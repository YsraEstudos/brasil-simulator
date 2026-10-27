import { describe, expect, it } from 'vitest';
import {
  createExpandedFinance,
  contributePersonal,
  scheduleReceipt,
  receiveDue,
  chooseDebt,
  payFromPocket,
} from './finance';

// PLANO_CAMPANHA.md Fase C3: três bolsos, repasses futuros e dívida explícita.
const settings = { spendingLimit: 1000, personalAvailable: 200, personalLimit: 100, debtLimit: 150 };
describe('contabilidade expandida da campanha', () => {
  it('limita o aporte pessoal pela liquidez e pelo limite legal, não pelo gasto', () => {
    const start = createExpandedFinance(settings);
    const first = contributePersonal(start, 70);
    expect(first.pockets.personal).toBe(70);
    expect(first.personalAvailable).toBe(130);
    expect(() => contributePersonal(first, 31)).toThrow();
    const last = contributePersonal(first, 30);
    expect(last.personalContributed).toBe(100);
  });
  it('disponibiliza parcelas e doações somente no turno previsto', () => {
    let ledger = scheduleReceipt(createExpandedFinance(settings), { pocket: 'party', amount: 70, turn: 2 });
    ledger = scheduleReceipt(ledger, { pocket: 'donations', amount: 30, turn: 1 });
    expect(receiveDue(ledger, 0).pockets).toEqual({ personal: 0, party: 0, donations: 0 });
    ledger = receiveDue(ledger, 1);
    expect(ledger.pockets).toEqual({ personal: 0, party: 0, donations: 30 });
    ledger = receiveDue(ledger, 2);
    expect(ledger.pockets).toEqual({ personal: 0, party: 70, donations: 30 });
    expect(receiveDue(ledger, 2)).toEqual(ledger);
  });
  it('só cria dívida por escolha e rejeita gastos acima de saldo, bolso ou teto', () => {
    let ledger = contributePersonal(createExpandedFinance(settings), 100);
    expect(() => payFromPocket(ledger, 'personal', 101, ['personal'])).toThrow();
    expect(ledger.debt).toBe(0);
    ledger = chooseDebt(ledger, 150);
    expect(ledger.debt).toBe(150);
    expect(() => chooseDebt(ledger, 1)).toThrow();
    expect(() => payFromPocket(ledger, 'personal', 1, ['party', 'donations'])).toThrow();
    ledger = payFromPocket(ledger, 'personal', 100, ['personal']);
    expect(ledger.pockets).toEqual({ personal: 0, party: 0, donations: 0 });
    expect(ledger.spent).toBe(250);
  });
});

// PLANO_CAMPANHA.md Fase C3: o encerramento conserva sobras e transforma dívida em compromisso.
describe('encerramento da contabilidade expandida', () => {
  it('registra a sobra por bolso e a dívida para cobrança depois da posse', async () => {
    const { closeExpandedFinance } = await import('./finance');
    let ledger = contributePersonal(createExpandedFinance(settings), 50);
    ledger = chooseDebt(ledger, 60);
    ledger = scheduleReceipt(ledger, { pocket: 'party', amount: 100, turn: 7 });
    const result = closeExpandedFinance(ledger, 'estrategica', 6);
    expect(result.finance.pockets).toEqual({ personal: 0, party: 0, donations: 0 });
    expect(result.finance.closure).toMatchObject({
      remaining: { personal: 50, party: 0, donations: 0 },
      cancelledReceipts: 100,
      debt: 60,
    });
    expect(result.commitment).toMatchObject({ remaining: 60, deadline: 6, status: 'pendente' });
    expect(() => contributePersonal(result.finance, 1)).toThrow();
  });
  it('na dificuldade casual a dívida é encerrada sem cobrança futura', async () => {
    const { closeExpandedFinance } = await import('./finance');
    const result = closeExpandedFinance(chooseDebt(createExpandedFinance(settings), 50), 'casual', 6);
    expect(result.finance.closure?.debt).toBe(50);
    expect(result.commitment).toBeUndefined();
  });
});

// PLANO_CAMPANHA.md Fase C3: reserva em ordem sem dívida implícita.
describe('reserva com três bolsos', () => {
  it('só assume dívida se a decisão autorizar e preserva o saldo ao rejeitar', async () => {
    const { reserveExpandedCosts } = await import('./finance');
    const ledger = contributePersonal(createExpandedFinance(settings), 100);
    const requests = [
      { cost: 60, pocket: 'personal' as const, allowed: ['personal' as const], allowDebt: false },
      { cost: 50, pocket: 'personal' as const, allowed: ['personal' as const], allowDebt: false },
      { cost: 70, pocket: 'personal' as const, allowed: ['personal' as const], allowDebt: true },
    ];
    const result = reserveExpandedCosts(ledger, requests);
    expect(result.reasons).toEqual([null, 'sem_recursos', null]);
    expect(result.finance.pockets.personal).toBe(0);
    expect(result.finance.debt).toBe(30);
    expect(result.finance.spent).toBe(130);
    expect(ledger.pockets.personal).toBe(100);
  });
  it('rejeita o bolso errado e o gasto contratado além do teto', async () => {
    const { reserveExpandedCosts } = await import('./finance');
    const ledger = contributePersonal(createExpandedFinance({ ...settings, spendingLimit: 50 }), 100);
    const result = reserveExpandedCosts(ledger, [
      { cost: 1, pocket: 'personal', allowed: ['party'], allowDebt: false },
      { cost: 51, pocket: 'personal', allowed: ['personal'], allowDebt: true },
      { cost: 50, pocket: 'personal', allowed: ['personal'], allowDebt: false },
    ]);
    expect(result.reasons).toEqual(['bolso_invalido', 'teto_legal', null]);
    expect(result.finance.pockets.personal).toBe(50);
    expect(result.finance.debt).toBe(0);
  });
});

// PLANO_CAMPANHA.md Fase C3: dívida é uma escolha, inclusive quando há saldo.
it('permite contratar o gasto integralmente por dívida explicitamente escolhida', async () => {
  const { reserveExpandedCosts } = await import('./finance');
  const ledger = contributePersonal(createExpandedFinance(settings), 100);
  const result = reserveExpandedCosts(ledger, [
    { cost: 80, pocket: 'personal', allowed: ['personal'], allowDebt: true, borrowAll: true },
  ]);
  expect(result.reasons).toEqual([null]);
  expect(result.finance.pockets.personal).toBe(100);
  expect(result.finance.debt).toBe(80);
  expect(result.finance.spent).toBe(80);
});
