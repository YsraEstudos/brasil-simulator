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
  Difficulty,
} from '../types';
import { createRng } from '../rng';

import { createOpponents } from './opponents';
import { pollStep } from './polls';
import { initialRecognition, viabilityStep } from './viability';
import { inspectIllicitTurn, resolveIllicitCalibration } from './illicit';
import { offsetOfKey } from '../calendar';
import { appendNews } from '../news';
import {
  closeCampaignFinance,
  createCampaignFinance,
  reserveCampaignCosts,
  createExpandedFinance,
  contributePersonal,
  reserveExpandedCosts,
  recordExternalSpend,
  receiveSimpleDue,
  scheduleSimpleReceipt,
  closeExpandedFinance,
  receiveDue,
  scheduleReceipt,
  type FinancePocket,
  type FinanceExpenditure,
} from './finance';

/**
 * Carreira antes da posse (PLANO_CAMPANHA.md, Fase C1 / entrega M1.1): identidade dos turnos, despacho por estágio e
 * transição mínima de estágio. Fase C2: viabilidade, adversários e pesquisas (módulos vizinhos). Ainda sem ações,
 * finanças e eleição (Fases C3–C5).
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
 * 1 − (1 − R)(1 − base): nunca passa de 1 e não precisa de coeficiente. Os adversários (Fase C2) seguem a mesma
 * regra; ainda não há pesquisa (a primeira sai no fim do primeiro turno).
 */
export function createCareerState(
  content: Pick<GameContent, 'scenario'>,
  startPoint: CareerStartPoint,
  profileId?: string,
  difficulty: Difficulty = 'estrategica',
): CareerState {
  const schedule = careerSchedule(content, startPoint);
  const profile = careerProfile(content, profileId);
  const finance = content.scenario.career?.finance;
  const expanded = finance?.expanded;
  let expandedFinance =
    expanded && finance
      ? {
          ...createExpandedFinance({
            personalAvailable: expanded.personalAvailable,
            personalLimit: expanded.personalLimit,
            debtLimit: expanded.debtLimit,
            spendingLimit: finance.spendingLimit,
          }),
          pockets: { personal: 0, party: finance.initialBalance, donations: 0 },
        }
      : undefined;
  if (expandedFinance) {
    for (const receipt of expanded?.installments ?? []) expandedFinance = scheduleReceipt(expandedFinance, receipt);
  }
  return {
    startPoint,
    profileId: profile.id,
    ...(finance && !expanded ? { finance: createCampaignFinance(finance.initialBalance, finance.spendingLimit) } : {}),
    ...(expandedFinance ? { expandedFinance } : {}),
    ...(expanded?.illicit && difficulty !== 'casual'
      ? { illicit: { balance: 0, pending: [], exposure: 0, investigations: 0 } }
      : {}),
    stage: schedule[0].stage,
    turnIndex: 0,
    recognition: initialRecognition(content.scenario.regions?.ufs ?? [], profile.recognition, profile.territorialBase),
    valence: profile.valence,
    opponents: createOpponents(content, profile),
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
 * Etapas de um turno pré-posse, na ordem: viabilidade (Fase C2) e, por último, a pesquisa (PLANO_CAMPANHA.md Fase C2,
 * "etapa definida do turno"). As Fases C3–C5 acrescentam finanças, ações e eleição antes da pesquisa; nenhuma etapa
 * de governo roda antes da posse. Os indicadores de governo não mudam antes da posse: contribuições destas etapas são
 * só de relatório (pseudo-indicador `'careerRecognition'`).
 */
export const PRE_INAUGURATION_STEPS: readonly MonthStep[] = [viabilityStep, pollStep];

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

  const accepted: Decision[] = [];
  const expenditures: FinanceExpenditure[] = [];
  const rejected: { decision: Decision; reason: DecisionRejection }[] = [];
  const decisionOrder: { decision: Decision; accepted: boolean; reason: DecisionRejection | null }[] = [];
  const accept = (decision: Decision) => {
    accepted.push(decision);
    decisionOrder.push({ decision, accepted: true, reason: null });
  };
  const reject = (decision: Decision, reason: DecisionRejection) => {
    rejected.push({ decision, reason });
    decisionOrder.push({ decision, accepted: false, reason });
  };
  let finance = career.finance;
  const simpleReceipts =
    finance?.scheduled?.filter((item) => item.turn <= career.turnIndex).map((item) => ({ ...item })) ?? [];
  if (finance) finance = receiveSimpleDue(finance, career.turnIndex);
  let expandedFinance = career.expandedFinance;
  const receipts =
    expandedFinance?.scheduled.filter((item) => item.turn <= career.turnIndex).map((item) => ({ ...item })) ?? [];
  let personalContribution = 0;
  let illicit = career.illicit;
  if (illicit) {
    let balance = illicit.balance;
    const pending = illicit.pending.filter((item) => {
      if (item.turn > career.turnIndex) return true;
      balance += item.amount;
      if (!Number.isSafeInteger(balance)) throw new RangeError('saldo ilícito fora da faixa segura');
      return false;
    });
    illicit = { ...illicit, balance, pending };
  }
  let illicitVolume = 0;
  const illicitSpec = content.scenario.career?.finance?.expanded?.illicit;
  const illicitConfig = illicitSpec ? resolveIllicitCalibration(illicitSpec) : undefined;
  if (expandedFinance) expandedFinance = receiveDue(expandedFinance, career.turnIndex);
  const costs = content.scenario.career?.finance?.costs ?? [];
  let fundraisingDone = false;
  for (const item of input.decisions) {
    const decision = item.params ? { ...item, params: { ...item.params } } : { ...item };
    const entry = costs.find((cost) => cost.id === decision.policyId);
    if (turn.stage === 'transicao') {
      reject(decision, 'fora_do_estagio');
      continue;
    }
    if (decision.policyId === 'arrecadar_doacoes' && fundraisingDone) {
      reject(decision, 'acao_repetida');
      continue;
    }
    if (decision.policyId === 'usar_caixa_dois') {
      const amount = decision.params?.valor;
      if (!expandedFinance || !illicit || !illicitConfig || state.difficulty === 'casual') {
        reject(decision, 'fora_do_estagio');
      } else if (
        typeof amount !== 'number' ||
        !Number.isSafeInteger(amount) ||
        amount <= 0 ||
        !Number.isSafeInteger(illicit.balance + illicit.pending.reduce((sum, item) => sum + item.amount, 0) + amount)
      ) {
        reject(decision, 'custo_invalido');
      } else {
        const months = offsetOfKey(turn.to ?? turn.from) - offsetOfKey(turn.from) + 1;
        const limit = illicitConfig.monthlyLimit * months;
        if (!Number.isSafeInteger(limit) || amount > limit - illicitVolume) reject(decision, 'teto_legal');
        else {
          illicitVolume += amount;
          illicit = { ...illicit, pending: [...illicit.pending, { turn: career.turnIndex + 1, amount }] };
          accept(decision);
        }
      }
      continue;
    }
    if (expandedFinance && decision.policyId === 'aportar_campanha') {
      const amount = decision.params?.valor;
      if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0) {
        reject(decision, 'custo_invalido');
      } else if (amount > expandedFinance.personalAvailable) {
        reject(decision, 'sem_recursos');
      } else if (amount > expandedFinance.personalLimit - expandedFinance.personalContributed) {
        reject(decision, 'teto_legal');
      } else {
        expandedFinance = contributePersonal(expandedFinance, amount);
        personalContribution += amount;
        accept(decision);
      }
      continue;
    }
    if (expandedFinance && entry) {
      const pocket = decision.params?.bolso;
      if (pocket === 'illicit') {
        if (!illicit || !entry.pockets?.includes('illicit')) reject(decision, 'alvo_invalido');
        else if (entry.cost > expandedFinance.spendingLimit - expandedFinance.spent) reject(decision, 'teto_legal');
        else if (entry.cost > illicit.balance) reject(decision, 'sem_recursos');
        else {
          illicit = { ...illicit, balance: illicit.balance - entry.cost };
          expandedFinance = recordExternalSpend(expandedFinance, entry.cost);
          if (decision.policyId === 'arrecadar_doacoes') {
            const amount = careerProfile(content, career.profileId).fundraisingCapacity;
            expandedFinance = scheduleReceipt(expandedFinance, {
              pocket: 'donations',
              turn: career.turnIndex + 1,
              amount,
            });
            fundraisingDone = true;
          }
          accept(decision);
          expenditures.push({
            actionId: decision.policyId,
            amount: entry.cost,
            pocket: 'illicit',
            paid: entry.cost,
            debt: 0,
          });
        }
        continue;
      }
      if (pocket !== 'personal' && pocket !== 'party' && pocket !== 'donations') {
        reject(decision, 'alvo_invalido');
        continue;
      }
      const beforeReservation = expandedFinance;
      const reservation = reserveExpandedCosts(expandedFinance, [
        {
          cost: entry.cost,
          pocket: pocket as FinancePocket,
          allowed: (entry.pockets ?? []).filter((p): p is FinancePocket => p !== 'illicit'),
          allowDebt: decision.params?.divida === true || decision.params?.divida === 'integral',
          borrowAll: decision.params?.divida === 'integral',
        },
      ]);
      const reason = reservation.reasons[0];
      if (reason) reject(decision, reason === 'bolso_invalido' ? 'alvo_invalido' : reason);
      else {
        expandedFinance = reservation.finance;
        if (decision.policyId === 'arrecadar_doacoes') {
          const amount = careerProfile(content, career.profileId).fundraisingCapacity;
          expandedFinance = scheduleReceipt(expandedFinance, {
            pocket: 'donations',
            turn: career.turnIndex + 1,
            amount,
          });
          fundraisingDone = true;
        }
        accept(decision);
        expenditures.push({
          actionId: decision.policyId,
          amount: entry.cost,
          pocket,
          paid: beforeReservation.pockets[pocket] - expandedFinance.pockets[pocket],
          debt: expandedFinance.debt - beforeReservation.debt,
        });
      }
      continue;
    }
    if (!finance || !entry) {
      reject(decision, 'fora_do_estagio');
      continue;
    }
    const reservation = reserveCampaignCosts(finance, [entry.cost]);
    const reason = reservation.reasons[0];
    if (reason) reject(decision, reason);
    else {
      finance = reservation.finance;
      if (decision.policyId === 'arrecadar_doacoes') {
        finance = scheduleSimpleReceipt(
          finance,
          career.turnIndex + 1,
          careerProfile(content, career.profileId).fundraisingCapacity,
        );
        fundraisingDone = true;
      }
      accept(decision);
      expenditures.push({
        actionId: decision.policyId,
        amount: entry.cost,
        pocket: 'simple',
        paid: entry.cost,
        debt: 0,
      });
    }
  }
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
  let illicitReport:
    | { volume: number; exposure: number; hazard: number; discovered: boolean; balance: number; investigations: number }
    | undefined;
  if (illicit && illicitConfig) {
    const months = offsetOfKey(turn.to ?? turn.from) - offsetOfKey(turn.from) + 1;
    const inspection = inspectIllicitTurn(
      illicit,
      illicitVolume,
      { ...illicitConfig, monthlyLimit: illicitConfig.monthlyLimit * months },
      state.seed,
      career.stage,
      career.turnIndex,
    );
    illicit = { ...illicit, ...inspection.state };
    illicitReport = {
      volume: illicitVolume,
      exposure: inspection.exposureBeforeInspection,
      hazard: inspection.hazard,
      discovered: inspection.discovered,
      balance: illicit.balance,
      investigations: illicit.investigations,
    };
    if (inspection.discovered) draft.notes.push('Investigação de caixa 2 iniciada; ainda não há condenação.');
  }
  // Respostas a eventos seguem para as etapas, como no mandato: uma por evento pendente (ainda não há eventos de
  // campanha, Fase C3 em diante; o custo em ações de campanha entra com eles).
  const answered = new Set<string>();
  const eventChoices = (input.eventChoices ?? []).filter((choice) => {
    const ok = !answered.has(choice.eventId) && state.events.pending.some((p) => p.eventId === choice.eventId);
    answered.add(choice.eventId);
    return ok;
  });
  const ctx = { rng, content, decisions: accepted, eventChoices, draft };
  const contributions: Contribution[] = [];
  let current: GameState = {
    ...state,
    career: {
      ...career,
      ...(finance ? { finance } : {}),
      ...(expandedFinance ? { expandedFinance } : {}),
      ...(illicit ? { illicit } : {}),
    },
  };
  for (const step of steps) {
    const out = step(current, ctx);
    current = out.state;
    contributions.push(...out.contributions);
  }

  const schedule = careerSchedule(content, career.startPoint);
  const nextTurn = career.turnIndex + 1;
  const nextStage: CareerStage = nextTurn < schedule.length ? schedule[nextTurn].stage : 'governo';
  if (nextStage === 'governo') draft.notes.push(INAUGURATION_NOTE);
  const after = current.career ?? career;
  const poll = after.poll?.turnIndex === career.turnIndex ? after.poll : undefined;
  finance = after.finance && nextStage === 'governo' ? closeCampaignFinance(after.finance) : after.finance;
  expandedFinance = after.expandedFinance;
  let commitments = after.commitments;
  if (expandedFinance && nextStage === 'governo') {
    const deadline = content.scenario.career?.finance?.expanded?.debtDeadline;
    if (deadline === undefined) throw new RangeError('prazo de dívida ausente');
    const closed = closeExpandedFinance(expandedFinance, state.difficulty, deadline);
    expandedFinance = closed.finance;
    if (closed.commitment) commitments = [...(commitments ?? []), closed.commitment];
  }
  if (illicit && nextStage === 'governo')
    illicit = {
      ...illicit,
      closedBalance: illicit.balance,
      balance: 0,
      cancelledPending: illicit.pending.reduce((sum, item) => sum + item.amount, 0),
      pending: [],
    };
  const next: GameState = {
    ...current,
    rng: rng.state(),
    career: {
      ...after,
      ...(finance ? { finance } : {}),
      ...(expandedFinance ? { expandedFinance } : {}),
      ...(commitments ? { commitments } : {}),
      ...(illicit ? { illicit } : {}),
      stage: nextStage,
      turnIndex: nextTurn,
    },
  };
  const withNews = illicitReport?.discovered
    ? appendNews(next, [
        {
          id: `career_${career.turnIndex}_caixa_dois`,
          monthIndex: state.monthIndex,
          turnIndex: career.turnIndex,
          careerPeriod: turn.to ?? turn.from,
          kind: 'institucional',
          tone: 'negativa',
          headline: 'Investigação apura recursos não declarados na campanha',
          cause: 'Causa: fiscalização identificou exposição de caixa 2.',
          sourceId: 'caixa_dois',
        },
      ])
    : next;
  return {
    state: withNews,
    report: {
      monthIndex: state.monthIndex,
      turnIndex: career.turnIndex,
      career: {
        stage: turn.stage,
        from: turn.from,
        to: turn.to ?? turn.from,
        ...(poll ? { poll } : {}),
        ...(finance ? { finance: { ...finance, expenditures, receipts: simpleReceipts } } : {}),
        ...(expandedFinance
          ? { expandedFinance: { ...expandedFinance, expenditures, receipts, personalContribution } }
          : {}),
        ...(illicitReport ? { illicit: illicitReport } : {}),
      },
      accepted,
      rejected,
      decisionOrder,
      contributions,
      proposalChanges: draft.proposalChanges,
      eventsResolved: draft.eventsResolved,
      eventsFired: draft.eventsFired,
      eventInstances: draft.eventInstances ?? [],
      copom: draft.copom,
      notes: draft.notes,
      regional: draft.regional,
      profileMoves: draft.profileMoves ?? [],
    },
  };
}
