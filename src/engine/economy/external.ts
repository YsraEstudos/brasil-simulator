import { sumActive } from '../impulses';
import type { Difficulty, GameState, StepContext } from '../types';

import type { Calibration, ParamName } from './calibration';

/**
 * Setor externo e risco (ECONOMIC_MODEL.md §5.5, §8): juro externo e termos de troca estocásticos, prêmio de
 * risco saturado e câmbio que volta ao equilíbrio de paridade (preços internos ÷ externos) deslocado pelo
 * diferencial de juros e pelos termos de troca. Sorteia exatamente três normais por mês, sempre na mesma ordem.
 */

const MONTHS_PER_YEAR = 12;

/** Desvio do ruído do hiato por dificuldade: também dá a escala dos demais ruídos (GAME_DESIGN.md §6). */
export const NOISE_PARAM: Record<Difficulty, ParamName> = {
  casual: 'ruido_hiato_casual',
  estrategica: 'ruido_hiato_estrategica',
  realismo: 'ruido_hiato_realismo',
};

/** Escala dos ruídos externos (1 na Estratégica). */
export function noiseScale(difficulty: Difficulty, c: Calibration): number {
  const reference = c.ruido_hiato_estrategica;
  return reference > 0 ? c[NOISE_PARAM[difficulty]] / reference : 0;
}

/** Valores iniciais do cenário que ancoram o câmbio de equilíbrio. */
export interface ExternalAnchor {
  exchangeRate: number;
  externalRate: number;
  riskPremium: number;
  selic: number;
}

/** Causas que empurram o prêmio de risco (todas ≥ 0, salvo choques), antes da saturação. */
export interface RiskDrivers {
  debt: number;
  fiscalTarget: number;
  credibility: number;
  capitalFlight: number;
  pressure: number;
  shocks: number;
}

export interface ExternalMonth {
  externalRate: number;
  termsOfTrade: number;
  riskPremium: number;
  riskTarget: number;
  exchangeRate: number;
  /** Variação do câmbio no mês (log). */
  exchangeChange: number;
  depreciation12m: number;
}

/** Soma das causas do prêmio (fração), antes da saturação. */
export function riskDrivers(
  state: Readonly<GameState>,
  credibility: number,
  incomeOverload: number,
  pressures12m: number,
  c: Calibration,
): RiskDrivers {
  const e = state.economy;
  return {
    debt: c.sens_divida_risco * Math.max(0, e.grossDebt - c.limiar_divida),
    fiscalTarget:
      c.sens_meta_risco * Math.max(0, c.meta_primario - c.banda_meta_primario - state.indicators.primaryBalance12m),
    credibility: c.sens_cred_risco * Math.max(0, c.credibilidade_base - credibility),
    capitalFlight: c.sens_saida_capital * incomeOverload,
    pressure: c.custo_risco_pressao * pressures12m,
    shocks: sumActive(state.impulses, state.monthIndex, 'choque.risco'),
  };
}

/** Prêmio-alvo: base + saturação tanh das causas (ECONOMIC_MODEL.md §1.8). */
export function riskTarget(drivers: RiskDrivers, c: Calibration): number {
  const raw = Object.values(drivers).reduce((s, v) => s + v, 0);
  return c.premio_base + c.premio_extra_max * Math.tanh(raw / c.premio_extra_max);
}

export function externalMonth(
  state: Readonly<GameState>,
  ctx: StepContext,
  drivers: RiskDrivers,
  anchor: ExternalAnchor,
): ExternalMonth {
  const c = ctx.content.calibration;
  const e = state.economy;
  const t = state.monthIndex;
  const scale = noiseScale(state.difficulty, c);
  const zRate = ctx.rng.normal();
  const zTerms = ctx.rng.normal();
  const zFx = ctx.rng.normal();

  const externalRate = Math.max(
    0,
    e.externalRate +
      (1 - c.rho_juros_externos) * (c.juros_externos_medio - e.externalRate) +
      c.ruido_juros_externos * scale * zRate,
  );
  const termsOfTrade = c.rho_termos_troca * e.termsOfTrade + c.ruido_termos_troca * scale * zTerms;

  const target = riskTarget(drivers, c);
  const riskPremium = Math.max(0, e.riskPremium + c.ajuste_risco * (target - e.riskPremium));

  // Câmbio de equilíbrio: paridade de preços, deslocada pelo diferencial de juros (saturado) e pelos termos de troca.
  const foreignPrices = (1 + c.inflacao_externa) ** (t / MONTHS_PER_YEAR);
  const differential = externalRate + riskPremium - e.selic - (anchor.externalRate + anchor.riskPremium - anchor.selic);
  const logEquilibrium =
    Math.log(anchor.exchangeRate * (e.priceLevel / foreignPrices)) +
    c.desvio_cambio_max * Math.tanh((c.elast_cambio_juros * differential) / c.desvio_cambio_max) -
    c.elast_cambio_termos_troca * termsOfTrade;
  const exchangeChange =
    c.ajuste_cambio * (logEquilibrium - Math.log(e.exchangeRate)) +
    sumActive(state.impulses, t, 'choque.cambio') +
    c.ruido_cambio * scale * zFx;

  return {
    externalRate,
    termsOfTrade,
    riskPremium,
    riskTarget: target,
    exchangeRate: e.exchangeRate * Math.exp(exchangeChange),
    exchangeChange,
    depreciation12m: e.depreciation12m + exchangeChange - e.depreciation12m / MONTHS_PER_YEAR,
  };
}
