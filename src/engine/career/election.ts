import type { CareerTurn } from '../../types/scenario';
import type {
  CareerElectionOutcome,
  CareerElectionResult,
  CareerElectionRound,
  CareerElectionTiebreak,
  CareerState,
  GameContent,
  MonthStep,
} from '../types';

import { careerParam } from './calibration';
import { keyedRng } from './draw';
import { aggregateTallies, tallyUf, validVotes } from './electorate';
import { ballotOptions, candidateIdentities, PLAYER_CANDIDATE_ID } from './opponents';
import { electorateParams, ufElectorates } from './polls';

/**
 * Eleição antes da posse (PLANO_CAMPANHA.md Fase C5, tarefa C5.1; D-C15 = A: os dois turnos no mesmo turno de jogo).
 * Regras (CF art. 77, DATA_SOURCES.md §6):
 * 1. quem tem a maioria absoluta dos válidos no 1º turno vence; se for um adversário, o jogador perde, mesmo em
 *    segundo;
 * 2. senão, os dois mais votados vão ao 2º turno, e vence quem tiver mais válidos;
 * 3. empate na vaga do 2º turno: o mais idoso (§5); a mesma regra vale para o empate exato no 2º turno
 *    (simplificação: a Constituição não trata esse caso). Idades iguais ou ausentes: sorteio por chave;
 * 4. com um adversário só, o 1º turno decide, salvo empate exato (vão os dois ao 2º turno).
 *
 * A apuração usa a partição do eleitorado em modo `eleicao` (Fase C2): votos inteiros por UF, nacional = soma das UFs.
 * O humor do dia (`ruido_eleicao`) multiplica o peso de cada candidato por e^(σ·z), com z sorteado pela chave
 * `['career', 'election', turno, rodada]`. No 2º turno, os votos de quem saiu se redistribuem pelos pesos, com o teto
 * de elegibilidade, sem parâmetro de transferência. Funções puras; o PRNG principal não é tocado.
 */

/** Chave do sorteio do humor do dia em cada rodada (nunca muda depois de publicada). */
export function electionKey(turnIndex: number, round: 1 | 2): (string | number)[] {
  return ['career', 'election', turnIndex, round];
}

/** Chave do sorteio de desempate (idades iguais ou ausentes). */
export function tiebreakKey(turnIndex: number, round: 1 | 2): (string | number)[] {
  return ['career', 'election', turnIndex, round, 'desempate'];
}

/** O turno é o da eleição. */
export function isElectionTurn(turn: Pick<CareerTurn, 'stage'>): boolean {
  return turn.stage === 'eleicao';
}

/** Desfecho ganho pelo jogador. */
export function electedOutcome(outcome: CareerElectionOutcome): boolean {
  return outcome === 'eleito_1t' || outcome === 'eleito_2t';
}

/** Idade de cada candidato da disputa (perfil e adversários do cenário); ausente quando o cenário não a traz. */
function candidateAges(
  career: CareerState,
  content: Pick<GameContent, 'scenario'>,
): Record<string, number | undefined> {
  const spec = content.scenario.career;
  const ages: Record<string, number | undefined> = {
    [PLAYER_CANDIDATE_ID]: spec?.profiles.find((p) => p.id === career.profileId)?.age,
  };
  for (const o of career.opponents) ages[o.blocId] = spec?.opponents.find((x) => x.blocId === o.blocId)?.age;
  return ages;
}

/** Apura uma rodada só com os candidatos de `ids` (índices na ordem das pesquisas). */
export function tallyRound(
  career: CareerState,
  content: Pick<GameContent, 'scenario'>,
  ids: readonly number[],
  swing: readonly number[],
  round: 1 | 2,
): CareerElectionRound {
  const ufs = content.scenario.regions?.ufs ?? [];
  const electorates = ufElectorates(content);
  const params = {
    ...electorateParams(),
    ...(round === 2 ? { abstencao: careerParam('abstencao_2t') } : {}),
  };
  const all = candidateIdentities(career, content).map((c) => c.id);
  const candidates = ids.map((i) => all[i]);
  const ufWinners: Record<string, string> = {};
  const playerShareByUf: Record<string, number> = {};
  const tallies = ufs.map((u, k) => {
    const options = ballotOptions(career, content, u.id);
    const ballot = ids.map((i) => ({ weight: options[i].weight * Math.exp(swing[i]), ceiling: options[i].ceiling }));
    const t = tallyUf(electorates[k], ballot, params, 'eleicao');
    const top = t.votes.reduce((best, v, j) => (v > t.votes[best] ? j : best), 0);
    ufWinners[u.id] = candidates[top];
    const valid = validVotes(t);
    const p = candidates.indexOf(PLAYER_CANDIDATE_ID);
    if (p >= 0) playerShareByUf[u.id] = valid > 0 ? t.votes[p] / valid : 0;
    return t;
  });
  const national = aggregateTallies(tallies, ids.length);
  return {
    candidates,
    votes: national.votes,
    electorate: national.electorate,
    abstention: national.abstention,
    blankNull: national.blankNull,
    ufWinners,
    playerShareByUf,
  };
}

/**
 * Ordena por idade quando todas são conhecidas; caso contrário, sorteia todos os empatados pela chave.
 * Idades iguais também são ordenadas por sorteio. `rule` indica como foi decidida a primeira posição.
 */
export function breakTie(
  tied: readonly string[],
  ages: Record<string, number | undefined>,
  seed: number,
  key: (string | number)[],
): { order: string[]; rule: 'idade' | 'sorteio' } {
  const rng = keyedRng(seed, key);
  const lots = Object.fromEntries([...tied].sort().map((id) => [id, rng.float()]));
  const compareLots = (a: string, b: string) => lots[a] - lots[b] || (a < b ? -1 : a > b ? 1 : 0);
  if (tied.some((id) => ages[id] === undefined)) {
    return { order: [...tied].sort(compareLots), rule: 'sorteio' };
  }
  const age = (id: string) => ages[id] ?? -1;
  const order = [...tied].sort((a, b) => age(b) - age(a) || compareLots(a, b));
  const decidedByAge = ages[order[0]] !== undefined && age(order[0]) > age(order[1]);
  return { order, rule: decidedByAge ? 'idade' : 'sorteio' };
}

/** Os dois que vão ao 2º turno (com o desempate na vaga, se houver), do mais ao menos votado. */
export function finalists(
  round: CareerElectionRound,
  ages: Record<string, number | undefined>,
  seed: number,
  turnIndex: number,
): { ids: string[]; tiebreak?: CareerElectionTiebreak } {
  const sorted = round.candidates
    .map((id, i) => ({ id, votes: round.votes[i] }))
    .sort((a, b) => b.votes - a.votes || round.candidates.indexOf(a.id) - round.candidates.indexOf(b.id));
  const cut = sorted[1].votes;
  const above = sorted.filter((c) => c.votes > cut).map((c) => c.id);
  const tied = sorted.filter((c) => c.votes === cut).map((c) => c.id);
  if (above.length + tied.length <= 2) return { ids: [...above, ...tied] };
  const { order, rule } = breakTie(tied, ages, seed, tiebreakKey(turnIndex, 1));
  const chosen = order.slice(0, 2 - above.length);
  return {
    ids: [...above, ...chosen],
    tiebreak: { round: 1, place: 'segundo_lugar', candidates: tied, rule, winner: chosen[chosen.length - 1] },
  };
}

/** Humor do dia de cada candidato (índice nas pesquisas). */
function daySwing(seed: number, turnIndex: number, round: 1 | 2, count: number): number[] {
  const rng = keyedRng(seed, electionKey(turnIndex, round));
  const sigma = careerParam('ruido_eleicao');
  return Array.from({ length: count }, () => sigma * rng.normal());
}

/** Apura a eleição da carreira atual (1º turno e, se preciso, 2º turno). Função pura. */
export function runElection(
  career: CareerState,
  content: Pick<GameContent, 'scenario'>,
  seed: number,
  month: string,
): CareerElectionResult {
  const ids = candidateIdentities(career, content).map((c) => c.id);
  if (ids.length < 2) throw new RangeError('eleição com menos de dois candidatos (cenário inválido)');
  const ages = candidateAges(career, content);
  const all = ids.map((_, i) => i);
  const first = tallyRound(career, content, all, daySwing(seed, career.turnIndex, 1, ids.length), 1);
  const tiebreaks: CareerElectionTiebreak[] = [];
  const valid = first.votes.reduce((sum, v) => sum + v, 0);
  const majority = first.candidates.find((_, i) => 2 * first.votes[i] > valid);
  if (majority !== undefined) {
    return {
      turnIndex: career.turnIndex,
      month,
      first,
      winner: majority,
      outcome: majority === PLAYER_CANDIDATE_ID ? 'eleito_1t' : 'derrotado_1t',
      tiebreaks,
    };
  }
  const pair = finalists(first, ages, seed, career.turnIndex);
  if (pair.tiebreak) tiebreaks.push(pair.tiebreak);
  const second = tallyRound(
    career,
    content,
    pair.ids.map((id) => ids.indexOf(id)),
    daySwing(seed, career.turnIndex, 2, ids.length),
    2,
  );
  let winner = second.votes[0] >= second.votes[1] ? second.candidates[0] : second.candidates[1];
  if (second.votes[0] === second.votes[1]) {
    const { order, rule } = breakTie(second.candidates, ages, seed, tiebreakKey(career.turnIndex, 2));
    winner = order[0];
    tiebreaks.push({ round: 2, place: 'vencedor', candidates: [...second.candidates], rule, winner });
  }
  const inRunoff = second.candidates.includes(PLAYER_CANDIDATE_ID);
  const outcome: CareerElectionOutcome =
    winner === PLAYER_CANDIDATE_ID ? 'eleito_2t' : inRunoff ? 'derrotado_2t' : 'derrotado_1t';
  return { turnIndex: career.turnIndex, month, first, second, winner, outcome, tiebreaks };
}

/** Nota do relatório com o desfecho (os percentuais ficam no cartão do resultado). */
export const ELECTION_NOTES: Record<CareerElectionOutcome, string> = {
  eleito_1t: 'Eleição: você venceu no 1º turno. O próximo turno é a transição de governo.',
  eleito_2t: 'Eleição: você venceu no 2º turno. O próximo turno é a transição de governo.',
  derrotado_1t: 'Eleição: você não chegou à vitória no 1º turno. A campanha termina aqui.',
  derrotado_2t: 'Eleição: você perdeu no 2º turno. A campanha termina aqui.',
};

/**
 * Etapa da eleição: só no turno de estágio `eleicao`, depois das ações e da viabilidade (vota o eleitorado que a
 * campanha do turno deixou). Grava o resultado no estado e no relatório. Sem contribuições: voto não é indicador.
 */
export const electionStep: MonthStep = (state, ctx) => {
  const career = state.career;
  const turn = career
    ? ctx.content.scenario.career?.startPoints[career.startPoint]?.turns[career.turnIndex]
    : undefined;
  if (!career || !turn || !isElectionTurn(turn) || (ctx.content.scenario.regions?.ufs.length ?? 0) === 0) {
    return { state, contributions: [] };
  }
  const election = runElection(career, ctx.content, state.seed, turn.to ?? turn.from);
  ctx.draft.careerElection = election;
  ctx.draft.notes.push(ELECTION_NOTES[election.outcome]);
  return { state: { ...state, career: { ...career, election } }, contributions: [] };
};
