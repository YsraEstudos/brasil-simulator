import { activeImpulses, sumActive } from '../impulses';
import {
  MANDATORY_GROUPS,
  REVENUE_GROUPS,
  type FiscalState,
  type GameState,
  type ImpulseTarget,
  type MandatoryGroup,
  type RevenueBaseDetail,
  type RevenueGroup,
  type ScheduledImpulse,
} from '../types';

import type { Calibration, ParamName } from './calibration';
import { clamp, impulsePiece, type Piece } from './pieces';

/**
 * Contas do governo central (ECONOMIC_MODEL.md §5.7–5.8; POLITICAL_RULES.md §4.2–4.3):
 * - receitas por grupo, com repartição a estados e municípios e retorno decrescente das alíquotas;
 * - despesas obrigatórias indexadas, vinculadas à receita e discricionárias;
 * - limite do Regime Fiscal Sustentável (LC 200/2023), revisto em janeiro, que comprime as discricionárias.
 *
 * Razões de despesa são medidas contra o PIB **potencial** (crescem com a regra de cada grupo e caem com o
 * potencial); a receita responde ao ciclo. Simplificações em ECONOMIC_MODEL.md §5.14.
 */

const MONTHS_PER_YEAR = 12;

/** Valores fiscais iniciais do cenário (ou os provisórios padrão), já em fração do PIB. */
export interface FiscalValues {
  revenue: number;
  primarySpending: number;
  revenueShares: Record<RevenueGroup, number>;
  transferShares: Record<RevenueGroup, number>;
  spending: Record<MandatoryGroup | 'linked' | 'discretionary' | 'exceptions', number>;
}

/** Estrutura fixa do cenário, recalculada a cada mês a partir dos valores iniciais (não vive no estado). */
export interface FiscalStructure {
  /** Carga bruta inicial de cada grupo (fração do PIB). */
  baseGross: Record<RevenueGroup, number>;
  transfer: Record<RevenueGroup, number>;
  /** Vinculadas ÷ receita líquida sem a folha, no início (mínimos e emendas acompanham a RCL). */
  linkedShare: number;
  /** Despesa primária inicial: referência da postura fiscal estrutural. */
  initialSpending: number;
}

export function fiscalStructure(v: FiscalValues): FiscalStructure {
  const kept = REVENUE_GROUPS.reduce((s, g) => s + v.revenueShares[g] * (1 - v.transferShares[g]), 0);
  const grossTotal = v.revenue / kept;
  const baseGross = Object.fromEntries(REVENUE_GROUPS.map((g) => [g, v.revenueShares[g] * grossTotal])) as Record<
    RevenueGroup,
    number
  >;
  const netExFolha = REVENUE_GROUPS.filter((g) => g !== 'folha').reduce(
    (s, g) => s + baseGross[g] * (1 - v.transferShares[g]),
    0,
  );
  return {
    baseGross,
    transfer: { ...v.transferShares },
    linkedShare: v.spending.linked / netExFolha,
    initialSpending: v.primarySpending,
  };
}

/** Estado fiscal no início do cenário: limite igual à despesa sujeita a ele (a LOA usa todo o espaço). */
export function initialFiscal(v: FiscalValues, gdpGrowth: number, gdpGrowthTwoYearsAgo: number, c: Calibration) {
  const s = v.spending;
  const structure = fiscalStructure(v);
  const mandatory: Record<MandatoryGroup, number> = {
    previdencia: s.previdencia,
    beneficios: s.beneficios,
    pessoal: s.pessoal,
    outras: s.outras,
  };
  const revenueByGroup = Object.fromEntries(
    REVENUE_GROUPS.map((g) => [g, structure.baseGross[g] * (1 - structure.transfer[g])]),
  ) as Record<RevenueGroup, number>;
  const revenueDetail = Object.fromEntries(
    REVENUE_GROUPS.map((g) => [
      g,
      {
        base: structure.baseGross[g],
        policy: 0,
        cycle: 0,
        loss: 0,
        transfers: structure.baseGross[g] * structure.transfer[g],
      },
    ]),
  ) as Record<RevenueGroup, RevenueBaseDetail>;
  const fiscal: FiscalState = {
    mandatory,
    linked: s.linked,
    policyMandatory: 0,
    discretionary: s.discretionary,
    policyDiscretionary: 0,
    exceptions: s.exceptions,
    extraordinary: 0,
    spendingLimit: v.primarySpending - s.exceptions,
    limitRealGrowth: clamp(c.limite_fracao_receita * gdpGrowth, c.limite_piso, c.limite_teto),
    limitExcess: 0,
    revenueByGroup,
    revenueLoss: 0,
    revenueDetail,
    revenue12m: v.revenue,
    revenue12mAtReview: v.revenue,
    gdpGrowthHistory: [gdpGrowthTwoYearsAgo, gdpGrowth],
    minimumWageIndex: 1,
    demandRef: 0,
  };
  return fiscal;
}

// ── Receitas ───────────────────────────────────────────────────────────────────────────────────────

/** Impulsos de receita → grupo e sinal sobre a carga legal (desoneração reduz a carga). */
export const REVENUE_TARGETS: Partial<Record<ImpulseTarget, { group: RevenueGroup; sign: 1 | -1 }>> = {
  'receita.tributaria': { group: 'outras', sign: 1 },
  'receita.renda': { group: 'renda', sign: 1 },
  'receita.consumo': { group: 'consumo', sign: 1 },
  'receita.desoneracao_consumo': { group: 'consumo', sign: -1 },
  'receita.desoneracao_renda': { group: 'renda', sign: -1 },
};

/** Margem de carga sem perda, por grupo; royalties não têm retorno decrescente (não é alíquota). */
const LOSS_MARGIN: Record<RevenueGroup, ParamName | null> = {
  renda: 'margem_carga_renda',
  folha: 'margem_carga_folha',
  consumo: 'margem_carga_consumo',
  outras: 'margem_carga_outras',
  royalties: null,
};

export interface RevenueMonth {
  total: number;
  byGroup: Record<RevenueGroup, number>;
  /** Do tributo legal à receita líquida, por base (soma `byGroup`; PLANO_EXPANSAO EX-11). */
  detail: Record<RevenueGroup, RevenueBaseDetail>;
  /** Arrecadação perdida pelo retorno decrescente, líquida de repartição (≥ 0). */
  loss: number;
  /** Carga sobre a renda acima da margem sem perda (alimenta a saída de capital, §5.7). */
  incomeOverload: number;
  /** Receita líquida sem políticas nem ciclo (parte da tendência fiscal). */
  base: number;
  /** Receita que serve de base às vinculações (sem políticas, com ciclo, sem a folha). */
  linkedBase: number;
  /** Parcelas da receita do mês: ciclo, cada impulso e perda (somam `total − base`). */
  pieces: Piece[];
}

/** Fração da carga perdida pelo retorno decrescente (ECONOMIC_MODEL.md §5.7). */
export function lossRate(load: number, base: number, margin: number, c: Calibration): number {
  return c.perda_max * Math.tanh(Math.max(0, load - base - margin) / c.escala_perda);
}

/**
 * Receita líquida do mês por grupo: carga legal (base + impulsos) × (1 − perda) × ciclo × (1 − repartição).
 * O ciclo usa o hiato do mês anterior (defasagem de arrecadação) e, nos royalties, os termos de troca.
 */
export function revenueMonth(
  state: Readonly<GameState>,
  structure: FiscalStructure,
  h0: number,
  c: Calibration,
): RevenueMonth {
  const t = state.monthIndex;
  const tt = state.economy.termsOfTrade;
  const cycle = (g: RevenueGroup): number =>
    1 + c.elast_receita_hiato * h0 + (g === 'royalties' ? c.elast_royalties_termos_troca * tt : 0);

  const impulses = activeImpulses(state.impulses, t, Object.keys(REVENUE_TARGETS) as ImpulseTarget[]);
  const load = { ...structure.baseGross };
  for (const i of impulses) {
    const map = REVENUE_TARGETS[i.target];
    if (map) load[map.group] += map.sign * i.delta;
  }

  const byGroup = {} as Record<RevenueGroup, number>;
  const detail = {} as Record<RevenueGroup, RevenueBaseDetail>;
  const pieces: Piece[] = [];
  let base = 0;
  let cycleTotal = 0;
  let loss = 0;
  let linkedBase = 0;
  for (const g of REVENUE_GROUPS) {
    const kept = 1 - structure.transfer[g];
    const cyc = cycle(g);
    const margin = LOSS_MARGIN[g];
    const rate = margin === null ? 0 : lossRate(load[g], structure.baseGross[g], c[margin], c);
    byGroup[g] = kept * load[g] * (1 - rate) * cyc;
    detail[g] = {
      base: structure.baseGross[g],
      policy: load[g] - structure.baseGross[g],
      cycle: load[g] * (cyc - 1),
      loss: load[g] * rate * cyc,
      transfers: structure.transfer[g] * load[g] * (1 - rate) * cyc,
    };
    base += kept * structure.baseGross[g];
    cycleTotal += kept * structure.baseGross[g] * (cyc - 1);
    loss += kept * load[g] * rate * cyc;
    if (g !== 'folha') linkedBase += kept * structure.baseGross[g] * cyc;
  }

  pieces.push({ cause: 'ciclo_receita', label: 'Arrecadação e atividade', delta: cycleTotal });
  for (const i of impulses) {
    const map = REVENUE_TARGETS[i.target];
    if (map) pieces.push(impulsePiece(i, (1 - structure.transfer[map.group]) * map.sign * i.delta * cycle(map.group)));
  }
  pieces.push({ cause: 'perda_arrecadacao', label: 'Perda de arrecadação (sonegação e elisão)', delta: -loss });

  const incomeOverload = Math.max(0, load.renda - structure.baseGross.renda - c.margem_carga_renda);
  const total = REVENUE_GROUPS.reduce((s, g) => s + byGroup[g], 0);
  return { total, byGroup, detail, loss, incomeOverload, base, linkedBase, pieces };
}

// ── Revisão anual (janeiro) ─────────────────────────────────────────────────────────────────────────

export interface AnnualReview {
  fiscal: FiscalState;
  /** Ganho real do salário mínimo aplicado (regra + políticas). */
  minimumWageGain: number;
  note: string;
}

/**
 * Janeiro: reajuste do salário mínimo (Lei 15.077/2024: ganho real = PIB de dois anos antes, na faixa do
 * arcabouço, até 2030) e novo crescimento real do limite (LC 200/2023: 70% do crescimento real da receita,
 * 50% se a meta do ano anterior foi descumprida, entre 0,6% e 2,5%). Ano-calendário como aproximação do
 * período de apuração (jul–jun) da lei.
 */
export function annualReview(state: Readonly<GameState>, c: Calibration): AnnualReview {
  const f = state.economy.fiscal;
  const t = state.monthIndex;
  const growthDec = state.indicators.gdpGrowth12m;
  const history: [number, number] = [f.gdpGrowthHistory[1], growthDec];

  const rule = t < c.sm_regra_ate_mes ? clamp(history[0], c.sm_ganho_min, c.sm_ganho_max) : c.sm_ganho_apos_regra;
  const gain = rule + sumActive(state.impulses, t, 'salario_minimo');
  const mandatory = {
    ...f.mandatory,
    previdencia: f.mandatory.previdencia * (1 + c.peso_sm_previdencia * gain),
    beneficios: f.mandatory.beneficios * (1 + c.peso_sm_beneficios * gain),
  };

  const realRevenueGrowth = (1 + growthDec) * (f.revenue12m / f.revenue12mAtReview) - 1;
  const targetMet = state.indicators.primaryBalance12m >= c.meta_primario - c.banda_meta_primario;
  const share = targetMet ? c.limite_fracao_receita : c.limite_fracao_descumprida;
  const limitRealGrowth = clamp(share * realRevenueGrowth, c.limite_piso, c.limite_teto);

  const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')}%`;
  const note =
    `Reajustes de janeiro: salário mínimo com ganho real de ${pct(gain)}; limite de despesas cresce ` +
    `${pct(limitRealGrowth)} acima da inflação${targetMet ? '' : ' (redutor por meta fiscal descumprida)'}.`;

  return {
    fiscal: {
      ...f,
      mandatory,
      limitRealGrowth,
      revenue12mAtReview: f.revenue12m,
      gdpGrowthHistory: history,
      minimumWageIndex: f.minimumWageIndex * (1 + gain),
    },
    minimumWageGain: gain,
    note,
  };
}

// ── Despesas e limite ──────────────────────────────────────────────────────────────────────────────

const GROWTH_PARAM: Record<MandatoryGroup, ParamName> = {
  previdencia: 'cresc_real_previdencia',
  beneficios: 'cresc_real_beneficios',
  pessoal: 'cresc_real_pessoal',
  outras: 'cresc_real_outras',
};

/** Impulsos que criam despesa obrigatória (não podem ser cortados pelo limite). */
export const MANDATORY_TARGETS: readonly ImpulseTarget[] = [
  'gasto.obrigatoria',
  'gasto.transferencia_baixa_renda',
  'gasto.transferencia_alta_renda',
];

/** Impulsos de despesa discricionária (crédito adicional, contingenciamento). */
export const DISCRETIONARY_TARGETS: readonly ImpulseTarget[] = ['gasto.investimento', 'gasto.custeio'];

/** Créditos extraordinários: despesa fora do limite (CF art. 167 §3º; LC 200/2023 art. 3º §2º). */
export const EXTRAORDINARY_TARGETS: readonly ImpulseTarget[] = ['gasto.extraordinario'];

export interface SpendingMonth {
  total: number;
  mandatory: Record<MandatoryGroup, number>;
  linked: number;
  policyMandatory: number;
  /** Discricionárias livres executadas. */
  discretionary: number;
  policyDiscretionary: number;
  exceptions: number;
  extraordinary: number;
  spendingLimit: number;
  limitExcess: number;
  /** Despesa que haveria sem nenhuma política ou evento (parte da tendência fiscal). */
  withoutPolicies: number;
  /** Diferença entre a despesa sem políticas e a despesa dirigida pela regra, menos os impulsos (≤ 0 = compressão). */
  compression: number;
  /** Despesa estrutural (sem impulsos de política) menos a inicial: postura fiscal para a demanda. */
  structuralStance: number;
  /** Impulsos de despesa ativos, com sinal da despesa (+ = mais gasto). */
  impulses: ScheduledImpulse[];
  /**
   * Fração dos cortes discricionários do mês que foi de fato executada (0–1). Cortes que passam do que resta de
   * discricionária não reduzem despesa e não podem contrair a demanda (§4, despesa efetivamente executada).
   */
  cutExecution: number;
}

/**
 * Despesa do mês (ECONOMIC_MODEL.md §5.8). Obrigatórias crescem pela regra de cada grupo; o limite cresce pela
 * regra do arcabouço; as discricionárias livres ficam com o espaço que sobra (a LOA usa todo o limite), nunca
 * abaixo de `discricionaria_minima`. Gasto discricionário de política sai desse espaço; contingenciamento corta
 * abaixo dele. O que passar do limite é estouro registrado (invariante §7.4).
 */
export function spendingMonth(
  state: Readonly<GameState>,
  fiscal: FiscalState,
  structure: FiscalStructure,
  linkedBase: number,
  potentialGrowth: number,
  c: Calibration,
): SpendingMonth {
  const t = state.monthIndex;
  const relative = (g: number) => ((1 + g) / (1 + potentialGrowth)) ** (1 / MONTHS_PER_YEAR);
  const mandatory = Object.fromEntries(
    MANDATORY_GROUPS.map((g) => [g, fiscal.mandatory[g] * relative(c[GROWTH_PARAM[g]])]),
  ) as Record<MandatoryGroup, number>;
  const spendingLimit = fiscal.spendingLimit * relative(fiscal.limitRealGrowth);
  const exceptions = fiscal.exceptions;
  const linked = structure.linkedShare * linkedBase;

  const mandatoryImpulses = activeImpulses(state.impulses, t, MANDATORY_TARGETS);
  const discretionaryImpulses = activeImpulses(state.impulses, t, DISCRETIONARY_TARGETS);
  const extraordinaryImpulses = activeImpulses(state.impulses, t, EXTRAORDINARY_TARGETS);
  const extraordinary = extraordinaryImpulses.reduce((s, i) => s + i.delta, 0);
  const policyMandatory = mandatoryImpulses.reduce((s, i) => s + i.delta, 0);
  const plus = discretionaryImpulses.reduce((s, i) => s + Math.max(0, i.delta), 0);
  const minus = discretionaryImpulses.reduce((s, i) => s + Math.min(0, i.delta), 0);

  const ruled = MANDATORY_GROUPS.reduce((s, g) => s + mandatory[g], 0) + linked;
  const room = spendingLimit - ruled - policyMandatory;
  const planned = Math.max(c.discricionaria_minima, room - plus);
  const discretionary = Math.max(0, planned + minus);
  const total = ruled + policyMandatory + discretionary + plus + exceptions + extraordinary;
  const limitExcess = Math.max(0, total - exceptions - extraordinary - spendingLimit);

  const withoutPolicies = ruled + Math.max(c.discricionaria_minima, spendingLimit - ruled) + exceptions;
  const compression = total - withoutPolicies - policyMandatory - plus - minus - extraordinary;

  return {
    total,
    mandatory,
    linked,
    policyMandatory,
    discretionary,
    policyDiscretionary: plus,
    exceptions,
    extraordinary,
    spendingLimit,
    limitExcess,
    withoutPolicies,
    compression,
    structuralStance: ruled + planned + exceptions - structure.initialSpending,
    impulses: [...mandatoryImpulses, ...discretionaryImpulses, ...extraordinaryImpulses],
    cutExecution: minus < 0 ? (discretionary - planned) / minus : 1,
  };
}

/** Parcelas da despesa do mês para o "Por que mudou?" (somam `total − withoutPolicies`). */
export function spendingPieces(s: SpendingMonth): Piece[] {
  return [
    ...s.impulses.map((i) => impulsePiece(i, i.delta)),
    {
      cause: 'compressao_discricionarias',
      label: 'Compressão das discricionárias (limite de despesas)',
      delta: s.compression,
    },
  ];
}

/** Espaço para gasto discricionário novo sem estourar o limite (fração do PIB; usado por propostas e pareceres). */
export function fiscalRoom(fiscal: FiscalState, c: Calibration): { room: number; aboveFloor: number } {
  return {
    room: Math.max(0, fiscal.discretionary - c.discricionaria_minima),
    aboveFloor: Math.max(0, fiscal.discretionary - c.piso_custeio),
  };
}
