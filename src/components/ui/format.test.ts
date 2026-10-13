import { describe, expect, it } from 'vitest';

import { deltaSentiment, formatMoneyMillions, formatNumber, formatPercent, formatPointsDelta } from './format';

describe('formatação pt-BR', () => {
  it('agrupa milhares com ponto e usa vírgula decimal', () => {
    expect(formatNumber(1234567.891, 2)).toBe('1.234.567,89');
    expect(formatNumber(999)).toBe('999');
    expect(formatNumber(-1500.5, 1)).toBe('−1.500,5');
    expect(formatNumber(-0.0001, 2)).toBe('0,00');
    expect(formatNumber(NaN)).toBe('—');
  });

  it('formata frações como porcentagem', () => {
    expect(formatPercent(0.045)).toBe('4,5%');
    expect(formatPercent(-0.005, 2)).toBe('−0,50%');
  });

  it('formata variação em pontos percentuais com sinal', () => {
    expect(formatPointsDelta(0.0012)).toBe('+0,1 p.p.');
    expect(formatPointsDelta(-0.003)).toBe('−0,3 p.p.');
    expect(formatPointsDelta(0.00001)).toBe('±0,0 p.p.');
  });

  it('formata R$ milhões em mi, bi e tri', () => {
    expect(formatMoneyMillions(850)).toBe('R$ 850 mi');
    expect(formatMoneyMillions(15000)).toBe('R$ 15,0 bi');
    expect(formatMoneyMillions(2_428_000)).toBe('R$ 2,43 tri');
  });

  it('decide se a variação é boa ou ruim conforme o indicador', () => {
    expect(deltaSentiment(0.01, 'up')).toEqual({ trend: 'up', sentiment: 'positive' });
    expect(deltaSentiment(0.01, 'down')).toEqual({ trend: 'up', sentiment: 'negative' }); // inflação subindo
    expect(deltaSentiment(-0.002, 'down')).toEqual({ trend: 'down', sentiment: 'positive' }); // desemprego caindo
    expect(deltaSentiment(0.00001, 'up')).toEqual({ trend: 'flat', sentiment: 'neutral' });
  });
});
