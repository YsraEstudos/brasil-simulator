import { describe, expect, it } from 'vitest';

import {
  advanceMonth,
  checkInvariants,
  createInitialState,
  createRng,
  monthKey,
  seedRng,
  TERM_MONTHS,
  toCalendar,
  toMonthIndex,
  type Decision,
  type GameState,
  type MonthStep,
} from './index';

// Valores PROVISORIO só para teste; o cenário real vem na Fase 02.
const campaign = (seed = 42) =>
  createInitialState({
    scenarioId: 'teste',
    difficulty: 'estrategica',
    seed,
    indicators: { approval: 0.45, gdpGrowth12m: 0.02, inflation12m: 0.045, unemployment: 0.06, primaryBalance12m: 0 },
  });

const decision = (policyId: string, agendaCost: number): Decision => ({ policyId, agendaCost });

/** Etapa de teste que usa o sorteador, para provar que o RNG é encadeado entre meses. */
const noisyApproval: MonthStep = (_state, rng) => [
  { indicator: 'approval', cause: 'ruido_teste', delta: rng.normal() * 0.001 },
];

function play(seed: number, months: number, steps: MonthStep[] = [noisyApproval]) {
  let state = campaign(seed);
  for (let m = 0; m < months; m++) {
    const decisions = m % 3 === 0 ? [decision('infraestrutura', 1), decision('reforma_administrativa', 2)] : [];
    const r = advanceMonth(state, decisions, steps);
    expect(checkInvariants(state, r.state, r.report)).toEqual([]);
    state = r.state;
  }
  return state;
}

describe('rng', () => {
  it('é reproduzível e fixo entre versões (mudar estes valores quebra saves antigos)', () => {
    const rng = createRng(seedRng(42));
    expect([rng.nextUint32(), rng.nextUint32(), rng.nextUint32()]).toMatchInlineSnapshot(`
      [
        853279530,
        1920286840,
        3588795744,
      ]
    `);
  });

  it('retoma a mesma sequência a partir do estado salvo', () => {
    const a = createRng(seedRng(7));
    for (let i = 0; i < 10; i++) a.float();
    const b = createRng(a.state());
    expect([a.float(), a.float(), a.float()]).toEqual([b.float(), b.float(), b.float()]);
  });

  it('gera distribuições com média e intervalo corretos', () => {
    const rng = createRng(seedRng(1));
    let sumU = 0;
    let sumN = 0;
    let sumN2 = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const u = rng.float();
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
      sumU += u;
      const z = rng.normal();
      sumN += z;
      sumN2 += z * z;
      const k = rng.int(1, 6);
      expect(Number.isInteger(k) && k >= 1 && k <= 6).toBe(true);
    }
    expect(sumU / n).toBeCloseTo(0.5, 1);
    expect(sumN / n).toBeCloseTo(0, 1);
    expect(Math.sqrt(sumN2 / n)).toBeCloseTo(1, 1);
  });

  it('sementes diferentes geram sequências diferentes', () => {
    expect(seedRng(1)).not.toEqual(seedRng(2));
  });
});

describe('calendário', () => {
  it('mês 0 é jan/2027 e o mandato termina em dez/2030 (GAME_DESIGN.md §4.1)', () => {
    expect(toCalendar(0)).toEqual({ year: 2027, month: 1 });
    expect(monthKey(TERM_MONTHS - 1)).toBe('2030-12');
    expect(toMonthIndex({ year: 2028, month: 7 })).toBe(18);
    for (const bad of [
      { year: 2027, month: 0 },
      { year: 2027, month: 13 },
      { year: 2027, month: 1.5 },
      { year: 2026, month: 12 },
    ]) {
      expect(() => toMonthIndex(bad)).toThrow(RangeError);
    }
  });
});

describe('advanceMonth', () => {
  it('determinismo: mesma semente e mesmas decisões → estado idêntico (ECONOMIC_MODEL.md §7.7)', () => {
    expect(play(123, TERM_MONTHS)).toEqual(play(123, TERM_MONTHS));
    expect(play(123, TERM_MONTHS).indicators).not.toEqual(play(124, TERM_MONTHS).indicators);
  });

  it('salvar no meio e retomar dá o mesmo resultado (estado é serializável)', () => {
    let state: GameState = campaign(5);
    for (let m = 0; m < 20; m++) state = advanceMonth(state, [], [noisyApproval]).state;
    const resumed: GameState = JSON.parse(JSON.stringify(state));
    let a = state;
    let b = resumed;
    for (let m = 0; m < 28; m++) {
      a = advanceMonth(a, [], [noisyApproval]).state;
      b = advanceMonth(b, [], [noisyApproval]).state;
    }
    expect(b).toEqual(a);
  });

  it('é pura: não altera o estado nem as decisões recebidas', () => {
    const state = campaign();
    const decisions = [decision('infraestrutura', 1)];
    const before = JSON.stringify({ state, decisions });
    advanceMonth(state, decisions, [noisyApproval]);
    expect(JSON.stringify({ state, decisions })).toBe(before);
  });

  it('limita as decisões aos pontos de agenda do mês (GAME_DESIGN.md §4.3)', () => {
    // estratégica = 3 pontos (GAME_DESIGN.md §6)
    const { report, state } = advanceMonth(campaign(), [
      decision('pec_reforma', 2),
      decision('pl_irpf', 2),
      decision('decreto_iof', 1),
      decision('invalida', -1),
    ]);
    expect(report.accepted.map((d) => d.policyId)).toEqual(['pec_reforma', 'decreto_iof']);
    expect(report.rejected.map((r) => [r.decision.policyId, r.reason])).toEqual([
      ['pl_irpf', 'sem_pontos_de_agenda'],
      ['invalida', 'custo_invalido'],
    ]);
    expect(state.decisionLog).toEqual([
      { monthIndex: 0, decision: decision('pec_reforma', 2) },
      { monthIndex: 0, decision: decision('decreto_iof', 1) },
    ]);
  });

  it('cada etapa vê o resultado das etapas anteriores do mesmo mês (ECONOMIC_MODEL.md §4)', () => {
    const seen: number[] = [];
    const bump: MonthStep = (s) => {
      seen.push(s.indicators.approval);
      return [{ indicator: 'approval', cause: 'teste', delta: 0.1 }];
    };
    const prev = campaign();
    const r = advanceMonth(prev, [], [bump, bump]);
    expect(seen[1]).toBeCloseTo(seen[0] + 0.1);
    expect(r.state.indicators.approval).toBeCloseTo(prev.indicators.approval + 0.2);
    expect(checkInvariants(prev, r.state, r.report)).toEqual([]);
  });

  it('o histórico guarda cópia das decisões (alterar o objeto depois não muda o save)', () => {
    const d: Decision = { policyId: 'decreto_iof', agendaCost: 1, params: { aliquota: 0.01 } };
    const { state } = advanceMonth(campaign(), [d]);
    (d.params as Record<string, number>).aliquota = 0.5;
    d.policyId = 'alterada';
    expect(state.decisionLog[0].decision).toEqual({
      policyId: 'decreto_iof',
      agendaCost: 1,
      params: { aliquota: 0.01 },
    });
  });

  it('decidir não altera indicadores diretamente (GAME_DESIGN.md §9)', () => {
    const state = campaign();
    const { state: next } = advanceMonth(state, [decision('infraestrutura', 1)]);
    expect(next.indicators).toEqual(state.indicators);
  });
});

describe('invariantes', () => {
  it('detecta contribuição que não explica a variação e valores impossíveis', () => {
    const prev = campaign();
    const { state, report } = advanceMonth(prev, []);
    const broken: GameState = { ...state, indicators: { ...state.indicators, unemployment: 1.2, approval: NaN } };
    const errors = checkInvariants(prev, broken, report);
    expect(errors.some((e) => e.includes('desemprego'))).toBe(true);
    expect(errors.some((e) => e.includes('não é finito'))).toBe(true);
    expect(errors.some((e) => e.includes('soma das contribuições'))).toBe(true);
  });
});
