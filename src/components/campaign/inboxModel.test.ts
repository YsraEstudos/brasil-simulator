import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { createInitialState, SANCTION_ACTION_ID, type GameState, type Proposal } from '@/engine';
import { EMPTY_DRAFT, type AgendaDraft } from '@/store/agendaDraft';

import {
  canChooseEvent,
  canToggleDecision,
  characterBriefs,
  eventChoiceCost,
  inboxCount,
  pendingItems,
  sanctionChoices,
  sanctionItems,
} from './inboxModel';

const content = loadContent(DEFAULT_SCENARIO_ID);
// Evento com respostas de custo 0 e 1 (alta_petroleo: absorver 0, subsidiar_diesel 1, repassar_precos 0).
const EVENT_ID = 'alta_petroleo';

function baseState(): GameState {
  return createInitialState({ content, difficulty: 'estrategica', seed: 7 });
}

function proposal(over: Partial<Proposal>): Proposal {
  const policyId = Object.keys(content.policies)[0];
  return {
    id: `${policyId}_0`,
    policyId,
    createdMonth: 0,
    status: 'aguardando_sancao',
    scale: 1,
    voteMonth: 0,
    stage: 0,
    rapporteur: null,
    textAltered: false,
    postponements: 0,
    negotiation: { blocs: {}, amendments: false, textConceded: false, urgency: false },
    rider: 0,
    veto: null,
    judicial: null,
    executionStart: null,
    executionEnd: null,
    adherents: null,
    votes: [],
    history: [],
    ...over,
  };
}

function withPending(state: GameState, eventIds: readonly string[]): GameState {
  return {
    ...state,
    events: { ...state.events, pending: eventIds.map((eventId) => ({ eventId, monthIndex: state.monthIndex })) },
  };
}

describe('Itens da caixa de entrada', () => {
  it('sem pendências a caixa fica vazia', () => {
    const state = baseState();
    expect(pendingItems(state, content)).toEqual([]);
    expect(sanctionItems(state, content)).toEqual([]);
    expect(inboxCount(state)).toBe(0);
  });

  it('liga cada evento pendente à sua definição e ignora evento que não existe mais no conteúdo', () => {
    const state = withPending(baseState(), [EVENT_ID, 'evento_que_sumiu']);
    const items = pendingItems(state, content);
    expect(items.map((i) => i.event.id)).toEqual([EVENT_ID]);
    expect(items[0].pending.eventId).toBe(EVENT_ID);
  });

  it('só as sanções deste mês entram, com o nome da política', () => {
    const [policyId] = Object.keys(content.policies);
    const state: GameState = {
      ...baseState(),
      monthIndex: 3,
      proposals: [
        proposal({ id: 'a', policyId, status: 'aguardando_sancao', voteMonth: 3 }),
        proposal({ id: 'b', policyId, status: 'aguardando_sancao', voteMonth: 4 }),
        proposal({ id: 'c', policyId, status: 'em_tramitacao', voteMonth: 3 }),
      ],
    };
    const items = sanctionItems(state, content);
    expect(items.map((i) => i.proposal.id)).toEqual(['a']);
    expect(items[0].name).toBe(content.policies[policyId].name);
  });

  it('o selo soma eventos aguardando e sanções por decidir', () => {
    const state: GameState = {
      ...withPending(baseState(), [EVENT_ID]),
      proposals: [proposal({ voteMonth: 0 })],
    };
    expect(inboxCount(state)).toBe(2);
  });

  it('monta os personagens do cenário com o prestígio atual', () => {
    const briefs = characterBriefs(baseState(), content);
    expect(briefs).toHaveLength(content.scenario.characters?.length ?? 0);
    for (const brief of briefs) expect(Number.isFinite(brief.standing)).toBe(true);
  });
});

describe('Sanção no rascunho', () => {
  it('lê só as decisões de sanção, por proposta', () => {
    const draft: AgendaDraft = {
      ...EMPTY_DRAFT,
      decisions: [
        { policyId: SANCTION_ACTION_ID, agendaCost: 0, params: { proposalId: 'p1', choice: 'vetar_total' } },
        { policyId: 'outra_politica', agendaCost: 1 },
      ],
    };
    expect(sanctionChoices(draft)).toEqual({ p1: 'vetar_total' });
    expect(sanctionChoices(EMPTY_DRAFT)).toEqual({});
  });
});

describe('Cabe na agenda?', () => {
  it('custo da resposta vem do evento; resposta desconhecida custa 0', () => {
    expect(eventChoiceCost(content, EVENT_ID, 'subsidiar_diesel')).toBe(1);
    expect(eventChoiceCost(content, EVENT_ID, 'absorver')).toBe(0);
    expect(eventChoiceCost(content, EVENT_ID, undefined)).toBe(0);
    expect(eventChoiceCost(content, 'evento_que_sumiu', 'x')).toBe(0);
  });

  it('resposta paga cabe com ação livre e não cabe com o mês cheio', () => {
    expect(canChooseEvent(EMPTY_DRAFT, content, 1, EVENT_ID, 'subsidiar_diesel')).toBe(true);
    expect(canChooseEvent(EMPTY_DRAFT, content, 0, EVENT_ID, 'subsidiar_diesel')).toBe(false);
    // resposta gratuita cabe sempre
    expect(canChooseEvent(EMPTY_DRAFT, content, 0, EVENT_ID, 'absorver')).toBe(true);
  });

  it('trocar a resposta marcada libera o custo dela antes de somar o da nova', () => {
    const draft: AgendaDraft = { ...EMPTY_DRAFT, eventChoices: { [EVENT_ID]: 'subsidiar_diesel' } };
    // o mês tem 1 ação e ela já está gasta nesta mesma resposta: trocar não estoura
    expect(canChooseEvent(draft, content, 1, EVENT_ID, 'absorver')).toBe(true);
    expect(canChooseEvent(draft, content, 1, EVENT_ID, 'subsidiar_diesel')).toBe(true);
  });

  it('decisão já marcada sempre pode sair; nova só entra se couber', () => {
    const entry = Object.entries(content.policies).find(([, p]) => p.agendaCost >= 1);
    if (!entry) throw new Error('nenhuma política com custo de agenda');
    const decision = { policyId: entry[0], agendaCost: entry[1].agendaCost };
    expect(canToggleDecision(EMPTY_DRAFT, decision, content, 0)).toBe(false);
    expect(canToggleDecision(EMPTY_DRAFT, decision, content, decision.agendaCost)).toBe(true);
    const marked: AgendaDraft = { ...EMPTY_DRAFT, decisions: [decision] };
    expect(canToggleDecision(marked, decision, content, 0)).toBe(true);
  });
});
