import { describe, expect, it } from 'vitest';

import { advanceMonth } from '@/engine/advanceMonth';
import { createRng } from '@/engine/rng';
import type { Decision, GameContent, GameState, Proposal, ReportDraft, StepContext } from '@/engine/types';
import { TEST_BILL, TEST_DECREE, TEST_PEC, TEST_SCENARIO, testContent, testState } from '@/tests/fixtures';
import type { Policy } from '@/types/policy';

import { proposalsStep } from './proposals';

const decisao = (policyId: string): Decision => ({ policyId, agendaCost: 0 });

/** Um mês com a etapa de propostas apenas. */
function passo(state: GameState, content: GameContent, decisions: Decision[] = []): GameState {
  return advanceMonth(state, { decisions }, content, [proposalsStep]).state;
}

/** Roda só a etapa, para inspecionar os impulsos gerados no mês. */
function etapa(state: GameState, content: GameContent, decisions: Decision[]) {
  const draft: ReportDraft = { proposalChanges: [], eventsResolved: [], eventsFired: [], notes: [], copom: null };
  const ctx: StepContext = { rng: createRng(state.rng), content, decisions, eventChoices: [], draft };
  return proposalsStep(state, ctx);
}

function proposta(state: GameState, policyId: string): Proposal {
  const p = state.proposals.find((x) => x.policyId === policyId);
  if (!p) throw new Error(`proposta ausente: ${policyId}`);
  return p;
}

function ultimaCausa(p: Proposal): string | undefined {
  return p.history[p.history.length - 1]?.cause;
}

/** Relações de todos os blocos do cenário com o mesmo valor. */
function relacoes(valor: number): GameState['congress'] {
  return { blocs: TEST_SCENARIO.blocs.map((b) => ({ id: b.id, governmentRelation: valor })) };
}

describe('propostas: ciclo de vida (GAME_DESIGN.md §9)', () => {
  it('ato do Executivo entra em execução no mesmo mês e conclui após 12 meses', () => {
    const content = testContent();
    const out = etapa(testState(), content, [decisao(TEST_DECREE.id)]);
    const id = `${TEST_DECREE.id}_0`;
    const p = out.state.proposals.find((x) => x.id === id);
    expect(p?.status).toBe('em_execucao');
    expect(p && ultimaCausa(p)).toBe('ato_executivo');

    const custeio = out.state.impulses.find((i) => i.target === 'gasto.custeio');
    expect(custeio?.delta).toBeCloseTo(-20000 / 13_000_000, 12);
    expect(custeio?.startMonth).toBe(1);
    expect(custeio?.endMonth).toBe(12);

    const aprovacao = out.state.impulses.find((i) => i.target === 'aprovacao');
    expect(aprovacao?.startMonth).toBe(0);
    expect(aprovacao?.endMonth).toBe(0);

    let state = passo(testState(), content, [decisao(TEST_DECREE.id)]);
    for (let m = 1; m < 12; m++) state = passo(state, content);
    expect(state.monthIndex).toBe(12);
    expect(proposta(state, TEST_DECREE.id).status).toBe('em_execucao');

    state = passo(state, content);
    expect(state.monthIndex).toBe(13);
    expect(proposta(state, TEST_DECREE.id).status).toBe('concluida');
  });

  it('projeto de lei é enviado com votação prevista e vota no mês previsto', () => {
    const content = testContent();
    let state = passo(testState(), content, [decisao(TEST_BILL.id)]);
    expect(proposta(state, TEST_BILL.id).status).toBe('em_tramitacao');
    expect(proposta(state, TEST_BILL.id).voteMonth).toBe(2);

    state = passo(state, content); // mês 1
    state = passo(state, content); // mês 2: votação
    const p = proposta(state, TEST_BILL.id);
    expect(p.votes.length).toBeGreaterThan(0);
    const todasAprovadas = p.votes.every((v) => v.approved);
    expect(p.status).toBe(todasAprovadas ? 'em_execucao' : 'rejeitada');
  });

  it('com relações em 100 o projeto é aprovado e cria impulso permanente de transferência', () => {
    const content = testContent();
    const base = { ...testState(), congress: relacoes(100) };
    let state = passo(base, content, [decisao(TEST_BILL.id)]);
    state = passo(state, content);
    state = passo(state, content);

    const p = proposta(state, TEST_BILL.id);
    expect(p.status).toBe('em_execucao');
    expect(p.votes.map((v) => v.house)).toEqual(['camara', 'senado']);
    expect(p.votes.every((v) => v.approved)).toBe(true);
    expect(ultimaCausa(p)).toBe('sancao');

    const transferencia = state.impulses.find((i) => i.target === 'gasto.transferencia_baixa_renda');
    expect(transferencia).toBeDefined();
    expect(transferencia?.endMonth).toBeNull();
  });

  it('janeiro é recesso: votação empurrada para fevereiro, exceto no Casual (POLITICAL_RULES.md §3.3)', () => {
    const content = testContent();
    const estrategica = { ...testState(42, 'estrategica'), monthIndex: 10 };
    const casual = { ...testState(42, 'casual'), monthIndex: 10 };
    expect(proposta(passo(estrategica, content, [decisao(TEST_BILL.id)]), TEST_BILL.id).voteMonth).toBe(13);
    expect(proposta(passo(casual, content, [decisao(TEST_BILL.id)]), TEST_BILL.id).voteMonth).toBe(12);
  });

  it('pauta cheia: a terceira proposta tramitando deixa a quarta parada (POLITICAL_RULES.md §6.3)', () => {
    const copias: Policy[] = [1, 2, 3, 4].map((i) => ({ ...TEST_BILL, id: `teste_pl_copia_${i}` }));
    const content = testContent({
      scenario: { ...TEST_SCENARIO, policies: [...TEST_SCENARIO.policies, ...copias.map((p) => p.id)] },
      policies: { ...testContent().policies, ...Object.fromEntries(copias.map((p) => [p.id, p])) },
    });
    const base = testState();
    const state0 = { ...base, resources: { ...base.resources, agendaPointsPerMonth: 10 } };
    const out = advanceMonth(state0, { decisions: copias.map((p) => decisao(p.id)) }, content, [proposalsStep]);
    expect(out.report.rejected).toEqual([]);

    const statuses = copias.map((p) => proposta(out.state, p.id).status);
    expect(statuses.filter((s) => s === 'em_tramitacao')).toHaveLength(3);
    expect(statuses.filter((s) => s === 'parada')).toHaveLength(1);
    const parada = proposta(out.state, copias[3].id);
    expect(ultimaCausa(parada)).toBe('capacidade_pauta');
    expect(parada.voteMonth).toBeNull();
  });

  it('PEC: quatro votações quando aprovada, e capital cai com o envio (POLITICAL_RULES.md §3)', () => {
    const content = testContent();
    const base = testState();
    const favoravel = { ...base, congress: relacoes(100), indicators: { ...base.indicators, approval: 0.9 } };
    let state = passo(favoravel, content, [decisao(TEST_PEC.id)]);
    expect(state.resources.politicalCapital).toBe(65);
    while (state.monthIndex <= 4) state = passo(state, content);
    const aprovada = proposta(state, TEST_PEC.id);
    expect(aprovada.votes).toHaveLength(4);
    expect(aprovada.status).toBe('em_execucao');
    expect(state.resources.politicalCapital).toBe(69);

    const contraria = { ...base, congress: relacoes(-100) };
    let perdida = passo(contraria, content, [decisao(TEST_PEC.id)]);
    while (perdida.monthIndex <= 4) perdida = passo(perdida, content);
    const rejeitada = proposta(perdida, TEST_PEC.id);
    expect(rejeitada.status).toBe('rejeitada');
    expect(rejeitada.votes).toHaveLength(1);
    expect(rejeitada.votes[0]?.house).toBe('camara');
    expect(rejeitada.votes[0]?.round).toBe(1);
    expect(perdida.resources.politicalCapital).toBe(57);
  });

  it('anterioridade anual: receita de decreto executado em março só começa em janeiro seguinte', () => {
    const politica: Policy = {
      ...TEST_DECREE,
      id: 'teste_anterioridade',
      instruments: ['decreto_aliquota'],
      conditions: ['anterioridade_anual'],
      impacts: [{ channel: 'receita_tributaria', magnitude: 10000, lagMonths: 0 }],
    };
    const content = testContent({
      policies: { ...testContent().policies, [politica.id]: politica },
      scenario: { ...TEST_SCENARIO, policies: [...TEST_SCENARIO.policies, politica.id] },
    });
    const base = { ...testState(42, 'estrategica', content), monthIndex: 3 };
    const state = passo(base, content, [decisao(politica.id)]);
    const receita = state.impulses.find((i) => i.target === 'receita.tributaria');
    expect(receita?.startMonth).toBe(12);
  });
});

describe('propostas: determinismo e pureza', () => {
  it('mesma semente gera mesmas propostas; a entrada não é alterada', () => {
    const content = testContent();
    const base = testState(7);
    const antes = JSON.stringify(base);

    const rodar = (): GameState => {
      let state = passo(base, content, [decisao(TEST_BILL.id), decisao(TEST_PEC.id)]);
      for (let m = 1; m < 6; m++) state = passo(state, content);
      return state;
    };
    const a = rodar();
    const b = rodar();

    expect(JSON.stringify(base)).toBe(antes);
    expect(JSON.stringify(a.proposals)).toBe(JSON.stringify(b.proposals));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
