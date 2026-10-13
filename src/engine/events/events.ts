import type { ConditionVariable, EventCondition, EventEffect, GameEvent } from '../../types/event';
import {
  appointMinister,
  applyAppointment,
  cabinetScandalRisk,
  longestServingPartisan,
  partisanMinistries,
} from '../congress/cabinet';
import {
  TECHNICAL_OCCUPANT,
  type GameContent,
  type GameState,
  type MonthStep,
  type PendingEvent,
  type ScheduledImpulse,
  type StepContext,
} from '../types';

/**
 * Eventos (GAME_DESIGN.md §11.3; ECONOMIC_MODEL.md §5.11). Duas etapas do mês:
 * - `resolveEventsStep` (início do mês): aplica as escolhas do jogador e, para os prazos vencidos, a escolha padrão;
 * - `triggerEventsStep` (fim do mês): sorteia os eventos que chegam à caixa de entrada do mês seguinte.
 */

const MONTHS_PER_YEAR = 12;

/** Converte efeitos de evento em impulsos agendados a partir de `firstMonth` (ECONOMIC_MODEL.md §5.11). */
export function effectsToImpulses(
  effects: readonly EventEffect[],
  firstMonth: number,
  sourceId: string,
  fallbackLabel: string,
): ScheduledImpulse[] {
  return effects.map((effect) => {
    const startMonth = firstMonth + effect.lagMonths;
    return {
      sourceId,
      label: effect.label ?? fallbackLabel,
      target: effect.target,
      delta: effect.delta,
      startMonth,
      endMonth: effect.durationMonths === null ? null : startMonth + effect.durationMonths - 1,
    };
  });
}

/**
 * Valor de uma variável de condição no estado atual (GAME_DESIGN.md §11.3). `congressRelation` é a média das
 * relações dos blocos; quando o estado ainda não tem um bloco, usa a relação inicial do cenário.
 */
export function conditionValue(state: Readonly<GameState>, variable: ConditionVariable, content: GameContent): number {
  const reader: Record<ConditionVariable, () => number> = {
    approval: () => state.indicators.approval,
    gdpGrowth12m: () => state.indicators.gdpGrowth12m,
    inflation12m: () => state.indicators.inflation12m,
    unemployment: () => state.indicators.unemployment,
    primaryBalance12m: () => state.indicators.primaryBalance12m,
    outputGap: () => state.economy.outputGap,
    selic: () => state.economy.selic,
    credibility: () => state.economy.credibility,
    grossDebt: () => state.economy.grossDebt,
    politicalCapital: () => state.resources.politicalCapital,
    congressRelation: () => {
      const blocs = content.scenario.blocs;
      if (blocs.length === 0) return 0;
      const total = blocs.reduce((sum, bloc) => {
        const current = state.congress.blocs.find((b) => b.id === bloc.id);
        return sum + (current?.governmentRelation ?? bloc.governmentRelation);
      }, 0);
      return total / blocs.length;
    },
    proposalsInCongress: () =>
      state.proposals.filter((p) => p.status === 'em_tramitacao' || p.status === 'parada').length,
    exchangeRate: () => state.economy.exchangeRate,
    riskPremium: () => state.economy.riskPremium,
    discretionarySpending: () => state.economy.fiscal.discretionary,
    limitExcess: () => state.economy.fiscal.limitExcess,
    monthIndex: () => state.monthIndex,
    partisanMinistries: () => partisanMinistries(state, content).length,
    cabinetScandalRisk: () => cabinetScandalRisk(state, content),
  };
  return reader[variable]();
}

function conditionHolds(state: Readonly<GameState>, condition: EventCondition, content: GameContent): boolean {
  const value = conditionValue(state, condition.variable, content);
  return condition.op === 'gt' ? value > condition.value : value < condition.value;
}

/**
 * Aplica as escolhas do jogador (`ctx.eventChoices`, já validadas pelo `advanceMonth`) e a escolha padrão dos
 * eventos cujo prazo venceu. Eventos cuja definição não existe mais são descartados.
 */
export const resolveEventsStep: MonthStep = (state, ctx: StepContext) => {
  const t = state.monthIndex;
  const impulses = [...state.impulses];
  let pending: PendingEvent[] = [...state.events.pending];
  const findEvent = (eventId: string): GameEvent | undefined => ctx.content.events.find((e) => e.id === eventId);
  // Escolhas que demitem ministro (POLITICAL_RULES.md §6.3.1) alteram o gabinete e as relações.
  let current: GameState = state;
  const dismiss = () => {
    const ministry = longestServingPartisan(current, ctx.content);
    if (!ministry) return;
    const appointment = appointMinister(current, ctx.content, ministry, TECHNICAL_OCCUPANT);
    current = applyAppointment(current, appointment);
    ctx.draft.notes.push(appointment.note);
  };

  for (const choice of ctx.eventChoices) {
    const index = pending.findIndex((p) => p.eventId === choice.eventId);
    const event = findEvent(choice.eventId);
    const definition = event?.choices.find((c) => c.id === choice.choiceId);
    if (index < 0 || !event || !definition) continue;
    const entry = pending[index];
    pending = pending.filter((_, i) => i !== index);
    impulses.push(
      ...effectsToImpulses(definition.effects, t, `evento:${choice.eventId}_${entry.monthIndex}`, event.title),
    );
    if (definition.dismissMinister) dismiss();
    ctx.draft.eventsResolved.push({ eventId: choice.eventId, choiceId: choice.choiceId, automatic: false });
  }

  const remaining: PendingEvent[] = [];
  for (const entry of pending) {
    const event = findEvent(entry.eventId);
    if (!event) continue;
    if (entry.monthIndex > t) {
      remaining.push(entry);
      continue;
    }
    const definition = event.choices.find((c) => c.id === event.defaultChoice);
    if (definition) {
      impulses.push(
        ...effectsToImpulses(definition.effects, t, `evento:${entry.eventId}_${entry.monthIndex}`, event.title),
      );
      if (definition.dismissMinister) dismiss();
      ctx.draft.eventsResolved.push({ eventId: entry.eventId, choiceId: event.defaultChoice, automatic: true });
    }
  }

  return {
    state: { ...current, impulses, events: { ...state.events, pending: remaining } },
    contributions: [],
  };
};

/** Probabilidade do evento neste estado: a base, multiplicada pelo fator (limitado a [0, 1]) se houver. */
export function eventProbability(state: Readonly<GameState>, event: GameEvent, content: GameContent): number {
  const { probability, probabilityFactor } = event.trigger;
  if (probabilityFactor === undefined) return probability;
  const factor = Math.min(1, Math.max(0, conditionValue(state, probabilityFactor, content)));
  return probability * factor;
}

/**
 * Sorteia os eventos que aparecem na caixa de entrada do próximo mês (`n = monthIndex + 1`), na ordem do
 * conteúdo, até `max_eventos_mes` por mês. Só eventos elegíveis consomem sorteio.
 */
export const triggerEventsStep: MonthStep = (state, ctx: StepContext) => {
  const n = state.monthIndex + 1;
  const monthOfYear = (n % MONTHS_PER_YEAR) + 1;
  const maxPerMonth = ctx.content.calibration.max_eventos_mes;
  const pending: PendingEvent[] = [...state.events.pending];
  const lastFired: Record<string, number> = { ...state.events.lastFired };
  const count: Record<string, number> = { ...state.events.count };
  const impulses = [...state.impulses];
  let firedNow = 0;

  for (const event of ctx.content.events) {
    if (firedNow >= maxPerMonth) break;
    const { trigger } = event;
    const id = event.id;
    const last = lastFired[id];
    const eligible =
      !pending.some((p) => p.eventId === id) &&
      (count[id] ?? 0) < trigger.maxOccurrences &&
      (last === undefined || n - last >= trigger.cooldownMonths) &&
      (trigger.monthsOfYear.length === 0 || trigger.monthsOfYear.includes(monthOfYear)) &&
      trigger.conditions.every((c) => conditionHolds(state, c, ctx.content));
    if (!eligible || !ctx.rng.chance(eventProbability(state, event, ctx.content))) continue;

    pending.push({ eventId: id, monthIndex: n });
    lastFired[id] = n;
    count[id] = (count[id] ?? 0) + 1;
    ctx.draft.eventsFired.push(id);
    impulses.push(...effectsToImpulses(event.onFire, n, `evento:${id}_${n}`, event.title));
    firedNow += 1;
  }

  return {
    state: { ...state, impulses, events: { pending, lastFired, count } },
    contributions: [],
  };
};
