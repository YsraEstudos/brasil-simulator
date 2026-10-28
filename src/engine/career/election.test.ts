import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';

import { advanceMonth } from '../advanceMonth';
import { campaignOutcome } from '../events/outcome';
import { checkInvariants } from '../invariants';
import { createInitialState } from '../state';
import type { CareerElectionRound, CareerState, GameContent, GameState } from '../types';
import { careerDefeated, careerSchedule, inaugurationTurnIndex, INAUGURATION_NOTE } from '.';
import { breakTie, ELECTION_NOTES, finalists, runElection } from './election';
import { PLAYER_CANDIDATE_ID } from './opponents';
import { nationalRecognition } from './viability';

// PLANO_CAMPANHA.md Fase C5 (tarefas C5.1 e C5.3): regras da eleição, desfechos e posse com continuidade.

const content = loadContent(DEFAULT_SCENARIO_ID);
const ufs = content.scenario.regions!.ufs;
const PRE_TURNS = careerSchedule(content, 'corrida').length;
const ELECTION_TURN = careerSchedule(content, 'corrida').findIndex((t) => t.stage === 'eleicao');

const corrida = (seed = 11, c: GameContent = content) =>
  createInitialState({ content: c, difficulty: 'estrategica', seed, startPoint: 'corrida' });

function play(state: GameState, n: number, c: GameContent = content) {
  let s = state;
  const results = [];
  for (let i = 0; i < n; i++) {
    const r = advanceMonth(s, { decisions: [] }, c);
    expect(checkInvariants(s, r.state, r.report, c)).toEqual([]);
    results.push(r);
    s = r.state;
  }
  return { state: s, results };
}

/** Reconhecimento igual em todas as UFs. */
const flat = (r: number) => Object.fromEntries(ufs.map((u) => [u.id, r]));

/** Estado no turno da eleição com a carreira ajustada. */
function atElection(patch: (career: CareerState) => CareerState, seed = 11): GameState {
  const s = play(corrida(seed), ELECTION_TURN).state;
  return { ...s, career: patch(s.career!) };
}

const share = (round: CareerElectionRound, id: string) =>
  round.votes[round.candidates.indexOf(id)] / round.votes.reduce((a, b) => a + b, 0);

describe('regras da eleição (PLANO_CAMPANHA.md Fase C5, C5.1)', () => {
  it('a eleição sai no turno de outubro, no estado e no relatório, com a nota do desfecho e sem pesquisa', () => {
    const { results } = play(corrida(), ELECTION_TURN + 1);
    const r = results[ELECTION_TURN];
    const election = r.state.career!.election!;
    expect(r.report.career!.election).toEqual(election);
    expect(election).toMatchObject({ turnIndex: ELECTION_TURN, month: '2026-10' });
    expect(r.report.notes).toContain(ELECTION_NOTES[election.outcome]);
    expect(r.report.career!.poll).toBeUndefined();
    for (const earlier of results.slice(0, ELECTION_TURN)) expect(earlier.state.career!.election).toBeUndefined();
  });

  it('cada rodada é uma partição inteira do eleitorado, e o nacional soma as UFs', () => {
    const election = play(corrida(), ELECTION_TURN + 1).state.career!.election!;
    for (const round of [election.first, election.second].filter((x) => x !== undefined)) {
      expect(round.abstention + round.blankNull + round.votes.reduce((a, b) => a + b, 0)).toBe(round.electorate);
      expect(Object.keys(round.ufWinners)).toHaveLength(ufs.length);
    }
  });

  it('maioria do jogador no 1º turno: eleito sem 2º turno', () => {
    const s = atElection((c) => ({
      ...c,
      recognition: flat(1),
      valence: 1,
      opponents: c.opponents.map((o) => ({ ...o, recognition: flat(0.05), valence: -0.5 })),
    }));
    const election = runElection(s.career!, content, s.seed, '2026-10');
    expect(election).toMatchObject({ outcome: 'eleito_1t', winner: PLAYER_CANDIDATE_ID });
    expect(election.second).toBeUndefined();
    expect(share(election.first, PLAYER_CANDIDATE_ID)).toBeGreaterThan(0.5);
  });

  it('adversário com maioria no 1º turno e o jogador em segundo: derrota, sem 2º turno', () => {
    const s = atElection((c) => ({
      ...c,
      recognition: flat(0.6),
      valence: 0,
      opponents: c.opponents.map((o, i) =>
        i === 0 ? { ...o, recognition: flat(1), valence: 1 } : { ...o, recognition: flat(0.02), valence: -1 },
      ),
    }));
    const election = runElection(s.career!, content, s.seed, '2026-10');
    const rival = s.career!.opponents[0].blocId;
    expect(election).toMatchObject({ outcome: 'derrotado_1t', winner: rival });
    expect(election.second).toBeUndefined();
    const ranking = [...election.first.candidates].sort((a, b) => share(election.first, b) - share(election.first, a));
    expect(ranking.slice(0, 2)).toEqual([rival, PLAYER_CANDIDATE_ID]);
  });

  it('sem maioria, os dois mais votados vão ao 2º turno; o jogador fora deles perde no 1º turno', () => {
    const s = atElection((c) => ({ ...c, recognition: flat(0.02), valence: -1 }));
    const election = runElection(s.career!, content, s.seed, '2026-10');
    expect(election.outcome).toBe('derrotado_1t');
    expect(election.second!.candidates).toHaveLength(2);
    expect(election.second!.candidates).not.toContain(PLAYER_CANDIDATE_ID);
    const top2 = [...election.first.candidates]
      .sort((a, b) => share(election.first, b) - share(election.first, a))
      .slice(0, 2);
    expect(new Set(election.second!.candidates)).toEqual(new Set(top2));
  });

  it('o resultado depende só do estado da campanha e da chave, não do PRNG principal', () => {
    const s = play(corrida(), ELECTION_TURN).state;
    const a = runElection(s.career!, content, s.seed, '2026-10');
    expect(runElection(s.career!, content, s.seed, '2026-10')).toEqual(a);
    const otherRng: GameState = { ...s, rng: [1, 2, 3, 4] };
    const r1 = advanceMonth(s, { decisions: [] }, content);
    const r2 = advanceMonth(otherRng, { decisions: [] }, content);
    expect(r1.state.career!.election).toEqual(r2.state.career!.election);
  });
});

describe('empates (CF art. 77 §5: o mais idoso)', () => {
  const round = (candidates: string[], votes: number[]): CareerElectionRound => ({
    candidates,
    votes,
    electorate: votes.reduce((a, b) => a + b, 0),
    abstention: 0,
    blankNull: 0,
    ufWinners: {},
    playerShareByUf: {},
  });

  it('empate na vaga do 2º turno: vai o mais idoso', () => {
    const r = round([PLAYER_CANDIDATE_ID, 'a', 'b', 'c'], [100, 50, 50, 10]);
    const pair = finalists(r, { a: 60, b: 70 }, 1, 2);
    expect(pair.ids).toEqual([PLAYER_CANDIDATE_ID, 'b']);
    expect(pair.tiebreak).toMatchObject({ round: 1, place: 'segundo_lugar', rule: 'idade', winner: 'b' });
  });

  it('idades iguais ou ausentes: sorteio pela chave, estável', () => {
    const r = round([PLAYER_CANDIDATE_ID, 'a', 'b'], [100, 50, 50]);
    const pair = finalists(r, { a: 60, b: 60 }, 7, 2);
    expect(pair.tiebreak!.rule).toBe('sorteio');
    expect(finalists(r, { a: 60, b: 60 }, 7, 2)).toEqual(pair);
    expect(finalists(r, {}, 7, 2).tiebreak!.rule).toBe('sorteio');
  });

  it('empate exato com um adversário só: não há maioria, e os dois vão ao 2º turno sem desempate', () => {
    const pair = finalists(round([PLAYER_CANDIDATE_ID, 'a'], [50, 50]), {}, 1, 2);
    expect(pair.ids).toEqual([PLAYER_CANDIDATE_ID, 'a']);
    expect(pair.tiebreak).toBeUndefined();
  });

  it('empate no 2º turno: o mais idoso vence', () => {
    expect(breakTie([PLAYER_CANDIDATE_ID, 'a'], { [PLAYER_CANDIDATE_ID]: 58, a: 66 }, 1, ['k'])).toEqual({
      order: ['a', PLAYER_CANDIDATE_ID],
      rule: 'idade',
    });
  });

  it('idade desconhecida exige sorteio determinístico entre todos os empatados', () => {
    const tied = ['a', 'b'];
    for (let seed = 1; seed <= 40; seed++) {
      const missing = breakTie(tied, { a: 70 }, seed, ['k']);
      const unknown = breakTie(tied, {}, seed, ['k']);
      expect(missing).toEqual(unknown);
      expect(breakTie(['b', 'a'], {}, seed, ['k'])).toEqual(unknown);
      expect(missing.rule).toBe('sorteio');
    }
    const winners = new Set(Array.from({ length: 40 }, (_, i) => breakTie(tied, {}, i + 1, ['k']).order[0]));
    expect(winners.size).toBe(2);
  });

  it('o cenário traz a idade de todos os candidatos (sem desempate por sorteio no conteúdo padrão)', () => {
    const career = content.scenario.career!;
    expect(career.profiles.every((p) => p.age !== undefined)).toBe(true);
    expect(career.opponents.every((o) => o.age !== undefined)).toBe(true);
  });
});

describe('um adversário só (PLANO_CAMPANHA.md Fase C5, regra 4)', () => {
  const solo: GameContent = {
    ...content,
    scenario: {
      ...content.scenario,
      career: { ...content.scenario.career!, opponents: [content.scenario.career!.opponents[0]] },
    },
  };

  it('o 1º turno decide', () => {
    const election = play(corrida(11, solo), ELECTION_TURN + 1, solo).state.career!.election!;
    expect(election.first.candidates).toHaveLength(2);
    expect(election.second).toBeUndefined();
    expect(['eleito_1t', 'derrotado_1t']).toContain(election.outcome);
  });
});

describe('desfechos e posse (PLANO_CAMPANHA.md Fase C5, C5.1 e C5.3)', () => {
  it('derrota encerra a partida: estágio parado na eleição, desfecho durável e nenhum turno seguinte', () => {
    const s = atElection((c) => ({ ...c, recognition: flat(0.02), valence: -1 }));
    const r = advanceMonth(s, { decisions: [] }, content);
    expect(checkInvariants(s, r.state, r.report, content)).toEqual([]);
    expect(r.state.career).toMatchObject({ stage: 'eleicao', turnIndex: ELECTION_TURN + 1 });
    expect(careerDefeated(r.state)).toBe(true);
    expect(campaignOutcome(r.state)).toBe('derrota_campanha');
    expect(r.report.notes).toContain(ELECTION_NOTES.derrotado_1t);
    expect(() => advanceMonth(r.state, { decisions: [] }, content)).toThrow(RangeError);
  });

  it('vitória leva à transição e à posse com o PRNG e a semente da criação, e o feed começa com a posse', () => {
    const start = corrida(23);
    const { state, results } = play(start, PRE_TURNS + 1);
    const posseTurn = results[PRE_TURNS - 1];
    expect(results[ELECTION_TURN].state.career!.election!.outcome).toMatch(/^eleito/);
    expect(posseTurn.report.notes).toContain(INAUGURATION_NOTE);
    expect(posseTurn.state.career!.stage).toBe('governo');
    // Nenhuma etapa antes da posse toca o PRNG principal: a posse continua o da criação.
    expect(posseTurn.state.rng).toEqual(start.rng);
    expect(posseTurn.state.seed).toBe(start.seed);
    expect(inaugurationTurnIndex(posseTurn.state)).toBe(PRE_TURNS);
    expect(posseTurn.state.events.news!.at(-1)).toMatchObject({ sourceId: 'posse', careerPeriod: '2026-12' });
    // O primeiro mês do governo roda e o resultado da eleição continua gravado.
    expect(state.monthIndex).toBe(1);
    expect(state.career!.election).toEqual(results[ELECTION_TURN].state.career!.election);
  });

  it('a posse exige a eleição ganha: o estado de governo com derrota é inválido', () => {
    const { state, results } = play(corrida(), PRE_TURNS);
    const lost = { ...state.career!, election: { ...state.career!.election!, outcome: 'derrotado_2t' as const } };
    const errors = checkInvariants(results.at(-2)!.state, { ...state, career: lost }, results.at(-1)!.report, content);
    expect(errors).toContain('carreira: posse sem eleição ganha');
  });

  it('as causas acumuladas explicam o reconhecimento e a valência ao longo da campanha', () => {
    const start = corrida();
    let s = start;
    for (let i = 0; i < ELECTION_TURN; i++) {
      s = advanceMonth(
        s,
        { decisions: [{ policyId: 'caravana_regional', agendaCost: 0, params: { bolso: 'party', uf: 'BA' } }] },
        content,
      ).state;
    }
    const totals = s.career!.causeTotals!;
    expect(totals.recognition['acao:caravana_regional']).toBeGreaterThan(0);
    const explained = Object.values(totals.recognition).reduce((a, b) => a + b, 0);
    expect(explained).toBeCloseTo(
      nationalRecognition(s.career!.recognition, ufs) - nationalRecognition(start.career!.recognition, ufs),
      9,
    );
    const valence = Object.values(totals.valence).reduce((a, b) => a + b, 0);
    expect(valence).toBeCloseTo(s.career!.valence - start.career!.valence, 9);
  });
});
