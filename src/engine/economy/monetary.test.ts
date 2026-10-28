import { describe, expect, it } from 'vitest';

import { PRESSURE_ACTION_ID } from '@/engine/actions';
import { advanceMonth } from '@/engine/advanceMonth';
import { DEFAULT_CALIBRATION, type Calibration } from '@/engine/economy/calibration';
import { economyStep } from '@/engine/economy/economy';
import { boardShare, copomRate } from '@/engine/economy/monetary';
import { opinionStep } from '@/engine/politics/opinion';
import type { GameState, MonthInput, MonthResult } from '@/engine/types';
import { testContent, testState } from '@/tests/fixtures';

// ECONOMIC_MODEL.md §5.4 e §5.4.1: Copom com juro neutro e prêmio de risco, passo de crise e pressão pública.

const QUIET: Calibration = {
  ...DEFAULT_CALIBRATION,
  ruido_hiato_casual: 0,
  ruido_hiato_estrategica: 0,
  ruido_hiato_realismo: 0,
};
const content = testContent({ calibration: QUIET });
const PRESS: MonthInput = { decisions: [{ policyId: PRESSURE_ACTION_ID, agendaCost: 1 }] };
const NOTHING: MonthInput = { decisions: [] };

function run(state: GameState, input: MonthInput): MonthResult {
  return advanceMonth(state, input, content, [economyStep, opinionStep]);
}

/** Estado no mês `m` (sem jogar meses): só o calendário muda. */
const atMonth = (m: number, state = testState(1, 'estrategica', content)): GameState => ({ ...state, monthIndex: m });

describe('diretoria do BC indicada pelo governo (LC 179/2021)', () => {
  it('2, 4, 7 e 9 de 9 membros do 1º ao 4º ano; o ciclo recomeça no mandato seguinte', () => {
    const c = QUIET;
    expect(boardShare(0, c)).toBeCloseTo(2 / 9, 12);
    expect(boardShare(12, c)).toBeCloseTo(4 / 9, 12);
    expect(boardShare(24, c)).toBeCloseTo(7 / 9, 12);
    expect(boardShare(47, c)).toBe(1);
    expect(boardShare(48, c)).toBe(1);
  });
});

describe('Copom (ECONOMIC_MODEL.md §5.4)', () => {
  const base = { selicPrev: 0.1, expectation: 0.03, gap: 0, riskPremium: QUIET.premio_base, pendingCut: 0 };

  it('em crise de inflação o passo máximo sobe de 100 para 150 bp', () => {
    const calm = copomRate({ ...base, expectation: 0.09, inflation12m: 0.05 }, QUIET);
    const crisis = copomRate({ ...base, expectation: 0.09, inflation12m: 0.09 }, QUIET);
    expect(calm).toBeCloseTo(0.1 + QUIET.max_passo, 12);
    expect(crisis).toBeCloseTo(0.1 + QUIET.max_passo_crise, 12);
  });

  it('prêmio de risco maior eleva o juro neutro e a Selic decidida', () => {
    const calm = copomRate({ ...base, inflation12m: 0.03 }, QUIET);
    const risky = copomRate({ ...base, inflation12m: 0.03, riskPremium: QUIET.premio_base + 0.03 }, QUIET);
    expect(risky).toBeGreaterThan(calm);
  });

  it('o corte por pressão não leva a queda da reunião além do passo máximo', () => {
    const atLimit = { ...base, gap: -0.03, inflation12m: 0.03 };
    const free = copomRate(atLimit, QUIET);
    const pressed = copomRate({ ...atLimit, pendingCut: 0.0015 }, QUIET);
    expect(free).toBeCloseTo(0.1 - QUIET.max_passo, 12);
    expect(pressed).toBeCloseTo(0.1 - QUIET.max_passo, 12);
    // Longe do limite, a pressão continua cortando 25 bp.
    const mild = { ...base, inflation12m: 0.03 };
    expect(copomRate({ ...mild, pendingCut: 0.0015 }, QUIET)).toBeCloseTo(copomRate(mild, QUIET) - 0.0025, 12);
  });
});

describe('pressão pública sobre o Banco Central (ECONOMIC_MODEL.md §5.4.1)', () => {
  it('custa 1 ação de agenda, só uma vez por mês, e não vira proposta', () => {
    const r = advanceMonth(
      testState(1, 'estrategica', content),
      { decisions: [...PRESS.decisions, ...PRESS.decisions] },
      content,
    );
    expect(r.report.accepted).toHaveLength(1);
    expect(r.report.rejected[0]?.reason).toBe('acao_repetida');
    expect(r.state.proposals).toEqual([]);
  });

  it('derruba a credibilidade, mais a cada repetição em 12 meses, e aparece como causa na inflação e na aprovação', () => {
    const start = atMonth(1);
    const quiet = run(start, NOTHING).state;
    const first = run(start, PRESS);
    const lossFirst = quiet.economy.credibility - first.state.economy.credibility;
    expect(lossFirst).toBeCloseTo(QUIET.custo_cred_pressao, 6);

    const quiet2 = run(first.state, NOTHING).state;
    const second = run(first.state, PRESS).state;
    const lossSecond = quiet2.economy.credibility - second.economy.credibility;
    expect(lossSecond).toBeCloseTo(2 * QUIET.custo_cred_pressao, 6);

    const causes = first.report.contributions.filter(
      (c) => c.cause === 'pressao_bc' || c.label === 'Pressão sobre o Banco Central',
    );
    expect(causes.some((c) => c.indicator === 'inflation12m' && c.delta > 0)).toBe(true);
    expect(causes.some((c) => c.indicator === 'approval' && c.delta > 0)).toBe(true);
  });

  it('o corte vale na próxima reunião do Copom e é maior com mais diretores indicados', () => {
    // Fevereiro (sem Copom) → março (com Copom), no 1º e no 4º ano do mandato.
    const cutIn = (february: number): number => {
      const pressed = run(atMonth(february), PRESS).state;
      expect(pressed.economy.bcPressure.pendingCut).toBeGreaterThan(0);
      const march = run(pressed, NOTHING);
      expect(march.state.economy.bcPressure.pendingCut).toBe(0);
      return march.report.copom?.pressureCut ?? Number.NaN;
    };
    const year1 = cutIn(1);
    const year4 = cutIn(37);
    expect(year1).toBeGreaterThanOrEqual(0);
    expect(year4).toBeGreaterThanOrEqual(year1);
    expect(year4).toBeGreaterThan(0);
  });

  it('pressões ficam registradas por 12 meses e elevam o prêmio de risco', () => {
    let state = atMonth(1);
    let quiet = atMonth(1);
    for (let m = 0; m < 6; m++) {
      state = run(state, m % 3 === 0 ? PRESS : NOTHING).state;
      quiet = run(quiet, NOTHING).state;
    }
    expect(state.economy.bcPressure.months).toHaveLength(2);
    expect(state.economy.riskPremium).toBeGreaterThan(quiet.economy.riskPremium);
    for (let m = 0; m < 12; m++) state = run(state, NOTHING).state;
    expect(state.economy.bcPressure.months).toEqual([]);
  });
});
