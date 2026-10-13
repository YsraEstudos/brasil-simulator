import { describe, expect, it } from 'vitest';

import { TEST_BILL, TEST_DECREE, testContent, testState } from '@/tests/fixtures';

import {
  advanceMonth,
  checkInvariants,
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

const content = testContent();
const campaign = (seed = 42) => testState(seed);

const decision = (policyId: string, agendaCost = 1): Decision => ({ policyId, agendaCost });

/** Etapa de teste que usa o sorteador, para provar que o RNG é encadeado entre meses. */
const noisyApproval: MonthStep = (state, ctx) => ({
  state: { ...state },
  contributions: [{ indicator: 'approval', cause: 'ruido_teste', delta: ctx.rng.normal() * 0.001 }],
});

function play(seed: number, months: number, steps: MonthStep[] = [noisyApproval]) {
  let state = campaign(seed);
  for (let m = 0; m < months; m++) {
    const decisions = m % 3 === 0 ? [decision(TEST_DECREE.id), decision(TEST_BILL.id)] : [];
    const r = advanceMonth(state, { decisions }, content, steps);
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
    for (let m = 0; m < 20; m++) state = advanceMonth(state, { decisions: [] }, content, [noisyApproval]).state;
    const resumed: GameState = JSON.parse(JSON.stringify(state));
    let a = state;
    let b = resumed;
    for (let m = 0; m < 28; m++) {
      a = advanceMonth(a, { decisions: [] }, content, [noisyApproval]).state;
      b = advanceMonth(b, { decisions: [] }, content, [noisyApproval]).state;
    }
    expect(b).toEqual(a);
  });

  it('é pura: não altera o estado nem as decisões recebidas', () => {
    const state = campaign();
    const input = { decisions: [decision(TEST_DECREE.id)] };
    const before = JSON.stringify({ state, input });
    advanceMonth(state, input, content, [noisyApproval]);
    expect(JSON.stringify({ state, input })).toBe(before);
  });

  it('limita as decisões aos pontos de agenda e usa o custo do catálogo (GAME_DESIGN.md §4.3)', () => {
    // estratégica = 3 pontos (GAME_DESIGN.md §6); PEC custa 2 no catálogo, mesmo se a interface mandar 0
    const { report, state } = advanceMonth(
      campaign(),
      {
        decisions: [
          decision('teste_pec', 0),
          decision(TEST_BILL.id),
          decision(TEST_DECREE.id),
          decision('inexistente'),
          decision(TEST_BILL.id),
        ],
      },
      content,
      [],
    );
    expect(report.accepted.map((d) => [d.policyId, d.agendaCost])).toEqual([
      ['teste_pec', 2],
      [TEST_BILL.id, 1],
    ]);
    expect(report.rejected.map((r) => [r.decision.policyId, r.reason])).toEqual([
      [TEST_DECREE.id, 'sem_pontos_de_agenda'],
      ['inexistente', 'politica_desconhecida'],
      [TEST_BILL.id, 'ja_em_andamento'],
    ]);
    expect(state.decisionLog.map((r) => [r.monthIndex, r.decision.policyId])).toEqual([
      [0, 'teste_pec'],
      [0, TEST_BILL.id],
    ]);
  });

  it('cada etapa vê o resultado das etapas anteriores do mesmo mês (ECONOMIC_MODEL.md §4)', () => {
    const seen: number[] = [];
    const bump: MonthStep = (s) => {
      seen.push(s.indicators.approval);
      return { state: { ...s }, contributions: [{ indicator: 'approval', cause: 'teste', delta: 0.1 }] };
    };
    const prev = campaign();
    const r = advanceMonth(prev, { decisions: [] }, content, [bump, bump]);
    expect(seen[1]).toBeCloseTo(seen[0] + 0.1);
    expect(r.state.indicators.approval).toBeCloseTo(prev.indicators.approval + 0.2);
    expect(checkInvariants(prev, r.state, r.report)).toEqual([]);
  });

  it('indicadores só mudam por contribuição: etapa que altera o indicador direto é ignorada (§7.3)', () => {
    const cheat: MonthStep = (s) => ({
      state: { ...s, indicators: { ...s.indicators, approval: 1 } },
      contributions: [],
    });
    const prev = campaign();
    const r = advanceMonth(prev, { decisions: [] }, content, [cheat]);
    expect(r.state.indicators).toEqual(prev.indicators);
  });

  it('o histórico guarda cópia das decisões (alterar o objeto depois não muda o save)', () => {
    const d: Decision = { policyId: TEST_DECREE.id, agendaCost: 1, params: { aliquota: 0.01 } };
    const { state } = advanceMonth(campaign(), { decisions: [d] }, content, []);
    (d.params as Record<string, number>).aliquota = 0.5;
    d.policyId = 'alterada';
    expect(state.decisionLog[0].decision).toEqual({
      policyId: TEST_DECREE.id,
      agendaCost: 1,
      params: { aliquota: 0.01 },
    });
  });

  it('decidir não altera indicadores diretamente (GAME_DESIGN.md §9)', () => {
    const state = campaign();
    const { state: next } = advanceMonth(state, { decisions: [decision(TEST_DECREE.id)] }, content, []);
    expect(next.indicators).toEqual(state.indicators);
  });
});

describe('invariantes', () => {
  it('detecta contribuição que não explica a variação e valores impossíveis', () => {
    const prev = campaign();
    const { state, report } = advanceMonth(prev, { decisions: [] }, content, []);
    const broken: GameState = { ...state, indicators: { ...state.indicators, unemployment: 1.2, approval: NaN } };
    const errors = checkInvariants(prev, broken, report);
    expect(errors.some((e) => e.includes('desemprego'))).toBe(true);
    expect(errors.some((e) => e.includes('não é finito'))).toBe(true);
    expect(errors.some((e) => e.includes('soma das contribuições'))).toBe(true);
  });
});
