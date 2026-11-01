import type { CareerProfile, CareerTurn } from '../../types/scenario';
import type {
  CareerStage,
  CareerStartPoint,
  CareerState,
  Decision,
  DecisionRejection,
  GameContent,
  GameState,
  MonthInput,
  MonthResult,
  MonthStep,
  ReportDraft,
  Contribution,
} from '../types';
import { createRng } from '../rng';

/**
 * Carreira antes da posse (PLANO_CAMPANHA.md, Fase C1 / entrega M1.1): identidade dos turnos, despacho por estágio e
 * transição mínima de estágio. Ainda sem regras de campanha (viabilidade, finanças, eleição: Fases C2–C5).
 */

/** Índice sequencial do turno a ser jogado (PLANO_CAMPANHA.md §2.3): chave de banco, retenção e store. */
export function turnIndexOf(state: Pick<GameState, 'monthIndex' | 'career'>): number {
  return state.career?.turnIndex ?? state.monthIndex;
}

/** O turno a ser jogado é anterior à posse (o mandato ainda não começou). */
export function isPreInauguration(state: Pick<GameState, 'career'>): boolean {
  return state.career !== undefined && state.career.stage !== 'governo';
}

/**
 * Turno em que a posse foi jogada (mês do mandato 0); `null` antes da posse. Depois dela os dois relógios andam
 * juntos, então a diferença é constante.
 */
export function inaugurationTurnIndex(state: Pick<GameState, 'monthIndex' | 'career'>): number | null {
  return isPreInauguration(state) ? null : turnIndexOf(state) - state.monthIndex;
}

/** Turnos pré-posse do ponto de partida, na ordem; erro se o cenário não o oferece. */
export function careerSchedule(
  content: Pick<GameContent, 'scenario'>,
  startPoint: CareerStartPoint,
): readonly CareerTurn[] {
  const spec = content.scenario.career?.startPoints[startPoint];
  if (!spec) throw new RangeError(`o cenário ${content.scenario.id} não oferece o ponto de partida ${startPoint}`);
  return spec.turns;
}

/** Pontos de partida que o cenário oferece, na ordem de exibição; a posse está sempre disponível. */
export function availableStartPoints(content: Pick<GameContent, 'scenario'>): ('posse' | CareerStartPoint)[] {
  const points = content.scenario.career?.startPoints;
  return ['posse', ...(['corrida', 'pre_campanha'] as const).filter((p) => points?.[p] !== undefined)];
}

/** Perfil de candidato do cenário; sem id, o primeiro. Erro se não existir. */
export function careerProfile(content: Pick<GameContent, 'scenario'>, profileId?: string): CareerProfile {
  const profiles = content.scenario.career?.profiles ?? [];
  const found = profileId === undefined ? profiles[0] : profiles.find((p) => p.id === profileId);
  if (!found) throw new RangeError(`perfil de candidato desconhecido: ${profileId ?? '(nenhum)'}`);
  return found;
}

/**
 * Estado inicial da carreira. Reconhecimento por UF = combinação do nacional com a base territorial do perfil,
 * 1 − (1 − R)(1 − base): nunca passa de 1 e não precisa de coeficiente.
 */
export function createCareerState(
  content: Pick<GameContent, 'scenario'>,
  startPoint: CareerStartPoint,
  profileId?: string,
): CareerState {
  const schedule = careerSchedule(content, startPoint);
  const profile = careerProfile(content, profileId);
  const recognition: Record<string, number> = {};
  for (const uf of content.scenario.regions?.ufs ?? []) {
    const base = profile.territorialBase[uf.id] ?? 0;
    recognition[uf.id] = 1 - (1 - profile.recognition) * (1 - base);
  }
  return {
    startPoint,
    profileId: profile.id,
    stage: schedule[0].stage,
    turnIndex: 0,
    recognition,
    valence: profile.valence,
  };
}

/** Turno pré-posse a ser jogado (estágio e meses); `null` da posse em diante ou sem carreira. */
export function currentCareerTurn(
  state: Pick<GameState, 'career'>,
  content: Pick<GameContent, 'scenario'>,
): CareerTurn | null {
  const career = state.career;
  if (!career || career.stage === 'governo') return null;
  return careerSchedule(content, career.startPoint)[career.turnIndex] ?? null;
}

/**
 * Etapas de um turno pré-posse, na ordem (esqueleto da Fase C1). As Fases C2–C5 acrescentam aqui viabilidade,
 * pesquisas, finanças e eleição; nenhuma etapa de governo roda antes da posse. Os indicadores de governo não mudam
 * antes da posse: contribuições destas etapas são só de relatório (pseudo-indicadores, como `'votingIntention'`).
 */
export const PRE_INAUGURATION_STEPS: readonly MonthStep[] = [];

/** Nota do relatório no turno em que a campanha termina e o próximo é a posse. */
export const INAUGURATION_NOTE = 'Fim da campanha: o próximo turno é a posse, em janeiro de 2027.';

/**
 * Processa um turno pré-posse (despacho do `advanceMonth`). Decisões de governo são recusadas com `fora_do_estagio`
 * (ainda não há ações de campanha); o mês do mandato não anda; o turno avança e, no fim do calendário do ponto de
 * partida, o estágio passa a `governo` (transição mínima, sem regras de posse — Fase C5). Função pura.
 */
export function advanceCareerTurn(
  state: GameState,
  input: MonthInput,
  content: GameContent,
  steps: readonly MonthStep[] = PRE_INAUGURATION_STEPS,
): MonthResult {
  const career = state.career;
  const turn = currentCareerTurn(state, content);
  if (!career || !turn) throw new RangeError('advanceCareerTurn só processa turnos antes da posse');

  const rejected: { decision: Decision; reason: DecisionRejection }[] = input.decisions.map((decision) => ({
    decision: decision.params ? { ...decision, params: { ...decision.params } } : { ...decision },
    reason: 'fora_do_estagio',
  }));
  const rng = createRng(state.rng);
  const draft: ReportDraft = {
    proposalChanges: [],
    eventsResolved: [],
    eventsFired: [],
    eventInstances: [],
    notes: [],
    copom: null,
    regional: null,
    profileMoves: [],
  };
  const ctx = { rng, content, decisions: [], eventChoices: [], draft };
  const contributions: Contribution[] = [];
  let current: GameState = state;
  for (const step of steps) {
    const out = step(current, ctx);
    current = out.state;
    contributions.push(...out.contributions);
  }

  const schedule = careerSchedule(content, career.startPoint);
  const nextTurn = career.turnIndex + 1;
  const nextStage: CareerStage = nextTurn < schedule.length ? schedule[nextTurn].stage : 'governo';
  if (nextStage === 'governo') draft.notes.push(INAUGURATION_NOTE);
  const next: GameState = {
    ...current,
    rng: rng.state(),
    career: { ...(current.career ?? career), stage: nextStage, turnIndex: nextTurn },
  };
  return {
    state: next,
    report: {
      monthIndex: state.monthIndex,
      turnIndex: career.turnIndex,
      career: { stage: turn.stage, from: turn.from, to: turn.to ?? turn.from },
      accepted: [],
      rejected,
      contributions,
      proposalChanges: draft.proposalChanges,
      eventsResolved: draft.eventsResolved,
      eventsFired: draft.eventsFired,
      eventInstances: draft.eventInstances ?? [],
      copom: null,
      notes: draft.notes,
      regional: null,
      profileMoves: [],
    },
  };
}
