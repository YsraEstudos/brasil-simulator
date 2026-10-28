import type { GameContent, GameState } from '@/engine/types';
import { resolveIllicitCalibration } from '@/engine/career/illicit';

/** Caixa mínimo quando a expansão de três bolsos não está configurada. */
export function simpleFinanceView(state: GameState) {
  const career = state.career;
  return career && career.stage !== 'governo' ? (career.finance ?? null) : null;
}

/** Visão financeira sem cálculo ou sorteio novo; valores em R$ mil. */
export function careerFinanceView(state: GameState, content: GameContent) {
  const career = state.career;
  const finance = career?.expandedFinance;
  if (!career || career.stage === 'governo' || !finance) return null;
  const illicitSpec = content.scenario.career?.finance?.expanded?.illicit;
  const illicit = illicitSpec ? resolveIllicitCalibration(illicitSpec) : undefined;
  const hazard =
    career.illicit && illicit
      ? Math.min(illicit.maxHazard, -Math.expm1(-illicit.sensitivity * career.illicit.exposure))
      : undefined;
  const risk = hazard === undefined ? null : hazard < 0.05 ? 'baixo' : hazard < 0.2 ? 'moderado' : 'alto';
  return {
    ...finance.pockets,
    spent: finance.spent,
    limit: finance.spendingLimit,
    personalAvailable: finance.personalAvailable,
    personalRemainingLimit: finance.personalLimit - finance.personalContributed,
    debt: finance.debt,
    debtLimit: finance.debtLimit,
    pending: finance.scheduled,
    illicitBalance: career.illicit?.balance,
    illicitPending: career.illicit?.pending ?? [],
    investigations: career.illicit?.investigations ?? 0,
    risk,
    stage: career.stage,
  };
}
