import type {
  ConditionVariable,
  EventChoiceDefinition,
  EventCondition,
  EventEffect,
  GameEvent,
} from '../../types/event';
import {
  appointMinister,
  applyAppointment,
  cabinetScandalRisk,
  longestServingPartisan,
  partisanMinistries,
} from '../congress/cabinet';
import { meanGovernorRelation } from '../regions/regions';
import {
  TECHNICAL_OCCUPANT,
  type EventsState,
  type GameContent,
  type GameState,
  type MonthStep,
  type PendingEvent,
  type ScheduledEvent,
  type ScheduledImpulse,
  type StepContext,
} from '../types';

import { STANDING_LIMIT } from './calibration';
import { impeachmentPressure, meanCongressRelation } from './pressure';

/**
 * Eventos (GAME_DESIGN.md §11.3; ECONOMIC_MODEL.md §5.11; FASE_07.md). Duas etapas do mês:
 * - `resolveEventsStep` (início do mês): aplica as escolhas do jogador e, para os prazos vencidos, a escolha padrão.
 *   Cada escolha aplicada pode gravar marcas, mudar o prestígio de personagens e agendar eventos encadeados;
 * - `triggerEventsStep` (fim do mês): chega à caixa de entrada do mês seguinte o que estava agendado e, depois,
 *   sorteia os eventos elegíveis.
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
    const impulse: ScheduledImpulse = {
      sourceId,
      label: effect.label ?? fallbackLabel,
      target: effect.target,
      delta: effect.delta,
      startMonth,
      endMonth: effect.durationMonths === null ? null : startMonth + effect.durationMonths - 1,
    };
    // ECONOMIC_MODEL.md §5.15: efeito concentrado nas UFs atingidas, repartido pela população.
    return effect.regions ? { ...impulse, regional: { key: 'populacao', scope: [...effect.regions] } } : impulse;
  });
}

/**
 * Eventos que existem no cenário (`onlyScenarios`; AI_INSTRUCTIONS.md §8). Ausente = todos os cenários. Vale
 * tanto para o sorteio quanto para resolver um evento já na caixa de entrada.
 */
export function eventsForScenario(events: readonly GameEvent[], scenarioId: string): GameEvent[] {
  return events.filter((e) => e.onlyScenarios === undefined || e.onlyScenarios.includes(scenarioId));
}

/** Marca gravada no estado (`EventsState.flags`, FASE_07.md). */
export function hasFlag(state: Readonly<GameState>, flag: string): boolean {
  return Object.hasOwn(state.events.flags, flag);
}

/**
 * Prestígio atual de um personagem (−100…100): o valor já gravado ou, antes de qualquer mudança, o inicial do
 * cenário. Personagem fora do elenco do cenário parte de 0.
 */
export function standingOf(
  characters: Readonly<Record<string, number>>,
  content: Pick<GameContent, 'scenario'>,
  characterId: string,
): number {
  const current = characters[characterId];
  if (current !== undefined) return current;
  return content.scenario.characters?.find((c) => c.id === characterId)?.initialStanding ?? 0;
}

/**
 * Valor de uma variável de condição no estado atual (GAME_DESIGN.md §11.3). `congressRelation` é a média das
 * relações dos blocos; quando o estado ainda não tem um bloco, usa a relação inicial do cenário. `characterStanding`
 * exige `characterId` (FASE_07.md); sem ele o motor não sabe de quem falar.
 */
export function conditionValue(
  state: Readonly<GameState>,
  variable: ConditionVariable,
  content: GameContent,
  characterId?: string,
): number {
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
    congressRelation: () => meanCongressRelation(state, content),
    proposalsInCongress: () =>
      state.proposals.filter((p) => p.status === 'em_tramitacao' || p.status === 'parada').length,
    exchangeRate: () => state.economy.exchangeRate,
    riskPremium: () => state.economy.riskPremium,
    discretionarySpending: () => state.economy.fiscal.discretionary,
    limitExcess: () => state.economy.fiscal.limitExcess,
    monthIndex: () => state.monthIndex,
    partisanMinistries: () => partisanMinistries(state, content).length,
    cabinetScandalRisk: () => cabinetScandalRisk(state, content),
    governorRelation: () => meanGovernorRelation(state, content),
    impeachmentPressure: () => impeachmentPressure(state, content),
    characterStanding: () => {
      if (characterId === undefined) throw new RangeError('characterStanding exige characterId');
      return standingOf(state.events.characters, content, characterId);
    },
  };
  return reader[variable]();
}

function conditionHolds(state: Readonly<GameState>, condition: EventCondition, content: GameContent): boolean {
  const value = conditionValue(state, condition.variable, content, condition.characterId);
  return condition.op === 'gt' ? value > condition.value : value < condition.value;
}

/** Marcas exigidas e proibidas pelo gatilho (FASE_07.md): todas as exigidas, nenhuma das proibidas. */
function flagsAllow(state: Readonly<GameState>, event: GameEvent): boolean {
  const { requiresFlags = [], forbidsFlags = [] } = event.trigger;
  return requiresFlags.every((f) => hasFlag(state, f)) && !forbidsFlags.some((f) => hasFlag(state, f));
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Aplica as escolhas do jogador (`ctx.eventChoices`, já validadas pelo `advanceMonth`) e a escolha padrão dos
 * eventos cujo prazo venceu. Eventos cuja definição não existe mais (ou não existe no cenário) são descartados.
 */
export const resolveEventsStep: MonthStep = (state, ctx: StepContext) => {
  const t = state.monthIndex;
  const impulses = [...state.impulses];
  const events = eventsForScenario(ctx.content.events, state.scenarioId);
  const findEvent = (eventId: string): GameEvent | undefined => events.find((e) => e.id === eventId);
  let pending: PendingEvent[] = [...state.events.pending];
  // Memória do evento (marcas, personagens, cadeias) sai daqui; a caixa de entrada é tratada à parte.
  let memory: EventsState = { ...state.events };
  // Escolhas que demitem ministro (POLITICAL_RULES.md §6.3.1) alteram o gabinete e as relações.
  let current: GameState = state;
  const dismiss = () => {
    const ministry = longestServingPartisan(current, ctx.content);
    if (!ministry) return;
    const appointment = appointMinister(current, ctx.content, ministry, TECHNICAL_OCCUPANT);
    current = applyAppointment(current, appointment);
    ctx.draft.notes.push(appointment.note);
  };

  /**
   * Efeitos de uma escolha aplicada (FASE_07.md): impulsos, demissão, marcas (retiradas e gravadas), prestígio
   * dos personagens e, por sorteio com a semente, os eventos encadeados. Só sorteia quando há `followUps`, para
   * que escolhas sem cadeia não consumam a semente.
   */
  const applyChoice = (
    eventId: string,
    entryMonth: number,
    event: GameEvent,
    choiceId: string,
    definition: EventChoiceDefinition,
    automatic: boolean,
  ) => {
    impulses.push(...effectsToImpulses(definition.effects, t, `evento:${eventId}_${entryMonth}`, event.title));
    if (definition.dismissMinister) dismiss();

    const flags = { ...memory.flags };
    for (const flag of definition.clearFlags ?? []) delete flags[flag];
    for (const flag of definition.setFlags ?? []) flags[flag] = t;

    const characters = { ...memory.characters };
    for (const effect of definition.characterEffects ?? []) {
      const base = standingOf(characters, ctx.content, effect.characterId);
      characters[effect.characterId] = clamp(base + effect.delta, -STANDING_LIMIT, STANDING_LIMIT);
    }

    const scheduled: ScheduledEvent[] = [...memory.scheduled];
    for (const follow of definition.followUps ?? []) {
      if (!ctx.rng.chance(follow.probability)) continue;
      scheduled.push({
        eventId: follow.eventId,
        monthIndex: t + follow.delayMonths,
        causeEventId: eventId,
        causeChoiceId: choiceId,
      });
    }

    memory = { ...memory, flags, characters, scheduled };
    ctx.draft.eventsResolved.push({ eventId, choiceId, automatic });
  };

  for (const choice of ctx.eventChoices) {
    const index = pending.findIndex((p) => p.eventId === choice.eventId);
    const event = findEvent(choice.eventId);
    const definition = event?.choices.find((c) => c.id === choice.choiceId);
    if (index < 0 || !event || !definition) continue;
    const entry = pending[index];
    pending = pending.filter((_, i) => i !== index);
    applyChoice(choice.eventId, entry.monthIndex, event, choice.choiceId, definition, false);
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
    if (definition) applyChoice(entry.eventId, entry.monthIndex, event, event.defaultChoice, definition, true);
  }

  return {
    state: { ...current, impulses, events: { ...memory, pending: remaining } },
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
 * Coloca um evento na caixa de entrada do mês `n`: pendência, contadores, impulsos de disparo e marcas
 * (`onFireFlags`). Compartilhado pelos encadeados e pelo sorteio.
 */
function fireEvent(
  event: GameEvent,
  n: number,
  ctx: StepContext,
  book: { pending: PendingEvent[]; lastFired: Record<string, number>; count: Record<string, number> },
  impulses: ScheduledImpulse[],
  flags: Record<string, number>,
) {
  book.pending.push({ eventId: event.id, monthIndex: n });
  book.lastFired[event.id] = n;
  book.count[event.id] = (book.count[event.id] ?? 0) + 1;
  ctx.draft.eventsFired.push(event.id);
  impulses.push(...effectsToImpulses(event.onFire, n, `evento:${event.id}_${n}`, event.title));
  for (const flag of event.onFireFlags ?? []) flags[flag] = n;
}

/**
 * Sorteia os eventos que aparecem na caixa de entrada do próximo mês (`n = monthIndex + 1`). Antes do sorteio,
 * chegam os encadeados agendados para `n` (FASE_07.md): sem sorteio nem gatilho, respeitam `maxOccurrences` e
 * não contam em `max_eventos_mes`. O sorteio segue na ordem do conteúdo, até `max_eventos_mes` por mês, e só
 * eventos elegíveis consomem sorteio. Eventos `chainedOnly` nunca entram no sorteio.
 */
export const triggerEventsStep: MonthStep = (state, ctx: StepContext) => {
  const n = state.monthIndex + 1;
  const monthOfYear = (n % MONTHS_PER_YEAR) + 1;
  const maxPerMonth = ctx.content.calibration.max_eventos_mes;
  const events = eventsForScenario(ctx.content.events, state.scenarioId);
  const book = {
    pending: [...state.events.pending],
    lastFired: { ...state.events.lastFired },
    count: { ...state.events.count },
  };
  const flags = { ...state.events.flags };
  const impulses = [...state.impulses];
  const scheduled: ScheduledEvent[] = [];

  for (const item of state.events.scheduled) {
    if (item.monthIndex > n) {
      scheduled.push(item);
      continue;
    }
    const event = events.find((e) => e.id === item.eventId);
    // Vencido (já passou do mês), evento fora do cenário ou já pendente / no limite: descartado.
    if (item.monthIndex < n || !event) continue;
    const full = (book.count[event.id] ?? 0) >= event.trigger.maxOccurrences;
    if (full || book.pending.some((p) => p.eventId === event.id)) continue;
    fireEvent(event, n, ctx, book, impulses, flags);
  }

  let firedNow = 0;
  for (const event of events) {
    if (firedNow >= maxPerMonth) break;
    if (event.chainedOnly) continue;
    const { trigger } = event;
    const id = event.id;
    const last = book.lastFired[id];
    const eligible =
      !book.pending.some((p) => p.eventId === id) &&
      (book.count[id] ?? 0) < trigger.maxOccurrences &&
      (last === undefined || n - last >= trigger.cooldownMonths) &&
      (trigger.monthsOfYear.length === 0 || trigger.monthsOfYear.includes(monthOfYear)) &&
      flagsAllow(state, event) &&
      trigger.conditions.every((c) => conditionHolds(state, c, ctx.content));
    if (!eligible || !ctx.rng.chance(eventProbability(state, event, ctx.content))) continue;

    fireEvent(event, n, ctx, book, impulses, flags);
    firedNow += 1;
  }

  return {
    state: {
      ...state,
      impulses,
      events: {
        ...state.events,
        pending: book.pending,
        lastFired: book.lastFired,
        count: book.count,
        flags,
        scheduled,
      },
    },
    contributions: [],
  };
};
