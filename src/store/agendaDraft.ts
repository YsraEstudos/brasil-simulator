import { actionKey, AGENDA_ACTIONS, isCareerAction, type Decision, type GameContent, type MonthInput } from '@/engine';

/**
 * Rascunho da agenda do mês (GAME_DESIGN.md §4.2–4.3): decisões e respostas a eventos marcadas pelo jogador
 * em qualquer aba, até ele encerrar o mês. Não é salvo no banco: fechar o app descarta o rascunho.
 */
export interface AgendaDraft {
  decisions: readonly Decision[];
  /** Resposta marcada por evento pendente. */
  eventChoices: Readonly<Record<string, string>>;
}

export const EMPTY_DRAFT: AgendaDraft = { decisions: [], eventChoices: {} };

/**
 * Custo em ações: o do catálogo de políticas ou de ações; antes da posse, cada ação de campanha ocupa uma das ações
 * do turno (PLANO_CAMPANHA.md Fase C4). O motor confere de novo.
 */
export function decisionCost(decision: Decision, content: GameContent): number {
  if (isCareerAction(decision.policyId)) return 1;
  return content.policies[decision.policyId]?.agendaCost ?? AGENDA_ACTIONS[decision.policyId]?.agendaCost ?? 0;
}

/** Identidade da decisão no mês: a política, ou a ação mais o alvo (ex.: negociar a proposta X com o bloco Y). */
export function draftKey(decision: Decision): string {
  const action = AGENDA_ACTIONS[decision.policyId];
  return action ? actionKey(action, decision.params) : decision.policyId;
}

function sameParams(a: Decision, b: Decision): boolean {
  return JSON.stringify(a.params ?? {}) === JSON.stringify(b.params ?? {});
}

/** A decisão (com os mesmos parâmetros) já está no rascunho. */
export function hasDecision(draft: AgendaDraft, decision: Decision): boolean {
  return draft.decisions.some((d) => draftKey(d) === draftKey(decision) && sameParams(d, decision));
}

/** A decisão de mesma identidade, mesmo com outros parâmetros (ex.: outro ocupante para a mesma pasta). */
export function findDecision(draft: AgendaDraft, decision: Decision): Decision | undefined {
  return draft.decisions.find((d) => draftKey(d) === draftKey(decision));
}

/**
 * Marca ou desmarca: igual → sai; mesma identidade com outros parâmetros → substitui; nova → entra no fim
 * (o motor aceita na ordem enviada).
 */
export function toggleDecision(draft: AgendaDraft, decision: Decision): AgendaDraft {
  const key = draftKey(decision);
  const existing = draft.decisions.find((d) => draftKey(d) === key);
  if (existing && sameParams(existing, decision)) {
    return { ...draft, decisions: draft.decisions.filter((d) => draftKey(d) !== key) };
  }
  if (existing) return { ...draft, decisions: draft.decisions.map((d) => (draftKey(d) === key ? decision : d)) };
  return { ...draft, decisions: [...draft.decisions, decision] };
}

/** Marca a resposta do evento; marcar a mesma de novo desmarca. */
export function toggleEventChoice(draft: AgendaDraft, eventId: string, choiceId: string): AgendaDraft {
  const eventChoices = { ...draft.eventChoices };
  if (eventChoices[eventId] === choiceId) delete eventChoices[eventId];
  else eventChoices[eventId] = choiceId;
  return { ...draft, eventChoices };
}

function eventChoiceCost(content: GameContent, eventId: string, choiceId: string): number {
  return content.events.find((e) => e.id === eventId)?.choices.find((c) => c.id === choiceId)?.agendaCost ?? 0;
}

/** Ações de agenda usadas pelo rascunho (decisões e respostas a eventos). */
export function draftCost(draft: AgendaDraft, content: GameContent): number {
  const decisions = draft.decisions.reduce((n, d) => n + decisionCost(d, content), 0);
  const events = Object.entries(draft.eventChoices).reduce(
    (n, [eventId, choiceId]) => n + eventChoiceCost(content, eventId, choiceId),
    0,
  );
  return decisions + events;
}

/** Cabe nas ações do mês se for incluída (a já marcada sempre pode ser desmarcada ou trocada). */
export function fits(draft: AgendaDraft, decision: Decision, content: GameContent, actionsMax: number): boolean {
  const existing = findDecision(draft, decision);
  const released = existing ? decisionCost(existing, content) : 0;
  return draftCost(draft, content) - released + decisionCost(decision, content) <= actionsMax;
}

/** Entrada do mês para o motor, com os custos do catálogo. */
export function draftInput(draft: AgendaDraft, content: GameContent): MonthInput {
  return {
    decisions: draft.decisions.map((d) => ({ ...d, agendaCost: decisionCost(d, content) })),
    eventChoices: Object.entries(draft.eventChoices).map(([eventId, choiceId]) => ({ eventId, choiceId })),
  };
}

/** O rascunho tem decisões ou respostas a eventos ainda não confirmadas (seriam perdidas ao trocar de campanha). */
export function hasPendingChoices(draft: AgendaDraft): boolean {
  return draft.decisions.length > 0 || Object.keys(draft.eventChoices).length > 0;
}
