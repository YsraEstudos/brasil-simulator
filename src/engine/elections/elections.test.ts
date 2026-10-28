import { describe, expect, it } from 'vitest';
import { loadContent } from '@/content';
import { advanceMonth, DEFAULT_STEPS } from '@/engine/advanceMonth';
import { RELACAO_MAX, RELACAO_MIN } from '@/engine/congress/relations';
import { campaignOutcome } from '@/engine/events/outcome';
import { checkInvariants } from '@/engine/invariants';
import { proposalsStep } from '@/engine/proposals/proposals';
import { createRng } from '@/engine/rng';
import { createInitialState } from '@/engine/state';
import type { Decision, GameContent, GameState, PoliticsState, ReportDraft, StepContext } from '@/engine/types';
import { TEST_BILL, TEST_DECREE, TEST_PEC } from '@/tests/fixtures';
import type { ScenarioElections } from '@/types/scenario';
import {
  DECLARE_CANDIDACY_ACTION_ID,
  declarationInTermWindow,
  electionsStep,
  governorTurnoverStep,
  MEMORY_MONTHS,
  moodOf,
  SUPPORT_CANDIDATE_ACTION_ID,
  weightedMemory,
} from './elections';
import { inVedacaoWindow, isNovoBeneficio, vedacaoAtiva } from './vedacao';

// FASE_08.md: eleições, memória do eleitor, intenção de voto, vedação eleitoral e renovação de 2030.
const ELECTIONS: ScenarioElections = {
  reeleicaoPermitida: true,
  mesEleicaoMunicipal: 21,
  mesEleicaoGeral: 45,
  janelaDeclaracao: { inicio: 39, fim: 44 },
};

const base = loadContent('brasil_2027_01_v060');
const content: GameContent = { ...base, scenario: { ...base.scenario, elections: ELECTIONS } };
const c = content.calibration;

// Estado inicial do cenário v060 (com UFs e blocos reais) e o bloco `elections` injetado.
function newState(seed = 7, difficulty: 'casual' | 'estrategica' | 'realismo' = 'estrategica'): GameState {
  return createInitialState({ content, difficulty, seed });
}

function politics(state: GameState) {
  if (!state.politics) throw new Error('estado sem politics');
  return state.politics;
}

/** Roda as etapas eleitorais direto, com as decisões dadas (pula o `screenInput`; sem as demais etapas). */
function runStep(state: GameState, decisions: Decision[] = [], withElections = true) {
  const draft: ReportDraft = {
    proposalChanges: [],
    eventsResolved: [],
    eventsFired: [],
    notes: [],
    copom: null,
    regional: null,
  };
  const ctx: StepContext = {
    rng: createRng(state.rng),
    content: withElections ? content : base,
    decisions,
    eventChoices: [],
    draft,
  };
  const electoral = electionsStep(state, ctx);
  const posse = governorTurnoverStep(electoral.state, ctx);
  return { state: posse.state, contributions: electoral.contributions };
}

/** Roda `months` meses pelas etapas eleitorais (e só por elas). */
function play(state: GameState, months: number, withElections = true) {
  let current = state;
  for (let i = 0; i < months; i++)
    current = advanceMonth(current, { decisions: [] }, withElections ? content : base, [
      electionsStep,
      governorTurnoverStep,
    ]).state;
  return current;
}

describe('moodOf e weightedMemory (FASE_08.md)', () => {
  it('clima neutro é zero e os desvios movem o clima no sinal esperado', () => {
    const neutral = {
      ...newState().indicators,
      inflation12m: c.meta_inflacao,
      unemployment: c.nairu,
      gdpGrowth12m: c.g_pot_base,
    };
    expect(moodOf(neutral, c)).toBeCloseTo(0, 10);
    expect(moodOf({ ...neutral, inflation12m: c.meta_inflacao + 0.02 }, c)).toBeLessThan(0);
    expect(moodOf({ ...neutral, unemployment: c.nairu + 0.02 }, c)).toBeLessThan(0);
    expect(moodOf({ ...neutral, gdpGrowth12m: c.g_pot_base + 0.02 }, c)).toBeGreaterThan(0);
    expect(moodOf({ ...neutral, inflation12m: 3, unemployment: 3 }, c)).toBeCloseTo(-c.mood_max, 10);
    expect(moodOf({ ...neutral, gdpGrowth12m: 3 }, c)).toBeCloseTo(c.mood_max, 10);
  });

  it('memória pondera os meses recentes com peso maior (janela_memoria × peso_memoria_recente)', () => {
    expect(weightedMemory([], c)).toBe(0);
    expect(weightedMemory([0.5, 0.5], c)).toBeCloseTo(0.5, 10);
    // 12 climas: os 6 antigos valem 1, os 6 recentes valem 3.
    const memory = [...Array(6).fill(-1), ...Array(6).fill(1)];
    expect(weightedMemory(memory, c)).toBeCloseTo(0.5, 10);
    expect(weightedMemory([1, ...Array(6).fill(1)], c)).toBeCloseTo(1, 10);
  });
});

describe('electionsStep (FASE_08.md)', () => {
  it('cenário sem eleições: etapa é no-op e não consome sorteio', () => {
    const state = play(newState(), 12, false);
    expect(state.politics).toBeUndefined();
    const withStep = advanceMonth(play(newState(), 5, false), { decisions: [] }, base, [electionsStep]).state;
    const withoutStep = advanceMonth(play(newState(), 5, false), { decisions: [] }, base, []).state;
    expect(withStep.rng).toEqual(withoutStep.rng);
  });

  it('cria o estado eleitoral no 1º mês e mantém a memória limitada a 12 meses', () => {
    const first = play(newState(), 1);
    expect(first.politics).toBeDefined();
    expect(politics(first).memoria).toHaveLength(1);
    expect(politics(first).votingIntention).toBeGreaterThanOrEqual(c.int_min);
    expect(politics(first).votingIntention).toBeLessThanOrEqual(c.int_max);
    const late = play(newState(), 48);
    expect(politics(late).memoria).toHaveLength(MEMORY_MONTHS);
  });

  it('a intenção desliza para o alvo e a soma das contribuições = variação em 48 meses', () => {
    let state = newState();
    for (let month = 0; month < 48; month++) {
      // No mês 0 o estado eleitoral ainda não existe: a intenção parte da base.
      const before = state.politics?.votingIntention ?? c.int_base;
      const { state: next, report } = advanceMonth(state, { decisions: [] }, content, [electionsStep]);
      const parts = report.contributions.filter((x) => x.indicator === 'votingIntention');
      const sum = parts.reduce((s, x) => s + x.delta, 0);
      expect(politics(next).votingIntention - before).toBeCloseTo(sum, 10);
      expect(politics(next).votingIntention).toBeGreaterThanOrEqual(c.int_min - 1e-9);
      expect(politics(next).votingIntention).toBeLessThanOrEqual(c.int_max + 1e-9);
      state = next;
    }
    // Alvo com aprovação e clima correntes; a intenção segue o alvo ao longo do mandato.
    const target =
      c.int_base +
      c.int_peso_aprovacao * (state.indicators.approval - c.aprovacao_base) +
      c.int_peso_memoria * weightedMemory(politics(state).memoria, c);
    expect(Math.abs(politics(state).votingIntention - target)).toBeLessThan(0.05);
  });

  it('saturação: um impulso de intenção enorme trava no teto com causa `saturacao`', () => {
    const state = newState();
    const withImpulse: GameState = {
      ...state,
      impulses: [
        {
          sourceId: 'teste:impulso',
          label: 'Impulso enorme',
          target: 'intencao',
          delta: 1,
          startMonth: 0,
          endMonth: 0,
        },
      ],
    };
    const out = runStep(withImpulse);
    expect(politics(out.state).votingIntention).toBeCloseTo(c.int_max, 10);
    expect(out.contributions.some((x) => x.cause === 'saturacao' && x.indicator === 'votingIntention')).toBe(true);
  });

  it('eleição municipal: contribuição `municipais` na aprovação e registro em eleicao_municipal', () => {
    let state = newState();
    let municipalReport = null;
    for (let month = 0; month <= ELECTIONS.mesEleicaoMunicipal; month++) {
      const r = advanceMonth(state, { decisions: [] }, content, [electionsStep]);
      state = r.state;
      if (state.monthIndex === ELECTIONS.mesEleicaoMunicipal + 1) municipalReport = r.report;
    }
    expect(state.monthIndex).toBe(ELECTIONS.mesEleicaoMunicipal + 1);
    expect(politics(state).eleicao_municipal?.monthIndex).toBe(ELECTIONS.mesEleicaoMunicipal);
    const municipal = municipalReport?.contributions.find((x) => x.cause === 'municipais');
    expect(municipal?.indicator).toBe('approval');
    expect(municipal?.delta).toBeCloseTo(c.municipais_efeito * weightedMemory(politics(state).memoria, c), 10);
  });

  it('eleição geral: candidatura exige declaração na janela, reeleição permitida e 1º mandato', () => {
    expect(declarationInTermWindow(44, 45, ELECTIONS)).toBe(true);
    expect(declarationInTermWindow(30, 45, ELECTIONS)).toBe(false);
    expect(declarationInTermWindow(38, 45, ELECTIONS)).toBe(false);

    // Sem declaração: sucessão (candidatura = false), resultado gravado no mês 45 (46 meses processados).
    const noRun: GameState = play(newState(11), 46);
    expect(politics(noRun).eleicao_geral?.candidatura).toBe(false);
    expect(politics(noRun).eleicao_geral?.monthIndex).toBe(ELECTIONS.mesEleicaoGeral);
    expect(typeof politics(noRun).eleicao_geral?.turno2).toBe('boolean');

    // Com declaração no mês 44: jogador candidato.
    const at45: GameState = play(newState(11), 45);
    const declared: GameState = { ...at45, politics: { ...politics(at45), declaracao: 44 } };
    const out = runStep(declared);
    expect(politics(out.state).eleicao_geral).toEqual({
      monthIndex: 45,
      candidatura: true,
      venceu: expect.any(Boolean),
      turno2: expect.any(Boolean),
    });

    // 2º mandato (mês 93): a declaração está na janela, mas a reeleição não é permitida de novo.
    const secondTerm: GameState = { ...declared, monthIndex: 93, politics: { ...politics(declared), declaracao: 92 } };
    expect(runStep(secondTerm).state.politics?.eleicao_geral?.candidatura).toBe(false);
  });

  it('eleição geral: governadores trocam de dono e o Congresso renova as relações', () => {
    const before: GameState = play(newState(7), 45);
    const after: GameState = play(before, 1);
    expect(after.regions.ufs).toHaveLength(before.regions.ufs.length);
    let changed = 0;
    after.regions.ufs.forEach((uf, i) => {
      expect(uf.governorRelation).toBeGreaterThanOrEqual(RELACAO_MIN);
      expect(uf.governorRelation).toBeLessThanOrEqual(RELACAO_MAX);
      if (uf.governorRelation !== before.regions.ufs[i].governorRelation) {
        changed++;
        expect(uf.governorRelation).toBe(c.governador_nova_relacao);
      }
    });
    expect(changed).toBeGreaterThan(0);
    let blocChanges = 0;
    after.congress.blocs.forEach((bloc, i) => {
      const delta = Math.abs(bloc.governmentRelation - before.congress.blocs[i].governmentRelation);
      expect(delta).toBeLessThanOrEqual(c.renovacao_amplitude + 1e-9);
      if (delta > 0) blocChanges++;
    });
    expect(blocChanges).toBeGreaterThan(0);
  });

  it('ações: declaração agenda o impulso de intenção e apoio melhora a relação do bloco', () => {
    const state: GameState = play(newState(), 40);
    const declared = runStep(state, [{ policyId: DECLARE_CANDIDACY_ACTION_ID, agendaCost: 1 }]);
    const declaracao = politics(declared.state).declaracao;
    expect(declaracao).toBe(40);
    const impulse = declared.state.impulses.find((i) => i.target === 'intencao');
    expect(impulse).toMatchObject({ startMonth: 40, endMonth: 40, delta: c.declaracao_intencao });
    const contribution = declared.contributions.find(
      (x) => x.indicator === 'votingIntention' && x.cause.includes(DECLARE_CANDIDACY_ACTION_ID),
    );
    expect(contribution?.delta).toBe(c.declaracao_intencao);

    const bloc = content.scenario.blocs[1];
    const relationBefore =
      state.congress.blocs.find((b) => b.id === bloc.id)?.governmentRelation ?? bloc.governmentRelation;
    const supported = runStep(state, [
      { policyId: SUPPORT_CANDIDATE_ACTION_ID, agendaCost: 1, params: { blocId: bloc.id } },
    ]);
    expect(politics(supported.state).apoio).toBe(bloc.id);
    const relationAfter = supported.state.congress.blocs.find((b) => b.id === bloc.id)?.governmentRelation ?? 0;
    expect(relationAfter).toBeCloseTo(Math.min(RELACAO_MAX, relationBefore + c.apoio_relacao_candidato), 10);
  });

  it('determinismo: mesma semente e mesmo input → mesmas eleições (FASE_08.md, critério 6)', () => {
    const a = play(newState(3), 96);
    const b = play(newState(3), 96);
    expect(a.politics).toEqual(b.politics);
    expect(a.regions).toEqual(b.regions);
    expect(a.congress).toEqual(b.congress);
  });
});

describe('vedação eleitoral (POLITICAL_RULES.md §11.2; FASE_08.md)', () => {
  it('janela: os 3 meses antes de cada pleito', () => {
    for (const month of [17, 21, 41, 45]) expect(inVedacaoWindow(ELECTIONS, month)).toBe(false);
    for (const month of [18, 19, 20, 42, 43, 44]) expect(inVedacaoWindow(ELECTIONS, month)).toBe(true);
  });

  it('novo benefício: só canais de transferência/obrigatória/salário mínimo com magnitude positiva', () => {
    expect(isNovoBeneficio(TEST_BILL)).toBe(true);
    expect(isNovoBeneficio(TEST_DECREE)).toBe(false);
    expect(isNovoBeneficio(TEST_PEC)).toBe(false);
    // O cenário real precisa de pelo menos uma política de benefício para a vedação ter efeito.
    expect(Object.values(content.policies).some((p) => isNovoBeneficio(p))).toBe(true);
  });

  it('vedacaoAtiva: cenário com eleições, fora do casual, na janela', () => {
    const at18 = play(newState(), 18);
    expect(vedacaoAtiva(at18, content)).toBe(true);
    expect(vedacaoAtiva(play(newState(), 17), content)).toBe(false);
    const initial = newState(7, 'casual');
    const casual = play(
      {
        ...initial,
        initialCampaignConfiguration: { ...initial.initialCampaignConfiguration, institutionalRules: 'simplificadas' },
      },
      18,
    );
    expect(vedacaoAtiva(casual, content)).toBe(false);
    expect(vedacaoAtiva(at18, base)).toBe(false);
  });

  it('screenInput rejeita novo benefício sem bypass e aceita com `vedacao_bypass`', () => {
    const state = play(newState(), 18);
    const policy = Object.values(content.policies).find(
      (p) => isNovoBeneficio(p) && content.scenario.policies.includes(p.id) && p.delivery !== 'rotina',
    );
    if (!policy) throw new Error('cenário sem política de benefício fora da rotina');
    const decision: Decision = { policyId: policy.id, agendaCost: policy.agendaCost };

    const blocked = advanceMonth(state, { decisions: [decision] }, content, [electionsStep]);
    expect(blocked.report.rejected).toEqual([{ decision, reason: 'vedacao_eleitoral' }]);
    expect(blocked.report.accepted).toEqual([]);

    const bypass = advanceMonth(state, { decisions: [{ ...decision, params: { vedacao_bypass: true } }] }, content, [
      electionsStep,
    ]);
    expect(bypass.report.rejected).toEqual([]);
    expect(bypass.report.accepted).toHaveLength(1);
  });

  it('envio com bypass agenda a pena na intenção e arrisca multa da Justiça Eleitoral', () => {
    const state = play(newState(), 18);
    const policy = Object.values(content.policies).find(
      (p) => isNovoBeneficio(p) && content.scenario.policies.includes(p.id) && p.delivery !== 'rotina',
    );
    if (!policy) throw new Error('cenário sem política de benefício fora da rotina');
    const bypass: Decision = { policyId: policy.id, agendaCost: policy.agendaCost, params: { vedacao_bypass: true } };

    // A primeira tiragem de sorteio da etapa é a chance da multa: sem propostas em andamento, nada consome sorteio antes.
    const probe = createRng(state.rng).chance(c.prob_justica_vedacao);
    const draft: ReportDraft = {
      proposalChanges: [],
      eventsResolved: [],
      eventsFired: [],
      notes: [],
      copom: null,
      regional: null,
    };
    const ctx: StepContext = { rng: createRng(state.rng), content, decisions: [bypass], eventChoices: [], draft };
    const out = proposalsStep(state, ctx);

    const penalty = out.state.impulses.find((i) => i.sourceId === `vedacao:${policy.id}_18`);
    expect(penalty).toMatchObject({
      target: 'intencao',
      delta: -c.pena_intencao_vedacao,
      startMonth: 18,
      endMonth: 18 + c.vedacao_abuso_meses - 1,
    });
    const multa = out.state.impulses.find((i) => i.label === 'Multa da Justiça Eleitoral');
    expect(Boolean(multa)).toBe(probe);
    expect(draft.notes.some((n) => n.includes('vedação eleitoral'))).toBe(true);

    // Sem bypass declarado não há penalidade (o `screenInput` já barrou o envio).
    const clean = proposalsStep(state, {
      rng: createRng(state.rng),
      content,
      decisions: [{ policyId: policy.id, agendaCost: policy.agendaCost }],
      eventChoices: [],
      draft,
    });
    expect(clean.state.impulses.some((i) => i.sourceId.startsWith('vedacao:'))).toBe(false);
  });
});

describe('ações eleitorais no pipeline (FASE_08.md)', () => {
  const declarar: Decision = { policyId: DECLARE_CANDIDACY_ACTION_ID, agendaCost: 0 };
  const apoiar = (blocId: string): Decision => ({
    policyId: SUPPORT_CANDIDATE_ACTION_ID,
    agendaCost: 1,
    params: { blocId },
  });

  it('janela do calendário: fora dela, declaração e apoio são rejeitados', () => {
    const state = play(newState(), 22);
    const out = advanceMonth(state, { decisions: [declarar, apoiar(content.scenario.blocs[0].id)] }, content, [
      electionsStep,
    ]);
    expect(out.report.accepted).toEqual([]);
    expect(out.report.rejected).toEqual([
      { decision: declarar, reason: 'alvo_invalido' },
      { decision: apoiar(content.scenario.blocs[0].id), reason: 'alvo_invalido' },
    ]);
  });

  it('na janela: declaração aceita, apoio a bloco inexistente rejeitado e depois da declaração feita não repete', () => {
    const state = play(newState(), 40);
    const out = advanceMonth(
      state,
      {
        decisions: [declarar, apoiar('bloco_fantasma'), { policyId: SUPPORT_CANDIDATE_ACTION_ID, agendaCost: 1 }],
      },
      content,
      [electionsStep],
    );
    expect(out.report.accepted).toEqual([declarar]);
    expect(out.report.rejected.map((r) => r.reason)).toEqual(['alvo_invalido', 'alvo_invalido']);
    expect(out.state.politics?.declaracao).toBe(40);

    // Já declarado nesta campanha: nova declaração é alvo inválido.
    const again = advanceMonth({ ...out.state, monthIndex: 41 }, { decisions: [declarar] }, content, [electionsStep]);
    expect(again.report.rejected).toEqual([{ decision: declarar, reason: 'alvo_invalido' }]);

    // Segundo mandato: a janela existe, mas a reeleição não é permitida de novo.
    const secondTerm = advanceMonth({ ...out.state, monthIndex: 90 }, { decisions: [declarar] }, content, [
      electionsStep,
    ]);
    expect(secondTerm.report.rejected).toEqual([{ decision: declarar, reason: 'alvo_invalido' }]);
  });

  it('apoio: um por campanha e um bloco por mês (chave sem params barra o segundo)', () => {
    const state = play(newState(), 40);
    const [a, b] = content.scenario.blocs;
    const out = advanceMonth(state, { decisions: [apoiar(a.id), apoiar(b.id)] }, content, [electionsStep]);
    expect(out.report.accepted).toEqual([apoiar(a.id)]);
    expect(out.report.rejected).toEqual([{ decision: apoiar(b.id), reason: 'acao_repetida' }]);

    // Com apoio já registrado (outra campanha), novo apoio é alvo inválido.
    const supported = out.state;
    const nextMonth = advanceMonth({ ...supported, monthIndex: 41 }, { decisions: [apoiar(b.id)] }, content, [
      electionsStep,
    ]);
    expect(nextMonth.report.rejected).toEqual([{ decision: apoiar(b.id), reason: 'alvo_invalido' }]);
  });
});

describe('campaignOutcome (FASE_08.md)', () => {
  const basePolitics: PoliticsState = { votingIntention: 0.4, memoria: [], declaracao: null, apoio: null };

  it('sem estado eleitoral não há desfecho', () => {
    const state = newState();
    expect(campaignOutcome(state)).toBeNull();
  });

  it('eleição geral perdida encerra como derrota eleitoral, mesmo antes da posse', () => {
    const state: GameState = {
      ...newState(),
      monthIndex: 46,
      politics: {
        ...basePolitics,
        eleicao_geral: { monthIndex: 45, candidatura: false, venceu: false, turno2: true },
      },
    };
    expect(campaignOutcome(state)).toBe('derrota_eleitoral');
  });

  it('posse de sucessor sem candidatura encerra como fim de mandato; reeleito segue', () => {
    const fim: GameState = {
      ...newState(),
      monthIndex: 48,
      politics: {
        ...basePolitics,
        eleicao_geral: { monthIndex: 45, candidatura: false, venceu: true, turno2: false },
      },
    };
    expect(campaignOutcome(fim)).toBe('fim_de_mandato');
    const reeleito: GameState = {
      ...fim,
      politics: { ...fim.politics!, eleicao_geral: { monthIndex: 45, candidatura: true, venceu: true, turno2: false } },
    };
    expect(campaignOutcome(reeleito)).toBeNull();
  });

  it('impeachment tem precedência sobre os desfechos eleitorais', () => {
    const state: GameState = {
      ...newState(),
      monthIndex: 46,
      politics: {
        ...basePolitics,
        eleicao_geral: { monthIndex: 45, candidatura: false, venceu: false, turno2: false },
      },
      events: { ...newState().events, flags: { impeachment_condenado: 1 } },
    };
    expect(campaignOutcome(state)).toBe('impeachment');
  });
});

describe('notícias eleitorais (FASE_08.md)', () => {
  it('eleições municipal e geral viram manchete no mês do pleito, com o tom do resultado', () => {
    const beforeMunicipal = play(newState(5), 21);
    const municipal = advanceMonth(beforeMunicipal, { decisions: [] }, content, DEFAULT_STEPS);
    expect(municipal.state.events.news.some((n) => n.sourceId === 'eleicao_municipal')).toBe(true);

    const beforeGeneral = play(newState(5), 45);
    const general = advanceMonth(beforeGeneral, { decisions: [] }, content, DEFAULT_STEPS);
    const headline = general.state.events.news.find((n) => n.sourceId === 'eleicao_geral');
    expect(headline).toBeDefined();
    const venceu = politics(general.state).eleicao_geral?.venceu;
    expect(headline?.tone).toBe(venceu ? 'positiva' : 'negativa');
  });

  it('declaração de candidatura vira manchete no mês da ação', () => {
    const before = play(newState(5), 40);
    const run = advanceMonth(
      before,
      { decisions: [{ policyId: DECLARE_CANDIDACY_ACTION_ID, agendaCost: 0 }] },
      content,
      DEFAULT_STEPS,
    );
    expect(run.report.accepted).toHaveLength(1);
    expect(run.state.events.news.some((n) => n.sourceId === 'declaracao_reeleicao')).toBe(true);
  });

  it('sem eleições no cenário não há manchete eleitoral (nem no-op muda o feed)', () => {
    const before = advanceMonth(play(newState(5, 'casual'), 21), { decisions: [] }, base, DEFAULT_STEPS);
    expect(before.state.events.news.some((n) => n.sourceId?.startsWith('eleicao_'))).toBe(false);
  });
});

describe('pipeline completo com eleições (FASE_08.md, critérios 2 e 4)', () => {
  it('48 meses de pipeline completo: invariantes limpos e municípios no mês 21', () => {
    let state = newState(5);
    let municipalMonth = false;
    for (let month = 0; month < 48; month++) {
      const r = advanceMonth(state, { decisions: [] }, content, DEFAULT_STEPS);
      expect(checkInvariants(state, r.state, r.report, content)).toEqual([]);
      if (state.monthIndex === ELECTIONS.mesEleicaoMunicipal)
        municipalMonth = r.report.contributions.some((x) => x.cause === 'municipais');
      expect(politics(r.state).votingIntention).toBeGreaterThanOrEqual(c.int_min - 1e-9);
      expect(politics(r.state).votingIntention).toBeLessThanOrEqual(c.int_max + 1e-9);
      state = r.state;
    }
    expect(municipalMonth).toBe(true);
  });

  it('mês da eleição geral: o governador recém-eleito persiste em governador_nova_relacao', () => {
    // Com a etapa eleitoral antes da regional, o arrasto de `evolveRelations` (regionsStep) puxaria a relação
    // nova ~10% ainda no mesmo mês; o teste antigo não pegava porque roda só `electionsStep` (revisão do PR #9).
    let state = newState(5);
    while (state.monthIndex < ELECTIONS.mesEleicaoGeral) {
      state = advanceMonth(state, { decisions: [] }, content, DEFAULT_STEPS).state;
    }
    const after = advanceMonth(state, { decisions: [] }, content, DEFAULT_STEPS).state;
    expect(politics(after).eleicao_geral).toBeDefined();
    const turned = after.regions.ufs.filter((uf) => uf.governorRelation === c.governador_nova_relacao);
    expect(turned.length).toBeGreaterThan(0);
  });
});
