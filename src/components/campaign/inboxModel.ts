import {
  SANCTION_ACTION_ID,
  standingOf,
  type Decision,
  type GameContent,
  type GameState,
  type Proposal,
  type SanctionChoice,
} from '@/engine';
import { draftCost, hasDecision, fits, type AgendaDraft } from '@/store/agendaDraft';

import type { CharacterBrief } from './characterView';
import type { PendingItem, SanctionItem } from './EventInbox';

/**
 * Modelo da caixa de entrada (GAME_DESIGN.md §4.2): monta os itens do `EventInbox` a partir do estado e do rascunho
 * do mês e responde "cabe na agenda?". Lógica pura — sem React —, usada pela folha "Alertas e eventos" do Painel.
 */

/** Eventos que pedem resposta neste mês, com a definição do evento (pendências de eventos que sumiram do conteúdo caem fora). */
export function pendingItems(state: Readonly<GameState>, content: GameContent): PendingItem[] {
  const eventsById = new Map(content.events.map((e) => [e.id, e]));
  return state.events.pending.flatMap((pending) => {
    const event = eventsById.get(pending.eventId);
    return event ? [{ event, pending }] : [];
  });
}

/** Projetos aprovados cuja sanção se decide neste mês (POLITICAL_RULES.md §7). */
function awaitingSanction(state: Readonly<GameState>): Proposal[] {
  return state.proposals.filter((p) => p.status === 'aguardando_sancao' && p.voteMonth === state.monthIndex);
}

/** Itens de sanção da caixa de entrada; sem resposta vale a sanção tácita. */
export function sanctionItems(state: Readonly<GameState>, content: GameContent): SanctionItem[] {
  return awaitingSanction(state).map((proposal) => ({
    proposal,
    name: content.policies[proposal.policyId]?.name ?? proposal.policyId,
  }));
}

/** Quantos itens a caixa de entrada tem: eventos aguardando resposta mais sanções por decidir (selo dos alertas). */
export function inboxCount(state: Readonly<GameState>): number {
  return state.events.pending.length + awaitingSanction(state).length;
}

/** Decisão de sanção/veto já marcada no rascunho, por proposta. */
export function sanctionChoices(draft: AgendaDraft): Partial<Record<string, SanctionChoice>> {
  const chosen: Partial<Record<string, SanctionChoice>> = {};
  for (const d of draft.decisions) {
    const choice = d.params?.choice;
    if (d.policyId === SANCTION_ACTION_ID && typeof choice === 'string') {
      chosen[String(d.params?.proposalId)] = choice as SanctionChoice;
    }
  }
  return chosen;
}

/** Personagens do cenário com o prestígio atual, para os eventos com `characterId` (FASE_07.md). */
export function characterBriefs(state: Readonly<GameState>, content: GameContent): CharacterBrief[] {
  return (content.scenario.characters ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    role: c.role,
    standing: standingOf(state.events.characters, content, c.id),
  }));
}

/** Custo, em ações de agenda, de uma resposta de evento (0 se a resposta não existe ou não foi marcada). */
export function eventChoiceCost(content: GameContent, eventId: string, choiceId: string | undefined): number {
  return content.events.find((e) => e.id === eventId)?.choices.find((c) => c.id === choiceId)?.agendaCost ?? 0;
}

/** A resposta cabe nas ações do mês? Trocar a resposta já marcada libera o custo dela antes de somar o da nova. */
export function canChooseEvent(
  draft: AgendaDraft,
  content: GameContent,
  actionsMax: number,
  eventId: string,
  choiceId: string,
): boolean {
  const current = draft.eventChoices[eventId];
  const releasing = current === undefined ? 0 : eventChoiceCost(content, eventId, current);
  return draftCost(draft, content) - releasing + eventChoiceCost(content, eventId, choiceId) <= actionsMax;
}

/** Marcar/desmarcar a decisão é permitido: já está no rascunho (sempre pode sair) ou cabe nas ações restantes. */
export function canToggleDecision(
  draft: AgendaDraft,
  decision: Decision,
  content: GameContent,
  actionsMax: number,
): boolean {
  return hasDecision(draft, decision) || fits(draft, decision, content, actionsMax);
}
