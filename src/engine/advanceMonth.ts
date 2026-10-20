import { actionKey, AGENDA_ACTIONS } from './actions';
import { validateActionTarget } from './agenda';
import { electionsStep, governorTurnoverStep } from './elections/elections';
import { isNovoBeneficio, vedacaoAtiva } from './elections/vedacao';
import { cabinetStep } from './congress/cabinet';
import { congressStep } from './congress/congress';
import { economyStep } from './economy/economy';
import { resolveEventsStep, triggerEventsStep } from './events/events';
import { pruneImpulses } from './impulses';
import { appendNews, generateNews } from './news';
import { opinionStep } from './politics/opinion';
import { governmentProfileStep } from './politics/profile';
import { publicPoliciesStep, reservePublicAction } from './publicPolicies/publicPolicies';
import { societyStep } from './society/society';
import { proposalsStep, reissueBarredPolicies } from './proposals/proposals';
import { regionsStep } from './regions/regions';
import { createRng } from './rng';
import {
  PROPOSAL_IN_PROGRESS,
  type Contribution,
  type Decision,
  type DecisionRejection,
  type EventChoice,
  type GameContent,
  type GameState,
  type Indicators,
  type MonthInput,
  type MonthReport,
  type MonthResult,
  type MonthStep,
  type ReportDraft,
} from './types';

/**
 * Etapas do mês, na ordem do pipeline (ECONOMIC_MODEL.md §4): respostas a eventos, nomeações de ministros,
 * propostas e Congresso (negociação, votações, sanção, execução), relações com os blocos, perfil ideológico do
 * governo (PLANO_GLOBO.md §5.1), economia, opinião
 * pública, eleições (FASE_08.md), distribuição às UFs (ECONOMIC_MODEL.md §5.15), posse dos governadores
 * eleitos e, por fim, sorteio dos eventos que chegam à caixa de entrada do mês seguinte.
 *
 * Contrato de ordem eleitoral (revisão do PR #9): `electionsStep` roda ANTES de `regionsStep` (a contribuição
 * de aprovação do pleito entra antes da distribuição às UFs) e `governorTurnoverStep` roda DEPOIS, para o
 * governador recém-eleito não ser puxado pela evolução regional do próprio mês.
 */
export const DEFAULT_STEPS: readonly MonthStep[] = [
  resolveEventsStep,
  cabinetStep,
  proposalsStep,
  congressStep,
  publicPoliciesStep,
  governmentProfileStep,
  economyStep,
  societyStep,
  opinionStep,
  electionsStep,
  regionsStep,
  governorTurnoverStep,
  triggerEventsStep,
];

/**
 * Processa um mês: valida as escolhas pelas ações de agenda do mês, roda as etapas e aplica as contribuições.
 * Função pura: não altera `state` nem `input`; mesma entrada → mesma saída.
 */
export function advanceMonth(
  state: GameState,
  input: MonthInput,
  content: GameContent,
  steps: readonly MonthStep[] = DEFAULT_STEPS,
): MonthResult {
  const screened = screenInput(state, input, content);

  const rng = createRng(state.rng);
  const draft: ReportDraft = {
    proposalChanges: [],
    eventsResolved: [],
    eventsFired: [],
    notes: [],
    copom: null,
    regional: null,
    profileMoves: [],
  };
  const ctx = { rng, content, decisions: screened.accepted, eventChoices: screened.eventChoices, draft };
  const contributions: Contribution[] = [];
  let current: GameState = state;
  // Cada etapa vê o resultado das anteriores (ex.: inflação depois do hiato, ECONOMIC_MODEL.md §4).
  for (const step of steps) {
    const out = step(current, ctx);
    current = { ...out.state, indicators: applyContributions(current.indicators, out.contributions) };
    contributions.push(...out.contributions);
  }

  const nextMonth = state.monthIndex + 1;
  const next: GameState = {
    ...current,
    rng: rng.state(),
    monthIndex: nextMonth,
    impulses: pruneImpulses(current.impulses, nextMonth),
    decisionLog: [
      ...state.decisionLog,
      ...screened.accepted.map((decision) => ({ monthIndex: state.monthIndex, decision: copyDecision(decision) })),
    ],
  };

  const report: MonthReport = {
    monthIndex: state.monthIndex,
    accepted: screened.accepted,
    rejected: screened.rejected,
    contributions,
    proposalChanges: draft.proposalChanges,
    eventsResolved: draft.eventsResolved,
    eventsFired: draft.eventsFired,
    copom: draft.copom,
    notes: draft.notes,
    regional: draft.regional,
    profileMoves: draft.profileMoves ?? [],
  };
  // Notícias (FASE_07.md): geradas depois dos indicadores e do relatório finais, com causa; o relatório não muda.
  const news = generateNews({ previous: state, next, report, content });
  return { state: appendNews(next, news), report };
}

/**
 * Aceita primeiro as respostas a eventos e depois as decisões, na ordem enviada, enquanto houver ações de
 * agenda (GAME_DESIGN.md §4.3). O custo de uma política vem do catálogo, não do que a interface enviou.
 */
function screenInput(state: GameState, input: MonthInput, content: GameContent) {
  let left = state.resources.agendaActionsPerMonth;
  const eventChoices: EventChoice[] = [];
  const answered = new Set<string>();
  for (const choice of input.eventChoices ?? []) {
    const pending = state.events.pending.some((p) => p.eventId === choice.eventId);
    const def = content.events.find((e) => e.id === choice.eventId)?.choices.find((c) => c.id === choice.choiceId);
    if (!pending || answered.has(choice.eventId) || !def || def.agendaCost > left) continue;
    left -= def.agendaCost;
    answered.add(choice.eventId);
    eventChoices.push({ ...choice });
  }

  const accepted: Decision[] = [];
  const rejected: { decision: Decision; reason: DecisionRejection }[] = [];
  const sent = new Set(state.proposals.filter((p) => PROPOSAL_IN_PROGRESS.has(p.status)).map((p) => p.policyId));
  // CF art. 62 §10: MP rejeitada ou caducada não volta na mesma sessão legislativa.
  const barredMeasures = reissueBarredPolicies(state, content);
  const actionsDone = new Set<string>();
  let actionState = state;
  for (const decision of input.decisions) {
    // Ação de agenda (sem proposta): uma vez por mês para cada alvo, custo do catálogo de ações.
    const action = Object.hasOwn(AGENDA_ACTIONS, decision.policyId) ? AGENDA_ACTIONS[decision.policyId] : undefined;
    if (action) {
      const key = actionKey(action, decision.params);
      const normalized = { ...decision, agendaCost: action.agendaCost };
      const invalid = validateActionTarget(action, normalized, actionState, content);
      if (invalid) {
        rejected.push({ decision, reason: invalid });
      } else if (actionsDone.has(key)) {
        rejected.push({ decision, reason: 'acao_repetida' });
      } else if (action.agendaCost > left) {
        rejected.push({ decision, reason: 'sem_acoes_de_agenda' });
      } else {
        left -= action.agendaCost;
        actionsDone.add(key);
        accepted.push({ ...copyDecision(decision), agendaCost: action.agendaCost });
        actionState = reservePublicAction(actionState, normalized, content);
      }
      continue;
    }
    const policy = content.policies[decision.policyId];
    const cost = policy ? policy.agendaCost : decision.agendaCost;
    if (!policy || !content.scenario.policies.includes(decision.policyId)) {
      rejected.push({ decision, reason: 'politica_desconhecida' });
    } else if (policy.delivery === 'rotina') {
      rejected.push({ decision, reason: 'alvo_invalido' });
    } else if (sent.has(decision.policyId)) {
      rejected.push({ decision, reason: 'ja_em_andamento' });
    } else if (barredMeasures.has(decision.policyId)) {
      rejected.push({ decision, reason: 'reedicao_vedada' });
    } else if (vedacaoAtiva(state, content) && !decision.params?.vedacao_bypass && isNovoBeneficio(policy)) {
      rejected.push({ decision, reason: 'vedacao_eleitoral' });
    } else if (!Number.isFinite(cost) || cost < 0) {
      rejected.push({ decision, reason: 'custo_invalido' });
    } else if (cost > left) {
      rejected.push({ decision, reason: 'sem_acoes_de_agenda' });
    } else {
      left -= cost;
      sent.add(decision.policyId);
      accepted.push({ ...copyDecision(decision), agendaCost: cost });
    }
  }
  return { accepted, rejected, eventChoices };
}

/** Cópia própria do motor: o histórico não pode mudar se quem chamou alterar o objeto depois. */
function copyDecision(d: Decision): Decision {
  return d.params ? { ...d, params: { ...d.params } } : { ...d };
}

function applyContributions(indicators: Indicators, contributions: readonly Contribution[]): Indicators {
  const next = { ...indicators };
  for (const c of contributions) {
    // 'votingIntention' (Fase 08) é report-only: a intenção não pertence ao `Indicators`.
    if (c.indicator === 'votingIntention') continue;
    next[c.indicator] += c.delta;
  }
  return next;
}
