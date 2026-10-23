import { VISIT_ACTION_ID } from '../actions';
import { blocRelation, RELACAO_ESCALA, RELACAO_MAX, RELACAO_MIN } from '../congress/relations';
import type { Calibration } from '../economy/calibration';
import { DEMAND_GAIN } from '../economy/demand';
import { activeImpulses } from '../impulses';
import { regionalAlignmentOf } from '../politics/alignment';
import type { RegionalScope, SectorId } from '../../types/regions';
import type { ScenarioUf } from '../../types/scenario';
import type {
  GameContent,
  GameState,
  ImpulseRegional,
  ImpulseTarget,
  MonthStep,
  RegionalPiece,
  ScheduledImpulse,
  UfExplanation,
  UfState,
} from '../types';

/**
 * Distribuição do agregado nacional às UFs (ECONOMIC_MODEL.md §5.12 e §5.15; decisão D7). O motor nacional não
 * muda: cada UF tem uma participação de tendência e um desvio explicado por causa (ciclo dos setores, gasto
 * federal pela chave de distribuição, choques regionais). Desemprego e aprovação por UF são desvios da média,
 * normalizados para que as médias ponderadas pela população reproduzam os números nacionais (invariante §7.9).
 * Funções puras; a etapa do mês roda depois da opinião pública.
 */

const MONTHS_PER_YEAR = 12;
/** p.p. por unidade de fração (a relação do governador anda em pontos por p.p. de aprovação). */
const PERCENT = 100;

/** Causa da normalização da atividade: o que a UF "perde" ou "ganha" porque as demais também mudaram. */
const OTHERS_CAUSE = 'demais_ufs';
/** Causa do desvio de aprovação pelo alinhamento da UF com o perfil ideológico do governo (PLANO_GLOBO.md §5.1). */
export const ALIGNMENT_CAUSE = 'alinhamento_perfil';
/** Causa da normalização à média nacional (desemprego e aprovação). */
const NORMALIZATION_CAUSE = 'media_nacional';

/** Setores com ciclo próprio em relação ao agregado (serviços acompanham o agregado). */
const SECTOR_CYCLE: readonly { sector: SectorId; label: string }[] = [
  { sector: 'agropecuaria', label: 'Agropecuária (preços das exportações)' },
  { sector: 'extrativa', label: 'Petróleo e mineração (preços das exportações)' },
  { sector: 'industria', label: 'Indústria (ciclo da economia)' },
];

/** Alvos fiscais cuja incidência regional muda a aprovação local: sinal do benefício para quem recebe. */
const FISCAL_BENEFIT: Partial<Record<ImpulseTarget, 1 | -1>> = {
  'gasto.investimento': 1,
  'gasto.custeio': 1,
  'gasto.transferencia_baixa_renda': 1,
  'gasto.transferencia_alta_renda': 1,
  'gasto.obrigatoria': 1,
  'gasto.extraordinario': 1,
  'receita.desoneracao_consumo': 1,
  'receita.desoneracao_renda': 1,
  'receita.tributaria': -1,
  'receita.renda': -1,
  'receita.consumo': -1,
};

const DEMAND_TARGETS = Object.keys(DEMAND_GAIN) as ImpulseTarget[];
const FISCAL_TARGETS = Object.keys(FISCAL_BENEFIT) as ImpulseTarget[];

/** Alvos cujos efeitos o modelo regional realmente distribui entre as UFs. */
export function supportsRegionalDistribution(target: ImpulseTarget): boolean {
  return DEMAND_TARGETS.includes(target) || FISCAL_TARGETS.includes(target);
}

/** UFs do cenário (vazio = sem dados regionais). */
export function regionsOf(content: Pick<GameContent, 'scenario'>): readonly ScenarioUf[] {
  return content.scenario.regions?.ufs ?? [];
}

/** Participação de cada UF na população (soma 1), na ordem do cenário. */
export function populationShares(ufs: readonly ScenarioUf[]): number[] {
  const total = ufs.reduce((s, u) => s + u.population, 0);
  return ufs.map((u) => u.population / total);
}

/** A UF está no escopo (vazio = todas as UFs). */
export function inScope(uf: ScenarioUf, scope: readonly RegionalScope[]): boolean {
  return scope.length === 0 || scope.includes(uf.region) || scope.includes(uf.id);
}

/**
 * Pesos da chave de distribuição (soma 1), dadas as participações de tendência no PIB (ECONOMIC_MODEL.md §5.15).
 * Escopo sem nenhuma UF cai na distribuição pelo PIB (sem efeito regional diferente).
 */
export function keyWeights(ufs: readonly ScenarioUf[], structural: readonly number[], r: ImpulseRegional): number[] {
  const pop = populationShares(ufs);
  const raw = ufs.map((uf, i) => {
    if (!inScope(uf, r.scope)) return 0;
    const base = {
      populacao: pop[i],
      pobreza: pop[i] * uf.poverty,
      pib: structural[i],
      renda_alta: (structural[i] * structural[i]) / pop[i],
    }[r.key];
    return base * (r.boost?.[uf.id] ?? 1);
  });
  const total = raw.reduce((s, x) => s + x, 0);
  return total > 0 ? raw.map((x) => x / total) : [...structural];
}

/** UFs iniciais a partir do cenário: participação de tendência = a do cenário; governadores do cenário. */
function seedUfs(ufs: readonly ScenarioUf[]): UfState[] {
  return ufs.map((u) => ({
    id: u.id,
    share: u.gdpShare,
    structuralShare: u.gdpShare,
    growthGap12m: 0,
    unemployment: u.unemployment,
    approval: 0,
    governorRelation: u.governor.relation,
  }));
}

/** Soma parcelas de mesma causa (uma política com vários impulsos vira uma parcela só). */
function merge(pieces: readonly RegionalPiece[]): RegionalPiece[] {
  const out = new Map<string, RegionalPiece>();
  for (const p of pieces) {
    const current = out.get(p.cause);
    if (current) current.delta += p.delta;
    else out.set(p.cause, { ...p });
  }
  return [...out.values()];
}

const sum = (pieces: readonly RegionalPiece[]): number => pieces.reduce((s, p) => s + p.delta, 0);
const scale = (pieces: readonly RegionalPiece[], k: number): RegionalPiece[] =>
  pieces.map((p) => ({ ...p, delta: p.delta * k }));

/** Saturação `max · tanh(x / max)` aplicada às parcelas proporcionalmente (a soma continua exata). */
function saturate(pieces: readonly RegionalPiece[], max: number): RegionalPiece[] {
  const raw = sum(pieces);
  if (raw === 0) return [...pieces];
  return scale(pieces, (max * Math.tanh(raw / max)) / raw);
}

/**
 * Reparte `total` entre as parcelas na proporção de cada uma (usado quando a diferença é exp(soma) − 1).
 * Parcelas que somam zero ficam como estão.
 */
function allocate(pieces: readonly RegionalPiece[], total: number): RegionalPiece[] {
  const raw = sum(pieces);
  return raw === 0 ? [...pieces] : scale(pieces, total / raw);
}

const nonZero = (pieces: readonly RegionalPiece[]): RegionalPiece[] => pieces.filter((p) => p.delta !== 0);

interface Distribution {
  ufs: UfState[];
  explanations: UfExplanation[];
}

/**
 * Distribui os números nacionais do mês às UFs (ECONOMIC_MODEL.md §5.15), dadas as participações de tendência
 * e as relações dos governadores no início do mês. Lê os impulsos ativos no mês de `state`.
 */
function distribute(
  state: Readonly<GameState>,
  content: GameContent,
  structural: readonly number[],
  relations: readonly number[],
): Distribution {
  const c = content.calibration;
  const t = state.monthIndex;
  const ufs = regionsOf(content);
  const pop = populationShares(ufs);
  const { outputGap, termsOfTrade } = state.economy;
  const impulses = state.impulses;

  // Atividade: ciclo dos setores em relação ao agregado (serviços acompanham o agregado).
  const cycle: Record<SectorId, number> = {
    agropecuaria: c.ciclo_agro_termos * termsOfTrade,
    extrativa: c.ciclo_extrativa_termos * termsOfTrade,
    industria: c.ciclo_industria_hiato * outputGap,
    servicos: 0,
  };
  const national = (s: SectorId) => ufs.reduce((n, u, i) => n + structural[i] * u.sectors[s], 0);
  const sectorMean = Object.fromEntries(SECTOR_CYCLE.map(({ sector }) => [sector, national(sector)]));

  const activityRaw: RegionalPiece[][] = ufs.map((u) =>
    SECTOR_CYCLE.map(({ sector, label }) => ({
      cause: `setor_${sector}`,
      label,
      delta: (u.sectors[sector] - sectorMean[sector]) * cycle[sector],
    })),
  );
  const approvalRaw: RegionalPiece[][] = ufs.map((u, i) => [
    {
      cause: 'governador',
      label: 'Relação com o governador',
      delta: (c.aprovacao_governador * relations[i]) / RELACAO_ESCALA,
    },
  ]);

  // Alinhamento com o perfil do governo: desvio bruto `k·tanh((alinhamento − média)/s)`; a normalização à média
  // nacional abaixo o centra (D7), então o termo só redistribui. Sem inclinações no cenário, não age.
  const alignment = regionalAlignmentOf(state.government.profile, ufs, pop);
  if (alignment) {
    ufs.forEach((_, i) => {
      approvalRaw[i].push({
        cause: ALIGNMENT_CAUSE,
        label: 'Alinhamento com o perfil do governo',
        delta: alignment.raw[i],
      });
    });
  }

  // Gasto e tributo federal pela chave de cada impulso: demanda local e aprovação per capita.
  for (const impulse of activeImpulses(impulses, t, DEMAND_TARGETS)) {
    const gain = DEMAND_GAIN[impulse.target];
    if (!impulse.regional || !gain) continue;
    const w = keyWeights(ufs, structural, impulse.regional);
    const level = c[gain.mult] * gain.sign * impulse.delta;
    ufs.forEach((_, i) => {
      activityRaw[i].push({
        cause: impulse.sourceId,
        label: impulse.label,
        delta: c.concentracao_regional * level * (w[i] / structural[i] - 1),
      });
    });
  }
  for (const impulse of activeImpulses(impulses, t, FISCAL_TARGETS)) {
    const benefit = FISCAL_BENEFIT[impulse.target];
    if (!impulse.regional || !benefit) continue;
    const w = keyWeights(ufs, structural, impulse.regional);
    ufs.forEach((_, i) => {
      approvalRaw[i].push({
        cause: impulse.sourceId,
        label: impulse.label,
        delta: c.aprovacao_gasto_regional * benefit * impulse.delta * (w[i] / pop[i] - 1),
      });
    });
  }
  // Choques regionais de eventos e visitas: nível enquanto ativos, só nas UFs do escopo.
  for (const impulse of activeImpulses(impulses, t, ['regiao.atividade', 'regiao.aprovacao'])) {
    const scope = impulse.regional?.scope ?? [];
    const target = impulse.target === 'regiao.atividade' ? activityRaw : approvalRaw;
    ufs.forEach((u, i) => {
      if (inScope(u, scope)) target[i].push({ cause: impulse.sourceId, label: impulse.label, delta: impulse.delta });
    });
  }

  // Participações: tendência × exp(desvio), normalizadas (soma 1 por construção).
  const activity = activityRaw.map((pieces) => saturate(merge(pieces), c.desvio_atividade_max));
  const weighted = structural.map((s, i) => s * Math.exp(sum(activity[i])));
  const z = weighted.reduce((s, x) => s + x, 0);
  const logZ = Math.log(z);
  const shares = weighted.map((x) => x / z);
  // Desvio log da atividade em relação à tendência, já descontado o que as demais UFs fizeram.
  const relActivity = activity.map((pieces) => [
    ...pieces,
    { cause: OTHERS_CAUSE, label: 'Desempenho das demais UFs', delta: -logZ },
  ]);

  // Desemprego: razão em log (estrutura local − Okun × atividade), normalizada à taxa nacional.
  const uNat = state.indicators.unemployment;
  const meanU0 = ufs.reduce((s, u, i) => s + pop[i] * u.unemployment, 0);
  const unemploymentLog = ufs.map((u, i) => [
    {
      cause: 'estrutura_emprego',
      label: 'Estrutura do mercado de trabalho local',
      delta: Math.log(u.unemployment / meanU0),
    },
    ...scale(relActivity[i], -c.okun_regional),
  ]);
  const ratios = unemploymentLog.map((pieces) => Math.exp(sum(pieces)));
  const logR = Math.log(ratios.reduce((s, r, i) => s + pop[i] * r, 0));

  // Aprovação: desvio saturado, com média ponderada zero, limitado para caber em [0, 1].
  const approvalDev = approvalRaw.map((pieces, i) =>
    saturate(merge([...pieces, ...scale(relActivity[i], c.aprovacao_atividade_regional)]), c.desvio_aprovacao_max),
  );
  const meanDev = approvalDev.reduce((s, pieces, i) => s + pop[i] * sum(pieces), 0);
  const centered = approvalDev.map((pieces) => [
    ...pieces,
    { cause: NORMALIZATION_CAUSE, label: 'Média nacional', delta: -meanDev },
  ]);
  const aNat = state.indicators.approval;
  let k = 1;
  for (const pieces of centered) {
    const e = sum(pieces);
    if (e > 0) k = Math.min(k, (1 - aNat) / e);
    else if (e < 0) k = Math.min(k, aNat / -e);
  }

  const out: UfState[] = [];
  const explanations: UfExplanation[] = [];
  ufs.forEach((u, i) => {
    const activityPieces = allocate(relActivity[i], shares[i] / structural[i] - 1);
    const uLog = [...unemploymentLog[i], { cause: NORMALIZATION_CAUSE, label: 'Ajuste à taxa nacional', delta: -logR }];
    const unemployment = (uNat * ratios[i]) / Math.exp(logR);
    const unemploymentPieces = allocate(uLog, unemployment - uNat);
    const approvalPieces = scale(centered[i], k);
    out.push({
      id: u.id,
      share: shares[i],
      structuralShare: structural[i],
      growthGap12m: 0,
      unemployment,
      approval: aNat + sum(approvalPieces),
      governorRelation: relations[i],
    });
    explanations.push({
      id: u.id,
      activity: nonZero(activityPieces),
      unemployment: nonZero(unemploymentPieces),
      approval: nonZero(approvalPieces),
    });
  });
  return { ufs: out, explanations };
}

/**
 * Participações de tendência do mês: o capital público com incidência regional (`oferta.potencial`) faz a UF
 * que recebe crescer mais que a média enquanto o impulso está ativo (ECONOMIC_MODEL.md §5.15).
 */
function evolveStructural(state: Readonly<GameState>, content: GameContent, previous: readonly number[]): number[] {
  const c = content.calibration;
  const ufs = regionsOf(content);
  const extra = ufs.map(() => 0);
  for (const impulse of activeImpulses(state.impulses, state.monthIndex, ['oferta.potencial'])) {
    if (!impulse.regional) continue;
    const w = keyWeights(ufs, previous, impulse.regional);
    ufs.forEach((_, i) => {
      extra[i] += c.concentracao_regional * impulse.delta * (w[i] / previous[i] - 1);
    });
  }
  const grown = previous.map((s, i) => s * Math.exp(extra[i] / MONTHS_PER_YEAR));
  const total = grown.reduce((s, x) => s + x, 0);
  return grown.map((x) => x / total);
}

/**
 * Posição própria de cada governador: a relação inicial do cenário menos a parte explicada pelo bloco. Ela
 * persiste na meta da relação, então governadores aliados e hostis continuam diferentes ao longo do mandato.
 */
function governorStance(uf: ScenarioUf, content: GameContent): number {
  const bloc = content.scenario.blocs.find((b) => b.id === uf.governor.bloc);
  return uf.governor.relation - content.calibration.governador_alinhamento * (bloc?.governmentRelation ?? 0);
}

/** Relação dos governadores no fim do mês: anda até a meta e soma os impulsos `governadores.relacao` do escopo. */
function evolveRelations(state: Readonly<GameState>, content: GameContent, ufs: readonly UfState[]): number[] {
  const c = content.calibration;
  const scenarioUfs = regionsOf(content);
  const shocks = activeImpulses(state.impulses, state.monthIndex, ['governadores.relacao']);
  return scenarioUfs.map((u, i) => {
    const bloc = content.scenario.blocs.find((b) => b.id === u.governor.bloc);
    const target =
      governorStance(u, content) +
      c.governador_alinhamento * (bloc ? blocRelation(state, bloc) : 0) +
      c.governador_aprovacao * (ufs[i].approval - c.aprovacao_base) * PERCENT;
    const current = ufs[i].governorRelation;
    const shock = shocks.filter((s) => inScope(u, s.regional?.scope ?? [])).reduce((total, s) => total + s.delta, 0);
    return Math.min(RELACAO_MAX, Math.max(RELACAO_MIN, current + c.ajuste_governador * (target - current) + shock));
  });
}

/** UFs no estado, ou as do cenário quando o estado ainda não as tem (save antigo). */
export function currentUfs(state: Readonly<GameState>, content: GameContent): UfState[] {
  const ufs = regionsOf(content);
  return state.regions.ufs.length === ufs.length ? state.regions.ufs : seedUfs(ufs);
}

/** Regiões no início da campanha (ou ao abrir um save antigo): distribuição sem histórico. */
export function initialRegions(state: Readonly<GameState>, content: GameContent): Distribution {
  const ufs = regionsOf(content);
  if (ufs.length === 0) return { ufs: [], explanations: [] };
  const seed = seedUfs(ufs);
  return distribute(
    state,
    content,
    seed.map((u) => u.structuralShare),
    seed.map((u) => u.governorRelation),
  );
}

/** UFs para a interface: as do estado ou, num save antigo ainda não processado, as iniciais. */
export function regionsView(state: Readonly<GameState>, content: GameContent): UfState[] {
  const ufs = regionsOf(content);
  if (ufs.length === 0) return [];
  return state.regions.ufs.length === ufs.length ? state.regions.ufs : initialRegions(state, content).ufs;
}

/** Visita presidencial (ação de agenda): aprovação local por alguns meses e relação com o governador. */
function visitImpulses(state: Readonly<GameState>, content: GameContent, ufId: string): ScheduledImpulse[] {
  const c = content.calibration;
  const t = state.monthIndex;
  const uf = regionsOf(content).find((u) => u.id === ufId);
  const sourceId = `acao:${VISIT_ACTION_ID}_${ufId}_${t}`;
  const regional: ImpulseRegional = { key: 'populacao', scope: [ufId] };
  const label = `Visita presidencial: ${uf?.name ?? ufId}`;
  return [
    {
      sourceId,
      label,
      target: 'regiao.aprovacao',
      delta: c.aprovacao_visita,
      startMonth: t,
      endMonth: t + c.meses_visita - 1,
      regional,
    },
    { sourceId, label, target: 'governadores.relacao', delta: c.relacao_visita, startMonth: t, endMonth: t, regional },
  ];
}

/**
 * Etapa regional do mês (ECONOMIC_MODEL.md §5.15). Roda depois da economia e da opinião: distribui o mês já
 * calculado. Não gera contribuições nacionais (a distribuição não muda o total); a explicação por UF vai para
 * o relatório (`MonthReport.regional`).
 */
export const regionsStep: MonthStep = (input, ctx) => {
  const content = ctx.content;
  if (regionsOf(content).length === 0) return { state: input, contributions: [] };

  const visits = ctx.decisions
    .filter((d) => d.policyId === VISIT_ACTION_ID && typeof d.params?.uf === 'string')
    .flatMap((d) => visitImpulses(input, content, String(d.params?.uf)));
  const state: GameState = visits.length > 0 ? { ...input, impulses: [...input.impulses, ...visits] } : input;

  const previous = currentUfs(state, content);
  const structural = evolveStructural(
    state,
    content,
    previous.map((u) => u.structuralShare),
  );
  const dist = distribute(
    state,
    content,
    structural,
    previous.map((u) => u.governorRelation),
  );
  const relations = evolveRelations(state, content, dist.ufs);
  const ufs = dist.ufs.map((u, i) => {
    const before = previous[i];
    // Crescimento relativo em 12 meses por suavização (como o PIB 12m nacional, ECONOMIC_MODEL.md §5.13).
    const step = Math.log(u.share / before.share);
    return {
      ...u,
      growthGap12m: before.growthGap12m + step - before.growthGap12m / MONTHS_PER_YEAR,
      governorRelation: relations[i],
    };
  });
  ctx.draft.regional = dist.explanations;
  return { state: { ...state, regions: { ufs } }, contributions: [] };
};

/** Média da relação dos governadores, ponderada pela população (variável de condição de eventos). */
export function meanGovernorRelation(state: Readonly<GameState>, content: GameContent): number {
  const ufs = regionsOf(content);
  if (ufs.length === 0) return 0;
  const pop = populationShares(ufs);
  const view = regionsView(state, content);
  return view.reduce((s, u, i) => s + pop[i] * u.governorRelation, 0);
}

/**
 * Dispersão da renda per capita entre as UFs (GAME_DESIGN.md §7.2, objetivo "Desenvolver as regiões"):
 * coeficiente de variação ponderado pela população da renda relativa (participação no PIB ÷ na população).
 */
export function regionalDispersion(ufs: readonly Pick<UfState, 'share'>[], content: GameContent): number {
  const scenarioUfs = regionsOf(content);
  if (scenarioUfs.length === 0 || ufs.length !== scenarioUfs.length) return 0;
  const pop = populationShares(scenarioUfs);
  const variance = ufs.reduce((s, u, i) => s + pop[i] * (u.share / pop[i] - 1) ** 2, 0);
  return Math.sqrt(variance);
}

/** Nomes das grandes regiões para textos ao jogador. */
export const REGION_NAMES: Readonly<Record<string, string>> = {
  norte: 'Norte',
  nordeste: 'Nordeste',
  centro_oeste: 'Centro-Oeste',
  sudeste: 'Sudeste',
  sul: 'Sul',
};

/**
 * Peso de cada UF na chave de distribuição (soma 1) e incidência per capita (peso ÷ participação na população;
 * 1 = média nacional), na ordem do cenário (ECONOMIC_MODEL.md §5.15). Base única da mesa de despacho
 * (`regionalIncidence`) e da prévia regional da decisão (`regions/preview.ts`).
 */
export function ufIncidence(
  ufs: readonly ScenarioUf[],
  structural: readonly number[],
  regional: ImpulseRegional,
): { id: string; weight: number; ratio: number }[] {
  const pop = populationShares(ufs);
  const w = keyWeights(ufs, structural, regional);
  return ufs.map((u, i) => ({ id: u.id, weight: w[i], ratio: w[i] / pop[i] }));
}

/**
 * Incidência per capita de uma chave por grande região (1 = média nacional), na ordem de `REGION_NAMES`, e a UF
 * mais concentrada. Usada pela mesa de despacho para dizer onde a política pesa mais.
 */
export function regionalIncidence(
  content: GameContent,
  regional: ImpulseRegional,
): { regions: { id: string; ratio: number }[]; topUf: { id: string; ratio: number } | null } {
  const ufs = regionsOf(content);
  if (ufs.length === 0) return { regions: [], topUf: null };
  const pop = populationShares(ufs);
  const ratios = ufIncidence(
    ufs,
    ufs.map((u) => u.gdpShare),
    regional,
  );
  const regions = Object.keys(REGION_NAMES).map((id) => {
    const weight = ufs.reduce((n, u, i) => (u.region === id ? n + ratios[i].weight : n), 0);
    const people = ufs.reduce((n, u, i) => (u.region === id ? n + pop[i] : n), 0);
    return { id, ratio: people > 0 ? weight / people : 0 };
  });
  const top = ratios.reduce((a, b) => (b.ratio > a.ratio ? b : a), ratios[0]);
  return { regions, topUf: { id: top.id, ratio: top.ratio } };
}

/**
 * Probabilidade de um governador aderir a programa por convênio (POLITICAL_RULES.md §2.1):
 * `adesao_base + adesao_relacao × relação/100`, limitada a [0, 1]. Fórmula única do sorteio da execução
 * (`proposals.ts`), do parecer (`expectedAdhesion`) e da prévia regional.
 */
export function adhesionProbability(
  c: Pick<Calibration, 'adesao_base' | 'adesao_relacao'>,
  governorRelation: number,
): number {
  return Math.min(1, Math.max(0, c.adesao_base + (c.adesao_relacao * governorRelation) / RELACAO_MAX));
}

/** Probabilidade de adesão de cada UF, na ordem do cenário (vazio sem UFs). */
export function adhesionProbabilities(state: Readonly<GameState>, content: GameContent): number[] {
  const ufs = regionsOf(content);
  if (ufs.length === 0) return [];
  const view = regionsView(state, content);
  return ufs.map((_, i) => adhesionProbability(content.calibration, view[i].governorRelation));
}

/**
 * Adesão esperada a um programa por convênio (POLITICAL_RULES.md §2.1), sem sorteio: soma das probabilidades de
 * cada governador. Usada nos pareceres; a execução sorteia UF por UF.
 */
export function expectedAdhesion(
  state: Readonly<GameState>,
  content: GameContent,
): { states: number; populationShare: number } | null {
  const ufs = regionsOf(content);
  if (ufs.length === 0) return null;
  const pop = populationShares(ufs);
  const probabilities = adhesionProbabilities(state, content);
  return {
    states: probabilities.reduce((n, p) => n + p, 0),
    populationShare: probabilities.reduce((n, p, i) => n + p * pop[i], 0),
  };
}
