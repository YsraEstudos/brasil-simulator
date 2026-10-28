import type { CareerActionOutcome, Contribution, GameContent, MonthStep } from '../types';

import { applyCareerAction, isCareerAction } from './actions';
import { applyDebate, DEBATE_ACTION_ID, debateOfTurn } from './debate';

/**
 * Etapa das ações de campanha (PLANO_CAMPANHA.md Fase C4): aplica, na ordem de envio, as ações aceitas pela triagem
 * (estágio, alvo, limite e reserva do custo já conferidos) e o debate do turno, se houver (sem escolha marcada, vale
 * a postura padrão). Roda antes da viabilidade: o esquecimento e o crescimento do mês partem do que as ações
 * deixaram. Contribuições só de relatório (`careerRecognition`, `careerValence`).
 */
export const campaignStep: MonthStep = (state, ctx) => {
  const career = state.career;
  const content: GameContent = ctx.content;
  const turn = career ? content.scenario.career?.startPoints[career.startPoint]?.turns[career.turnIndex] : undefined;
  if (!career || !turn || turn.stage === 'transicao') return { state, contributions: [] };

  let current = career;
  const contributions: Contribution[] = [];
  const outcomes: CareerActionOutcome[] = [];
  for (const decision of ctx.decisions) {
    if (!isCareerAction(decision.policyId)) continue;
    const r = applyCareerAction(current, decision, content, state.seed);
    current = r.career;
    outcomes.push(r.outcome);
    contributions.push(...r.contributions);
  }
  if (outcomes.length > 0) ctx.draft.careerActions = outcomes;

  const debate = debateOfTurn(content, turn);
  if (debate) {
    const chosen = ctx.decisions.find((d) => d.policyId === DEBATE_ACTION_ID) ?? null;
    const r = applyDebate(current, debate, chosen, content, state.seed);
    current = r.career;
    ctx.draft.careerDebate = r.outcome;
    contributions.push(...r.contributions);
    if (!chosen) ctx.draft.notes.push(`${debate.name}: sem postura marcada, você foi com a postura propositiva.`);
  }
  return { state: { ...state, career: current }, contributions };
};
