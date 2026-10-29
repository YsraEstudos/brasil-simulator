import { describe, expect, it } from 'vitest';

import { skillParam, type GameState } from '@/engine';
import { testState } from '@/tests/fixtures';

import { skillsView, trainingCostText } from './skillsView';

// PLANO_EXPANSAO EX-21: o cartão mostra nível, progresso e o efeito pelo canal da regra, nunca como bônus de indicador.

function withTraining(negociacao: number, federalismo: number): GameState {
  const state = testState();
  return {
    ...state,
    skills: { characters: { presidente: { negociacao, federalismo, ciencia_tecnologia: 0, diplomacia: 0 } } },
  };
}

describe('cartão Habilidades', () => {
  it('sem treino: nível 0, quanto falta e o efeito do próximo nível', () => {
    const [negociacao, federalismo] = skillsView(testState());
    expect(negociacao.level).toBe('Nível 0 de 3');
    expect(negociacao.progress).toBe(`0 meses de treino · faltam ${skillParam('treino_nivel_1')} para o nível 1`);
    expect(negociacao.effect).toContain('capital político cheio');
    expect(negociacao.next).toContain('menos capital político');
    expect(federalismo.next).toContain('chance de cada governador aderir');
    expect(negociacao.trainable).toBe(true);
  });

  it('no nível máximo não oferece treino nem próximo nível', () => {
    const top = skillParam('treino_nivel_3');
    const [negociacao] = skillsView(withTraining(top, 0));
    expect(negociacao.level).toBe('Nível 3 de 3');
    expect(negociacao.progress).toContain('nível máximo');
    expect(negociacao.next).toBeNull();
    expect(negociacao.trainable).toBe(false);
  });

  it('nenhum texto promete PIB, aprovação ou voto', () => {
    const texts = skillsView(withTraining(5, 9)).flatMap((v) => [v.effect, v.next ?? '']);
    for (const text of [...texts, trainingCostText()]) expect(text).not.toMatch(/PIB|aprovação|voto/i);
  });
});
