import {
  climateLocation,
  drawableEvents,
  eventInstanceId,
  legislativeInstrument,
  PROPOSAL_IN_CONGRESS,
  type GameContent,
  type GameState,
  type Proposal,
} from '@/engine';

/*
 * Painel de desenvolvedor (só `__DEV__`): atalhos para chegar rápido a uma situação de teste. Não é jogo: o motor
 * nunca chama estas funções e o jogador não as vê. Cada uma devolve um estado novo (nunca altera o recebido) e deixa
 * o resto do trabalho ao próprio motor no fechamento do mês seguinte (sanção, execução, resposta ao evento), para o
 * estado continuar coerente com os invariantes.
 */

/** Causa gravada na trilha das propostas alteradas pelo painel (visível no histórico da proposta). */
export const DEV_CAUSE = 'painel_dev';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Soma ao capital político (limitado a 0–100). */
export function devAddCapital(state: GameState, delta: number): GameState {
  const politicalCapital = clamp(state.resources.politicalCapital + delta, 0, 100);
  return { ...state, resources: { ...state.resources, politicalCapital } };
}

/**
 * Soma à aprovação nacional (fração: 0,1 = 10 pontos) e desloca todas as UFs pelo mesmo valor, para o mapa
 * acompanhar. O próximo mês recalcula a distribuição regional a partir do nacional (ECONOMIC_MODEL.md §5.15).
 */
export function devAddApproval(state: GameState, delta: number): GameState {
  const approval = clamp(state.indicators.approval + delta, 0, 1);
  const shift = approval - state.indicators.approval;
  return {
    ...state,
    indicators: { ...state.indicators, approval },
    regions: {
      ...state.regions,
      ufs: state.regions.ufs.map((u) => ({ ...u, approval: clamp(u.approval + shift, 0, 1) })),
    },
  };
}

/** Eventos que o painel pode disparar (os do sorteio do cenário), em ordem alfabética do título. */
export function devEventList(content: GameContent, scenarioId: string) {
  return drawableEvents(content.events, scenarioId)
    .map((e) => ({ id: e.id, title: e.title }))
    .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
}

export type DevEventResult = { ok: true; state: GameState } | { ok: false; error: string };

/**
 * Põe o evento na caixa de entrada agora, ignorando condições, probabilidade e intervalo. Evento climático ganha o
 * local do clima atual (ou fica nacional, se nenhuma UF passa do limiar). Grava as marcas de disparo; os efeitos
 * imediatos de disparo (`onFire`) não são aplicados — só os da escolha, quando o jogador responder.
 */
export function devFireEvent(state: GameState, content: GameContent, eventId: string): DevEventResult {
  const event = content.events.find((e) => e.id === eventId);
  if (!event) return { ok: false, error: `Evento desconhecido: ${eventId}.` };
  if (state.events.pending.some((p) => p.eventId === eventId)) {
    return { ok: false, error: 'Este evento já está na caixa de entrada.' };
  }
  const t = state.monthIndex;
  const location = event.trigger.climate ? climateLocation(state, content, event.trigger.climate) : undefined;
  const flags = { ...state.events.flags };
  for (const flag of event.onFireFlags ?? []) flags[flag] = t;
  return {
    ok: true,
    state: {
      ...state,
      events: {
        ...state.events,
        pending: [
          ...state.events.pending,
          { eventId, monthIndex: t, instanceId: eventInstanceId(eventId, t), ...(location ? { location } : {}) },
        ],
        lastFired: { ...state.events.lastFired, [eventId]: t },
        count: { ...state.events.count, [eventId]: (state.events.count[eventId] ?? 0) + 1 },
        flags,
      },
    },
  };
}

/** Propostas no Congresso (em tramitação ou paradas), que o painel pode aprovar ou rejeitar. */
export function devCongressProposals(state: GameState): Proposal[] {
  return state.proposals.filter((p) => PROPOSAL_IN_CONGRESS.has(p.status));
}

/**
 * Aprova todas as propostas no Congresso. Medida provisória: convertida em lei (já está em vigor). Demais: vão à
 * sanção neste mês; o fechamento do mês aplica a escolha da sanção (ou a tácita) e começa a execução pelo motor.
 */
export function devApproveAll(state: GameState, content: GameContent): GameState {
  const t = state.monthIndex;
  const proposals = state.proposals.map((p): Proposal => {
    if (!PROPOSAL_IN_CONGRESS.has(p.status)) return p;
    const policy = content.policies[p.policyId];
    const isMp = policy !== undefined && legislativeInstrument(policy) === 'medida_provisoria';
    const base = { ...p, rapporteur: null };
    if (isMp) {
      return {
        ...base,
        status: 'em_execucao',
        voteMonth: null,
        history: [
          ...p.history,
          { monthIndex: t, status: 'em_execucao', cause: DEV_CAUSE, detail: 'Convertida (painel dev).' },
        ],
      };
    }
    return {
      ...base,
      status: 'aguardando_sancao',
      voteMonth: t,
      history: [
        ...p.history,
        {
          monthIndex: t,
          status: 'aguardando_sancao',
          cause: DEV_CAUSE,
          detail: 'Aprovada (painel dev): sanção neste mês.',
        },
      ],
    };
  });
  return { ...state, proposals };
}

/** Rejeita todas as propostas no Congresso. MP rejeitada perde a vigência: os efeitos futuros dela são cortados. */
export function devRejectAll(state: GameState, content: GameContent): GameState {
  const t = state.monthIndex;
  let impulses = state.impulses;
  const proposals = state.proposals.map((p): Proposal => {
    if (!PROPOSAL_IN_CONGRESS.has(p.status)) return p;
    const policy = content.policies[p.policyId];
    const isMp = policy !== undefined && legislativeInstrument(policy) === 'medida_provisoria';
    if (isMp) {
      // Mesma regra do motor (`cancelMeasure`): o que não começou sai da fila; o que está valendo termina agora.
      const source = `proposta:${p.id}`;
      impulses = impulses
        .filter((i) => !(i.sourceId === source && i.startMonth > t))
        .map((i) => (i.sourceId === source && (i.endMonth === null || i.endMonth > t) ? { ...i, endMonth: t } : i));
    }
    return {
      ...p,
      status: 'rejeitada',
      voteMonth: null,
      rapporteur: null,
      ...(isMp ? { executionEnd: t, judicial: null } : {}),
      history: [
        ...p.history,
        { monthIndex: t, status: 'rejeitada', cause: DEV_CAUSE, detail: 'Rejeitada (painel dev).' },
      ],
    };
  });
  return { ...state, proposals, impulses };
}
