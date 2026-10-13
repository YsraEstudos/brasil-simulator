import { describe, expect, it } from 'vitest';

import { testContent, testState, TEST_BILL, TEST_DECREE, TEST_PEC } from '@/tests/fixtures';
import type { GameState, MonthReport } from '@/engine/types';

import { billions, pct, pp } from './format';
import { explainIndicator, headlines } from './explain';
import { adviseDecision } from './dispatch';

const content = testContent();

function report(overrides: Partial<MonthReport> = {}): MonthReport {
  return {
    monthIndex: 2,
    accepted: [],
    rejected: [],
    contributions: [],
    proposalChanges: [],
    eventsResolved: [],
    eventsFired: [],
    copom: null,
    notes: [],
    ...overrides,
  };
}

function withRelation(state: GameState, relation: number): GameState {
  return {
    ...state,
    congress: { blocs: state.congress.blocs.map((b) => ({ ...b, governmentRelation: relation })) },
  };
}

describe('format', () => {
  it('formata porcentagens com vírgula e sinal −', () => {
    expect(pct(0.045)).toBe('4,5%');
    expect(pct(-0.004, 2)).toBe('−0,40%');
  });

  it('formata pontos percentuais com sinal', () => {
    expect(pp(0.003)).toBe('+0,3 p.p.');
  });

  it('formata bilhões em reais', () => {
    expect(billions(15000)).toBe('R$ 15 bi');
    expect(billions(1500)).toBe('R$ 1,5 bi');
  });
});

describe('explainIndicator', () => {
  const r = report({
    contributions: [
      { indicator: 'inflation12m', cause: 'juros_bc', delta: -0.001, label: 'Juros do Banco Central' },
      { indicator: 'inflation12m', cause: 'expectativas', delta: 0.004 },
      { indicator: 'inflation12m', cause: 'juros_bc', delta: -0.0005 },
      { indicator: 'inflation12m', cause: 'flutuacoes', delta: 0.00001, label: 'Ruído' },
      { indicator: 'unemployment', cause: 'desemprego', delta: 0.02 },
    ],
  });

  it('agrupa por causa, ordena por |delta| e preserva a soma', () => {
    const parts = explainIndicator(r, 'inflation12m');
    expect(parts.map((p) => p.cause)).toEqual(['expectativas', 'juros_bc', 'flutuacoes']);
    expect(parts[0]?.label).toBe('Expectativas de inflação');
    expect(parts[1]?.label).toBe('Juros do Banco Central');
    expect(parts[1]?.delta).toBeCloseTo(-0.0015, 12);

    const sumParts = parts.reduce((n, p) => n + p.delta, 0);
    const sumContributions = r.contributions
      .filter((c) => c.indicator === 'inflation12m')
      .reduce((n, c) => n + c.delta, 0);
    expect(sumParts).toBeCloseTo(sumContributions, 12);
  });

  it('ignora outros indicadores', () => {
    expect(explainIndicator(r, 'unemployment')).toEqual([{ cause: 'desemprego', label: 'Desemprego', delta: 0.02 }]);
  });
});

describe('headlines', () => {
  it('inclui linha do Copom e título de evento', () => {
    const r = report({
      copom: { previous: 0.13, next: 0.13 },
      eventsFired: ['teste_choque'],
      eventsResolved: [{ eventId: 'teste_choque', choiceId: 'absorver', automatic: true }],
      proposalChanges: [
        {
          proposalId: 'teste_pl_transferencia_0',
          policyId: TEST_BILL.id,
          transition: { monthIndex: 2, status: 'aprovada', cause: 'votacao_camara', detail: 'Câmara aprovou' },
        },
      ],
    });
    const lines = headlines(r, content);
    expect(lines[0]).toBe('Copom mantém a Selic em 13,00%');
    expect(lines).toContain('Congresso aprova: Ampliar transferência de renda (Câmara aprovou)');
    expect(lines).toContain('Urgente: Choque de teste');
    expect(lines).toContain('Sem resposta do governo: Choque de teste');
  });
});

describe('adviseDecision', () => {
  it('decreto: articulação neutra e menção ao Executivo', () => {
    const advice = adviseDecision(testState(), TEST_DECREE.id, content);
    expect(advice.articulacao.tone).toBe('neutro');
    expect(advice.articulacao.text).toContain('Executivo');
    expect(advice.forecast.votes).toEqual([]);
  });

  it('projeto com custo positivo: fazenda descreve o custo', () => {
    const advice = adviseDecision(testState(), TEST_BILL.id, content);
    expect(advice.fazenda.text).toContain('Custo');
    expect(advice.forecast.annualFiscalImpact).toBeGreaterThan(0);
  });

  it('corte por decreto: fazenda favorável', () => {
    const advice = adviseDecision(testState(), TEST_DECREE.id, content);
    expect(advice.fazenda.tone).toBe('favoravel');
    expect(advice.forecast.annualFiscalImpact).toBeLessThan(0);
  });

  it('PEC com relação hostil: articulação desfavorável', () => {
    const advice = adviseDecision(withRelation(testState(), -100), TEST_PEC.id, content);
    expect(advice.articulacao.tone).toBe('desfavoravel');
    expect(advice.forecast.votes.length).toBe(4);
  });

  it('é determinística e não altera o estado', () => {
    const state = testState();
    const before = JSON.stringify(state);
    const a = adviseDecision(state, TEST_PEC.id, content);
    const b = adviseDecision(state, TEST_PEC.id, content);
    expect(a).toEqual(b);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('casual mostra um número; estratégica mostra uma faixa', () => {
    const casual = adviseDecision(testState(42, 'casual'), TEST_PEC.id, content);
    expect(casual.articulacao.text).not.toContain('entre');
    expect(casual.articulacao.text).toContain('cerca de');

    const estrategica = adviseDecision(testState(42, 'estrategica'), TEST_PEC.id, content);
    expect(estrategica.articulacao.text).toContain('entre');
  });

  it('política desconhecida lança RangeError', () => {
    expect(() => adviseDecision(testState(), 'nao_existe', content)).toThrow(RangeError);
  });
});
