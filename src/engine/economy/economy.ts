import { activeImpulses, sumActive } from '../impulses';
import { scenarioEconomyValues } from '../state';
import type {
  Contribution,
  Difficulty,
  EconomyState,
  GameState,
  ImpulseTarget,
  IndicatorKey,
  MonthStep,
  ScheduledImpulse,
  StepContext,
} from '../types';

import type { Calibration, ParamName } from './calibration';

/**
 * Etapa econômica do mês (ECONOMIC_MODEL.md §4–5, versão simplificada v0.1).
 *
 * Calcula, nesta ordem: potencial, fluxos fiscais, credibilidade, hiato, inflação, Copom, juro real efetivo
 * e dívida. Devolve o novo bloco `economy` e as contribuições dos indicadores; os indicadores em si só mudam
 * quando o `advanceMonth` soma as contribuições (ECONOMIC_MODEL.md §7.3).
 */

/** Uma parcela de variação de um indicador, antes de virar `Contribution`. */
interface Piece {
  cause: string;
  label: string;
  delta: number;
}

/** Multiplicador e sinal de um impulso de demanda sobre o hiato (ECONOMIC_MODEL.md §5.2). */
interface DemandGain {
  mult: ParamName;
  sign: 1 | -1;
}

const DEMAND_GAIN: Partial<Record<ImpulseTarget, DemandGain>> = {
  'gasto.investimento': { mult: 'mult_investimento', sign: 1 },
  'gasto.custeio': { mult: 'mult_custeio', sign: 1 },
  'gasto.transferencia_baixa_renda': { mult: 'mult_transf_baixa_renda', sign: 1 },
  'gasto.transferencia_alta_renda': { mult: 'mult_transf_alta_renda', sign: 1 },
  'gasto.obrigatoria': { mult: 'mult_obrigatoria', sign: 1 },
  'receita.desoneracao_consumo': { mult: 'mult_desoneracao_consumo', sign: 1 },
  'receita.desoneracao_renda': { mult: 'mult_desoneracao_renda', sign: 1 },
  'receita.tributaria': { mult: 'mult_receita', sign: -1 },
  'demanda.credito': { mult: 'mult_credito', sign: 1 },
};

const GASTO_TARGETS: readonly ImpulseTarget[] = [
  'gasto.investimento',
  'gasto.custeio',
  'gasto.transferencia_baixa_renda',
  'gasto.transferencia_alta_renda',
  'gasto.obrigatoria',
];

const DESONERACAO_TARGETS: readonly ImpulseTarget[] = ['receita.desoneracao_consumo', 'receita.desoneracao_renda'];

/** Impulsos com efeito no resultado primário (ECONOMIC_MODEL.md §5.9). */
const FISCAL_TARGETS: readonly ImpulseTarget[] = [...GASTO_TARGETS, 'receita.tributaria', ...DESONERACAO_TARGETS];

/** Impulsos de demanda que entram no hiato (ECONOMIC_MODEL.md §5.2). */
const DEMAND_TARGETS = Object.keys(DEMAND_GAIN) as ImpulseTarget[];

/** Desvio do ruído mensal do hiato por dificuldade (GAME_DESIGN.md §6). */
const NOISE_PARAM: Record<Difficulty, ParamName> = {
  casual: 'ruido_hiato_casual',
  estrategica: 'ruido_hiato_estrategica',
  realismo: 'ruido_hiato_realismo',
};

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

const sumOf = (pieces: readonly Piece[]): number => pieces.reduce((s, p) => s + p.delta, 0);

const impulsePiece = (impulse: ScheduledImpulse, delta: number): Piece => ({
  cause: impulse.sourceId,
  label: impulse.label,
  delta,
});

/** Converte parcelas em contribuições, sem as de variação exatamente zero (AI_INSTRUCTIONS.md §3). */
function toContributions(indicator: IndicatorKey, pieces: readonly Piece[]): Contribution[] {
  return pieces
    .filter((p) => p.delta !== 0)
    .map((p) => ({ indicator, cause: p.cause, label: p.label, delta: p.delta }));
}

/**
 * Receita, despesa e resultado primário do mês, em fração do PIB anualizada (ECONOMIC_MODEL.md §5.7–5.9).
 * A receita depende do hiato anterior; a despesa parte da base do cenário mais os gastos agendados.
 */
function fiscalFlows(state: GameState, base: { revenue: number; primarySpending: number }, h0: number, c: Calibration) {
  const t = state.monthIndex;
  const sum = (target: ImpulseTarget) => sumActive(state.impulses, t, target);
  const lostRevenue = DESONERACAO_TARGETS.reduce((s, target) => s + sum(target), 0);
  const revenue = base.revenue * (1 + c.elast_receita_hiato * h0) + sum('receita.tributaria') - lostRevenue;
  const spending = base.primarySpending + GASTO_TARGETS.reduce((s, target) => s + sum(target), 0);
  return { revenue, spending, monthlyPrimary: revenue - spending };
}

/**
 * Credibilidade do mês, 0–1 (ECONOMIC_MODEL.md §5.3): volta à base aos poucos e cai com déficit abaixo da
 * banda, inflação acima do teto e dívida acima do limiar. Choques de `credibilidade` somam por cima.
 */
function nextCredibility(state: GameState, c: Calibration): number {
  const e = state.economy;
  const i = state.indicators;
  const recovery = c.recuperacao_cred * (c.credibilidade_base - e.credibility);
  const fiscalGap = Math.max(0, c.meta_primario - c.banda_meta_primario - i.primaryBalance12m);
  const inflationGap = Math.max(0, i.inflation12m - (c.meta_inflacao + c.tolerancia_meta));
  const debtGap = Math.max(0, e.grossDebt - c.limiar_divida);
  const penalties =
    (c.pena_cred_fiscal * fiscalGap + c.pena_cred_inflacao * inflationGap + c.pena_cred_divida * debtGap) / 12;
  const shocks = sumActive(state.impulses, state.monthIndex, 'credibilidade');
  return clamp(e.credibility + recovery - penalties + shocks, c.cred_min, c.cred_max);
}

/**
 * Parcelas da variação do hiato no mês (ECONOMIC_MODEL.md §5.2): inércia, juro real, impulsos fiscais e de
 * demanda (com multiplicador que cresce na ociosidade e cai com risco fiscal), choques e ruído.
 * Sorteia exatamente uma normal por mês, mesmo com desvio zero, para manter a sequência do RNG estável.
 */
function gapPieces(state: GameState, ctx: StepContext): Piece[] {
  const t = state.monthIndex;
  const e = state.economy;
  const c = ctx.content.calibration;
  const h0 = e.outputGap;
  const pieces: Piece[] = [
    { cause: 'inercia_hiato', label: 'Acomodação da atividade', delta: (c.rho_h - 1) * h0 },
    { cause: 'juros_bc', label: 'Juros do Banco Central', delta: -c.beta_r * (e.effectiveRealRate - c.juro_neutro) },
  ];

  const risk = (1 + c.sens_hiato * Math.max(0, -h0)) * (1 - c.sens_risco * (1 - e.credibility));
  for (const impulse of activeImpulses(state.impulses, t, DEMAND_TARGETS)) {
    const gain = DEMAND_GAIN[impulse.target];
    if (gain) pieces.push(impulsePiece(impulse, (1 - c.rho_h) * c[gain.mult] * risk * gain.sign * impulse.delta));
  }
  for (const impulse of activeImpulses(state.impulses, t, ['choque.hiato'])) {
    pieces.push(impulsePiece(impulse, impulse.delta));
  }

  const sigma = c[NOISE_PARAM[state.difficulty]];
  pieces.push({ cause: 'flutuacoes', label: 'Flutuações da economia', delta: ctx.rng.normal() * sigma });
  return pieces;
}

/**
 * Selic decidida pelo Copom (ECONOMIC_MODEL.md §5.4): regra de Taylor suavizada, movimento limitado por
 * reunião, arredondamento a 25 pontos-base e piso operacional.
 */
function copomRate(selicPrev: number, pe1: number, h1: number, c: Calibration): number {
  const target = c.juro_neutro + pe1 + c.phi_pi * (pe1 - c.meta_inflacao) + c.phi_h * h1;
  const raw = c.suav * selicPrev + (1 - c.suav) * target;
  const limited = clamp(raw, selicPrev - c.max_passo, selicPrev + c.max_passo);
  const rounded = Math.round(limited / c.passo_selic) * c.passo_selic;
  return Math.max(c.selic_piso, rounded);
}

/**
 * Dívida e juros (ECONOMIC_MODEL.md §5.9): a taxa implícita segue a Selic com defasagem; a dívida sobe com os
 * juros, cai com o resultado primário e cai com o crescimento do PIB nominal (ajuste do denominador).
 */
function debtDynamics(e: EconomyState, selic1: number, monthlyPrimary: number, nominalGrowth: number, c: Calibration) {
  const implicitRate = e.implicitRate + c.transmissao_selic_divida * (selic1 - e.implicitRate);
  const interest = implicitRate * e.grossDebt;
  const debtAdjustment = (-e.grossDebt * nominalGrowth) / 12;
  const grossDebt = e.grossDebt + (interest - monthlyPrimary) / 12 + debtAdjustment;
  return { implicitRate, interest, debtAdjustment, grossDebt };
}

/** Etapa econômica do pipeline mensal (ECONOMIC_MODEL.md §4–5). */
export const economyStep: MonthStep = (state, ctx) => {
  const t = state.monthIndex;
  const e = state.economy;
  const c = ctx.content.calibration;
  const i = state.indicators;
  const impulses = state.impulses;
  const base = scenarioEconomyValues(ctx.content.scenario);
  const h0 = e.outputGap;

  // §5.1: potencial
  const gPot = c.g_pot_base + sumActive(impulses, t, 'oferta.potencial');

  // §5.7–5.9: fluxos fiscais
  const flows = fiscalFlows(state, base, h0, c);
  if (flows.spending > c.limite_despesa) {
    ctx.draft.notes.push('Despesa primária acima do limite do arcabouço fiscal.');
  }

  // §5.3: credibilidade e expectativas
  const cred1 = nextCredibility(state, c);
  const pe1 = cred1 * c.meta_inflacao + (1 - cred1) * i.inflation12m;

  // §5.2: hiato
  const gap = gapPieces(state, ctx);
  const h1 = h0 + sumOf(gap);

  // §5.2, §5.3, §5.6, §5.9: contribuições de cada indicador (somas exatas, ECONOMIC_MODEL.md §7.3)
  const gdpPieces: Piece[] = [
    { cause: 'tendencia_potencial', label: 'Crescimento potencial', delta: (gPot - i.gdpGrowth12m) / 12 },
    ...gap,
  ];
  const unemploymentPieces: Piece[] = [
    {
      cause: 'tendencia_emprego',
      label: 'Ajuste do mercado de trabalho',
      delta: c.ajuste_u * (c.nairu - i.unemployment - c.theta * h0),
    },
    ...gap.map((p) => ({ ...p, delta: -c.ajuste_u * c.theta * p.delta })),
  ];
  const inflationPieces: Piece[] = [
    { cause: 'expectativas', label: 'Expectativas de inflação', delta: c.ajuste_inflacao * (pe1 - i.inflation12m) },
    { cause: 'atividade', label: 'Aquecimento da economia', delta: c.ajuste_inflacao * c.kappa * h0 },
    ...gap.map((p) => ({ ...p, delta: c.ajuste_inflacao * c.kappa * p.delta })),
    ...activeImpulses(impulses, t, ['choque.inflacao']).map((s) => impulsePiece(s, c.ajuste_inflacao * s.delta)),
  ];
  const primaryPieces: Piece[] = [
    {
      cause: 'tendencia_fiscal',
      label: 'Receitas e despesas correntes',
      delta: (base.revenue - base.primarySpending - i.primaryBalance12m) / 12,
    },
    {
      cause: 'ciclo_receita',
      label: 'Arrecadação e atividade',
      delta: (base.revenue * c.elast_receita_hiato * h0) / 12,
    },
    ...activeImpulses(impulses, t, FISCAL_TARGETS).map((s) => impulsePiece(s, (primarySign(s.target) * s.delta) / 12)),
  ];

  const contributions = [
    ...toContributions('gdpGrowth12m', gdpPieces),
    ...toContributions('unemployment', unemploymentPieces),
    ...toContributions('inflation12m', inflationPieces),
    ...toContributions('primaryBalance12m', primaryPieces),
  ];
  const g12n = i.gdpGrowth12m + sumOf(gdpPieces);
  const pi12n = i.inflation12m + sumOf(inflationPieces);

  // §5.4: Banco Central, só nas reuniões do Copom
  const isCopomMonth = ctx.content.scenario.copomMonths.includes((t % 12) + 1);
  const selic1 = isCopomMonth ? copomRate(e.selic, pe1, h1, c) : e.selic;
  if (isCopomMonth) ctx.draft.copom = { previous: e.selic, next: selic1 };

  // §5.2: juro real que chega à economia, com média móvel de lag_r meses
  const rEff1 = e.effectiveRealRate + (selic1 - pe1 - e.effectiveRealRate) / c.lag_r;

  // §5.9: dívida
  const debt = debtDynamics(e, selic1, flows.monthlyPrimary, g12n + pi12n, c);

  const economy: EconomyState = {
    outputGap: h1,
    potentialGrowth: gPot,
    selic: selic1,
    effectiveRealRate: rEff1,
    inflationExpectation: pe1,
    credibility: cred1,
    grossDebt: debt.grossDebt,
    implicitRate: debt.implicitRate,
    revenue: flows.revenue,
    primarySpending: flows.spending,
    monthlyPrimary: flows.monthlyPrimary,
    interest: debt.interest,
    debtAdjustment: debt.debtAdjustment,
  };

  return { state: { ...state, economy }, contributions };
};

/** Sinal do impulso no primário: receita tributária sobe o resultado; gasto e desoneração o reduzem. */
function primarySign(target: ImpulseTarget): number {
  return target === 'receita.tributaria' ? 1 : -1;
}
