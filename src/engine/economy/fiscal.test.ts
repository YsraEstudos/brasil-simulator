import { describe, expect, it } from 'vitest';

import { advanceMonth } from '@/engine/advanceMonth';
import { DEFAULT_CALIBRATION, type Calibration } from '@/engine/economy/calibration';
import { economyStep } from '@/engine/economy/economy';
import { lossRate } from '@/engine/economy/fiscal';
import { checkInvariants } from '@/engine/invariants';
import {
  MANDATORY_GROUPS,
  REVENUE_GROUPS,
  type GameState,
  type MonthResult,
  type ScheduledImpulse,
} from '@/engine/types';
import { testContent, testState } from '@/tests/fixtures';

// ECONOMIC_MODEL.md §5.7–5.8 e POLITICAL_RULES.md §4.2–4.3: receitas por grupo, limite do arcabouço,
// compressão das discricionárias, revisão anual (salário mínimo e limite) e retorno decrescente.

const QUIET: Calibration = {
  ...DEFAULT_CALIBRATION,
  ruido_hiato_casual: 0,
  ruido_hiato_estrategica: 0,
  ruido_hiato_realismo: 0,
};
const content = testContent({ calibration: QUIET });

function runMonth(state: GameState): MonthResult {
  return advanceMonth(state, { decisions: [] }, content, [economyStep]);
}

function runMonths(start: GameState, months: number): { state: GameState; errors: string[]; last: MonthResult } {
  let last = runMonth(start);
  const errors = checkInvariants(start, last.state, last.report);
  for (let m = 1; m < months; m++) {
    const prev = last.state;
    last = runMonth(prev);
    errors.push(...checkInvariants(prev, last.state, last.report));
  }
  return { state: last.state, errors, last };
}

function permanent(target: ScheduledImpulse['target'], delta: number, label = target): ScheduledImpulse {
  return { sourceId: `teste:${target}`, label, target, delta, startMonth: 0, endMonth: null };
}

const withImpulses = (state: GameState, impulses: ScheduledImpulse[]): GameState => ({ ...state, impulses });

describe('estrutura fiscal inicial (ECONOMIC_MODEL.md §5.7–5.8)', () => {
  it('receitas por grupo somam a receita, despesas por grupo somam a despesa e o limite está cheio', () => {
    const e = testState(1, 'estrategica', content).economy;
    const f = e.fiscal;
    const revenue = REVENUE_GROUPS.reduce((s, g) => s + f.revenueByGroup[g], 0);
    expect(revenue).toBeCloseTo(e.revenue, 12);
    expect(e.revenue).toBeCloseTo(0.185, 12);
    const spending =
      MANDATORY_GROUPS.reduce((s, g) => s + f.mandatory[g], 0) + f.linked + f.discretionary + f.exceptions;
    expect(spending).toBeCloseTo(e.primarySpending, 12);
    expect(f.spendingLimit).toBeCloseTo(e.primarySpending - f.exceptions, 12);
    expect(f.limitExcess).toBe(0);
  });
});

describe('limite de despesas e compressão das discricionárias (ECONOMIC_MODEL.md §5.8)', () => {
  it('obrigatória nova que cabe no limite não muda a despesa total: sai das discricionárias', () => {
    const base = runMonth(testState(2, 'estrategica', content));
    const transfer = runMonth(
      withImpulses(testState(2, 'estrategica', content), [permanent('gasto.transferencia_baixa_renda', 0.003)]),
    );
    expect(transfer.state.economy.primarySpending).toBeCloseTo(base.state.economy.primarySpending, 12);
    expect(transfer.state.economy.fiscal.discretionary).toBeCloseTo(
      base.state.economy.fiscal.discretionary - 0.003,
      12,
    );
    const compression = transfer.report.contributions.find((c) => c.cause === 'compressao_discricionarias');
    expect(compression?.delta).toBeCloseTo(0.003 / 12, 12);
  });

  it('obrigatória nova acima do espaço estoura o limite com registro e derruba a credibilidade', () => {
    const start = withImpulses(testState(3, 'estrategica', content), [
      permanent('gasto.transferencia_baixa_renda', 0.02),
    ]);
    const run = runMonths(start, 6);
    expect(run.errors).toEqual([]);
    const f = run.state.economy.fiscal;
    expect(f.discretionary).toBeCloseTo(QUIET.discricionaria_minima, 12);
    expect(f.limitExcess).toBeGreaterThan(0.005);
    const quiet = runMonths(testState(3, 'estrategica', content), 6).state;
    expect(run.state.economy.credibility).toBeLessThan(quiet.economy.credibility);
    expect(run.state.indicators.primaryBalance12m).toBeLessThan(quiet.indicators.primaryBalance12m);
  });

  it('contingenciamento corta abaixo do limite e melhora o primário', () => {
    const cut = runMonths(withImpulses(testState(4, 'estrategica', content), [permanent('gasto.custeio', -0.003)]), 3);
    const base = runMonths(testState(4, 'estrategica', content), 3);
    expect(cut.errors).toEqual([]);
    expect(cut.state.economy.primarySpending).toBeLessThan(base.state.economy.primarySpending - 0.0029);
    expect(cut.state.indicators.primaryBalance12m).toBeGreaterThan(base.state.indicators.primaryBalance12m);
  });

  it('sem reformas, as obrigatórias crescem acima do PIB e comprimem as discricionárias até o mínimo', () => {
    const start = testState(5, 'estrategica', content);
    const run = runMonths(start, 72);
    expect(run.errors).toEqual([]);
    const f = run.state.economy.fiscal;
    expect(f.discretionary).toBeLessThan(start.economy.fiscal.discretionary);
    expect(f.discretionary).toBeGreaterThanOrEqual(QUIET.discricionaria_minima - 1e-12);
    expect(f.mandatory.previdencia).toBeGreaterThan(start.economy.fiscal.mandatory.previdencia);
    // O limite cresce menos que o PIB (70% da receita real): a razão limite/PIB cai.
    expect(f.spendingLimit).toBeLessThan(start.economy.fiscal.spendingLimit);
  });
});

describe('revisão anual em janeiro (Lei 15.077/2024; LC 200/2023)', () => {
  it('reajusta o salário mínimo pelo PIB de dois anos antes e revê o limite dentro da faixa', () => {
    const start = testState(6, 'estrategica', content);
    const run = runMonths(start, 13);
    const f = run.state.economy.fiscal;
    // Jan/2028 usa o PIB de 2026 (indicador inicial do cenário: 2%), dentro da faixa 0,6–2,5%.
    expect(f.minimumWageIndex).toBeCloseTo(1.02, 12);
    expect(f.limitRealGrowth).toBeGreaterThanOrEqual(QUIET.limite_piso);
    expect(f.limitRealGrowth).toBeLessThanOrEqual(QUIET.limite_teto);
    expect(f.gdpGrowthHistory[0]).toBe(0.02);
  });

  it('ganho real extra de política entra no reajuste de janeiro', () => {
    const extra: ScheduledImpulse = {
      sourceId: 'teste:sm',
      label: 'Valorização extra',
      target: 'salario_minimo',
      delta: 0.01,
      startMonth: 12,
      endMonth: 12,
    };
    const run = runMonths(withImpulses(testState(6, 'estrategica', content), [extra]), 13);
    expect(run.state.economy.fiscal.minimumWageIndex).toBeCloseTo(1.03, 12);
  });

  it('meta de primário descumprida reduz o crescimento do limite para 50% da receita (LC 200/2023 art. 5º)', () => {
    const start = testState(7, 'estrategica', content);
    const at11 = runMonths(start, 12).state;
    const missed: GameState = { ...at11, indicators: { ...at11.indicators, primaryBalance12m: -0.02 } };
    const met: GameState = { ...at11, indicators: { ...at11.indicators, primaryBalance12m: 0.01 } };
    const gMissed = runMonth(missed).state.economy.fiscal.limitRealGrowth;
    const gMet = runMonth(met).state.economy.fiscal.limitRealGrowth;
    expect(gMissed).toBeLessThanOrEqual(gMet);
  });
});

describe('receitas: repartição e retorno decrescente (ECONOMIC_MODEL.md §5.7)', () => {
  it('aumento pequeno de carga sobre a renda não tem perda, mas parte vai para estados e municípios', () => {
    const base = runMonth(testState(8, 'estrategica', content));
    const up = runMonth(withImpulses(testState(8, 'estrategica', content), [permanent('receita.renda', 0.003)]));
    const gain = up.state.economy.revenue - base.state.economy.revenue;
    expect(up.state.economy.fiscal.revenueLoss).toBe(0);
    expect(gain).toBeGreaterThan(0);
    expect(gain).toBeLessThan(0.003);
  });

  it('aumento grande de carga perde arrecadação, aparece como causa e eleva o prêmio de risco', () => {
    const base = runMonths(testState(9, 'estrategica', content), 3);
    const up = runMonths(withImpulses(testState(9, 'estrategica', content), [permanent('receita.renda', 0.03)]), 3);
    expect(up.errors).toEqual([]);
    expect(up.state.economy.fiscal.revenueLoss).toBeGreaterThan(0);
    expect(up.last.report.contributions.some((c) => c.cause === 'perda_arrecadacao' && c.delta < 0)).toBe(true);
    expect(up.state.economy.riskPremium).toBeGreaterThan(base.state.economy.riskPremium);
  });

  it('a perda cresce com a carga e satura em perda_max', () => {
    const c = QUIET;
    expect(lossRate(0.1, 0.1, 0.005, c)).toBe(0);
    const mid = lossRate(0.13, 0.1, 0.005, c);
    const high = lossRate(0.3, 0.1, 0.005, c);
    expect(mid).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(mid);
    expect(high).toBeLessThanOrEqual(c.perda_max);
  });
});
