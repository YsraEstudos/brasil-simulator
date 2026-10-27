import { describe, expect, it } from 'vitest';

import { createRng, seedRng } from '../rng';

import { CAREER_PARAMS } from './calibration';
import {
  aggregateTallies,
  apportion,
  fillWithCaps,
  tallyUf,
  validShares,
  validVotes,
  type BallotOption,
  type ElectorateParams,
  type Tally,
} from './electorate';

// PLANO_CAMPANHA.md Fase C2 (tarefa C2.2): contabilidade dos eleitores por UF.

const sumTally = (t: Tally) => t.abstention + t.blankNull + t.undecided + t.votes.reduce((s, v) => s + v, 0);

/** Gerador de casos com o PRNG do projeto (D-C8: geradores próprios, sem dependência nova). */
function* cases(seed: number, n: number) {
  const rng = createRng(seedRng(seed));
  for (let k = 0; k < n; k++) {
    const options: BallotOption[] = Array.from({ length: rng.int(2, 6) }, () => ({
      weight: rng.float() * 2,
      ceiling: rng.chance(0.2) ? rng.float() * 0.1 : rng.float(),
    }));
    const params: ElectorateParams = {
      abstencao: rng.float() * 0.4,
      brancos_nulos: rng.float() * 0.15,
      indecisos_peso: rng.float(),
      indecisos_brancos: rng.float() * 0.6,
    };
    yield { electorate: rng.int(0, 2_000_000), options, params };
  }
}

describe('partição do eleitorado (PLANO_CAMPANHA.md Fase C2)', () => {
  it('exemplo obrigatório: 100 mil eleitores, dois candidatos, 10 mil abstenções e 5 mil brancos/nulos', () => {
    const t = tallyUf(
      100_000,
      [
        { weight: 1, ceiling: 1 },
        { weight: 2, ceiling: 1 },
      ],
      { abstencao: 0.1, brancos_nulos: 1 / 18, indecisos_peso: 0.25, indecisos_brancos: 0 },
      'eleicao',
    );
    expect(t.abstention).toBe(10_000);
    expect(t.electorate - t.abstention).toBe(90_000);
    expect(t.blankNull).toBe(5_000);
    expect(validVotes(t)).toBe(85_000);
    expect(t.undecided).toBe(0);
    expect(validShares(t).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
    expect(sumTally(t)).toBe(100_000);
  });

  it('propriedades: a partição soma o eleitorado e nenhum candidato passa do teto, em pesquisa e na eleição', () => {
    for (const c of cases(11, 400)) {
      for (const mode of ['pesquisa', 'eleicao'] as const) {
        const t = tallyUf(c.electorate, c.options, c.params, mode);
        expect(sumTally(t)).toBe(c.electorate);
        expect([t.abstention, t.blankNull, t.undecided, ...t.votes].every((v) => Number.isInteger(v) && v >= 0)).toBe(
          true,
        );
        const turnout = c.electorate - t.abstention;
        for (const [i, o] of c.options.entries())
          expect(t.votes[i]).toBeLessThanOrEqual(Math.floor(o.ceiling * turnout));
        if (mode === 'eleicao') expect(t.undecided).toBe(0);
      }
    }
  });

  it('nacional = soma das UFs, sem perder voto, e os percentuais sobre válidos somam 100%', () => {
    const ufs = [...cases(12, 27)].map((c) =>
      tallyUf(c.electorate, c.options.slice(0, 2).concat({ weight: 1, ceiling: 1 }), c.params, 'eleicao'),
    );
    const national = aggregateTallies(ufs, 3);
    expect(national.electorate).toBe(ufs.reduce((s, t) => s + t.electorate, 0));
    expect(sumTally(national)).toBe(national.electorate);
    for (let i = 0; i < 3; i++) expect(national.votes[i]).toBe(ufs.reduce((s, t) => s + t.votes[i], 0));
    expect(validShares(national).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
  });

  it('quem bate no teto fica nele; o excesso vai aos demais; com todos no teto, o resto vira branco/nulo', () => {
    const { shares, leftover } = fillWithCaps(100, [3, 1], [50, 100]);
    expect(shares).toEqual([50, 50]);
    expect(leftover).toBe(0);
    const full = fillWithCaps(100, [1, 1], [20, 30]);
    expect(full.shares).toEqual([20, 30]);
    expect(full.leftover).toBe(50);
    const t = tallyUf(
      1_000,
      [
        { weight: 1, ceiling: 0.1 },
        { weight: 1, ceiling: 0.1 },
      ],
      { abstencao: 0, brancos_nulos: 0, indecisos_peso: 0, indecisos_brancos: 0 },
      'eleicao',
    );
    expect(t.votes).toEqual([100, 100]);
    expect(t.blankNull).toBe(800);
  });

  it('nenhum voto válido (D-C16): estado inválido, com erro e sem divisão por zero', () => {
    expect(() =>
      tallyUf(
        100,
        [{ weight: 1, ceiling: 1 }],
        { abstencao: 0.6, brancos_nulos: 0.4, indecisos_peso: 0, indecisos_brancos: 0 },
        'eleicao',
      ),
    ).toThrow(/D-C16/);
    const empty = tallyUf(
      100,
      [{ weight: 1, ceiling: 0 }],
      { abstencao: 0.1, brancos_nulos: 0.1, indecisos_peso: 0, indecisos_brancos: 0 },
      'eleicao',
    );
    expect(validVotes(empty)).toBe(0);
    expect(() => validShares(empty)).toThrow(/D-C16/);
    // A calibração garante a condição até nos extremos das faixas.
    expect(CAREER_PARAMS.abstencao.max + CAREER_PARAMS.brancos_nulos.max).toBeLessThan(1);
  });

  it('monotonicidade: com teto, adversários e arredondamento fixos, mais peso para i não reduz os votos de i', () => {
    const rng = createRng(seedRng(13));
    const params: ElectorateParams = {
      abstencao: 0.2,
      brancos_nulos: 0.05,
      indecisos_peso: 0.3,
      indecisos_brancos: 0.3,
    };
    for (let k = 0; k < 300; k++) {
      const options: BallotOption[] = Array.from({ length: 4 }, () => ({ weight: rng.float(), ceiling: rng.float() }));
      const electorate = rng.int(1_000, 500_000);
      for (const mode of ['pesquisa', 'eleicao'] as const) {
        let last = -1;
        for (const factor of [0.5, 1, 1.5, 2, 4, 8]) {
          const raised = options.map((o, i) => (i === 0 ? { ...o, weight: o.weight * factor } : o));
          const votes = tallyUf(electorate, raised, params, mode).votes[0];
          expect(votes).toBeGreaterThanOrEqual(last);
          last = votes;
        }
      }
    }
  });

  it('repartição inteira pelos maiores restos soma exatamente o total', () => {
    expect(apportion(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(apportion(156_454_011, [0.3, 0.3, 0.4]).reduce((s, v) => s + v, 0)).toBe(156_454_011);
  });
});
