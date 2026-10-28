import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { createInitialState, SANCTION_ACTION_ID, type GameState, type Proposal } from '@/engine';
import { EMPTY_DRAFT, type AgendaDraft } from '@/store/agendaDraft';

import {
  canChooseEvent,
  canToggleDecision,
  characterBriefs,
  eventChoiceCost,
  focusFirst,
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
    events: {
      ...state.events,
      pending: eventIds.map((eventId) => ({
        eventId,
        monthIndex: state.monthIndex,
        instanceId: `${eventId}#${state.monthIndex}`,
      })),
    },
  };
}

describe('Itens da caixa de entrada', () => {
  it('sem pendências a caixa fica vazia', () => {
    const state = baseState();
    expect(pendingItems(state, content)).toEqual([]);
    expect(sanctionItems(state, content)).toEqual([]);
    expect(inboxCount(state, content, EMPTY_DRAFT)).toBe(0);
  });

  it('liga cada evento pendente à sua definição e ignora evento que não existe mais no conteúdo', () => {
    const state = withPending(baseState(), [EVENT_ID, 'evento_que_sumiu']);
    const items = pendingItems(state, content);
    expect(items.map((i) => i.event.id)).toEqual([EVENT_ID]);
    expect(items[0].pending.eventId).toBe(EVENT_ID);
  });

  it('evento geográfico chega com os textos preenchidos pelo local congelado e sem marcadores soltos', () => {
    const base = withPending(baseState(), ['seca_safra_energia_v2']);
    const location = { affectedUfs: ['CE', 'PI'], primaryUf: 'CE', severityByUf: { CE: 0.9, PI: 0.8 } };
    const state: GameState = {
      ...base,
      events: { ...base.events, pending: base.events.pending.map((p) => ({ ...p, location })) },
    };
    const [item] = pendingItems(state, content);
    expect(item.pending.location).toEqual(location);
    expect(item.event.description).toContain('Ceará e Piauí');
    expect(item.event.description).toContain('Nordeste');
    for (const text of [item.event.title, item.event.description, ...item.event.choices.map((c) => c.description)]) {
      expect(text).not.toContain('{');
    }
    // Evento sem local (save antigo) mostra "o país" em vez do marcador.
    const [national] = pendingItems(withPending(baseState(), ['seca_safra_energia_v2']), content);
    expect(national.event.description).toContain('o país');
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

  it('a pauta-bomba (Fase C6c) mostra no cartão quem propôs e quanto custa, em vez do texto padrão', () => {
    const detail = 'Pauta-bomba: o Congresso aprovou, por iniciativa do bloco Centro, um texto.';
    const bomb = proposal({
      id: 'pb',
      policyId: 'pauta_bomba_reajuste_servidores',
      status: 'aguardando_sancao',
      voteMonth: 3,
    });
    const state: GameState = {
      ...baseState(),
      monthIndex: 3,
      proposals: [{ ...bomb, history: [{ monthIndex: 2, status: 'aguardando_sancao', cause: 'pauta_bomba', detail }] }],
    };
    const [item] = sanctionItems(state, content);
    expect(item.context).toBe(detail);
    expect(item.name).toBe(content.policies.pauta_bomba_reajuste_servidores.name);
  });

  it('o selo soma eventos e sanções ainda sem resposta no rascunho, e ignora evento que sumiu do conteúdo', () => {
    const state: GameState = {
      ...withPending(baseState(), [EVENT_ID, 'evento_que_sumiu']),
      proposals: [proposal({ id: 'p1', voteMonth: 0 })],
    };
    expect(inboxCount(state, content, EMPTY_DRAFT)).toBe(2);
    const answered: AgendaDraft = { ...EMPTY_DRAFT, eventChoices: { [EVENT_ID]: 'absorver' } };
    expect(inboxCount(state, content, answered)).toBe(1);
    const sanctioned: AgendaDraft = {
      ...answered,
      decisions: [{ policyId: SANCTION_ACTION_ID, agendaCost: 0, params: { proposalId: 'p1', choice: 'sancionar' } }],
    };
    expect(inboxCount(state, content, sanctioned)).toBe(0);
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

  it('descarta sanções sem proposta ou com opção desconhecida', () => {
    const sanction = (params: Record<string, unknown>) => ({ policyId: SANCTION_ACTION_ID, agendaCost: 0, params });
    const draft = {
      ...EMPTY_DRAFT,
      decisions: [
        sanction({ choice: 'sancionar' }),
        sanction({ proposalId: '', choice: 'sancionar' }),
        sanction({ proposalId: 'p2', choice: 'promulgar' }),
        sanction({ proposalId: '__proto__', choice: 'vetar_total' }),
      ],
    } as AgendaDraft;
    const chosen = sanctionChoices(draft);
    expect(Object.keys(chosen)).toEqual(['__proto__']);
    expect(chosen.undefined).toBeUndefined();
    expect(chosen.p2).toBeUndefined();
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

describe('focusFirst (evento aberto pelo marcador do mapa)', () => {
  const list = ['a', 'b', 'c'].map((id) => ({ id, pending: { instanceId: `${id}#1` } }));

  it('põe a instância em foco no topo e mantém a ordem dos demais', () => {
    expect(focusFirst(list, 'c#1').map((i) => i.id)).toEqual(['c', 'a', 'b']);
    expect(focusFirst(list, 'b#1').map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });

  it('sem foco ou com foco fora da lista, a ordem não muda (e a lista original fica intacta)', () => {
    expect(focusFirst(list, null).map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(focusFirst(list, undefined).map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(focusFirst(list, 'z#9').map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(list.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });
});
