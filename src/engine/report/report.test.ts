import { describe, expect, it } from 'vitest';

import { testContent, testState, TEST_BILL, TEST_DECREE, TEST_PEC } from '@/tests/fixtures';
import type { GameState, MonthReport } from '@/engine/types';

import { billions, pct, pp } from './format';
import { explainIndicator, headlines } from './explain';
import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';

import { createInitialState } from '../state';

import { adviseDecision, adviseEventChoice } from './dispatch';

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
    regional: null,
    ...overrides,
  };
}

function withRelation(state: GameState, relation: number): GameState {
  return {
    ...state,
    congress: { ...state.congress, blocs: state.congress.blocs.map((b) => ({ ...b, governmentRelation: relation })) },
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
          transition: { monthIndex: 2, status: 'aprovada', cause: 'votacao', detail: 'Câmara aprovou' },
        },
        {
          proposalId: 'teste_pl_transferencia_0',
          policyId: TEST_BILL.id,
          transition: { monthIndex: 2, status: 'em_tramitacao', cause: 'negociacao', detail: 'Negociação' },
        },
        {
          proposalId: 'teste_pl_transferencia_0',
          policyId: TEST_BILL.id,
          transition: { monthIndex: 2, status: 'vetada', cause: 'veto_mantido', detail: 'Veto mantido' },
        },
      ],
    });
    const lines = headlines(r, content);
    expect(lines[0]).toBe('Copom mantém a Selic em 13,00%');
    // A manchete da votação depende do status final; negociação não vira manchete (causa fora da lista).
    expect(lines).toContain('Congresso aprova: Ampliar transferência de renda (Câmara aprovou)');
    expect(lines).toContain('Congresso mantém veto: Ampliar transferência de renda (Veto mantido)');
    expect(lines.some((l) => l.includes('Negociação'))).toBe(false);
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

  it('articulação avisa pedágio na PEC e presidência da Casa insatisfeita (POLITICAL_RULES.md §6.3)', () => {
    const pec = adviseDecision(testState(), TEST_PEC.id, content);
    expect(pec.articulacao.text).toContain('Quórum qualificado');
    expect(adviseDecision(testState(), TEST_BILL.id, content).articulacao.text).not.toContain('Quórum qualificado');
    const hostil = adviseDecision(withRelation(testState(), -100), TEST_BILL.id, content);
    expect(hostil.articulacao.text).toContain('pode não pautar');
  });
});

describe('mesa de despacho: federação (ECONOMIC_MODEL.md §5.15; POLITICAL_RULES.md §2.1)', () => {
  const real = loadContent(DEFAULT_SCENARIO_ID);
  const state = createInitialState({ content: real, difficulty: 'estrategica', seed: 1 });

  it('a Comunicação diz onde a política pesa mais', () => {
    expect(adviseDecision(state, 'transferencia_renda_ampliacao', real).comunicacao.text).toContain(
      'Favorece mais o Nordeste',
    );
    expect(adviseDecision(state, 'reforma_administrativa', real).comunicacao.text).toContain('Distrito Federal');
  });

  it('a Articulação prevê a adesão dos governadores a programa por convênio', () => {
    const advice = adviseDecision(state, 'seguranca_cooperacao', real);
    expect(advice.articulacao.text).toContain('Governadores: devem aderir');
    expect(advice.forecast.adhesion).toBeGreaterThan(0);
    expect(advice.forecast.adhesion).toBeLessThan(1);
    expect(adviseDecision(state, 'irpf_tabela', real).forecast.adhesion).toBeNull();
  });
});

describe('mesa de despacho: execução e respostas a eventos (GAME_DESIGN.md §4.4)', () => {
  const real = loadContent(DEFAULT_SCENARIO_ID);
  const state = createInitialState({ content: real, difficulty: 'estrategica', seed: 1 });

  it('o custo do programa por convênio considera só os estados que devem aderir', () => {
    const advice = adviseDecision(state, 'seguranca_cooperacao', real);
    const share = advice.forecast.adhesion ?? 1;
    const casual = adviseDecision({ ...state, difficulty: 'casual' }, 'seguranca_cooperacao', real);
    expect(advice.forecast.annualFiscalImpact).toBeCloseTo(casual.forecast.annualFiscalImpact * share, 12);
  });

  it('a Fazenda cita o salário mínimo real e a credibilidade fiscal', () => {
    expect(adviseDecision(state, 'salario_minimo_valorizacao', real).fazenda.text).toContain('salário mínimo');
    const withCredibility = Object.values(real.policies).find((p) =>
      p.impacts.some((i) => i.channel === 'credibilidade_fiscal' && i.magnitude < 0),
    );
    if (withCredibility) {
      expect(adviseDecision(state, withCredibility.id, real).fazenda.text).toContain('credibilidade fiscal');
    }
  });

  it('resposta a evento tem os três pareceres, lidos dos efeitos da escolha', () => {
    const event = content.events.find((e) => e.id === 'teste_choque');
    if (!event) throw new Error('evento de teste ausente');
    const subsidiar = adviseEventChoice(event, 'subsidiar');
    expect(subsidiar?.fazenda.text).toContain('Custo de');
    expect(subsidiar?.fazenda.tone).toBe('desfavoravel');
    expect(subsidiar?.comunicacao.tone).toBe('favoravel');
    const absorver = adviseEventChoice(event, 'absorver');
    expect(absorver?.comunicacao.text).toContain('se o governo não responder');
    expect(adviseEventChoice(event, 'nao_existe')).toBeNull();
  });
});
