import { describe, expect, it } from 'vitest';

import { pickRandomSetup } from './randomSetup';

const OPTIONS = {
  difficulties: ['casual', 'estrategica', 'realismo'] as const,
  scenarioIds: ['cenario_a', 'cenario_b'] as const,
  profileIds: ['centro', 'esquerda', 'direita'] as const,
};

/** Sequência fixa de valores em [0, 1): deixa cada sorteio previsível. */
function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

describe('pickRandomSetup', () => {
  it('escolhe um item de cada lista pelo valor sorteado', () => {
    const pick = pickRandomSetup(sequence([0, 0.5, 0.99, 0]), OPTIONS);
    expect(pick.difficulty).toBe('casual');
    expect(pick.scenarioId).toBe('cenario_b');
    expect(pick.profileId).toBe('direita');
  });

  it('a semente é um inteiro de 0 a 4.294.967.295', () => {
    const low = pickRandomSetup(sequence([0, 0, 0, 0]), OPTIONS);
    expect(low.seedText).toBe('0');

    const high = pickRandomSetup(sequence([0, 0, 0, 0.9999999999]), OPTIONS);
    expect(Number(high.seedText)).toBeLessThanOrEqual(4294967295);
    expect(Number.isInteger(Number(high.seedText))).toBe(true);
  });

  it('nunca sai da lista mesmo com o valor máximo de [0, 1)', () => {
    const pick = pickRandomSetup(sequence([0.999999, 0.999999, 0.999999, 0.999999]), OPTIONS);
    expect(OPTIONS.difficulties).toContain(pick.difficulty);
    expect(OPTIONS.scenarioIds).toContain(pick.scenarioId);
    expect(OPTIONS.profileIds).toContain(pick.profileId);
  });

  it('lista vazia não sorteia nada', () => {
    expect(() => pickRandomSetup(sequence([0]), { ...OPTIONS, scenarioIds: [] })).toThrow(/cenário/);
  });
});
