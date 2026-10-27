import { describe, expect, it } from 'vitest';
import { closeCampaignFinance, createCampaignFinance, reserveCampaignCosts } from './finance';

// PLANO_CAMPANHA.md Fase C3: valores inteiros, reservas na ordem e encerramento.
describe('finanças de campanha', () => {
  it('aceita saldo exato, rejeita excesso e não reserva a ação rejeitada', () => {
    const finance = createCampaignFinance(100, 200);
    const result = reserveCampaignCosts(finance, [70, 31, 30]);
    expect(result.reasons).toEqual([null, 'sem_recursos', null]);
    expect(result.finance).toMatchObject({ balance: 0, spent: 100 });
    expect(finance.balance).toBe(100);
  });
  it('aplica o teto ao total contratado na ordem', () => {
    const result = reserveCampaignCosts(createCampaignFinance(300, 100), [60, 41, 40]);
    expect(result.reasons).toEqual([null, 'teto_legal', null]);
    expect(result.finance).toMatchObject({ balance: 200, spent: 100 });
  });
  it('registra a sobra ao encerrar e impede gastos posteriores', () => {
    const reserved = reserveCampaignCosts(createCampaignFinance(100, 200), [25]).finance;
    const closed = closeCampaignFinance(reserved);
    expect(closed).toMatchObject({ balance: 0, spent: 25, closedBalance: 75 });
    expect(() => reserveCampaignCosts(closed, [1])).toThrow();
  });
  it('recusa quantias fracionárias, negativas e inteiros inseguros', () => {
    for (const amount of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN]) {
      expect(() => createCampaignFinance(amount, 100)).toThrow();
      expect(() => reserveCampaignCosts(createCampaignFinance(100, 100), [amount])).toThrow();
    }
  });
});

// PLANO_CAMPANHA.md Fase C3: arredondamento ao par sem deriva acumulada.
describe('conversão proporcional de taxas', () => {
  it('distribui frações em 96 turnos sem perder mais de uma unidade', async () => {
    const { apportionedAmount } = await import('./finance');
    const amounts = Array.from({ length: 96 }, (_, turn) => apportionedAmount(5, 2, turn));
    expect(amounts.slice(0, 4)).toEqual([2, 3, 3, 2]);
    expect(amounts.reduce((sum, value) => sum + value, 0)).toBe(240);
    expect(apportionedAmount(1, 3, 0)).toBe(0);
    expect(apportionedAmount(1, 3, 1)).toBe(1);
    expect(apportionedAmount(1, 3, 2)).toBe(0);
  });
});

// PLANO_CAMPANHA.md Fase C3: índices e somas sempre exatos.
it('recusa índices e totais que não cabem em inteiro seguro', async () => {
  const { apportionedAmount } = await import('./finance');
  expect(() => apportionedAmount(0, 1, Number.MAX_SAFE_INTEGER)).toThrow();
});
