import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { advanceMonth, DEFAULT_STEPS } from '@/engine/advanceMonth';
import { createInitialState } from '@/engine/state';
import type { GameContent, GameState, NationalElectionVote } from '@/engine/types';

import {
  electionResultStep,
  electorateWeights,
  nationalRounds,
  regionalVoteIntention,
  solveCommonShift,
} from './regionalResult';
import { votingIntentionOf } from './elections';

// PLANO_GLOBO.md §5.3 e §8, teste 8: o resultado simulado por UF fecha com o nacional, sem sorteio novo.

const content = loadContent(DEFAULT_SCENARIO_ID);
const elections = content.scenario.elections!;
const ufs = content.scenario.regions!.ufs;
const TOLERANCE = 1e-9;

/** Aprovações de 27 UFs entre 20% e 62%, determinísticas, e pesos desiguais (SP pesa 44 vezes o AC). */
const BASES = ufs.map((_, i) => 0.2 + (0.42 * ((i * 7) % 27)) / 26);
const WEIGHTS = ufs.map((u) => u.population);

const weightedSum = (shares: readonly number[], weights: readonly number[]) => {
  const total = weights.reduce((s, w) => s + w, 0);
  return shares.reduce((s, x, i) => s + (weights[i] / total) * x, 0);
};

describe('solveCommonShift', () => {
  it('a soma ponderada pelo eleitorado fecha com o nacional, em toda a faixa', () => {
    for (const national of [0.01, 0.05, 0.2, 0.4, 0.5, 0.5137, 0.7, 0.95, 0.99]) {
      const { shares, national: used } = solveCommonShift(BASES, WEIGHTS, national);
      expect(used).toBe(national);
      expect(Math.abs(weightedSum(shares, WEIGHTS) - national), `nacional ${national}`).toBeLessThan(TOLERANCE);
    }
  });

  it('todas as UFs ficam em ]0, 1[ nos extremos', () => {
    for (const national of [0.01, 0.99]) {
      for (const s of solveCommonShift(BASES, WEIGHTS, national).shares) {
        expect(s).toBeGreaterThan(0);
        expect(s).toBeLessThan(1);
      }
    }
  });

  it('votação crua fora de [0, 1] é limitada e ainda fecha', () => {
    const high = solveCommonShift(BASES, WEIGHTS, 1.3);
    expect(high.national).toBeLessThan(1);
    expect(Math.abs(weightedSum(high.shares, WEIGHTS) - high.national)).toBeLessThan(TOLERANCE);
    const low = solveCommonShift(BASES, WEIGHTS, -0.2);
    expect(low.national).toBeGreaterThan(0);
    expect(Math.abs(weightedSum(low.shares, WEIGHTS) - low.national)).toBeLessThan(TOLERANCE);
  });

  it('aprovação 0 ou 1 numa UF não quebra a conta', () => {
    const bases = [...BASES];
    bases[0] = 0;
    bases[1] = 1;
    const { shares } = solveCommonShift(bases, WEIGHTS, 0.45);
    expect(shares.every((s) => Number.isFinite(s) && s > 0 && s < 1)).toBe(true);
    expect(Math.abs(weightedSum(shares, WEIGHTS) - 0.45)).toBeLessThan(TOLERANCE);
  });

  it('monótona: mais voto nacional é mais voto em toda UF, e a ordem das UFs se mantém', () => {
    let previous = solveCommonShift(BASES, WEIGHTS, 0.02);
    for (let national = 0.05; national < 0.99; national += 0.03) {
      const next = solveCommonShift(BASES, WEIGHTS, national);
      expect(next.shift).toBeGreaterThan(previous.shift);
      next.shares.forEach((s, i) => expect(s).toBeGreaterThan(previous.shares[i]));
      previous = next;
    }
    // Quem aprova mais vota mais: a ordem por aprovação é a ordem por voto.
    const { shares } = solveCommonShift(BASES, WEIGHTS, 0.43);
    for (let i = 0; i < BASES.length; i++) {
      for (let j = 0; j < BASES.length; j++) {
        if (BASES[i] > BASES[j]) expect(shares[i]).toBeGreaterThan(shares[j]);
      }
    }
  });

  it('o deslocamento é comum: a diferença de logit entre duas UFs é a da aprovação', () => {
    const logit = (p: number) => Math.log(p / (1 - p));
    const { shares } = solveCommonShift(BASES, WEIGHTS, 0.38);
    expect(logit(shares[3]) - logit(shares[9])).toBeCloseTo(logit(BASES[3]) - logit(BASES[9]), 9);
  });

  it('determinística: a mesma entrada dá exatamente a mesma saída', () => {
    expect(solveCommonShift(BASES, WEIGHTS, 0.41)).toEqual(solveCommonShift(BASES, WEIGHTS, 0.41));
  });

  it('os pesos são normalizados: escalá-los não muda nada', () => {
    const a = solveCommonShift(BASES, WEIGHTS, 0.41);
    const b = solveCommonShift(
      BASES,
      WEIGHTS.map((w) => w / 1000),
      0.41,
    );
    expect(b.shift).toBeCloseTo(a.shift, 12);
  });
});

describe('nationalRounds', () => {
  it('sem 2º turno há uma só votação, a do 1º', () => {
    expect(nationalRounds({ vote1: 0.53, venceu: true })).toEqual([{ round: 1, national: 0.53 }]);
  });

  it('2º turno: governo ÷ (governo + oposição) passa de 0,5 exatamente quando o motor dá vitória', () => {
    const cases: NationalElectionVote[] = [
      { vote1: 0.41, vote2: 0.48, opponent: 0.45, venceu: true },
      { vote1: 0.41, vote2: 0.44, opponent: 0.45, venceu: false },
      { vote1: 0.3, vote2: 0.5, opponent: 0.5, venceu: false },
    ];
    for (const vote of cases) {
      const rounds = nationalRounds(vote);
      expect(rounds.map((r) => r.round)).toEqual([1, 2]);
      expect(rounds[1].national > 0.5).toBe(vote.vote2! > vote.opponent!);
    }
  });
});

/** Joga o pipeline completo até o mês anterior ao da eleição geral. */
function playUntilElection(seed: number, scenario: GameContent = content): GameState {
  let state = createInitialState({ content: scenario, difficulty: 'estrategica', seed });
  while (state.monthIndex < elections.mesEleicaoGeral) {
    state = advanceMonth(state, { decisions: [] }, scenario, DEFAULT_STEPS).state;
  }
  return state;
}

describe('resultado simulado na eleição geral', () => {
  const seeds = [3, 5, 11, 21];
  const runs = seeds.map((seed) => {
    const before = playUntilElection(seed);
    return { seed, before, month: advanceMonth(before, { decisions: [] }, content, DEFAULT_STEPS) };
  });

  it('só o mês da eleição geral tem resultado; os outros meses não ganham o campo', () => {
    const { before, month } = runs[0];
    expect(month.report.electionResult).toBeDefined();
    expect(month.report.electionResult?.monthIndex).toBe(elections.mesEleicaoGeral);
    const earlier = advanceMonth(
      playUntilElection(3),
      { decisions: [] },
      { ...content, scenario: { ...content.scenario, elections: { ...elections, mesEleicaoGeral: 46 } } },
      DEFAULT_STEPS,
    );
    expect('electionResult' in earlier.report).toBe(false);
    expect(before.monthIndex).toBe(elections.mesEleicaoGeral);
  });

  it('fecha com o nacional em todos os turnos, com os pesos do eleitorado (PLANO_GLOBO.md §8, teste 8)', () => {
    for (const { seed, month } of runs) {
      const result = month.report.electionResult!;
      const weightSum = Object.values(result.weights).reduce((s, w) => s + w, 0);
      expect(weightSum, `semente ${seed}`).toBeCloseTo(1, 12);
      expect(result.rounds.length).toBeGreaterThanOrEqual(1);
      for (const round of result.rounds) {
        const sum = ufs.reduce((s, u) => s + result.weights[u.id] * round.ufs[u.id], 0);
        expect(Math.abs(sum - round.national), `semente ${seed}, turno ${round.round}`).toBeLessThan(TOLERANCE);
        expect(Object.keys(round.ufs)).toHaveLength(27);
      }
    }
  });

  it('os turnos e o vencedor são os do motor', () => {
    for (const { month } of runs) {
      const result = month.report.electionResult!;
      const general = month.state.politics!.eleicao_geral!;
      expect(result.governmentWon).toBe(general.venceu);
      expect(result.rounds.map((r) => r.round)).toEqual(general.turno2 ? [1, 2] : [1]);
      const deciding = result.rounds[result.rounds.length - 1];
      expect(deciding.national > 0.5).toBe(general.venceu);
    }
  });

  it('a votação do 1º turno é a sorteada: sem 2º turno o governo passou de 50%', () => {
    for (const { month } of runs) {
      const result = month.report.electionResult!;
      if (result.rounds.length === 1) expect(result.rounds[0].national).toBeGreaterThan(0.5);
      else expect(result.rounds[0].national).toBeLessThanOrEqual(0.5);
    }
  });

  it('a troca de governador vem à parte do voto presidencial e bate com a posse', () => {
    for (const { month } of runs) {
      const result = month.report.electionResult!;
      const nova = content.calibration.governador_nova_relacao;
      for (const id of result.governorChanges) {
        expect(month.state.regions.ufs.find((u) => u.id === id)?.governorRelation).toBe(nova);
      }
      expect(new Set(result.governorChanges).size).toBe(result.governorChanges.length);
    }
    expect(runs.some((r) => r.month.report.electionResult!.governorChanges.length > 0)).toBe(true);
  });

  it('não sorteia: o estado e o PRNG saem idênticos com e sem a etapa do resultado', () => {
    const without = DEFAULT_STEPS.filter((step) => step !== electionResultStep);
    for (const { before, month } of runs) {
      const plain = advanceMonth(before, { decisions: [] }, content, without);
      expect(plain.report.electionResult).toBeUndefined();
      expect(month.state).toEqual(plain.state);
      expect(month.state.rng).toEqual(plain.state.rng);
    }
  });

  it('determinístico: a mesma semente dá o mesmo resultado', () => {
    const again = advanceMonth(playUntilElection(3), { decisions: [] }, content, DEFAULT_STEPS);
    expect(again.report.electionResult).toEqual(runs[0].month.report.electionResult);
  });

  it('partindo da aprovação: a UF que aprova mais vota mais no governo', () => {
    const { month } = runs[0];
    const result = month.report.electionResult!;
    const approvals = new Map(month.state.regions.ufs.map((u) => [u.id, u.approval]));
    const [first] = result.rounds;
    for (const a of ufs) {
      for (const b of ufs) {
        if ((approvals.get(a.id) as number) > (approvals.get(b.id) as number)) {
          expect(first.ufs[a.id]).toBeGreaterThan(first.ufs[b.id]);
        }
      }
    }
  });

  it('sem dados regionais no cenário não há resultado (e nada quebra)', () => {
    const semUfs = loadContent('prototipo_ficticio');
    expect(semUfs.scenario.regions).toBeUndefined();
    const withElections: GameContent = { ...semUfs, scenario: { ...semUfs.scenario, elections } };
    const state = playUntilElection(3, withElections);
    const run = advanceMonth(state, { decisions: [] }, withElections, DEFAULT_STEPS);
    expect(run.report.electionResult).toBeUndefined();
  });
});

describe('regionalVoteIntention (camada "Intenção de voto estimada")', () => {
  it('fecha com a intenção nacional de voto e tem uma estimativa por UF', () => {
    const state = playUntilElection(5);
    const estimate = regionalVoteIntention(state, content)!;
    expect(estimate.national).toBeCloseTo(votingIntentionOf(state, content.calibration), 12);
    expect(Object.keys(estimate.ufs)).toHaveLength(27);
    const weights = electorateWeights(ufs, state);
    const sum = weightedSum(
      ufs.map((u) => estimate.ufs[u.id]),
      weights,
    );
    expect(Math.abs(sum - estimate.national)).toBeLessThan(TOLERANCE);
  });

  it('já existe no mês da posse, antes de o estado eleitoral nascer', () => {
    const state = createInitialState({ content, difficulty: 'estrategica', seed: 1 });
    expect(state.politics).toBeUndefined();
    const estimate = regionalVoteIntention(state, content)!;
    expect(estimate.national).toBeCloseTo(content.calibration.int_base, 12);
  });

  it('é uma leitura pura: não altera o estado', () => {
    const state = playUntilElection(5);
    const copy = structuredClone(state);
    regionalVoteIntention(state, content);
    expect(state).toEqual(copy);
  });

  it('sem eleições no cenário, ou sem UFs, não há estimativa', () => {
    const state = createInitialState({ content, difficulty: 'estrategica', seed: 1 });
    const semEleicao: GameContent = { ...content, scenario: { ...content.scenario, elections: undefined } };
    expect(regionalVoteIntention(state, semEleicao)).toBeNull();
    const semUfs = loadContent('prototipo_ficticio');
    const withElections: GameContent = { ...semUfs, scenario: { ...semUfs.scenario, elections } };
    expect(regionalVoteIntention(state, withElections)).toBeNull();
  });
});

it('o eleitorado estimado acompanha a população por UF e fecha com o resultado nacional', () => {
  const state = createInitialState({ content, difficulty: 'estrategica', seed: 1 });
  const baseline = electorateWeights(ufs, state);
  const changed = structuredClone(state);
  const sp = changed.demography.ufs.find((uf) => uf.id === 'SP')!;
  sp.ages.working *= 2;
  const updated = electorateWeights(ufs, changed);
  expect(updated[ufs.findIndex((uf) => uf.id === 'SP')]).toBeGreaterThan(
    baseline[ufs.findIndex((uf) => uf.id === 'SP')],
  );
  expect(updated.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  const estimate = regionalVoteIntention(changed, content)!;
  const national = ufs.reduce((sum, uf, i) => sum + updated[i] * estimate.ufs[uf.id], 0);
  expect(national).toBeCloseTo(estimate.national, 10);
});
