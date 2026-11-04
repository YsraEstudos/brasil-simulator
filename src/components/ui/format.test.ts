import { describe, expect, it } from 'vitest';

import {
  deltaSentiment,
  formatFiscal,
  formatFiscalShare,
  formatMoneyMillions,
  formatNumber,
  formatPercent,
  formatPointsDelta,
  formatSignedPercent,
} from './format';

/** PIB nominal anual de referência: R$ 13 tri (ordem de grandeza do cenário inicial). */
const GDP = 13_000_000;

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

  it('formata variação em porcentagem com sinal', () => {
    expect(formatSignedPercent(0.018)).toBe('+1,8%');
    expect(formatSignedPercent(-0.0234)).toBe('−2,3%');
    expect(formatSignedPercent(0.00001)).toBe('±0,0%');
    expect(formatSignedPercent(NaN)).toBe('—');
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

describe('valores fiscais na unidade escolhida', () => {
  it('em R$, escala mi, bi e tri com vírgula decimal', () => {
    expect(formatFiscal(850, GDP, 'reais')).toBe('R$ 850 mi');
    expect(formatFiscal(123_400, GDP, 'reais')).toBe('R$ 123,4 bi');
    expect(formatFiscal(1_250_000, GDP, 'reais')).toBe('R$ 1,25 tri');
  });

  it('em % do PIB, com a casa decimal pedida (padrão 1)', () => {
    expect(formatFiscal(156_000, GDP, 'pib')).toBe('1,2% do PIB');
    expect(formatFiscal(156_000, GDP, 'pib', { decimals: 2 })).toBe('1,20% do PIB');
  });

  it('negativos têm sinal − antes de R$ e antes do número', () => {
    expect(formatFiscal(-123_400, GDP, 'reais')).toBe('−R$ 123,4 bi');
    expect(formatFiscal(-156_000, GDP, 'pib')).toBe('−1,2% do PIB');
  });

  it('sinal + só quando pedido, e nunca em zero', () => {
    expect(formatFiscal(15_000, GDP, 'reais', { signed: true })).toBe('+R$ 15,0 bi');
    expect(formatFiscal(-15_000, GDP, 'reais', { signed: true })).toBe('−R$ 15,0 bi');
    expect(formatFiscal(0, GDP, 'reais', { signed: true })).toBe('R$ 0 mi');
    expect(formatFiscal(0, GDP, 'pib', { signed: true })).toBe('0,0% do PIB');
  });

  it('zero e valores que arredondam para zero não têm sinal', () => {
    expect(formatFiscal(0, GDP, 'reais')).toBe('R$ 0 mi');
    expect(formatFiscal(-0.2, GDP, 'reais')).toBe('R$ 0 mi');
    expect(formatFiscal(0, GDP, 'pib')).toBe('0,0% do PIB');
    expect(formatFiscal(-0.2, GDP, 'pib')).toBe('0,0% do PIB');
  });

  it('PIB zero, negativo, NaN ou ausente cai para R$ no modo % do PIB', () => {
    expect(formatFiscal(15_000, 0, 'pib')).toBe('R$ 15,0 bi');
    expect(formatFiscal(15_000, -1, 'pib')).toBe('R$ 15,0 bi');
    expect(formatFiscal(15_000, Number.NaN, 'pib')).toBe('R$ 15,0 bi');
    expect(formatFiscal(15_000, undefined, 'pib')).toBe('R$ 15,0 bi');
    expect(formatFiscal(15_000, null, 'pib')).toBe('R$ 15,0 bi');
  });

  it('valor não finito vira travessão', () => {
    expect(formatFiscal(Number.NaN, GDP, 'reais')).toBe('—');
    expect(formatFiscal(Number.POSITIVE_INFINITY, GDP, 'pib')).toBe('—');
  });

  it('frações do PIB do motor: em R$ convertem pelo PIB anual', () => {
    expect(formatFiscalShare(0.012, GDP, 'reais')).toBe('R$ 156,0 bi');
    expect(formatFiscalShare(-0.0005, GDP, 'reais', { signed: true })).toBe('−R$ 6,5 bi');
  });

  it('frações do PIB do motor: em % do PIB não precisam do PIB', () => {
    expect(formatFiscalShare(0.012, GDP, 'pib')).toBe('1,2% do PIB');
    expect(formatFiscalShare(-0.0005, GDP, 'pib', { decimals: 2, signed: true })).toBe('−0,05% do PIB');
    expect(formatFiscalShare(0.78, null, 'pib', { decimals: 0 })).toBe('78% do PIB');
  });

  it('frações do PIB sem PIB utilizável mostram % do PIB, não R$', () => {
    expect(formatFiscalShare(0.78, 0, 'reais', { decimals: 0 })).toBe('78% do PIB');
    expect(formatFiscalShare(0.78, undefined, 'reais', { decimals: 0 })).toBe('78% do PIB');
  });

  it('fração não finita vira travessão', () => {
    expect(formatFiscalShare(Number.NaN, GDP, 'reais')).toBe('—');
    expect(formatFiscalShare(Number.NaN, GDP, 'pib')).toBe('—');
  });
});
