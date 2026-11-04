import { describe, expect, it } from 'vitest';

import { bandTone, GUIDED_BY_INDICATOR, INDICATOR_GUIDE, indicatorBand, outOfBandAlert } from './indicatorGuide';

describe('indicatorBand: os limites de sempre, na mesma escala do valor', () => {
  it('aprovação: 50% e 35%', () => {
    expect(indicatorBand('approval', 0.5)).toBe('boa');
    expect(indicatorBand('approval', 0.49)).toBe('atencao');
    expect(indicatorBand('approval', 0.35)).toBe('atencao');
    expect(indicatorBand('approval', 0.349)).toBe('ruim');
  });

  it('inflação: meta de 3,0% e teto da banda (4,5%)', () => {
    expect(indicatorBand('inflation12m', 0.03)).toBe('boa');
    expect(indicatorBand('inflation12m', 0.04)).toBe('atencao');
    expect(indicatorBand('inflation12m', 0.046)).toBe('ruim');
  });

  it('desemprego: 6% e 9%', () => {
    expect(indicatorBand('unemployment', 0.06)).toBe('boa');
    expect(indicatorBand('unemployment', 0.09)).toBe('atencao');
    expect(indicatorBand('unemployment', 0.091)).toBe('ruim');
  });

  it('PIB em 12 meses: 1,5%, zero', () => {
    expect(indicatorBand('gdpGrowth12m', 0.015)).toBe('boa');
    expect(indicatorBand('gdpGrowth12m', 0.005)).toBe('atencao');
    expect(indicatorBand('gdpGrowth12m', 0)).toBe('ruim');
    expect(indicatorBand('gdpGrowth12m', -0.01)).toBe('ruim');
  });

  it('capital político: 60 e 35', () => {
    expect(indicatorBand('politicalCapital', 60)).toBe('boa');
    expect(indicatorBand('politicalCapital', 59)).toBe('atencao');
    expect(indicatorBand('politicalCapital', 35)).toBe('atencao');
    expect(indicatorBand('politicalCapital', 34)).toBe('ruim');
  });
});

describe('bandTone e alerta', () => {
  it('cada faixa vira um tom do HUD', () => {
    expect(bandTone('boa')).toBe('positive');
    expect(bandTone('atencao')).toBe('warning');
    expect(bandTone('ruim')).toBe('negative');
  });

  it('o alerta só aparece quando o indicador sai da faixa', () => {
    expect(outOfBandAlert('inflation12m', 0.03)).toBeUndefined();
    expect(outOfBandAlert('inflation12m', 0.04)).toBeUndefined();
    expect(outOfBandAlert('inflation12m', 0.046)).toBe('Inflação acima do teto da meta (4,5%)');
    expect(outOfBandAlert('approval', 0.2)).toBe('Aprovação abaixo de 35%');
  });
});

describe('texto de ajuda', () => {
  it('todo indicador com faixa tem nome, explicação, faixas e seta', () => {
    for (const id of Object.keys(INDICATOR_GUIDE) as (keyof typeof INDICATOR_GUIDE)[]) {
      const guide = INDICATOR_GUIDE[id];
      expect(guide.name).not.toBe('');
      expect(guide.what).not.toBe('');
      expect(guide.bands).toMatch(/Boa:/);
      expect(guide.arrows).toMatch(/seta/);
    }
  });

  it('a gaveta liga os quatro indicadores do motor; o primário fica de fora', () => {
    expect(GUIDED_BY_INDICATOR).toEqual({
      approval: 'approval',
      inflation12m: 'inflation12m',
      unemployment: 'unemployment',
      gdpGrowth12m: 'gdpGrowth12m',
    });
    expect(GUIDED_BY_INDICATOR.primaryBalance12m).toBeUndefined();
  });
});
