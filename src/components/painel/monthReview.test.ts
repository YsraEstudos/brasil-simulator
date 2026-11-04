import { describe, expect, it } from 'vitest';
import { monthReview, loadingTip } from './monthReview';

describe('revisão antes de encerrar', () => {
  it('lista eventos sem escolha, ações livres e votações previstas', () => {
    expect(
      monthReview({
        events: [
          { id: 'seca', name: 'Seca' },
          { id: 'chuva', name: 'Chuva' },
        ],
        choices: { chuva: 'agir' },
        actionsMax: 3,
        actionsUsed: 1,
        proposals: [
          { name: 'Saúde', voteMonth: 5, status: 'em_tramitacao' },
          { name: 'Outro', voteMonth: 6, status: 'em_tramitacao' },
        ],
        monthIndex: 5,
      }),
    ).toEqual({ events: ['Seca'], actionsLeft: 2, proposals: ['Saúde'] });
  });
  it('não mostra propostas concluídas ou votos sem data e nunca mostra ações negativas', () => {
    expect(
      monthReview({
        events: [],
        choices: {},
        actionsMax: 3,
        actionsUsed: 4,
        proposals: [
          { name: 'A', voteMonth: 5, status: 'concluida' },
          { name: 'B', voteMonth: null, status: 'parada' },
        ],
        monthIndex: 5,
      }),
    ).toEqual({ events: [], actionsLeft: 0, proposals: [] });
  });
  it('a dica é escolhida das instruções e funciona com sementes negativas', () => {
    expect(loadingTip(10)).toBe(loadingTip(10));
    expect(loadingTip(-1).length).toBeGreaterThan(20);
  });
});
