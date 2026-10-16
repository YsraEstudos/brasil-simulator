import { describe, expect, it } from 'vitest';

import { characterHeading, standingBand, standingText } from './characterView';

describe('relação com o governo', () => {
  it('faixas: boa ≥ 30, ruim ≤ −30, neutra entre elas', () => {
    expect(standingBand(30)).toBe('boa');
    expect(standingBand(29)).toBe('neutra');
    expect(standingBand(0)).toBe('neutra');
    expect(standingBand(-29)).toBe('neutra');
    expect(standingBand(-30)).toBe('ruim');
  });

  it('texto com a palavra da faixa', () => {
    expect(standingText(40)).toBe('Relação: boa');
    expect(standingText(-40)).toBe('Relação: ruim');
    expect(standingText(-10)).toBe('Relação: neutra');
  });

  it('cabeçalho "Nome — papel"', () => {
    expect(characterHeading({ name: 'Teodoro Vilar', role: 'Ministro da Fazenda' })).toBe(
      'Teodoro Vilar — Ministro da Fazenda',
    );
  });
});
