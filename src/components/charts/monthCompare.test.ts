import { describe, expect, it } from 'vitest';

import type { IndicatorPoint } from '@/database/campaignRepository';

import { comparableMonths, compareMonths, stepMonth } from './monthCompare';

const point = (monthIndex: number, approval: number, exchangeRate: number | null): IndicatorPoint => ({
  monthIndex,
  indicators: {
    approval,
    gdpGrowth12m: 0.02,
    inflation12m: 0.04,
    unemployment: 0.07,
    primaryBalance12m: -0.005,
  },
  selic: 0.15,
  grossDebt: 0.78,
  credibility: 0.6,
  exchangeRate,
  riskPremium: 0.02,
});

describe('comparar dois meses (A27)', () => {
  const history = [point(0, 0.5, null), point(3, 0.44, 5.4), point(7, 0.47, 5.65)];

  it('valores lado a lado, diferença B − A e leitura de bom ou ruim', () => {
    const rows = compareMonths(history, 3, 7);
    const approval = rows.find((r) => r.key === 'approval')!;
    expect(approval).toMatchObject({ a: '44%', b: '47%', difference: '+3 p.p.', sentiment: 'positive' });
    const exchange = rows.find((r) => r.key === 'exchangeRate')!;
    expect(exchange).toMatchObject({ a: 'R$ 5,40', b: 'R$ 5,65', difference: '+R$ 0,25', sentiment: 'neutral' });
    const inflation = rows.find((r) => r.key === 'inflation12m')!;
    expect(inflation).toMatchObject({ difference: '±0,0 p.p.', sentiment: 'neutral' });
    expect(approval.accessibilityLabel).toBe('Aprovação: 44% em abr/2027, 47% em ago/2027, diferença +3 p.p.');
  });

  it('mês sem a variável mostra traço, sem inventar diferença', () => {
    const exchange = compareMonths(history, 0, 7).find((r) => r.key === 'exchangeRate')!;
    expect(exchange).toMatchObject({ a: '—', difference: '—', sentiment: 'neutral' });
  });

  it('meses escolhíveis e passo das setas', () => {
    const months = comparableMonths(history);
    expect(months).toEqual([0, 3, 7]);
    expect(stepMonth(months, 3, 1)).toBe(7);
    expect(stepMonth(months, 7, 1)).toBe(7);
    expect(stepMonth(months, 0, -1)).toBe(0);
    expect(stepMonth(months, 5, -1)).toBe(0);
  });
});
