import { describe, expect, it } from 'vitest';
import { nextRailSheet, nightKey, quoteForSeed } from './navigationModel';

describe('navegação do painel', () => {
  it('percorre os trilhos e inverte a direção no modo canhoto', () => {
    expect(nextRailSheet(['alertas', 'meta', 'indicadores'], 'meta', 1, false)).toBe('indicadores');
    expect(nextRailSheet(['alertas', 'meta', 'indicadores'], 'meta', 1, true)).toBe('alertas');
    expect(nextRailSheet(['alertas', 'meta'], 'meta', 1, false)).toBe('alertas');
    expect(nextRailSheet(['alertas'], 'menu', 1, false)).toBeNull();
  });
  it('identifica a noite após a meia-noite e somente antes das 6 horas', () => {
    expect(nightKey(new Date(2027, 0, 2, 0, 30))).toBe('2027-1-2');
    expect(nightKey(new Date(2027, 0, 2, 6))).toBeNull();
    expect(nightKey(new Date(2027, 0, 2, 23))).toBeNull();
  });
  it('escolhe uma citação fictícia estável pela semente', () => {
    expect(quoteForSeed(42)).toBe(quoteForSeed(42));
    expect(quoteForSeed(42).length).toBeGreaterThan(10);
    expect(quoteForSeed(-1).length).toBeGreaterThan(10);
  });
});
