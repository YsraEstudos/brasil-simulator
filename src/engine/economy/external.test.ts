import { describe, expect, it } from 'vitest';

import { advanceMonth } from '@/engine/advanceMonth';
import { DEFAULT_CALIBRATION, type Calibration } from '@/engine/economy/calibration';
import { economyStep } from '@/engine/economy/economy';
import { riskTarget, type RiskDrivers } from '@/engine/economy/external';
import { checkInvariants } from '@/engine/invariants';
import type { GameState, ScheduledImpulse } from '@/engine/types';
import { testContent, testState } from '@/tests/fixtures';

// ECONOMIC_MODEL.md §5.5 e §8: prêmio de risco saturado, câmbio de equilíbrio e repasse cambial.

const QUIET: Calibration = {
  ...DEFAULT_CALIBRATION,
  ruido_hiato_casual: 0,
  ruido_hiato_estrategica: 0,
  ruido_hiato_realismo: 0,
};
const content = testContent({ calibration: QUIET });

function runMonths(start: GameState, months: number): { state: GameState; errors: string[] } {
  let state = start;
  const errors: string[] = [];
  for (let m = 0; m < months; m++) {
    const r = advanceMonth(state, { decisions: [] }, content, [economyStep]);
    errors.push(...checkInvariants(state, r.state, r.report, content));
    state = r.state;
  }
  return { state, errors };
}

const drivers = (overrides: Partial<RiskDrivers>): RiskDrivers => ({
  debt: 0,
  fiscalTarget: 0,
  credibility: 0,
  capitalFlight: 0,
  pressure: 0,
  shocks: 0,
  ...overrides,
});

const shock = (target: ScheduledImpulse['target'], delta: number, months: number): ScheduledImpulse => ({
  sourceId: `teste:${target}`,
  label: 'Choque de teste',
  target,
  delta,
  startMonth: 0,
  endMonth: months - 1,
});

describe('prêmio de risco (ECONOMIC_MODEL.md §5.5, §1.8)', () => {
  it('cresce com as causas e satura em premio_base + premio_extra_max', () => {
    const c = QUIET;
    const calm = riskTarget(drivers({}), c);
    const some = riskTarget(drivers({ debt: 0.02 }), c);
    const extreme = riskTarget(drivers({ debt: 10, fiscalTarget: 10 }), c);
    expect(calm).toBeCloseTo(c.premio_base, 12);
    expect(some).toBeGreaterThan(calm);
    expect(extreme).toBeGreaterThan(some);
    expect(extreme).toBeLessThanOrEqual(c.premio_base + c.premio_extra_max);
  });

  it('dívida muito alta eleva o prêmio, sem passar da saturação, e o motor segue estável', () => {
    const base = testState(1, 'estrategica', content);
    const indebted: GameState = { ...base, economy: { ...base.economy, grossDebt: 2.5 } };
    const run = runMonths(indebted, 24);
    expect(run.errors).toEqual([]);
    expect(run.state.economy.riskPremium).toBeGreaterThan(runMonths(base, 24).state.economy.riskPremium);
    expect(run.state.economy.riskPremium).toBeLessThanOrEqual(QUIET.premio_base + QUIET.premio_extra_max);
  });
});

describe('câmbio (ECONOMIC_MODEL.md §5.5)', () => {
  it('choque de saída de capital deprecia o câmbio e a depreciação chega à inflação com causa "Câmbio"', () => {
    const base = runMonths(testState(2, 'estrategica', content), 6);
    const shocked = runMonths(
      { ...testState(2, 'estrategica', content), impulses: [shock('choque.cambio', 0.03, 3)] },
      6,
    );
    expect(shocked.errors).toEqual([]);
    expect(shocked.state.economy.exchangeRate).toBeGreaterThan(base.state.economy.exchangeRate);
    expect(shocked.state.indicators.inflation12m).toBeGreaterThan(base.state.indicators.inflation12m);
  });

  it('Selic mais alta aprecia o câmbio (diferencial de juros)', () => {
    const base = testState(3, 'estrategica', content);
    const tight: GameState = { ...base, economy: { ...base.economy, selic: base.economy.selic + 0.04 } };
    const b = runMonths(base, 2).state.economy.exchangeRate;
    const t = runMonths(tight, 2).state.economy.exchangeRate;
    expect(t).toBeLessThan(b);
  });

  it('sem ruído nem choques, o câmbio real fica estável em 20 anos (paridade de preços)', () => {
    const start = testState(4, 'estrategica', content);
    const { state, errors } = runMonths(start, 240);
    expect(errors).toEqual([]);
    const e = state.economy;
    const foreign = (1 + QUIET.inflacao_externa) ** (240 / 12);
    const real = (e.exchangeRate * foreign) / e.priceLevel / start.economy.exchangeRate;
    expect(real).toBeGreaterThan(0.7);
    expect(real).toBeLessThan(1.3);
  });
});
