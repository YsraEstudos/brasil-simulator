import { debtCommitment, type DebtCommitment } from './commitments';
import type { Difficulty } from '../types';

/** Contabilidade da campanha, em R$ mil inteiros (PLANO_CAMPANHA.md Fase C3). */
export interface CampaignFinance {
  balance: number;
  spendingLimit: number;
  spent: number;
  scheduled?: { turn: number; amount: number }[];
  /** Sobra registrada ao encerrar a campanha. */
  closedBalance?: number;
  cancelledReceipts?: number;
}

function assertAmount(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError('valor de campanha inválido');
}

export function createCampaignFinance(balance: number, spendingLimit: number): CampaignFinance {
  assertAmount(balance);
  assertAmount(spendingLimit);
  return { balance, spendingLimit, spent: 0 };
}

/** Reserva custos validados pelo catálogo, na ordem recebida; rejeições não consomem recursos. */
export function reserveCampaignCosts(
  finance: CampaignFinance,
  costs: readonly number[],
): { finance: CampaignFinance; reasons: (null | 'sem_recursos' | 'teto_legal')[] } {
  if (finance.closedBalance !== undefined) throw new RangeError('campanha encerrada');
  assertAmount(finance.balance);
  assertAmount(finance.spendingLimit);
  assertAmount(finance.spent);
  if (finance.spent > finance.spendingLimit) throw new RangeError('teto já excedido');
  let { balance, spent } = finance;
  const reasons = costs.map((cost) => {
    assertAmount(cost);
    if (cost > finance.spendingLimit - spent) return 'teto_legal' as const;
    if (cost > balance) return 'sem_recursos' as const;
    balance -= cost;
    spent += cost;
    return null;
  });
  return { finance: { ...finance, balance, spent }, reasons };
}

/** Encerra sem apagar a sobra: ela é registrada separadamente. */
export function closeCampaignFinance(finance: CampaignFinance): CampaignFinance {
  if (finance.closedBalance !== undefined) throw new RangeError('campanha já encerrada');
  assertAmount(finance.balance);
  assertAmount(finance.spent);
  assertAmount(finance.spendingLimit);
  if (finance.spent > finance.spendingLimit) throw new RangeError('teto já excedido');
  const cancelledReceipts = (finance.scheduled ?? []).reduce((sum, item) => sum + item.amount, 0);
  assertAmount(cancelledReceipts);
  return {
    ...finance,
    balance: 0,
    closedBalance: finance.balance,
    ...(finance.scheduled ? { scheduled: [], cancelledReceipts } : {}),
  };
}

/** Recebimentos de uma ação só ficam disponíveis a partir do turno registrado. */
export function receiveSimpleDue(finance: CampaignFinance, turn: number): CampaignFinance {
  assertAmount(turn);
  let balance = finance.balance;
  const scheduled = (finance.scheduled ?? []).filter((receipt) => {
    if (receipt.turn > turn) return true;
    balance += receipt.amount;
    assertAmount(balance);
    return false;
  });
  return { ...finance, balance, ...(finance.scheduled ? { scheduled } : {}) };
}

export function scheduleSimpleReceipt(finance: CampaignFinance, turn: number, amount: number): CampaignFinance {
  assertAmount(turn);
  assertAmount(amount);
  if (finance.closedBalance !== undefined) throw new RangeError('campanha encerrada');
  return { ...finance, scheduled: [...(finance.scheduled ?? []), { turn, amount }] };
}

/** Ampliação C3: três origens, parcelas por turno e gastos contratados por dívida explícita. */
export type FinancePocket = 'personal' | 'party' | 'donations';
export interface FinanceExpenditure {
  actionId: string;
  amount: number;
  pocket: FinancePocket | 'illicit' | 'simple';
  paid: number;
  debt: number;
}
export interface ScheduledReceipt {
  pocket: Exclude<FinancePocket, 'personal'>;
  amount: number;
  turn: number;
}
export interface ExpandedFinance {
  pockets: Record<FinancePocket, number>;
  personalAvailable: number;
  personalLimit: number;
  personalContributed: number;
  spendingLimit: number;
  spent: number;
  debt: number;
  debtLimit: number;
  scheduled: ScheduledReceipt[];
  closure?: { remaining: Record<FinancePocket, number>; cancelledReceipts: number; debt: number };
}

function assertOpen(finance: ExpandedFinance): void {
  if (finance.closure) throw new RangeError('campanha encerrada');
}

export function createExpandedFinance(options: {
  personalAvailable: number;
  personalLimit: number;
  spendingLimit: number;
  debtLimit: number;
}): ExpandedFinance {
  Object.values(options).forEach(assertAmount);
  return {
    pockets: { personal: 0, party: 0, donations: 0 },
    ...options,
    personalContributed: 0,
    spent: 0,
    debt: 0,
    scheduled: [],
  };
}

/** O limite incide na transferência do patrimônio, não no pagamento. */
export function contributePersonal(finance: ExpandedFinance, amount: number): ExpandedFinance {
  assertOpen(finance);
  assertAmount(amount);
  if (amount > finance.personalAvailable || amount > finance.personalLimit - finance.personalContributed)
    throw new RangeError('aporte pessoal excede limite ou liquidez');
  return {
    ...finance,
    personalAvailable: finance.personalAvailable - amount,
    personalContributed: finance.personalContributed + amount,
    pockets: { ...finance.pockets, personal: finance.pockets.personal + amount },
  };
}

/** Parcelas futuras são promessas; o chamador define um turno posterior para arrecadação por ação. */
export function scheduleReceipt(finance: ExpandedFinance, receipt: ScheduledReceipt): ExpandedFinance {
  assertOpen(finance);
  assertAmount(receipt.amount);
  assertAmount(receipt.turn);
  if (receipt.pocket !== 'party' && receipt.pocket !== 'donations') throw new RangeError('origem inválida');
  return { ...finance, scheduled: [...finance.scheduled, { ...receipt }] };
}

/** Aplique antes das decisões; parcelas vencidas são removidas para não entrar duas vezes. */
export function receiveDue(finance: ExpandedFinance, turn: number): ExpandedFinance {
  assertOpen(finance);
  assertAmount(turn);
  const pockets = { ...finance.pockets };
  const scheduled: ScheduledReceipt[] = [];
  for (const receipt of finance.scheduled) {
    if (receipt.turn > turn) scheduled.push(receipt);
    else {
      const total = pockets[receipt.pocket] + receipt.amount;
      assertAmount(total);
      pockets[receipt.pocket] = total;
    }
  }
  return { ...finance, pockets, scheduled };
}

/** Contrata uma despesa não paga apenas por escolha; conta imediatamente para o teto global. */
export function chooseDebt(finance: ExpandedFinance, amount: number): ExpandedFinance {
  assertOpen(finance);
  assertAmount(amount);
  if (amount > finance.debtLimit - finance.debt || amount > finance.spendingLimit - finance.spent)
    throw new RangeError('dívida ou teto de gastos excedido');
  return { ...finance, debt: finance.debt + amount, spent: finance.spent + amount };
}

/** Apenas um bolso permitido paga o gasto; não existe transferência ou dívida implícita. */
export function payFromPocket(
  finance: ExpandedFinance,
  pocket: FinancePocket,
  amount: number,
  allowed: readonly FinancePocket[],
): ExpandedFinance {
  assertOpen(finance);
  assertAmount(amount);
  if (!allowed.includes(pocket) || amount > finance.pockets[pocket] || amount > finance.spendingLimit - finance.spent)
    throw new RangeError('bolso, saldo ou teto insuficiente');
  return {
    ...finance,
    pockets: { ...finance.pockets, [pocket]: finance.pockets[pocket] - amount },
    spent: finance.spent + amount,
  };
}

/** Guarda saldos, cancela promessas futuras e transfere dívida a compromisso, exceto no Casual. */
export function closeExpandedFinance(
  finance: ExpandedFinance,
  difficulty: Difficulty,
  deadline: number,
): { finance: ExpandedFinance; commitment?: DebtCommitment } {
  assertOpen(finance);
  assertAmount(deadline);
  let cancelledReceipts = 0;
  for (const receipt of finance.scheduled) {
    cancelledReceipts += receipt.amount;
    assertAmount(cancelledReceipts);
  }
  const commitment =
    finance.debt > 0 && difficulty !== 'casual'
      ? debtCommitment('divida_de_campanha', finance.debt, deadline)
      : undefined;
  return {
    finance: {
      ...finance,
      pockets: { personal: 0, party: 0, donations: 0 },
      debt: 0,
      scheduled: [],
      closure: { remaining: { ...finance.pockets }, cancelledReceipts, debt: finance.debt },
    },
    ...(commitment ? { commitment } : {}),
  };
}

/** Diferença de totais arredondados ao par: converte uma taxa racional sem acumular erro por turno. */
export function apportionedAmount(numerator: number, denominator: number, turn: number): number {
  assertAmount(numerator);
  assertAmount(denominator);
  assertAmount(turn);
  if (denominator === 0 || !Number.isSafeInteger(turn + 1) || !Number.isSafeInteger(numerator * (turn + 1)))
    throw new RangeError('taxa ou turno fora da faixa segura');
  const cumulative = (periods: number): number => {
    const product = numerator * periods;
    const whole = Math.floor(product / denominator);
    const remainder = product % denominator;
    return (
      whole +
      (remainder > denominator - remainder || (remainder === denominator - remainder && whole % 2 === 1) ? 1 : 0)
    );
  };
  return cumulative(turn + 1) - cumulative(turn);
}

export interface ExpandedCostRequest {
  cost: number;
  pocket: FinancePocket;
  allowed: readonly FinancePocket[];
  allowDebt: boolean;
  borrowAll?: boolean;
}

/** Registra gasto pago fora dos bolsos oficiais, ainda sujeito ao teto contratado. */
export function recordExternalSpend(finance: ExpandedFinance, amount: number): ExpandedFinance {
  assertOpen(finance);
  assertAmount(amount);
  if (amount > finance.spendingLimit - finance.spent) throw new RangeError('teto excedido');
  return { ...finance, spent: finance.spent + amount };
}
/** Contrata custos na ordem de envio; a dívida cobre somente a falta e só com autorização explícita. */
export function reserveExpandedCosts(
  initial: ExpandedFinance,
  requests: readonly ExpandedCostRequest[],
): { finance: ExpandedFinance; reasons: (null | 'bolso_invalido' | 'sem_recursos' | 'teto_legal')[] } {
  assertOpen(initial);
  let finance = initial;
  const reasons = requests.map(({ cost, pocket, allowed, allowDebt, borrowAll }) => {
    assertAmount(cost);
    if (!Object.hasOwn(finance.pockets, pocket) || !allowed.includes(pocket)) return 'bolso_invalido' as const;
    if (cost > finance.spendingLimit - finance.spent) return 'teto_legal' as const;
    const available = borrowAll && allowDebt ? 0 : Math.min(cost, finance.pockets[pocket]);
    const missing = cost - available;
    if (missing > 0 && (!allowDebt || missing > finance.debtLimit - finance.debt)) return 'sem_recursos' as const;
    finance = payFromPocket(finance, pocket, available, allowed);
    if (missing > 0) finance = chooseDebt(finance, missing);
    return null;
  });
  return { finance, reasons };
}
