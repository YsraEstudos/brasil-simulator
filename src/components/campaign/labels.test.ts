import { describe, expect, it } from 'vitest';

import { careerTurnLabel, costText, DIFFICULTY, REJECTION_REASON_LABEL, shortCareerTurnLabel } from './labels';

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

// PLANO_CAMPANHA.md §2.4: turnos antes da posse têm rótulo do calendário civil; o condensado cobre dois meses.
describe('rótulos dos turnos antes da posse', () => {
  it('turno de um mês e turno condensado', () => {
    expect(careerTurnLabel({ from: '2026-08' })).toBe('Agosto de 2026');
    expect(careerTurnLabel({ from: '2026-11', to: '2026-12' })).toBe('Novembro a dezembro de 2026');
    expect(careerTurnLabel({ from: '2025-12', to: '2026-01' })).toBe('Dezembro de 2025 a janeiro de 2026');
    expect(shortCareerTurnLabel({ from: '2026-08' })).toBe('ago/2026');
    expect(shortCareerTurnLabel({ from: '2026-11', to: '2026-12' })).toBe('nov–dez/2026');
  });

  it('recusa por estágio tem rótulo', () => {
    expect(REJECTION_REASON_LABEL.fora_do_estagio).toContain('etapa da campanha');
  });
});
