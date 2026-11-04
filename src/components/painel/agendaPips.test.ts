import { describe, expect, it } from 'vitest';

import { agendaPips, agendaPipsLabel } from './agendaPips';

describe('agendaPips', () => {
  it('as ações usadas ficam cheias e as livres vazias', () => {
    expect(agendaPips(3, 2)).toBe('●●○');
    expect(agendaPips(3, 0)).toBe('○○○');
    expect(agendaPips(3, 3)).toBe('●●●');
  });

  it('sem ações de agenda não há bolinhas', () => {
    expect(agendaPips(0, 0)).toBe('');
  });

  it('uso fora da faixa é contido: nunca mais cheias que o total, nunca negativo', () => {
    expect(agendaPips(3, 7)).toBe('●●●');
    expect(agendaPips(3, -2)).toBe('○○○');
  });
});

describe('agendaPipsLabel', () => {
  it('diz quantas foram usadas e quantas faltam, no plural certo', () => {
    expect(agendaPipsLabel(3, 2)).toBe('2 de 3 ações de agenda usadas, 1 ação livre');
    expect(agendaPipsLabel(3, 0)).toBe('0 de 3 ações de agenda usadas, 3 ações livres');
    expect(agendaPipsLabel(3, 3)).toBe('3 de 3 ações de agenda usadas, 0 ações livres');
  });
});
