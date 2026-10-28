import type { Decision, DecisionRejection, GameState } from '../types';
import type { ParamSpec } from '../economy/calibration';
export { PAY_CAMPAIGN_DEBT } from '../actions';

/** Penalidade fictícia até a calibração da fase C3. */
export const DEBT_CHARGE: ParamSpec = {
  value: 5,
  min: 0,
  max: 20,
  note: 'capital político perdido por dívida de campanha não paga',
  basis: 'PROVISORIO: critério de jogo',
};

/** Compromisso fictício de campanha, com prazo no calendário do mandato. */
export interface DebtCommitment {
  origin: string;
  obligation: 'pagar_divida';
  initialAmount: number;
  remaining: number;
  deadline: number;
  status: 'pendente' | 'cumprido' | 'expirado';
}

function nonnegativeInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('valor de compromisso inválido');
}

export function debtCommitment(origin: string, amount: number, deadline: number): DebtCommitment {
  nonnegativeInteger(amount);
  nonnegativeInteger(deadline);
  if (!origin.trim() || amount === 0) throw new RangeError('origem ou valor inválido');
  return { origin, obligation: 'pagar_divida', initialAmount: amount, remaining: amount, deadline, status: 'pendente' };
}

export function settleDebt(commitment: DebtCommitment, payment: number, month: number): DebtCommitment {
  nonnegativeInteger(payment);
  nonnegativeInteger(month);
  if (
    commitment.status !== 'pendente' ||
    month > commitment.deadline ||
    payment === 0 ||
    payment > commitment.remaining
  )
    throw new RangeError('pagamento de compromisso inválido');
  const remaining = commitment.remaining - payment;
  return { ...commitment, remaining, status: remaining === 0 ? 'cumprido' : 'pendente' };
}

/** O resultado sinaliza uma cobrança apenas na passagem de pendente para expirado. */
export function expireDebt(commitment: DebtCommitment, month: number): { commitment: DebtCommitment; charge: boolean } {
  nonnegativeInteger(month);
  if (commitment.status !== 'pendente' || month <= commitment.deadline) return { commitment, charge: false };
  return { commitment: { ...commitment, status: 'expirado' }, charge: true };
}

/** Valida e paga a obrigação apenas com dinheiro pessoal, sem usar recursos do Estado. */
export function payCampaignDebt(
  state: GameState,
  decision: Decision,
): { state: GameState; reason?: DecisionRejection } {
  const career = state.career;
  const finance = career?.expandedFinance;
  const index = decision.params?.indice;
  const amount = decision.params?.valor;
  if (!career || career.stage !== 'governo' || !finance || !Array.isArray(career.commitments))
    return { state, reason: 'fora_do_estagio' };
  if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0 || !career.commitments[index])
    return { state, reason: 'alvo_invalido' };
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0)
    return { state, reason: 'custo_invalido' };
  const obligation = career.commitments[index];
  if (obligation.status !== 'pendente' || state.monthIndex > obligation.deadline || amount > obligation.remaining)
    return { state, reason: 'alvo_invalido' };
  if (amount > finance.personalAvailable) return { state, reason: 'sem_recursos' };
  const commitments = career.commitments.slice();
  commitments[index] = settleDebt(obligation, amount, state.monthIndex);
  return {
    state: {
      ...state,
      career: {
        ...career,
        commitments,
        expandedFinance: { ...finance, personalAvailable: finance.personalAvailable - amount },
      },
    },
  };
}

/** Aplica uma única cobrança na virada de status; os detalhes ficam no relatório. */
export function chargeExpiredDebt(state: GameState): { state: GameState; notes: string[] } {
  const career = state.career;
  if (!career?.commitments?.length || career.stage !== 'governo') return { state, notes: [] };
  let charges = 0;
  const commitments = career.commitments.map((item) => {
    const result = expireDebt(item, state.monthIndex);
    if (result.charge) charges++;
    return result.commitment;
  });
  if (charges === 0) return { state, notes: [] };
  const capital = Math.max(0, state.resources.politicalCapital - charges * DEBT_CHARGE.value);
  return {
    state: {
      ...state,
      resources: { ...state.resources, politicalCapital: capital },
      career: { ...career, commitments },
    },
    notes: [`Cobrança de dívida de campanha: capital político caiu ${state.resources.politicalCapital - capital}.`],
  };
}
