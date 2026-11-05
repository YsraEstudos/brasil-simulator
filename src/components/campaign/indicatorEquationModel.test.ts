import { describe, expect, it } from 'vitest';

import { formatPercent } from '@/components/ui/format';
import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { advanceMonth, createInitialState, type GameState, type MonthReport } from '@/engine';

import { buildIndicatorEquation, EQUATION_TOP_TERMS, signedText, toSteps } from './indicatorEquationModel';
import { INDICATOR_META, INDICATOR_ORDER } from './labels';

// PLANO_SAVES_HISTORICO.md H9/D2: a conta aberta soma o valor mostrado, com relatórios reais de um cenário.

const content = loadContent(DEFAULT_SCENARIO_ID);

function play(seed: number, months: number): { previous: GameState; state: GameState; report: MonthReport }[] {
  let state = createInitialState({ content, difficulty: 'estrategica', seed });
  const out: { previous: GameState; state: GameState; report: MonthReport }[] = [];
  for (let m = 0; m < months; m++) {
    const r = advanceMonth(state, { decisions: [] }, content);
    out.push({ previous: state, state: r.state, report: r.report });
    state = r.state;
  }
  return out;
}

const months = [...play(7, 18), ...play(31, 18)];

function report(contributions: MonthReport['contributions']): MonthReport {
  const base = months[0].report;
  return { ...base, contributions };
}

describe('buildIndicatorEquation: relatórios reais do motor', () => {
  it('em todo mês e indicador, partida + parcelas + arredondamento = valor do cartão', () => {
    let roundings = 0;
    for (const { previous, state, report: r } of months) {
      for (const key of INDICATOR_ORDER) {
        const { decimals, label } = INDICATOR_META[key];
        const eq = buildIndicatorEquation(r, key, state.indicators[key], previous.indicators[key], decimals, label);
        const sum = eq.startSteps + eq.terms.reduce((n, t) => n + t.steps, 0) + eq.roundingSteps;
        expect(sum).toBe(eq.endSteps);
        // O fim é exatamente o texto do cartão (Indicator usa formatPercent) e a partida, o do mês passado.
        expect(eq.endText).toBe(formatPercent(state.indicators[key], decimals));
        expect(eq.startText).toBe(formatPercent(previous.indicators[key], decimals));
        expect(eq.terms.length).toBeLessThanOrEqual(EQUATION_TOP_TERMS + 1);
        if (eq.roundingSteps !== 0) {
          roundings++;
          expect(eq.roundingNote).toContain('arredondamento');
          expect(eq.line).toContain('arredondamento');
        } else {
          expect(eq.roundingNote).toBeNull();
        }
        // O ajuste nunca passa de meio passo por parcela arredondada (mais a partida e o fim).
        expect(Math.abs(eq.roundingSteps)).toBeLessThanOrEqual(Math.ceil((eq.terms.length + 2) / 2));
      }
    }
    // Com tantos meses, alguma conta precisa de ajuste: o teste exercita os dois caminhos.
    expect(roundings).toBeGreaterThan(0);
  });

  it('sem o mês passado, parte de valor atual menos a soma das causas (invariante §7.3)', () => {
    const { previous, state, report: r } = months[3];
    const { decimals, label } = INDICATOR_META.approval;
    const withPrev = buildIndicatorEquation(
      r,
      'approval',
      state.indicators.approval,
      previous.indicators.approval,
      decimals,
      label,
    );
    const without = buildIndicatorEquation(r, 'approval', state.indicators.approval, undefined, decimals, label);
    expect(without.startSteps).toBe(withPrev.startSteps);
  });
});

describe('buildIndicatorEquation: casos montados', () => {
  it('quatro maiores parcelas e o resto em "outros"', () => {
    const r = report([
      { indicator: 'approval', cause: 'a', label: 'A', delta: 0.01 },
      { indicator: 'approval', cause: 'b', label: 'B', delta: -0.02 },
      { indicator: 'approval', cause: 'c', label: 'C', delta: 0.003 },
      { indicator: 'approval', cause: 'd', label: 'D', delta: 0.004 },
      { indicator: 'approval', cause: 'e', label: 'E', delta: 0.001 },
      { indicator: 'approval', cause: 'f', label: 'F', delta: 0.001 },
      { indicator: 'inflation12m', cause: 'x', label: 'X', delta: 0.5 },
    ]);
    const eq = buildIndicatorEquation(r, 'approval', 0.499, 0.5, 1, 'Aprovação');
    expect(eq.terms.map((t) => t.key)).toEqual(['b', 'a', 'd', 'c', 'outros']);
    expect(eq.terms[4]).toMatchObject({ merged: 2, steps: 2, text: '+0,2' });
    expect(eq.roundingSteps).toBe(0);
    expect(eq.line).toBe('Aprovação: 50,0% no mês passado − 2,0 B + 1,0 A + 0,4 D + 0,3 C + 0,2 outros = 49,9%');
  });

  it('quando as parcelas arredondadas não fecham, mostra o arredondamento e explica', () => {
    // 0,04 + 0,04 + 0,04 p.p. = 0,12 p.p.: cada parcela vira 0,0, mas o total vira 0,1.
    const r = report([
      { indicator: 'approval', cause: 'a', label: 'A', delta: 0.0004 },
      { indicator: 'approval', cause: 'b', label: 'B', delta: 0.0004 },
      { indicator: 'approval', cause: 'c', label: 'C', delta: 0.0004 },
    ]);
    const eq = buildIndicatorEquation(r, 'approval', 0.5012, 0.5, 1, 'Aprovação');
    expect(eq.terms.every((t) => t.steps === 0)).toBe(true);
    expect(eq.roundingSteps).toBe(1);
    expect(eq.roundingText).toBe('+0,1');
    expect(eq.roundingNote).toBe(
      'Cada parcela foi arredondada para 0,1 p.p.; a diferença de +0,1 p.p. vem desse arredondamento.',
    );
    expect(eq.endText).toBe('50,1%');
  });

  it('sem causas: "sem variação"', () => {
    const eq = buildIndicatorEquation(report([]), 'unemployment', 0.08, 0.08, 1, 'Desemprego');
    expect(eq.terms).toEqual([]);
    expect(eq.line).toBe('Desemprego: 8,0% no mês passado, sem variação = 8,0%');
  });

  it('duas casas no resultado primário', () => {
    expect(toSteps(-0.0123, 2)).toBe(-123);
    expect(signedText(-123, 2)).toBe('−1,23');
    expect(signedText(0, 2)).toBe('0,00');
  });
});
