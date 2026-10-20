import { describe, expect, it } from 'vitest';

import { costText, DIFFICULTY, REJECTION_REASON_LABEL } from './labels';

// GAME_DESIGN.md §4.3: o recurso mensal do presidente são as "ações de agenda".
describe('custo em ações de agenda', () => {
  it('singular só para 1 ação', () => {
    expect(costText(0)).toBe('0 ações');
    expect(costText(1)).toBe('1 ação');
    expect(costText(2)).toBe('2 ações');
  });

  it('dificuldades e recusa falam em ações, não em pontos', () => {
    expect(DIFFICULTY.casual.description).toContain('4 ações por mês');
    expect(DIFFICULTY.estrategica.description).toContain('3 ações por mês');
    expect(REJECTION_REASON_LABEL.sem_acoes_de_agenda).toBe('sem ações de agenda suficientes');
  });
});
