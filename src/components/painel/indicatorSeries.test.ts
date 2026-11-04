import { describe, expect, it } from 'vitest';

import type { IndicatorPoint } from '@/database/campaignRepository';

import {
  chartRange,
  emptySeriesNote,
  extremesLine,
  inaugurationIndicators,
  periodSlice,
  seriesBand,
  seriesExtremes,
  seriesOf,
  seriesSummary,
  termStartMonth,
} from './indicatorSeries';

const point = (monthIndex: number, approval: number, selic: number | null = 0.1): IndicatorPoint => ({
  monthIndex,
  indicators: {
    approval,
    gdpGrowth12m: 0.02,
    inflation12m: 0.04,
    unemployment: 0.07,
    primaryBalance12m: -0.005,
  },
  selic,
  grossDebt: 0.78,
  credibility: 0.6,
  exchangeRate: 5.4,
  riskPremium: 0.02,
});

describe('série de cada variável', () => {
  it('lê indicadores e variáveis da economia, sem os meses em que o valor falta', () => {
    const history = [point(0, 0.5, null), point(1, 0.52), point(2, 0.48)];
    expect(seriesOf(history, 'approval').map((p) => p.value)).toEqual([0.5, 0.52, 0.48]);
    expect(seriesOf(history, 'selic').map((p) => p.monthIndex)).toEqual([1, 2]);
    expect(seriesOf(history, 'exchangeRate')).toHaveLength(3);
  });
});

describe('período e posse', () => {
  it('posse do mandato em curso, inclusive com a campanha encerrada', () => {
    expect(termStartMonth(0, 96)).toBe(0);
    expect(termStartMonth(47, 96)).toBe(0);
    expect(termStartMonth(48, 96)).toBe(48);
    expect(termStartMonth(96, 96)).toBe(48); // encerrada: o último mandato
    expect(termStartMonth(48, 48)).toBe(0);
  });

  it('recorta 12 meses (13 pontos), o mandato e a campanha', () => {
    const points = Array.from({ length: 60 }, (_, m) => ({ monthIndex: m, value: m }));
    expect(periodSlice(points, '12m', 48)).toHaveLength(13);
    expect(periodSlice(points, '12m', 48)[0].monthIndex).toBe(47);
    expect(periodSlice(points, 'mandato', 48).map((p) => p.monthIndex)[0]).toBe(48);
    expect(periodSlice(points, 'campanha', 48)).toHaveLength(60);
  });

  it('indicadores da posse para as variações "desde a posse"', () => {
    const history = [point(0, 0.55), point(1, 0.5), point(48, 0.4), point(49, 0.45)];
    expect(inaugurationIndicators(history, 2, 96)?.approval).toBe(0.55);
    expect(inaugurationIndicators(history, 49, 96)?.approval).toBe(0.4);
    expect(inaugurationIndicators([point(1, 0.5)], 2, 96)).toBeUndefined();
    expect(inaugurationIndicators(null, 2, 96)).toBeUndefined();
  });
});

describe('máxima, mínima e banda', () => {
  it('empate fica com o mês mais antigo', () => {
    const points = [
      { monthIndex: 0, value: 0.4 },
      { monthIndex: 1, value: 0.6 },
      { monthIndex: 2, value: 0.6 },
      { monthIndex: 3, value: 0.3 },
    ];
    expect(seriesExtremes(points)).toEqual({ max: points[1], min: points[3] });
    expect(seriesExtremes([])).toBeNull();
    expect(extremesLine('approval', seriesExtremes(points)!, 'mandato')).toBe(
      'Máxima no mandato: 60% (fev/2027) · mínima: 30% (abr/2027)',
    );
  });

  it('só a inflação tem banda, e o eixo sempre mostra a banda inteira', () => {
    expect(seriesBand('approval')).toBeNull();
    const band = seriesBand('inflation12m')!;
    expect(band).toMatchObject({ low: 0.015, high: 0.045, center: 0.03, label: 'Meta 3,0% ± 1,5 p.p.' });
    const range = chartRange([0.031, 0.032], band);
    expect(range.min).toBeLessThan(0.015);
    expect(range.max).toBeGreaterThan(0.045);
  });

  it('série constante ainda tem eixo com altura', () => {
    const range = chartRange([5.4, 5.4]);
    expect(range.max).toBeGreaterThan(range.min);
  });
});

describe('textos', () => {
  it('resumo para o leitor de tela', () => {
    const points = [
      { monthIndex: 0, value: 0.04 },
      { monthIndex: 1, value: 0.061 },
      { monthIndex: 2, value: 0.042 },
    ];
    expect(seriesSummary('inflation12m', points, 'campanha')).toBe(
      'Gráfico de Inflação, IPCA em 12 meses, campanha. Agora: 4,2% em mar/2027. ' +
        'Máxima na campanha: 6,1% (fev/2027) · mínima: 4,0% (jan/2027). Meta 3,0% ± 1,5 p.p. 3 meses.',
    );
    expect(seriesSummary('approval', [], '12m')).toBe('Aprovação: sem dados no período.');
  });

  it('explica o gráfico vazio', () => {
    expect(emptySeriesNote('approval', 0)).toMatch(/depois do primeiro mês encerrado/);
    expect(emptySeriesNote('approval', 1)).toMatch(/segundo mês/);
    expect(emptySeriesNote('approval', 2)).toBeNull();
  });
});
