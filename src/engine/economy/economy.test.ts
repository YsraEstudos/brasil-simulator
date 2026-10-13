import { describe, expect, it } from 'vitest';

import { checkInvariants } from '@/engine/invariants';
import { advanceMonth } from '@/engine/advanceMonth';
import { DEFAULT_CALIBRATION } from '@/engine/economy/calibration';
import { economyStep } from '@/engine/economy/economy';
import type { GameState, MonthResult, ScheduledImpulse } from '@/engine/types';
import { testContent, testState } from '@/tests/fixtures';

/** Roda um mês só com a etapa econômica. */
function runMonth(state: GameState, content = testContent()): MonthResult {
  return advanceMonth(state, { decisions: [] }, content, [economyStep]);
}

/** Roda `months` meses seguidos e devolve o estado final, checando invariantes a cada mês. */
function runMonths(start: GameState, months: number, content = testContent()): { state: GameState; errors: string[] } {
  let state = start;
  const errors: string[] = [];
  for (let m = 0; m < months; m++) {
    const res = runMonth(state, content);
    errors.push(...checkInvariants(state, res.state, res.report));
    state = res.state;
  }
  return { state, errors };
}

/** Calibração sem ruído do hiato (ECONOMIC_MODEL.md §7.8: teste de estabilidade sem choques). */
const NO_NOISE = {
  ...DEFAULT_CALIBRATION,
  ruido_hiato_casual: 0,
  ruido_hiato_estrategica: 0,
  ruido_hiato_realismo: 0,
};

/** Impulso permanente de demanda (ECONOMIC_MODEL.md §5.11). */
function permanent(target: ScheduledImpulse['target'], delta: number, label: string): ScheduledImpulse {
  return { sourceId: `teste:${target}`, label, target, delta, startMonth: 0, endMonth: null };
}

describe('economyStep', () => {
  // ECONOMIC_MODEL.md §7: invariantes obrigatórios em toda simulação de teste
  it('mantém os invariantes por 240 meses e é determinístico (ECONOMIC_MODEL.md §7, AI_INSTRUCTIONS.md §5)', () => {
    const first = runMonths(testState(7), 240);
    expect(first.errors).toEqual([]);

    const second = runMonths(testState(7), 240);
    expect(second.state).toEqual(first.state);
  });

  // ECONOMIC_MODEL.md §7.8: sem choques e sem ruído, a economia fica em faixas plausíveis
  it('fica estável por 240 meses sem choques nem ruído (ECONOMIC_MODEL.md §7.8)', () => {
    const content = testContent({ calibration: NO_NOISE });
    let state = testState(42, 'estrategica', content);
    for (let m = 0; m < 240; m++) {
      state = runMonth(state, content).state;
      expect(Math.abs(state.economy.outputGap)).toBeLessThan(0.05);
    }
    expect(state.indicators.inflation12m).toBeGreaterThan(0);
    expect(state.indicators.inflation12m).toBeLessThan(0.15);
    expect(state.indicators.unemployment).toBeGreaterThan(0.02);
    expect(state.indicators.unemployment).toBeLessThan(0.2);
    expect(state.economy.selic).toBeGreaterThanOrEqual(0);
    expect(state.economy.selic).toBeLessThan(0.3);
  });

  // ECONOMIC_MODEL.md §9 "testes de sentido": mais gasto de investimento aquece a economia
  it('gasto de investimento permanente eleva o crescimento e reduz o desemprego e o primário (ECONOMIC_MODEL.md §9)', () => {
    const base = testState(11);
    const boosted: GameState = {
      ...base,
      impulses: [permanent('gasto.investimento', 0.01, 'Obras de infraestrutura')],
    };
    const b = runMonths(base, 6).state.indicators;
    const s = runMonths(boosted, 6).state.indicators;
    expect(s.gdpGrowth12m).toBeGreaterThan(b.gdpGrowth12m);
    expect(s.unemployment).toBeLessThan(b.unemployment);
    expect(s.primaryBalance12m).toBeLessThan(b.primaryBalance12m);
  });

  // ECONOMIC_MODEL.md §5.2: juro real acima do neutro esfria o hiato
  it('Selic e juro real mais altos reduzem o hiato em 12 meses (ECONOMIC_MODEL.md §5.2)', () => {
    const base = testState(5);
    const tight: GameState = {
      ...base,
      economy: {
        ...base.economy,
        selic: base.economy.selic + 0.05,
        effectiveRealRate: base.economy.effectiveRealRate + 0.05,
      },
    };
    const b = runMonths(base, 12).state.economy.outputGap;
    const t = runMonths(tight, 12).state.economy.outputGap;
    expect(t).toBeLessThan(b);
  });

  // ECONOMIC_MODEL.md §5.3: choque de inflação eleva a inflação de 12 meses e aparece com o rótulo do impulso
  it('choque de inflação eleva a inflação de 12 meses e aparece nas contribuições com o rótulo', () => {
    const base = testState(3);
    const label = 'Choque de preços dos alimentos';
    const shocked: GameState = {
      ...base,
      impulses: [permanent('choque.inflacao', 0.005, label)],
    };
    const b = runMonth(base);
    const s = runMonth(shocked);
    expect(s.state.indicators.inflation12m).toBeGreaterThan(b.state.indicators.inflation12m);

    const tagged = s.report.contributions.filter((c) => c.label === label);
    expect(tagged).toHaveLength(1);
    expect(tagged[0]).toMatchObject({ indicator: 'inflation12m', cause: 'teste:choque.inflacao' });
  });

  // ECONOMIC_MODEL.md §5.4: Copom só nos meses de reunião; Selic em múltiplos de 25 pb
  it('decide a Selic só nas reuniões do Copom, em múltiplos de 25 pontos-base (ECONOMIC_MODEL.md §5.4)', () => {
    const january = runMonth(testState(9));
    expect(january.report.copom).not.toBeNull();
    expect(january.report.copom?.next).toBe(january.state.economy.selic);
    const steps = january.state.economy.selic / DEFAULT_CALIBRATION.passo_selic;
    expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9);

    const february = runMonth({ ...testState(9), monthIndex: 1 });
    expect(february.report.copom).toBeNull();
    expect(february.state.economy.selic).toBe(testState(9).economy.selic);
  });

  // ECONOMIC_MODEL.md §7.3: a soma das contribuições de cada indicador é exatamente a variação
  it('soma das contribuições de cada indicador é igual à variação (ECONOMIC_MODEL.md §7.3)', () => {
    const base = testState(21);
    const state: GameState = {
      ...base,
      impulses: [permanent('gasto.custeio', 0.002, 'Custeio'), permanent('receita.tributaria', 0.001, 'Tributo')],
    };
    const res = runMonth(state);
    const keys = ['approval', 'gdpGrowth12m', 'inflation12m', 'unemployment', 'primaryBalance12m'] as const;
    for (const key of keys) {
      const delta = res.state.indicators[key] - state.indicators[key];
      const explained = res.report.contributions
        .filter((c) => c.indicator === key)
        .reduce((sum, c) => sum + c.delta, 0);
      expect(Math.abs(delta - explained)).toBeLessThan(1e-9);
    }
  });
});
