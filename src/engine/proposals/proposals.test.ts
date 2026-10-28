import { describe, expect, it } from 'vitest';

import {
  AMENDMENTS_ACTION_ID,
  CONCEDE_ACTION_ID,
  NEGOTIATE_ACTION_ID,
  SANCTION_ACTION_ID,
  URGENCY_ACTION_ID,
} from '@/engine/actions';
import { advanceMonth } from '@/engine/advanceMonth';
import { predictVotes } from '@/engine/congress/congress';
import { DEFAULT_CALIBRATION } from '@/engine/economy/calibration';
import { sumActive } from '@/engine/impulses';
import { createRng } from '@/engine/rng';
import type { Decision, GameContent, GameState, MonthResult, Proposal, ReportDraft, StepContext } from '@/engine/types';
import { TEST_BILL, TEST_DECREE, TEST_MP, TEST_PEC, TEST_SCENARIO, testContent, testState } from '@/tests/fixtures';
import type { Policy } from '@/types/policy';

import { cutWindow, proposalsStep } from './proposals';

const c = DEFAULT_CALIBRATION;
const decisao = (policyId: string): Decision => ({ policyId, agendaCost: 0 });
const acao = (policyId: string, params: Record<string, string>): Decision => ({ policyId, agendaCost: 1, params });

/** Um mês com a etapa de propostas apenas. */
function mes(state: GameState, content: GameContent, decisions: Decision[] = []): MonthResult {
  return advanceMonth(state, { decisions }, content, [proposalsStep]);
}

function passo(state: GameState, content: GameContent, decisions: Decision[] = []): GameState {
  return mes(state, content, decisions).state;
}

/** Roda só a etapa, para inspecionar os impulsos gerados no mês. */
function etapa(state: GameState, content: GameContent, decisions: Decision[]) {
  const draft: ReportDraft = {
    proposalChanges: [],
    eventsResolved: [],
    eventsFired: [],
    notes: [],
    copom: null,
    regional: null,
  };
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

function causas(p: Proposal): string[] {
  return p.history.map((h) => h.cause);
}

/** Relações de todos os blocos do cenário com o mesmo valor. */
function relacoes(valor: number): GameState['congress'] {
  return { blocs: TEST_SCENARIO.blocs.map((b) => ({ id: b.id, governmentRelation: valor })), cabinet: [] };
}

function favoravel(seed = 42): GameState {
  const base = testState(seed);
  return { ...base, congress: relacoes(100), indicators: { ...base.indicators, approval: 0.9 } };
}

/** Conteúdo com a política extra disponível no cenário. */
function comPolitica(policy: Policy): GameContent {
  const base = testContent();
  return testContent({
    policies: { ...base.policies, [policy.id]: policy },
    scenario: { ...TEST_SCENARIO, policies: [...TEST_SCENARIO.policies, policy.id] },
  });
}

/** Avança até a proposta sair da tramitação ou até o mês-limite. */
function ateDecidir(state: GameState, content: GameContent, policyId: string, limite = 20): GameState {
  let s = state;
  while (s.monthIndex < limite && ['em_tramitacao', 'parada'].includes(proposta(s, policyId).status)) {
    s = passo(s, content);
  }
  return s;
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

  it('projeto de lei: Câmara, depois Senado, cada uma no seu prazo, com relator (POLITICAL_RULES.md §6.4)', () => {
    const content = testContent();
    // Prazo esperado de 2 meses: 1 na Câmara (fracao_tramitacao_camara = 0,5) e 1 no Senado.
    let state = passo(favoravel(), content, [decisao(TEST_BILL.id)]);
    let p = proposta(state, TEST_BILL.id);
    expect(p.status).toBe('em_tramitacao');
    expect(p.stage).toBe(0);
    expect(p.voteMonth).toBe(1);
    expect(TEST_SCENARIO.blocs.map((b) => b.id)).toContain(p.rapporteur);

    state = passo(state, content); // mês 1: Câmara
    p = proposta(state, TEST_BILL.id);
    expect(p.votes.map((v) => v.house)).toEqual(['camara']);
    expect(p.status).toBe('em_tramitacao');
    expect(p.stage).toBe(1);
    expect(p.voteMonth).toBe(2);

    state = passo(state, content); // mês 2: Senado
    p = proposta(state, TEST_BILL.id);
    expect(p.votes.map((v) => v.house)).toEqual(['camara', 'senado']);
    expect(p.status).toBe('aguardando_sancao');
    expect(p.voteMonth).toBe(3);
  });

  it('sanção tácita no mês seguinte à aprovação; o impulso permanente começa depois (POLITICAL_RULES.md §7)', () => {
    const content = testContent();
    let state = passo(favoravel(), content, [decisao(TEST_BILL.id)]);
    for (let m = 1; m <= 3; m++) state = passo(state, content);
    const p = proposta(state, TEST_BILL.id);
    expect(p.status).toBe('em_execucao');
    expect(ultimaCausa(p)).toBe('sancao_tacita');
    const transferencia = state.impulses.find((i) => i.target === 'gasto.transferencia_baixa_renda');
    expect(transferencia?.startMonth).toBe(4);
    expect(transferencia?.endMonth).toBeNull();
  });

  it('janeiro é recesso nas regras brasileiras, não nas simplificadas (POLITICAL_RULES.md §3.3)', () => {
    const content = testContent();
    const estrategica = { ...testState(42, 'estrategica'), monthIndex: 11 };
    const initial = testState(42, 'casual');
    const casual = {
      ...initial,
      monthIndex: 11,
      initialCampaignConfiguration: {
        ...initial.initialCampaignConfiguration,
        institutionalRules: 'simplificadas' as const,
      },
    };
    expect(proposta(passo(estrategica, content, [decisao(TEST_BILL.id)]), TEST_BILL.id).voteMonth).toBe(13);
    expect(proposta(passo(casual, content, [decisao(TEST_BILL.id)]), TEST_BILL.id).voteMonth).toBe(12);
  });

  it('pauta cheia na Câmara: a quarta proposta fica parada (POLITICAL_RULES.md §6.3)', () => {
    const copias: Policy[] = [1, 2, 3, 4].map((i) => ({ ...TEST_BILL, id: `teste_pl_copia_${i}` }));
    const content = testContent({
      scenario: { ...TEST_SCENARIO, policies: [...TEST_SCENARIO.policies, ...copias.map((p) => p.id)] },
      policies: { ...testContent().policies, ...Object.fromEntries(copias.map((p) => [p.id, p])) },
    });
    const base = testState();
    const state0 = { ...base, resources: { ...base.resources, agendaActionsPerMonth: 10 } };
    const out = advanceMonth(state0, { decisions: copias.map((p) => decisao(p.id)) }, content, [proposalsStep]);
    expect(out.report.rejected).toEqual([]);

    const statuses = copias.map((p) => proposta(out.state, p.id).status);
    expect(statuses.filter((s) => s === 'em_tramitacao')).toHaveLength(c.capacidade_pauta);
    expect(statuses.filter((s) => s === 'parada')).toHaveLength(1);
    const parada = proposta(out.state, copias[3].id);
    expect(ultimaCausa(parada)).toBe('capacidade_pauta');
    expect(parada.voteMonth).toBeNull();
    expect(parada.rapporteur).toBeNull();
  });

  it('vaga aberta vai para a proposta parada, não para a enviada no mês (POLITICAL_RULES.md §6.3)', () => {
    const copias: Policy[] = [1, 2, 3, 4, 5, 6].map((i) => ({ ...TEST_BILL, id: `teste_pl_fila_${i}` }));
    const content = testContent({
      scenario: { ...TEST_SCENARIO, policies: [...TEST_SCENARIO.policies, ...copias.map((p) => p.id)] },
      policies: { ...testContent().policies, ...Object.fromEntries(copias.map((p) => [p.id, p])) },
    });
    const base = favoravel();
    // Duas no mês 0; a terceira lota a pauta no mês 1 e a quarta fica parada.
    let s = passo({ ...base, resources: { ...base.resources, agendaActionsPerMonth: 10 } }, content, [
      decisao(copias[0].id),
      decisao(copias[1].id),
    ]);
    s = passo(s, content, [decisao(copias[2].id), decisao(copias[3].id)]);
    expect(proposta(s, copias[3].id).status).toBe('parada');
    const naCamara = (st: GameState, p: Policy) => {
      const x = proposta(st, p.id);
      return x.status === 'em_tramitacao' && x.stage === 0;
    };
    while (s.monthIndex < 12 && naCamara(s, copias[0]) && naCamara(s, copias[1])) s = passo(s, content);
    expect(naCamara(s, copias[2])).toBe(true);
    expect(proposta(s, copias[3].id).status).toBe('parada');

    // Duas vagas abertas e duas propostas novas: a parada entra primeiro.
    s = passo(s, content, [decisao(copias[4].id), decisao(copias[5].id)]);
    expect(proposta(s, copias[3].id).status).toBe('em_tramitacao');
    expect([copias[4], copias[5]].map((p) => proposta(s, p.id).status).sort()).toEqual(['em_tramitacao', 'parada']);
  });

  it('PEC ocupa duas vagas: PEC e um PL lotam a pauta de três vagas (POLITICAL_RULES.md §6.3)', () => {
    const outroPl: Policy = { ...TEST_BILL, id: 'teste_pl_outro' };
    const content = comPolitica(outroPl);
    const base = testState();
    const state0 = { ...base, resources: { ...base.resources, agendaActionsPerMonth: 10 } };
    const out = advanceMonth(
      state0,
      { decisions: [decisao(TEST_PEC.id), decisao(TEST_BILL.id), decisao(outroPl.id)] },
      content,
      [proposalsStep],
    );
    expect(proposta(out.state, TEST_PEC.id).status).toBe('em_tramitacao');
    expect(proposta(out.state, TEST_BILL.id).status).toBe('em_tramitacao');
    expect(proposta(out.state, outroPl.id).status).toBe('parada');
  });

  it('PEC: dois turnos em cada Casa, promulgada sem sanção; capital cai com o envio (POLITICAL_RULES.md §3)', () => {
    const content = testContent();
    let state = passo(favoravel(), content, [decisao(TEST_PEC.id)]);
    expect(state.resources.politicalCapital).toBe(70 + c.capital_envio_pec);
    // Emendas liberadas no mês 1: sem pedágio, as votações acontecem no prazo (2 meses por Casa).
    const id = proposta(state, TEST_PEC.id).id;
    state = passo(state, content, [acao(AMENDMENTS_ACTION_ID, { proposalId: id })]);
    while (state.monthIndex <= 4) state = passo(state, content);
    const aprovada = proposta(state, TEST_PEC.id);
    expect(aprovada.votes.map((v) => `${v.house}${v.round}`)).toEqual(['camara1', 'camara2', 'senado1', 'senado2']);
    expect(aprovada.votes[0]?.monthIndex).toBe(2);
    expect(aprovada.votes[2]?.monthIndex).toBe(4);
    expect(aprovada.status).toBe('em_execucao');
    expect(ultimaCausa(aprovada)).toBe('promulgacao');
    expect(state.resources.politicalCapital).toBe(70 + c.capital_envio_pec + c.capital_vitoria);
  });

  it('PEC rejeitada no 1º turno da Câmara com relações em −100', () => {
    const content = testContent();
    const contraria = { ...testState(), congress: relacoes(-100) };
    const perdida = ateDecidir(passo(contraria, content, [decisao(TEST_PEC.id)]), content, TEST_PEC.id);
    const rejeitada = proposta(perdida, TEST_PEC.id);
    expect(rejeitada.status).toBe('rejeitada');
    expect(rejeitada.votes).toHaveLength(1);
    expect(rejeitada.votes[0]?.house).toBe('camara');
    expect(rejeitada.votes[0]?.round).toBe(1);
    expect(perdida.resources.politicalCapital).toBe(70 + c.capital_envio_pec + c.capital_derrota);
  });

  it('anterioridade anual: receita de decreto executado em março só começa em janeiro seguinte', () => {
    const politica: Policy = {
      ...TEST_DECREE,
      id: 'teste_anterioridade',
      instruments: ['decreto_aliquota'],
      conditions: ['anterioridade_anual'],
      impacts: [{ channel: 'receita_tributaria', magnitude: 10000, lagMonths: 0 }],
    };
    const content = comPolitica(politica);
    const base = { ...testState(42, 'estrategica', content), monthIndex: 3 };
    const state = passo(base, content, [decisao(politica.id)]);
    const receita = state.impulses.find((i) => i.target === 'receita.tributaria');
    expect(receita?.startMonth).toBe(12);
  });
});

describe('propostas: relator, presidente da Casa e pedágio (POLITICAL_RULES.md §6.3–6.4)', () => {
  it('relator sem apoio altera o texto: escala menor e registro do parecer', () => {
    const content = testContent();
    const contraria = { ...testState(), congress: relacoes(-100) };
    let state = passo(contraria, content, [decisao(TEST_BILL.id)]);
    state = ateDecidir(state, content, TEST_BILL.id);
    const p = proposta(state, TEST_BILL.id);
    expect(p.votes.length).toBeGreaterThan(0);
    expect(p.textAltered).toBe(true);
    expect(p.scale).toBeCloseTo(c.escala_alterada, 12);
    expect(causas(p)).toContain('parecer_relator');
  });

  it('com relações em 100 o relator mantém o texto original', () => {
    const content = testContent();
    let state = passo(favoravel(), content, [decisao(TEST_BILL.id)]);
    for (let m = 1; m <= 3; m++) state = passo(state, content);
    const p = proposta(state, TEST_BILL.id);
    expect(p.textAltered).toBe(false);
    expect(p.scale).toBe(1);
    expect(p.rider).toBe(0);
  });

  it('presidente da Casa com relação ruim adia votações, até `max_adiamentos` por Casa', () => {
    const content = testContent();
    let adiou = false;
    for (let seed = 1; seed <= 20; seed++) {
      const base = { ...testState(seed), congress: relacoes(-50) };
      const state = ateDecidir(passo(base, content, [decisao(TEST_BILL.id)]), content, TEST_BILL.id, 30);
      const p = proposta(state, TEST_BILL.id);
      const adiamentos = p.history.filter((h) => ['presidente_nao_pautou', 'pedagio_emendas'].includes(h.cause)).length;
      if (causas(p).includes('presidente_nao_pautou')) adiou = true;
      // Duas Casas, cada uma com no máximo `max_adiamentos` adiamentos contados.
      expect(adiamentos).toBeLessThanOrEqual(2 * c.max_adiamentos);
      expect(p.status).not.toBe('em_tramitacao');
    }
    expect(adiou).toBe(true);
  });

  it('pedágio: PEC sem emendas é adiada em parte das sementes; com emendas, nunca por pedágio', () => {
    const content = testContent();
    let semEmendas = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const enviada = passo(favoravel(seed), content, [decisao(TEST_PEC.id)]);
      const sem = ateDecidir(enviada, content, TEST_PEC.id);
      if (causas(proposta(sem, TEST_PEC.id)).includes('pedagio_emendas')) semEmendas += 1;

      const id = proposta(enviada, TEST_PEC.id).id;
      const com = ateDecidir(
        passo(enviada, content, [acao(AMENDMENTS_ACTION_ID, { proposalId: id })]),
        content,
        TEST_PEC.id,
      );
      expect(causas(proposta(com, TEST_PEC.id))).not.toContain('pedagio_emendas');
    }
    expect(semEmendas).toBeGreaterThan(0);
  });

  it('emendas liberadas viram despesa discricionária por `emendas_meses` meses', () => {
    const content = testContent();
    const enviada = passo(testState(), content, [decisao(TEST_PEC.id)]);
    const id = proposta(enviada, TEST_PEC.id).id;
    const out = mes(enviada, content, [acao(AMENDMENTS_ACTION_ID, { proposalId: id })]);
    expect(out.report.rejected).toEqual([]);
    const emendas = out.state.impulses.find((i) => i.sourceId === `emendas:${id}`);
    expect(emendas?.target).toBe('gasto.custeio');
    expect(emendas?.delta).toBe(c.emendas_pedagio);
    expect(emendas?.startMonth).toBe(1);
    expect(emendas?.endMonth).toBe(c.emendas_meses);
    expect(proposta(out.state, TEST_PEC.id).negotiation.amendments).toBe(true);
  });
});

describe('propostas: negociação (POLITICAL_RULES.md §6.2–6.3)', () => {
  it('negociar com um bloco aumenta o apoio previsto dele, a relação, e custa capital', () => {
    const content = testContent();
    const enviada = passo(testState(), content, [decisao(TEST_PEC.id)]);
    const p0 = proposta(enviada, TEST_PEC.id);
    const antes = predictVotes(enviada, TEST_PEC, content, p0)[0]?.expectedYes ?? 0;
    const out = mes(enviada, content, [acao(NEGOTIATE_ACTION_ID, { proposalId: p0.id, blocId: 'direita' })]);
    expect(out.report.rejected).toEqual([]);
    const p1 = proposta(out.state, TEST_PEC.id);
    expect(p1.negotiation.blocs.direita).toBe(c.negociacao_apoio);
    expect(out.state.resources.politicalCapital).toBe(enviada.resources.politicalCapital + c.capital_negociacao);
    const direita = (s: GameState) => s.congress.blocs.find((b) => b.id === 'direita')?.governmentRelation;
    expect(direita(out.state)).toBe((direita(enviada) ?? 0) + c.relacao_negociacao);
    const depois = predictVotes(out.state, TEST_PEC, content, p1)[0]?.expectedYes ?? 0;
    expect(depois).toBeGreaterThan(antes);
  });

  it('apoio negociado satura em `negociacao_apoio_max`', () => {
    const content = testContent();
    let state = passo(testState(), content, [decisao(TEST_PEC.id)]);
    const id = proposta(state, TEST_PEC.id).id;
    for (let i = 0; i < 4; i++) {
      state = passo(state, content, [acao(NEGOTIATE_ACTION_ID, { proposalId: id, blocId: 'centro' })]);
    }
    expect(proposta(state, TEST_PEC.id).negotiation.blocs.centro).toBe(c.negociacao_apoio_max);
  });

  it('alvo inválido e repetição no mês são recusados; blocos diferentes são aceitos', () => {
    const content = testContent();
    const enviada = passo(testState(), content, [decisao(TEST_PEC.id)]);
    const id = proposta(enviada, TEST_PEC.id).id;
    const out = mes(enviada, content, [
      acao(NEGOTIATE_ACTION_ID, { proposalId: 'nao_existe', blocId: 'centro' }),
      acao(NEGOTIATE_ACTION_ID, { proposalId: id, blocId: 'bloco_fantasma' }),
      acao(NEGOTIATE_ACTION_ID, { proposalId: id, blocId: 'centro' }),
      acao(NEGOTIATE_ACTION_ID, { proposalId: id, blocId: 'centro' }),
      acao(NEGOTIATE_ACTION_ID, { proposalId: id, blocId: 'direita' }),
    ]);
    expect(out.report.rejected.map((r) => r.reason)).toEqual(['alvo_invalido', 'alvo_invalido', 'acao_repetida']);
    expect(out.report.accepted).toHaveLength(2);
  });

  it('ceder no texto reduz a escala e aumenta o apoio de todos', () => {
    const content = testContent();
    const enviada = passo(testState(), content, [decisao(TEST_PEC.id)]);
    const p0 = proposta(enviada, TEST_PEC.id);
    const out = mes(enviada, content, [acao(CONCEDE_ACTION_ID, { proposalId: p0.id })]);
    const p1 = proposta(out.state, TEST_PEC.id);
    expect(p1.scale).toBeCloseTo(c.escala_concessao, 12);
    expect(predictVotes(out.state, TEST_PEC, content, p1)[0]?.expectedYes ?? 0).toBeGreaterThan(
      predictVotes(enviada, TEST_PEC, content, p0)[0]?.expectedYes ?? 0,
    );
  });

  it('urgência só para PL/PLP: aproxima a votação; PEC recusa (CF art. 64)', () => {
    const lento: Policy = {
      ...TEST_BILL,
      id: 'teste_pl_lento',
      timeline: { ...TEST_BILL.timeline, expectedLegislativeMonths: 8 },
    };
    const content = comPolitica(lento);
    const base = testState();
    const state0 = { ...base, resources: { ...base.resources, agendaActionsPerMonth: 10 } };
    const enviada = passo(state0, content, [decisao(lento.id), decisao(TEST_PEC.id)]);
    expect(proposta(enviada, lento.id).voteMonth).toBe(4);
    const out = mes(enviada, content, [
      acao(URGENCY_ACTION_ID, { proposalId: proposta(enviada, lento.id).id }),
      acao(URGENCY_ACTION_ID, { proposalId: proposta(enviada, TEST_PEC.id).id }),
    ]);
    expect(out.report.rejected.map((r) => r.reason)).toEqual(['alvo_invalido']);
    expect(proposta(out.state, lento.id).voteMonth).toBe(3);
    expect(proposta(out.state, lento.id).negotiation.urgency).toBe(true);
  });
});

describe('propostas: sanção e veto (POLITICAL_RULES.md §7)', () => {
  /** PL aprovado com relações em 100; devolve o estado no mês da sanção (mês 3). */
  function aguardandoSancao(seed = 42): GameState {
    const content = testContent();
    let state = passo(favoravel(seed), content, [decisao(TEST_BILL.id)]);
    state = passo(state, content);
    state = passo(state, content);
    expect(proposta(state, TEST_BILL.id).status).toBe('aguardando_sancao');
    return state;
  }

  it('sancionar explicitamente registra a sanção', () => {
    const content = testContent();
    const state = aguardandoSancao();
    const id = proposta(state, TEST_BILL.id).id;
    const out = mes(state, content, [
      { policyId: SANCTION_ACTION_ID, agendaCost: 0, params: { proposalId: id, choice: 'sancionar' } },
    ]);
    expect(out.report.rejected).toEqual([]);
    expect(proposta(out.state, TEST_BILL.id).status).toBe('em_execucao');
    expect(ultimaCausa(proposta(out.state, TEST_BILL.id))).toBe('sancao');
  });

  it('veto total com base fiel e presidente popular é mantido: a lei não entra em vigor', () => {
    const content = testContent();
    const state = aguardandoSancao();
    const id = proposta(state, TEST_BILL.id).id;
    let next = passo(state, content, [
      { policyId: SANCTION_ACTION_ID, agendaCost: 0, params: { proposalId: id, choice: 'vetar_total' } },
    ]);
    let p = proposta(next, TEST_BILL.id);
    expect(p.status).toBe('apreciacao_veto');
    expect(p.voteMonth).toBe(4);
    expect(next.impulses.some((i) => i.sourceId === `proposta:${id}`)).toBe(false);

    const capital = next.resources.politicalCapital;
    next = passo(next, content);
    p = proposta(next, TEST_BILL.id);
    expect(p.status).toBe('vetada');
    expect(p.veto?.overridden).toBe(false);
    expect(next.resources.politicalCapital).toBe(capital + c.capital_veto_mantido);
    expect(next.impulses.some((i) => i.sourceId === `proposta:${id}`)).toBe(false);
  });

  it('veto derrubado põe a lei em vigor e custa capital (oposição forte e presidente impopular)', () => {
    const content = testContent();
    const state = aguardandoSancao();
    const id = proposta(state, TEST_BILL.id).id;
    const hostil = {
      ...state,
      congress: relacoes(-100),
      indicators: { ...state.indicators, approval: 0.1 },
    };
    let next = passo(hostil, content, [
      { policyId: SANCTION_ACTION_ID, agendaCost: 0, params: { proposalId: id, choice: 'vetar_total' } },
    ]);
    const capital = next.resources.politicalCapital;
    next = passo(next, content);
    const p = proposta(next, TEST_BILL.id);
    expect(p.veto?.overridden).toBe(true);
    expect(p.status).toBe('em_execucao');
    expect(ultimaCausa(p)).toBe('veto_derrubado');
    expect(next.resources.politicalCapital).toBe(capital + c.capital_veto_derrubado);
    expect(next.impulses.some((i) => i.sourceId === `proposta:${id}`)).toBe(true);
  });

  it('vetar acréscimos só quando o relator incluiu acréscimos; sanção fora do prazo é recusada', () => {
    const content = testContent();
    const state = aguardandoSancao();
    const id = proposta(state, TEST_BILL.id).id;
    const out = mes(state, content, [
      { policyId: SANCTION_ACTION_ID, agendaCost: 0, params: { proposalId: id, choice: 'vetar_acrescimos' } },
    ]);
    expect(out.report.rejected.map((r) => r.reason)).toEqual(['alvo_invalido']);
    const cedo = mes({ ...state, monthIndex: 2 }, content, [
      { policyId: SANCTION_ACTION_ID, agendaCost: 0, params: { proposalId: id, choice: 'sancionar' } },
    ]);
    expect(cedo.report.rejected.map((r) => r.reason)).toEqual(['alvo_invalido']);
  });

  it('acréscimos do relator seguem a liminar e a derrubada do STF da lei', () => {
    const judicial: Policy = { ...TEST_BILL, risks: [{ kind: 'judicializacao', probability: 1 }] };
    const content = testContent({ policies: { ...testContent().policies, [TEST_BILL.id]: judicial } });
    const base = aguardandoSancao();
    const p0 = proposta(base, TEST_BILL.id);
    const comAcrescimo: GameState = {
      ...base,
      proposals: base.proposals.map((p) => (p.id === p0.id ? { ...p, rider: c.custo_acrescimo } : p)),
    };
    const sancionada = passo(comAcrescimo, content);
    const j = proposta(sancionada, TEST_BILL.id).judicial;
    expect(j).not.toBeNull();
    if (!j) return;
    const rider = sancionada.impulses.filter((i) => i.sourceId === `acrescimo:${p0.id}`);
    const activeAt = (month: number) =>
      rider.some((i) => i.startMonth <= month && (i.endMonth === null || i.endMonth >= month));
    expect(activeAt(j.suspendFrom)).toBe(false);
    expect(activeAt(j.suspendTo + 1)).toBe(!j.struckDown && j.suspendTo + 1 <= 3 + c.meses_acrescimo - 1);
  });

  it('acréscimos do relator: vetados e mantidos não geram despesa; sancionados geram', () => {
    const content = testContent();
    const base = aguardandoSancao();
    const p0 = proposta(base, TEST_BILL.id);
    const comAcrescimo: GameState = {
      ...base,
      proposals: base.proposals.map((p) => (p.id === p0.id ? { ...p, rider: c.custo_acrescimo } : p)),
    };
    const sancionada = passo(comAcrescimo, content);
    const acrescimo = sancionada.impulses.find((i) => i.sourceId === `acrescimo:${p0.id}`);
    expect(acrescimo?.delta).toBe(c.custo_acrescimo);
    expect(acrescimo?.endMonth).toBe(3 + c.meses_acrescimo - 1);

    let vetada = passo(comAcrescimo, content, [
      { policyId: SANCTION_ACTION_ID, agendaCost: 0, params: { proposalId: p0.id, choice: 'vetar_acrescimos' } },
    ]);
    expect(proposta(vetada, TEST_BILL.id).status).toBe('em_execucao');
    expect(proposta(vetada, TEST_BILL.id).veto?.kind).toBe('acrescimos');
    vetada = passo(vetada, content);
    const p = proposta(vetada, TEST_BILL.id);
    expect(p.veto?.overridden).not.toBeNull();
    expect(vetada.impulses.some((i) => i.sourceId === `acrescimo:${p0.id}`)).toBe(p.veto?.overridden === true);
  });
});

describe('propostas: medida provisória (CF art. 62)', () => {
  it('MP tem vigência imediata e perde a eficácia se não for convertida em 120 dias', () => {
    const content = testContent();
    let state = passo(favoravel(), content, [decisao(TEST_MP.id)]);
    const id = proposta(state, TEST_MP.id).id;
    expect(state.impulses.some((i) => i.sourceId === `proposta:${id}` && i.startMonth === 0)).toBe(true);
    // Câmara em 3 meses, Senado em mais 3: a votação no Senado (mês 6) passa da vigência (mês 4).
    while (state.monthIndex <= 4) state = passo(state, content);
    const p = proposta(state, TEST_MP.id);
    expect(p.status).toBe('rejeitada');
    expect(ultimaCausa(p)).toBe('caducidade');
    expect(p.executionEnd).toBe(4);
    expect(sumActive(state.impulses, 5, 'gasto.custeio')).toBe(0);

    // CF art. 62 §10: não pode ser reeditada no mesmo ano; no ano seguinte, pode.
    const sameYear = mes(state, content, [decisao(TEST_MP.id)]);
    expect(sameYear.report.rejected.map((r) => r.reason)).toEqual(['reedicao_vedada']);
    const nextYear = mes({ ...state, monthIndex: 12 }, content, [decisao(TEST_MP.id)]);
    expect(nextYear.report.rejected).toEqual([]);
  });

  it('MP com mais de 45 dias tranca a pauta da Casa: o PL na mesma Casa espera', () => {
    const lento: Policy = {
      ...TEST_BILL,
      id: 'teste_pl_lento',
      timeline: { ...TEST_BILL.timeline, expectedLegislativeMonths: 4 },
    };
    const content = comPolitica(lento);
    // PL e MP enviados no mês 0: PL votaria na Câmara no mês 2; MP só no mês 3, com 2 meses de idade no mês 2.
    let state = passo(favoravel(), content, [decisao(TEST_MP.id), decisao(lento.id)]);
    state = passo(state, content);
    state = passo(state, content);
    const pl = proposta(state, lento.id);
    expect(causas(pl)).toContain('pauta_trancada_mp');
    expect(pl.votes).toHaveLength(0);
  });
});

describe('propostas: STF e escândalo na execução (POLITICAL_RULES.md §8)', () => {
  it('cutWindow divide impulsos que cruzam a janela e corta até o fim quando a medida cai', () => {
    const base = { sourceId: 'x', label: 'x', target: 'gasto.custeio' as const, delta: 1 };
    const impulses = [
      { ...base, startMonth: 0, endMonth: 2 },
      { ...base, startMonth: 0, endMonth: 20 },
      { ...base, startMonth: 7, endMonth: null },
      { ...base, startMonth: 30, endMonth: 31 },
    ];
    const suspensa = cutWindow(impulses, 5, 9);
    expect(suspensa.map((i) => [i.startMonth, i.endMonth])).toEqual([
      [0, 2],
      [0, 4],
      [10, 20],
      [10, null],
      [30, 31],
    ]);
    const derrubada = cutWindow(impulses, 5, null);
    expect(derrubada.map((i) => [i.startMonth, i.endMonth])).toEqual([
      [0, 2],
      [0, 4],
    ]);
  });

  it('com judicialização certa: liminar suspende a execução e o julgamento decide', () => {
    const politica: Policy = {
      ...TEST_DECREE,
      id: 'teste_judicial',
      timeline: { ...TEST_DECREE.timeline, executionMonths: 36 },
      risks: [{ kind: 'judicializacao', probability: 1 }],
    };
    const content = comPolitica(politica);
    let state = passo(testState(), content, [decisao(politica.id)]);
    const p0 = proposta(state, politica.id);
    const j = p0.judicial;
    expect(j).not.toBeNull();
    if (!j) return;
    expect(causas(p0)).toContain('acao_stf');
    expect(j.suspendFrom).toBeGreaterThanOrEqual(1);
    expect(j.suspendFrom).toBeLessThanOrEqual(c.liminar_lag_max);
    expect(sumActive(state.impulses, j.suspendFrom, 'gasto.custeio')).toBe(0);

    while (state.monthIndex <= j.suspendFrom) state = passo(state, content);
    expect(proposta(state, politica.id).status).toBe('suspensa');
    while (state.monthIndex <= j.suspendTo + 1) state = passo(state, content);
    const p = proposta(state, politica.id);
    expect(p.status).toBe(j.struckDown ? 'abandonada' : 'em_execucao');
    expect(ultimaCausa(p)).toBe(j.struckDown ? 'inconstitucional' : 'liminar_revogada');
    expect(sumActive(state.impulses, j.suspendTo + 1, 'gasto.custeio') !== 0).toBe(!j.struckDown);
  });

  it('escândalo certo na execução gera perda de aprovação por `escandalo_meses` meses', () => {
    const politica: Policy = { ...TEST_DECREE, id: 'teste_escandalo', risks: [{ kind: 'escandalo', probability: 1 }] };
    const content = comPolitica(politica);
    const state = passo(testState(), content, [decisao(politica.id)]);
    const escandalo = state.impulses.find((i) => i.label.startsWith('Escândalo'));
    expect(escandalo?.target).toBe('aprovacao');
    expect(escandalo?.delta).toBe(c.escandalo_aprovacao);
    expect((escandalo?.endMonth ?? 0) - (escandalo?.startMonth ?? 0) + 1).toBe(c.escandalo_meses);
    expect(causas(proposta(state, politica.id))).toContain('escandalo_execucao');
  });
});

describe('propostas: determinismo e pureza', () => {
  it('mesma semente gera mesmas propostas; a entrada não é alterada', () => {
    const content = testContent();
    const base = testState(7);
    const antes = JSON.stringify(base);

    const rodar = (): GameState => {
      let state = passo(base, content, [decisao(TEST_BILL.id), decisao(TEST_PEC.id)]);
      for (let m = 1; m < 10; m++) state = passo(state, content);
      return state;
    };
    const a = rodar();
    const b = rodar();

    expect(JSON.stringify(base)).toBe(antes);
    expect(JSON.stringify(a.proposals)).toBe(JSON.stringify(b.proposals));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
