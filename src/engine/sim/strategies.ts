import type { EventChoiceDefinition, GameEvent } from '../../types/event';
import { AGENDA_ACTIONS, PRESSURE_ACTION_ID } from '../actions';
import { createRng, seedRng, type Rng } from '../rng';
import {
  PROPOSAL_IN_PROGRESS,
  type Decision,
  type EventChoice,
  type GameContent,
  type GameState,
  type MonthInput,
} from '../types';

/**
 * Estratégias-robô para campanhas automáticas (ECONOMIC_MODEL.md §9). Cada uma é uma função pura do estado:
 * mesma entrada → mesma decisão. Não altera o estado e não chama o motor.
 */
export interface Strategy {
  id: string;
  name: string;
  decide(state: GameState, content: GameContent): MonthInput;
}

/** Escolhe a resposta de um evento entre as que cabem nos pontos restantes (sempre há a padrão, custo 0). */
type EventChooser = (event: GameEvent, affordable: readonly EventChoiceDefinition[]) => string;

interface EventAnswers {
  choices: EventChoice[];
  /** Pontos de agenda gastos com eventos (o motor processa eventos antes das decisões). */
  spent: number;
}

/** Responde a cada evento pendente com `choose`; se a escolha não couber, usa a padrão. */
function answerEvents(state: GameState, content: GameContent, choose: EventChooser): EventAnswers {
  const answers: EventAnswers = { choices: [], spent: 0 };
  for (const pending of state.events.pending) {
    const event = content.events.find((e) => e.id === pending.eventId);
    if (!event) continue;
    const left = state.resources.agendaPointsPerMonth - answers.spent;
    const affordable = event.choices.filter((c) => c.agendaCost <= left);
    const fallback = event.choices.find((c) => c.id === event.defaultChoice);
    const picked = affordable.find((c) => c.id === choose(event, affordable)) ?? fallback;
    if (!picked) continue;
    answers.spent += picked.agendaCost;
    answers.choices.push({ eventId: event.id, choiceId: picked.id });
  }
  return answers;
}

/** Resposta padrão do evento (`defaultChoice`), que todas as estratégias usam salvo indicação contrária. */
const useDefault: EventChooser = (event) => event.defaultChoice;

/** Políticas do cenário que podem ser enviadas agora (existem no catálogo e não estão em andamento). */
function sendablePolicies(state: GameState, content: GameContent): Set<string> {
  const busy = new Set(state.proposals.filter((p) => PROPOSAL_IN_PROGRESS.has(p.status)).map((p) => p.policyId));
  return new Set(content.scenario.policies.filter((id) => content.policies[id] !== undefined && !busy.has(id)));
}

function decisionFor(content: GameContent, policyId: string): Decision {
  return { policyId, agendaCost: content.policies[policyId].agendaCost };
}

/** Envia as políticas na ordem dada, enquanto couberem nos pontos que sobraram dos eventos. */
function sendInOrder(state: GameState, content: GameContent, order: readonly string[], eventSpent: number): Decision[] {
  const sendable = sendablePolicies(state, content);
  let left = state.resources.agendaPointsPerMonth - eventSpent;
  const decisions: Decision[] = [];
  for (const id of order) {
    if (!sendable.has(id)) continue;
    const decision = decisionFor(content, id);
    if (decision.agendaCost > left) continue;
    decisions.push(decision);
    left -= decision.agendaCost;
    sendable.delete(id);
  }
  return decisions;
}

/** Soma do efeito sobre a aprovação de uma escolha (ECONOMIC_MODEL.md §9: populista olha só para aprovação). */
function approvalGain(choice: EventChoiceDefinition): number {
  return choice.effects.filter((e) => e.target === 'aprovacao').reduce((sum, e) => sum + e.delta, 0);
}

/** Escolhe a com maior ganho de aprovação; sem ganho positivo, ou em empate com a padrão, fica a padrão. */
const maximizeApproval: EventChooser = (event, affordable) => {
  const gains = affordable.map((c) => ({ id: c.id, gain: approvalGain(c) }));
  const top = Math.max(...gains.map((g) => g.gain));
  if (!(top > 0)) return event.defaultChoice;
  const tied = gains.filter((g) => g.gain === top).map((g) => g.id);
  return tied.includes(event.defaultChoice) ? event.defaultChoice : (tied[0] ?? event.defaultChoice);
};

function pickOne<T>(rng: Rng, items: readonly T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[rng.int(0, items.length - 1)];
}

const POPULISTA_ORDER = [
  'salario_minimo_valorizacao',
  'transferencia_renda_ampliacao',
  'infraestrutura_credito_adicional',
  'iof_credito_reducao',
  'irpf_tabela',
  'seguranca_cooperacao',
];

const AUSTERA_ORDER = ['contingenciamento', 'gastos_tributarios_revisao', 'reforma_administrativa'];

const REFORMISTA_ORDER = ['reforma_administrativa', 'gastos_tributarios_revisao', 'infraestrutura_credito_adicional'];

/** Renda e consumo da base da pirâmide: transferências, salário mínimo e IR progressivo (ECONOMIC_MODEL.md §9). */
const DISTRIBUTIVA_ORDER = ['transferencia_renda_ampliacao', 'salario_minimo_valorizacao', 'irpf_tabela'];

/** Capacidade de produzir: infraestrutura, reforma do Estado, revisão de benefícios e crédito mais barato. */
const PRO_OFERTA_ORDER = [
  'infraestrutura_credito_adicional',
  'reforma_administrativa',
  'gastos_tributarios_revisao',
  'iof_credito_reducao',
];

/** Pressão sobre o BC a cada trimestre (ECONOMIC_MODEL.md §5.4.1, teste de sentido). */
const PRESSURE_EVERY_MONTHS = 3;

/** Linha de base: não envia nada e não responde a eventos (os padrões entram sozinhos no prazo). */
const inerte: Strategy = {
  id: 'inerte',
  name: 'Inerte (linha de base)',
  decide: () => ({ decisions: [], eventChoices: [] }),
};

/** Gasta no limite: amplia transferências, crédito e desonerações, e escolhe o evento que mais agrada. */
const populistaFiscal: Strategy = {
  id: 'populista_fiscal',
  name: 'Populista fiscal',
  decide(state, content) {
    const events = answerEvents(state, content, maximizeApproval);
    return { decisions: sendInOrder(state, content, POPULISTA_ORDER, events.spent), eventChoices: events.choices };
  },
};

/** Contém gastos e cria receita; responde aos eventos com a escolha padrão. */
const austera: Strategy = {
  id: 'austera',
  name: 'Austera',
  decide(state, content) {
    const events = answerEvents(state, content, useDefault);
    return { decisions: sendInOrder(state, content, AUSTERA_ORDER, events.spent), eventChoices: events.choices };
  },
};

/** Prioriza as reformas de longo prazo; responde aos eventos com a escolha padrão. */
const reformista: Strategy = {
  id: 'reformista',
  name: 'Reformista',
  decide(state, content) {
    const events = answerEvents(state, content, useDefault);
    return { decisions: sendInOrder(state, content, REFORMISTA_ORDER, events.spent), eventChoices: events.choices };
  },
};

/**
 * Sorteia políticas e respostas com RNG próprio, semeado pela campanha e pelo mês. Determinística: a mesma
 * semente e o mesmo mês geram sempre as mesmas escolhas.
 */
const aleatoria: Strategy = {
  id: 'aleatoria',
  name: 'Aleatória',
  decide(state, content) {
    const rng = createRng(seedRng(state.seed * 31 + state.monthIndex));
    const events = answerEvents(state, content, (event) => {
      const free = event.choices.filter((c) => c.agendaCost === 0).map((c) => c.id);
      return pickOne(rng, free) ?? event.defaultChoice;
    });

    const sendable = sendablePolicies(state, content);
    let left = state.resources.agendaPointsPerMonth - events.spent;
    const decisions: Decision[] = [];
    for (;;) {
      const options = [...sendable].filter((id) => content.policies[id].agendaCost <= left);
      const id = pickOne(rng, options);
      if (id === undefined) break;
      const decision = decisionFor(content, id);
      decisions.push(decision);
      left -= decision.agendaCost;
      sendable.delete(id);
    }
    return { decisions, eventChoices: events.choices };
  },
};

const distributiva: Strategy = {
  id: 'distributiva',
  name: 'Distributiva',
  decide(state, content) {
    const events = answerEvents(state, content, useDefault);
    return { decisions: sendInOrder(state, content, DISTRIBUTIVA_ORDER, events.spent), eventChoices: events.choices };
  },
};

const proOferta: Strategy = {
  id: 'pro_oferta',
  name: 'Pró-oferta',
  decide(state, content) {
    const events = answerEvents(state, content, useDefault);
    return { decisions: sendInOrder(state, content, PRO_OFERTA_ORDER, events.spent), eventChoices: events.choices };
  },
};

/**
 * A mesma estratégia, pressionando o Banco Central a cada trimestre quando sobra ponto de agenda depois das
 * decisões dela (o motor processa eventos e decisões na ordem enviada).
 */
export function withQuarterlyPressure(base: Strategy): Strategy {
  const pressure = AGENDA_ACTIONS[PRESSURE_ACTION_ID];
  return {
    id: `${base.id}_pressao_bc`,
    name: `${base.name} + pressão sobre o BC`,
    decide(state, content) {
      const input = base.decide(state, content);
      if (!pressure || state.monthIndex % PRESSURE_EVERY_MONTHS !== 0) return input;
      const eventCost = (input.eventChoices ?? []).reduce((sum, choice) => {
        const def = content.events.find((e) => e.id === choice.eventId)?.choices.find((c) => c.id === choice.choiceId);
        return sum + (def?.agendaCost ?? 0);
      }, 0);
      const spent = eventCost + input.decisions.reduce((sum, d) => sum + d.agendaCost, 0);
      if (state.resources.agendaPointsPerMonth - spent < pressure.agendaCost) return input;
      return { ...input, decisions: [...input.decisions, { policyId: pressure.id, agendaCost: pressure.agendaCost }] };
    },
  };
}

/** Todas as estratégias-robô, na ordem de exibição do balanceamento. */
export const STRATEGIES: readonly Strategy[] = [
  inerte,
  populistaFiscal,
  austera,
  reformista,
  distributiva,
  proOferta,
  withQuarterlyPressure(inerte),
  aleatoria,
];
