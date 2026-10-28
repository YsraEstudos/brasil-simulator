import { activeImpulses } from '../impulses';
import type { GameContent, GameState, ImpulseTarget, MonthStep, ScheduledImpulse } from '../types';

import { DEFAULT_SOCIETY_CALIBRATION, type SocietyCalibration } from './calibration';
import {
  SOCIETY_QUINTILE_IDS,
  SOCIETY_SECTOR_IDS,
  type SocietyExplanation,
  type SocietyQuintileId,
  type SocietyQuintileState,
  type SocietySectorId,
  type SocietySectorState,
  type SocietyState,
} from './types';

export { DEFAULT_SOCIETY_CALIBRATION } from './calibration';
export { SOCIETY_QUINTILE_IDS, SOCIETY_SECTOR_IDS } from './types';
export type { SocietyState } from './types';

const OUTPUT_TARGETS: readonly ImpulseTarget[] = [
  'gasto.investimento',
  'gasto.custeio',
  'gasto.transferencia_baixa_renda',
  'gasto.transferencia_alta_renda',
  'gasto.obrigatoria',
  'gasto.extraordinario',
  'receita.tributaria',
  'receita.renda',
  'receita.consumo',
  'receita.desoneracao_consumo',
  'receita.desoneracao_renda',
  'demanda.credito',
  'oferta.potencial',
  'choque.hiato',
  'salario_minimo',
];

/** Campos opcionais aceitos durante a transição para os impulsos com incidência setorial. */
type ImpulseWithAffectedSectors = ScheduledImpulse & {
  affected?: { sectors?: readonly string[] } | readonly string[];
  sectors?: readonly string[];
};

const SECTOR_ALIASES: Readonly<Record<string, SocietySectorId>> = {
  agro: 'agropecuaria',
  agropecuaria: 'agropecuaria',
  agricola: 'agropecuaria',
  extrativa: 'extrativa',
  mineracao: 'extrativa',
  industria: 'industria',
  industria_transformacao: 'industria',
  construcao: 'construcao',
  energia: 'energia',
  servicos: 'servicos',
  comercio: 'servicos',
  seguranca: 'servicos',
};

const finite = (value: number, fallback: number): number => (Number.isFinite(value) ? value : fallback);
const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));
const saturate = (value: number, limit: number): number => limit * Math.tanh(value / limit);

function sectorList(calibration: SocietyCalibration): SocietySectorState[] {
  return SOCIETY_SECTOR_IDS.map((id) => ({
    id,
    output: calibration.sectorShares[id],
    share: calibration.sectorShares[id],
    growth: 0,
  }));
}

function incomeList(calibration: SocietyCalibration): SocietyQuintileState[] {
  const total = SOCIETY_QUINTILE_IDS.reduce((sum, id) => sum + calibration.quintileIncomes[id], 0);
  return SOCIETY_QUINTILE_IDS.map((id) => ({
    id,
    realIncome: calibration.quintileIncomes[id],
    incomeShare: calibration.quintileIncomes[id] / total,
    policyAdjustment: 0,
  }));
}

function povertyRate(quintiles: readonly SocietyState['quintiles'][number][], calibration: SocietyCalibration): number {
  const rate = quintiles.reduce((sum, quintile) => {
    const pressure = (calibration.povertyThreshold - quintile.realIncome) / calibration.povertySmoothness;
    return sum + calibration.quintilePopulationShare / (1 + Math.exp(-pressure));
  }, 0);
  return clamp(rate, 0, 1);
}

/** Estado inicial sem dependência do cenário; o controlador apenas o persiste no `GameState`. */
export function initialSociety(calibration: SocietyCalibration = DEFAULT_SOCIETY_CALIBRATION): SocietyState {
  const quintiles = incomeList(calibration);
  return {
    sectors: sectorList(calibration),
    quintiles,
    nationalOutput: calibration.initialNationalOutput,
    realIncome: quintiles.reduce((sum, quintile) => sum + calibration.quintilePopulationShare * quintile.realIncome, 0),
    unemployment: calibration.initialUnemployment,
    realWage: calibration.initialRealWage,
    minimumWage: calibration.initialMinimumWage,
    povertyRate: povertyRate(quintiles, calibration),
    explanations: [],
  };
}

/** Inicializa o bloco no mesmo nível do agregado e dos indicadores do cenário. */
export function initialSocietyForGame(
  game: Pick<GameState, 'economy' | 'indicators'>,
  calibration: SocietyCalibration = DEFAULT_SOCIETY_CALIBRATION,
): SocietyState {
  const base = initialSociety(calibration);
  const total = Math.max(
    calibration.minimumPositiveLevel,
    finite(game.economy.potentialIndex * Math.exp(game.economy.outputGap), calibration.minimumPositiveLevel),
  );
  return {
    ...base,
    sectors: base.sectors.map((sector) => ({ ...sector, output: total * sector.share })),
    nationalOutput: total,
    unemployment: clamp(finite(game.indicators.unemployment, base.unemployment), 0, calibration.maximumUnemployment),
    minimumWage: Math.max(
      calibration.minimumPositiveLevel,
      finite(game.economy.fiscal.minimumWageIndex, base.minimumWage),
    ),
  };
}

function readSociety(state: Readonly<GameState>): SocietyState {
  return state.society;
}

function knownPolicyId(content: GameContent, candidate: string | undefined): string | undefined {
  return candidate && Object.hasOwn(content.policies, candidate) ? candidate : undefined;
}

/**
 * Extrai o policyId dos formatos produzidos pelo motor de políticas públicas.
 * O formato de diretriz é delimitado: diretriz:<ministryId>:<policyId>:<year>:<month>.
 * Propostas e projetos usam o id da proposta (<policyId>_<month>) e por isso
 * removemos somente o sufixo numérico delimitado, sem procurar por substring.
 */
function proposalPolicyId(content: GameContent, proposalId: string | undefined): string | undefined {
  if (!proposalId) return undefined;
  const suffix = proposalId.lastIndexOf('_');
  const candidate = suffix > 0 && /^\d+$/.test(proposalId.slice(suffix + 1)) ? proposalId.slice(0, suffix) : proposalId;
  return knownPolicyId(content, candidate);
}

function sourcePolicyId(sourceId: string, content: GameContent): string | undefined {
  const parts = sourceId.split(':');
  switch (parts[0]) {
    case 'diretriz':
      // publicPolicies.routineImpulses: diretriz:<ministryId>:<policyId>:<year>:<month>
      if (parts.length !== 5 || !parts[1] || !parts[2] || !/^\d+$/.test(parts[3]) || !/^\d+$/.test(parts[4])) {
        return undefined;
      }
      return knownPolicyId(content, parts[2]);
    case 'proposta':
      return parts.length === 2 ? proposalPolicyId(content, parts[1]) : undefined;
    case 'projeto':
      // publicPolicies: projeto:<proposalId>:maintenance|obra:<month> e projeto:capital:<proposalId>:<month>
      if (parts.length !== 4 || !/^\d+$/.test(parts[3])) return undefined;
      if (parts[1] === 'capital') return proposalPolicyId(content, parts[2]);
      return ['maintenance', 'obra'].includes(parts[2]) ? proposalPolicyId(content, parts[1]) : undefined;
    case 'rotina':
      // Reserved legacy spelling; keep its fields delimited as well.
      return parts.length >= 2 ? knownPolicyId(content, parts[1]) : undefined;
    default:
      return undefined;
  }
}

function affectedSectors(
  impulse: ImpulseWithAffectedSectors,
  content: GameContent,
): ReadonlySet<SocietySectorId> | null {
  const explicit = impulse.affected;
  const explicitObject = explicit as { sectors?: readonly string[] } | readonly string[] | undefined;
  const values: readonly string[] | undefined = Array.isArray(explicitObject)
    ? explicitObject
    : ((explicitObject as { sectors?: readonly string[] } | undefined)?.sectors ?? impulse.sectors);
  const policyId = sourcePolicyId(impulse.sourceId, content);
  const policyValues = policyId ? content.policies[policyId].affected.sectors : undefined;
  const input = values ?? policyValues;
  if (!input || input.length === 0) return null;
  const mapped = input.map((id: string) => SECTOR_ALIASES[id]).filter((id): id is SocietySectorId => id !== undefined);
  return mapped.length > 0 ? new Set(mapped) : null;
}

function sectorImpulseEffect(impulse: ScheduledImpulse): number {
  switch (impulse.target) {
    case 'receita.tributaria':
    case 'receita.renda':
    case 'receita.consumo':
      return -impulse.delta;
    case 'receita.desoneracao_consumo':
    case 'receita.desoneracao_renda':
    case 'gasto.investimento':
    case 'gasto.custeio':
    case 'gasto.transferencia_baixa_renda':
    case 'gasto.transferencia_alta_renda':
    case 'gasto.obrigatoria':
    case 'gasto.extraordinario':
    case 'demanda.credito':
    case 'oferta.potencial':
    case 'choque.hiato':
      return impulse.delta;
    default:
      return 0;
  }
}

function sectorGrowthEffect(
  impulse: ScheduledImpulse,
  sector: SocietySectorId,
  content: GameContent,
  calibration: SocietyCalibration,
): number {
  const effect = sectorImpulseEffect(impulse);
  if (effect === 0) return 0;
  const affected = affectedSectors(impulse as ImpulseWithAffectedSectors, content);
  const incidence = affected === null ? 1 : affected.has(sector) ? 1 : calibration.unaffectedSectorSpillover;
  return calibration.sectorImpulsePassThrough * effect * incidence;
}

function incomeImpulseEffect(
  impulse: ScheduledImpulse,
  quintile: SocietyQuintileId,
  calibration: SocietyCalibration,
): number {
  return quintileIncomeEffect(impulse.target, impulse.delta, quintile, calibration);
}

/**
 * Efeito permanente de um impulso (alvo, fração do PIB) na renda real média do quintil, em pontos do índice de
 * renda: o valor para o qual `policyAdjustment` converge. Fonte única da incidência por quintil, lida também pela
 * estimativa distributiva das reformas (`taxation/incidence.ts`).
 */
export function quintileIncomeEffect(
  target: ImpulseTarget,
  delta: number,
  quintile: SocietyQuintileId,
  calibration: SocietyCalibration = DEFAULT_SOCIETY_CALIBRATION,
): number {
  const impulse = { target, delta };
  const index = calibration.quintilePopulationShare;
  switch (impulse.target) {
    case 'gasto.transferencia_baixa_renda':
    case 'gasto.obrigatoria':
      return (
        (calibration.transferIncomePassThrough * impulse.delta * calibration.lowIncomeTransferIncidence[quintile]) /
        index
      );
    case 'gasto.transferencia_alta_renda':
      return (
        (calibration.transferIncomePassThrough * impulse.delta * calibration.highIncomeTransferIncidence[quintile]) /
        index
      );
    case 'receita.consumo':
    case 'receita.tributaria':
      return (-impulse.delta * calibration.regressiveTaxIncidence[quintile]) / index;
    case 'receita.renda':
      return (-impulse.delta * calibration.incomeTaxIncidence[quintile]) / index;
    case 'receita.desoneracao_consumo':
      return (impulse.delta * calibration.regressiveTaxIncidence[quintile]) / index;
    case 'receita.desoneracao_renda':
      return (impulse.delta * calibration.incomeTaxIncidence[quintile]) / index;
    case 'salario_minimo':
      return (impulse.delta * calibration.minimumWageIncidence[quintile]) / index;
    default:
      return 0;
  }
}

function labelsForImpulse(impulse: ScheduledImpulse): { cause: string; label: string } {
  return { cause: impulse.sourceId, label: impulse.label };
}

function nationalOutput(game: Readonly<GameState>, calibration: SocietyCalibration): number {
  const output = game.economy.potentialIndex * Math.exp(game.economy.outputGap);
  return Math.max(calibration.minimumPositiveLevel, finite(output, calibration.minimumPositiveLevel));
}

function sectorTransition(
  previous: SocietyState,
  game: Readonly<GameState>,
  content: GameContent,
  calibration: SocietyCalibration,
  explanations: SocietyExplanation[],
): SocietyState['sectors'] {
  const total = nationalOutput(game, calibration);
  const previousTotal = Math.max(calibration.minimumPositiveLevel, previous.nationalOutput);
  const impulses = activeImpulses(game.impulses, game.monthIndex, OUTPUT_TARGETS);
  // A participação anterior já carrega o nível acumulado; só a variação do mês desloca a composição de novo
  // (acumulado = sensibilidade × nível dos termos de troca, sem deriva enquanto o nível fica parado).
  const termsChange = game.economy.termsOfTrade - (previous.termsOfTrade ?? game.economy.termsOfTrade);
  const weights = SOCIETY_SECTOR_IDS.map((id) => {
    const terms = calibration.termsOfTradeSensitivity[id] * termsChange;
    const effect = impulses.reduce((sum, impulse) => sum + sectorGrowthEffect(impulse, id, content, calibration), 0);
    const extra = saturate(terms + effect, calibration.sectorGrowthSaturation);
    return {
      id,
      weight: previous.sectors.find((sector) => sector.id === id)?.share ?? calibration.sectorShares[id],
      extra,
    };
  });
  const weightSum = weights.reduce((sum, value) => sum + value.weight * Math.exp(value.extra), 0);
  return weights.map(({ id, weight, extra }) => {
    const share = (weight * Math.exp(extra)) / weightSum;
    const output = total * share;
    const before = previous.sectors.find((sector) => sector.id === id);
    const priorOutput = Math.max(calibration.minimumPositiveLevel, before?.output ?? previousTotal * weight);
    const growth = output / priorOutput - 1;
    const impulseContributions: { impulse: ScheduledImpulse; delta: number }[] = [];
    for (const impulse of impulses) {
      const effect = sectorGrowthEffect(impulse, id, content, calibration);
      if (effect === 0) continue;
      impulseContributions.push({ impulse, delta: priorOutput * effect });
    }
    // O resíduo fecha a decomposição: cada explicação mede um componente e a soma
    // dos componentes é exatamente a variação observada do setor.
    const impulseDelta = impulseContributions.reduce((sum, contribution) => sum + contribution.delta, 0);
    explanations.push({
      cause: 'atividade_nacional',
      label: 'Atividade nacional, termos de troca e normalização residual',
      delta: output - priorOutput - impulseDelta,
      metric: 'sector_output',
    });
    for (const contribution of impulseContributions) {
      const source = labelsForImpulse(contribution.impulse);
      explanations.push({
        cause: source.cause,
        label: source.label,
        delta: contribution.delta,
        metric: 'sector_output',
      });
    }
    return { id, output, share, growth };
  });
}

function incomeTransition(
  previous: SocietyState,
  game: Readonly<GameState>,
  calibration: SocietyCalibration,
  explanations: SocietyExplanation[],
): {
  quintiles: SocietyState['quintiles'];
  realIncome: number;
  realWage: number;
  minimumWage: number;
  povertyRate: number;
} {
  const previousOutput = Math.max(calibration.minimumPositiveLevel, previous.nationalOutput);
  const currentOutput = nationalOutput(game, calibration);
  const outputGrowth = saturate(Math.log(currentOutput / previousOutput), calibration.sectorGrowthSaturation);
  const currentUnemployment = clamp(
    finite(game.indicators.unemployment, previous.unemployment),
    0,
    calibration.maximumUnemployment,
  );
  const employmentSignal = previous.unemployment - currentUnemployment;
  const currentMinimumWage = Math.max(
    calibration.minimumPositiveLevel,
    finite(game.economy.fiscal.minimumWageIndex, previous.minimumWage),
  );
  const minimumWage = previous.minimumWage + calibration.minimumWageLag * (currentMinimumWage - previous.minimumWage);
  const minimumWageGrowth = Math.log(minimumWage / Math.max(calibration.minimumPositiveLevel, previous.minimumWage));
  const realWageGrowth =
    calibration.outputIncomePassThrough * outputGrowth +
    calibration.employmentIncomePassThrough * employmentSignal +
    calibration.minimumWageLag * minimumWageGrowth;
  const realWage = Math.max(calibration.minimumPositiveLevel, previous.realWage * Math.exp(realWageGrowth));
  const impulses = activeImpulses(game.impulses, game.monthIndex, OUTPUT_TARGETS);
  const candidates = SOCIETY_QUINTILE_IDS.map((id) => {
    const before = previous.quintiles.find((quintile) => quintile.id === id);
    const priorIncome = Math.max(
      calibration.minimumPositiveLevel,
      before?.realIncome ?? calibration.quintileIncomes[id],
    );
    const priorAdjustment = clamp(
      finite(before?.policyAdjustment ?? 0, 0),
      -calibration.policyAdjustmentLimit,
      calibration.policyAdjustmentLimit,
    );
    const targetAdjustment = clamp(
      impulses.reduce((sum, impulse) => sum + incomeImpulseEffect(impulse, id, calibration), 0),
      -calibration.policyAdjustmentLimit,
      calibration.policyAdjustmentLimit,
    );
    const nextAdjustment = priorAdjustment + calibration.policyAdjustmentLag * (targetAdjustment - priorAdjustment);
    const base = calibration.wageIncomePassThrough * realWageGrowth;
    const priorBaseIncome = priorIncome / Math.max(calibration.minimumPositiveLevel, 1 + priorAdjustment);
    const baseIncome = Math.max(calibration.minimumPositiveLevel, priorBaseIncome * Math.exp(base));
    const policyIncome = baseIncome * Math.max(calibration.minimumPositiveLevel, 1 + nextAdjustment);
    const nextIncome = Math.max(calibration.minimumPositiveLevel, policyIncome);
    const source = { cause: 'tendencia_social', label: 'Renda e mercado de trabalho' };
    explanations.push({
      cause: source.cause,
      label: source.label,
      delta: baseIncome - priorBaseIncome,
      metric: 'real_income',
    });
    let impulseExplanation = 0;
    for (const impulse of impulses) {
      const effect = incomeImpulseEffect(impulse, id, calibration);
      if (effect === 0) continue;
      const cause = labelsForImpulse(impulse);
      const delta = baseIncome * calibration.policyAdjustmentLag * effect;
      impulseExplanation += delta;
      explanations.push({ cause: cause.cause, label: cause.label, delta, metric: 'real_income' });
    }
    const exactPolicyDelta = nextIncome - baseIncome - (priorIncome - priorBaseIncome);
    const residual = exactPolicyDelta - impulseExplanation;
    if (residual !== 0) {
      explanations.push({
        cause: 'inercia_politica_social',
        label: 'Ajuste defasado de políticas sociais',
        delta: residual,
        metric: 'real_income',
      });
    }
    return { id, realIncome: nextIncome, incomeShare: 0, policyAdjustment: nextAdjustment };
  });
  const ordered = candidates.reduce<SocietyState['quintiles']>((result, quintile) => {
    const previousQuintile = result[result.length - 1];
    const floor = previousQuintile
      ? previousQuintile.realIncome + calibration.minimumQuintileGap
      : calibration.minimumPositiveLevel;
    result.push({ ...quintile, realIncome: Math.max(floor, quintile.realIncome) });
    return result;
  }, []);
  const totalIncome = ordered.reduce((sum, quintile) => sum + quintile.realIncome, 0);
  const normalized = ordered.map((quintile) => ({ ...quintile, incomeShare: quintile.realIncome / totalIncome }));
  const realIncome = normalized.reduce(
    (sum, quintile) => sum + calibration.quintilePopulationShare * quintile.realIncome,
    0,
  );
  const poverty = povertyRate(normalized, calibration);
  explanations.push({
    cause: 'tendencia_social',
    label: 'Linha de pobreza estimada',
    delta: poverty - previous.povertyRate,
    metric: 'poverty_rate',
  });
  explanations.push({
    cause: 'mercado_de_trabalho',
    label: 'Mercado de trabalho',
    delta: currentUnemployment - previous.unemployment,
    metric: 'unemployment',
  });
  explanations.push({
    cause: 'salario_real',
    label: 'Salário real médio',
    delta: realWage - previous.realWage,
    metric: 'real_wage',
  });
  explanations.push({
    cause: 'salario_minimo',
    label: 'Salário mínimo real',
    delta: minimumWage - previous.minimumWage,
    metric: 'minimum_wage',
  });
  return { quintiles: normalized, realIncome, realWage, minimumWage, povertyRate: poverty };
}

/** Etapa pura: executada depois da economia, antes da opinião e das regiões. */
export const societyStep: MonthStep = (input, ctx) => {
  const calibration = DEFAULT_SOCIETY_CALIBRATION;
  const previous = readSociety(input);
  const explanations: SocietyExplanation[] = [];
  const sectors = sectorTransition(previous, input, ctx.content, calibration, explanations);
  const income = incomeTransition(previous, input, calibration, explanations);
  const next: SocietyState = {
    sectors,
    quintiles: income.quintiles,
    nationalOutput: nationalOutput(input, calibration),
    realIncome: income.realIncome,
    unemployment: clamp(
      finite(input.indicators.unemployment, previous.unemployment),
      0,
      calibration.maximumUnemployment,
    ),
    realWage: income.realWage,
    minimumWage: income.minimumWage,
    povertyRate: income.povertyRate,
    explanations,
    termsOfTrade: input.economy.termsOfTrade,
  };
  return { state: { ...input, society: next }, contributions: [] };
};

/** Verifica reconciliação, limites e rastreabilidade do bloco social sem mutar o estado. */
export function checkSociety(state: SocietyState, game: Readonly<GameState>): string[] {
  const errors: string[] = [];
  const calibration = DEFAULT_SOCIETY_CALIBRATION;
  const expectedOutput = game.economy.potentialIndex * Math.exp(game.economy.outputGap);
  const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
  if (state.sectors.length !== SOCIETY_SECTOR_IDS.length) errors.push('setores sociais incompletos');
  if (state.quintiles.length !== SOCIETY_QUINTILE_IDS.length) errors.push('quintis sociais incompletos');
  if (Math.abs(sum(state.sectors.map((sector) => sector.share)) - 1) > calibration.minimumPositiveLevel) {
    errors.push('participações setoriais não somam 1');
  }
  if (
    Math.abs(sum(state.sectors.map((sector) => sector.output)) - state.nationalOutput) >
    calibration.minimumPositiveLevel
  ) {
    errors.push('produção setorial não reconcilia com o produto nacional');
  }
  if (Math.abs(sum(state.quintiles.map((quintile) => quintile.incomeShare)) - 1) > calibration.minimumPositiveLevel) {
    errors.push('participações de renda não somam 1');
  }
  if (Math.abs(state.nationalOutput - expectedOutput) > calibration.minimumPositiveLevel) {
    errors.push('produto social diverge do agregado econômico');
  }
  if (!(state.povertyRate >= 0 && state.povertyRate <= 1)) errors.push('pobreza fora de [0, 1]');
  if (!(state.unemployment >= 0 && state.unemployment <= calibration.maximumUnemployment))
    errors.push('desemprego fora de [0, 1]');
  if (!(state.realIncome > 0 && state.realWage > 0 && state.minimumWage > 0)) errors.push('nível social não positivo');
  for (const sector of state.sectors) {
    if (!(sector.output > 0 && sector.share > 0) || !Number.isFinite(sector.growth))
      errors.push(`setor inválido: ${sector.id}`);
  }
  for (const quintile of state.quintiles) {
    if (
      !(quintile.realIncome > 0 && quintile.incomeShare > 0) ||
      !Number.isFinite(quintile.policyAdjustment) ||
      Math.abs(quintile.policyAdjustment) > calibration.policyAdjustmentLimit
    ) {
      errors.push(`quintil inválido: ${quintile.id}`);
    }
  }
  for (const explanation of state.explanations) {
    if (!explanation.cause || !explanation.label || !Number.isFinite(explanation.delta)) {
      errors.push('explicação social sem causa, rótulo ou delta finito');
    }
  }
  return errors;
}

export type { SocietyCalibration } from './calibration';
