import { describe, expect, it } from 'vitest';

import { createRng, seedRng } from '@/engine/rng';
import { TEST_BILL, TEST_DECREE, TEST_PEC, testContent, testState } from '@/tests/fixtures';
import type { GameState, ScheduledImpulse } from '@/engine/types';
import type { Policy } from '@/types/policy';

import { congressStep, legislativeInstrument, predictVotes, voteStage, votingPlan, type VoteStage } from './congress';

const content = testContent();

function withRelations(state: GameState, relation: number): GameState {
  return {
    ...state,
    congress: { blocs: content.scenario.blocs.map((b) => ({ id: b.id, governmentRelation: relation })) },
  };
}

function totalYes(state: GameState, policy: Policy, stage: VoteStage, seed = 1): number {
  return voteStage(state, policy, stage, content, createRng(seedRng(seed))).yes;
}

describe('votingPlan (POLITICAL_RULES.md §3)', () => {
  it('PEC: quatro etapas, 3/5 em dois turnos em cada Casa (308 / 49)', () => {
    const plan = votingPlan('pec');
    expect(plan.map((s) => [s.house, s.round, s.required])).toEqual([
      ['camara', 1, 308],
      ['camara', 2, 308],
      ['senado', 1, 49],
      ['senado', 2, 49],
    ]);
  });

  it('PL e PLP: maioria absoluta de cada Casa (257 / 41), Câmara antes do Senado', () => {
    expect(votingPlan('projeto_lei').map((s) => [s.house, s.required])).toEqual([
      ['camara', 257],
      ['senado', 41],
    ]);
    expect(votingPlan('projeto_lei_complementar').map((s) => [s.house, s.required])).toEqual([
      ['camara', 257],
      ['senado', 41],
    ]);
  });

  it('decreto não tem instrumento legislativo', () => {
    expect(legislativeInstrument(TEST_DECREE)).toBeNull();
    expect(predictVotes(testState(), TEST_DECREE, content)).toEqual([]);
  });

  it('instrumento sem votação lança RangeError', () => {
    expect(() => votingPlan('decreto_programacao')).toThrow(RangeError);
  });

  it('PL legislativo é o primeiro instrumento legislativo da política', () => {
    expect(legislativeInstrument(TEST_BILL)).toBe('projeto_lei');
  });
});

describe('voteStage', () => {
  it('é determinística com a mesma semente', () => {
    const state = testState();
    const stage = votingPlan('projeto_lei')[0];
    const a = voteStage(state, TEST_BILL, stage, content, createRng(seedRng(7)));
    const b = voteStage(state, TEST_BILL, stage, content, createRng(seedRng(7)));
    expect(a).toEqual(b);
  });

  it('sim + não somam as cadeiras da Casa (513 na Câmara, 81 no Senado)', () => {
    const state = testState();
    const camara = voteStage(state, TEST_BILL, votingPlan('projeto_lei')[0], content, createRng(seedRng(3)));
    const senado = voteStage(state, TEST_BILL, votingPlan('projeto_lei')[1], content, createRng(seedRng(3)));
    expect(camara.yes + camara.no).toBe(513);
    expect(senado.yes + senado.no).toBe(81);
    expect(camara.blocs.every((b, i) => b.yes + b.no === content.scenario.blocs[i].chamberSeats)).toBe(true);
  });

  it('bloco alinhado com boa relação vota quase todo "sim"; bloco hostil e distante vota quase todo "não"', () => {
    // Esquerda: afinidade alta com o PL (área social = interesse), relação 40.
    // Direita: afinidade baixa, relação −30, sem interesse na área.
    const state = testState(42, 'estrategica');
    const stage = votingPlan('projeto_lei')[0];
    const result = voteStage(state, TEST_BILL, stage, content, createRng(seedRng(42)));
    const esquerda = result.blocs.find((b) => b.blocId === 'esquerda');
    const direita = result.blocs.find((b) => b.blocId === 'direita');
    expect(esquerda?.yes).toBeGreaterThan(0.9 * 120);
    expect(direita?.yes).toBeLessThan(0.1 * 143);
  });
});

describe('apoio e previsão', () => {
  it('subir a relação de todos os blocos para 100 aumenta o "sim" previsto', () => {
    const base = testState(42, 'estrategica');
    const stage = votingPlan('projeto_lei')[0];
    const before = totalYes(base, TEST_BILL, stage);
    const after = totalYes(withRelations(base, 100), TEST_BILL, stage);
    expect(after).toBeGreaterThan(before);

    const predBefore = predictVotes(base, TEST_BILL, content)[0].expectedYes;
    const predAfter = predictVotes(withRelations(base, 100), TEST_BILL, content)[0].expectedYes;
    expect(predAfter).toBeGreaterThan(predBefore);
  });

  it('dificuldade casual prevê mais "sim" que estratégica (bônus de Congresso receptivo)', () => {
    const casual = predictVotes(testState(42, 'casual'), TEST_BILL, content);
    const estrategica = predictVotes(testState(42, 'estrategica'), TEST_BILL, content);
    expect(casual[0].expectedYes).toBeGreaterThan(estrategica[0].expectedYes);
  });

  it('expectedYes fica a ±40 da média de 200 votações com sorteio (Câmara)', () => {
    const state = testState(42, 'estrategica');
    const stage = votingPlan('projeto_lei')[0];
    const expected = predictVotes(state, TEST_BILL, content)[0].expectedYes;
    const rng = createRng(seedRng(99));
    let sum = 0;
    const runs = 200;
    for (let i = 0; i < runs; i++) {
      sum += voteStage(state, TEST_BILL, stage, content, rng).yes;
    }
    expect(Math.abs(expected - sum / runs)).toBeLessThanOrEqual(40);
  });

  it('predictVotes devolve as etapas do instrumento com total de cada Casa', () => {
    const preds = predictVotes(testState(), TEST_PEC, content);
    expect(preds).toHaveLength(4);
    expect(preds.map((p) => p.total)).toEqual([513, 513, 81, 81]);
  });
});

describe('congressStep (POLITICAL_RULES.md §6.1)', () => {
  function withImpulse(state: GameState, delta: number): GameState {
    const impulse: ScheduledImpulse = {
      sourceId: 'teste:relacao',
      label: 'Teste',
      target: 'relacao_congresso',
      delta,
      startMonth: state.monthIndex,
      endMonth: state.monthIndex,
    };
    return { ...state, impulses: [...state.impulses, impulse] };
  }

  it('impulso de +10 ativo no mês soma 10 à relação de cada bloco', () => {
    const state = withImpulse(testState(), 10);
    const { state: next } = congressStep(state, ctxOf(state));
    const relations = Object.fromEntries(next.congress.blocs.map((b) => [b.id, b.governmentRelation]));
    expect(relations).toEqual({ esquerda: 50, centro: 20, direita: -20 });
  });

  it('a relação satura em 100', () => {
    const base = withRelations(testState(), 95);
    const state = withImpulse(base, 10);
    const { state: next } = congressStep(state, ctxOf(state));
    expect(next.congress.blocs.every((b) => b.governmentRelation === 100)).toBe(true);
  });

  it('sem estado de blocos, parte da relação do cenário', () => {
    const state = withImpulse({ ...testState(), congress: { blocs: [] } }, 10);
    const { state: next } = congressStep(state, ctxOf(state));
    expect(next.congress.blocs).toHaveLength(content.scenario.blocs.length);
    expect(next.congress.blocs.find((b) => b.id === 'centro')?.governmentRelation).toBe(20);
  });
});

function ctxOf(state: GameState) {
  return {
    rng: createRng(state.rng),
    content,
    decisions: [],
    eventChoices: [],
    draft: { proposalChanges: [], eventsResolved: [], eventsFired: [], notes: [], copom: null },
  };
}
