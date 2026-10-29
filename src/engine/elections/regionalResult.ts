import type { ScenarioUf } from '../../types/scenario';
import { currentUfs, populationShares, regionsOf, regionsView } from '../regions/regions';
import type {
  ElectionResult,
  ElectionRoundResult,
  GameContent,
  GameState,
  MonthStep,
  NationalElectionVote,
} from '../types';

import { votingIntentionOf } from './elections';

/**
 * Votação por UF (PLANO_GLOBO.md §5.3; POLITICAL_RULES.md §11.4). Duas leituras da MESMA conta:
 *
 * - **Resultado simulado** (`electionResultStep`): no mês da eleição geral, parte da votação nacional que o
 *   `electionsStep` já sorteou (`vote1`/`vote2`). Cada UF começa no logit da sua aprovação e recebe **um mesmo
 *   deslocamento**, achado por bissecção, para que a soma ponderada pelo eleitorado feche com o nacional. Não
 *   consome sorteio algum: a ordem dos sorteios do mês não muda.
 * - **Intenção estimada** (`regionalVoteIntention`): a mesma conta, a partir da intenção nacional de voto do
 *   momento, para o mapa mostrar "se a eleição fosse hoje" — sempre uma estimativa.
 *
 * O logit mantém tudo em ]0, 1[ e a ordem das UFs: quem aprova mais vota mais, e o deslocamento comum é a única
 * diferença entre a aprovação e o voto (o governo "perde" ou "ganha" igual em todo o país, em logit).
 */

/**
 * Guarda numérica (não é coeficiente de jogo): probabilidades são limitadas a [piso, 1 − piso] antes do logit, para
 * a aprovação 0 ou 1 de uma UF e a votação crua do sorteio (que pode sair de [0, 1]) não darem logit infinito.
 */
const PROBABILITY_FLOOR = 1e-6;
/** Teto de segurança das iterações da bissecção; o laço para antes, quando o ponto médio deixa de se mover. */
const MAX_BISECTION_STEPS = 200;

const clampProbability = (p: number): number => Math.min(1 - PROBABILITY_FLOOR, Math.max(PROBABILITY_FLOOR, p));
const logit = (p: number): number => Math.log(p / (1 - p));
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

/**
 * Peso de cada UF na soma que fecha com o nacional (soma 1). **PROVISORIO:** o cenário não traz o eleitorado por
 * UF, então vale a participação na população total simulada no momento da eleição. A aprovação regional continua
 * ponderada pela população inicial; o voto fecha com o nacional usando os pesos atuais. População total não equivale
 * a eleitores aptos, portanto esta aproximação não deve ser apresentada como cadastro eleitoral (DATA_SOURCES.md §4.2).
 */
export function electorateWeights(ufs: readonly ScenarioUf[], state?: Readonly<GameState>): number[] {
  if (!state || !state.demography.ufs.length) return populationShares(ufs);
  const population = new Map(
    state.demography.ufs.map((uf) => [uf.id, uf.ages.young + uf.ages.working + uf.ages.older]),
  );
  const values = ufs.map((uf) => population.get(uf.id) ?? 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  return total > 0 ? values.map((value) => value / total) : populationShares(ufs);
}

export interface CommonShiftSolution {
  /** Deslocamento comum, em logit. */
  shift: number;
  /** Votação por UF (ordem de `bases`), cada uma em ]0, 1[. */
  shares: number[];
  /** Votação nacional usada (a pedida, limitada a ]0, 1[). */
  national: number;
}

/**
 * Acha o deslocamento comum `s` tal que `Σ pesoᵢ · σ(logit(baseᵢ) + s) = nacional`. A soma cresce sempre com `s`
 * (σ é crescente), então a bissecção converge; o intervalo inicial vem da própria conta (com `s` no limite
 * inferior toda UF fica abaixo do nacional, no superior toda UF fica acima), sem número arbitrário. Determinística.
 * `weights` é normalizado para somar 1.
 */
export function solveCommonShift(
  bases: readonly number[],
  weights: readonly number[],
  nationalShare: number,
): CommonShiftSolution {
  const national = clampProbability(nationalShare);
  const total = weights.reduce((s, w) => s + w, 0);
  const w = weights.map((x) => x / total);
  const l = bases.map((b) => logit(clampProbability(b)));
  const target = logit(national);
  const closing = (shift: number): number => l.reduce((s, li, i) => s + w[i] * sigmoid(li + shift), 0) - national;

  let lo = target - Math.max(...l) - 1;
  let hi = target - Math.min(...l) + 1;
  for (let step = 0; step < MAX_BISECTION_STEPS; step++) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break;
    if (closing(mid) < 0) lo = mid;
    else hi = mid;
  }
  const shift = (lo + hi) / 2;
  return { shift, shares: l.map((li) => sigmoid(li + shift)), national };
}

/**
 * Votação nacional de cada turno, como fração dos votos válidos da candidatura do governo. 1º turno: a votação
 * sorteada. 2º turno: o motor compara a votação do governo com a da oposição (`vote2 > opponent`); a fração
 * governo ÷ (governo + oposição) passa de 0,5 exatamente nesse caso, então o vencedor do resultado simulado é o do
 * motor. Valores crus fora de [0, 1] são limitados por `solveCommonShift`.
 */
export function nationalRounds(vote: NationalElectionVote): { round: 1 | 2; national: number }[] {
  const rounds: { round: 1 | 2; national: number }[] = [{ round: 1, national: vote.vote1 }];
  if (vote.vote2 !== undefined && vote.opponent !== undefined) {
    const government = Math.max(0, vote.vote2);
    const total = government + Math.max(0, vote.opponent);
    rounds.push({ round: 2, national: total > 0 ? government / total : 0.5 });
  }
  return rounds;
}

export interface ElectionResultInput {
  monthIndex: number;
  vote: NationalElectionVote;
  /** UFs do cenário e a aprovação do governo em cada uma (mesma ordem). */
  ufs: readonly ScenarioUf[];
  approvals: readonly number[];
  governorChanges: readonly string[];
  weights?: readonly number[];
}

/** Resultado simulado por UF de uma eleição geral: um turno por turno disputado, cada um fechando com o nacional. */
export function buildElectionResult(input: ElectionResultInput): ElectionResult {
  const { ufs, approvals } = input;
  const weights = input.weights ?? electorateWeights(ufs);
  const rounds: ElectionRoundResult[] = nationalRounds(input.vote).map(({ round, national }) => {
    const solved = solveCommonShift(approvals, weights, national);
    return {
      round,
      national: solved.national,
      shift: solved.shift,
      ufs: Object.fromEntries(ufs.map((u, i) => [u.id, solved.shares[i]])),
    };
  });
  return {
    monthIndex: input.monthIndex,
    governmentWon: input.vote.venceu,
    weights: Object.fromEntries(ufs.map((u, i) => [u.id, weights[i]])),
    rounds,
    governorChanges: [...input.governorChanges],
  };
}

/**
 * Etapa do resultado simulado: roda depois da posse dos governadores (precisa da aprovação do mês já distribuída
 * às UFs e da lista de trocas). Só preenche o relatório (`draft.electionResult`); não muda o estado, não gera
 * contribuição e **não sorteia**. Fora do mês da eleição geral, ou sem dados regionais, não faz nada.
 */
export const electionResultStep: MonthStep = (state, ctx) => {
  const vote = ctx.draft.electionVote;
  const ufs = regionsOf(ctx.content);
  if (!vote || ufs.length === 0) return { state, contributions: [] };
  ctx.draft.electionResult = buildElectionResult({
    monthIndex: state.monthIndex,
    vote,
    ufs,
    weights: electorateWeights(ufs, state),
    approvals: currentUfs(state, ctx.content).map((u) => u.approval),
    governorChanges: ctx.draft.governorChanges ?? [],
  });
  return { state, contributions: [] };
};

export interface RegionalVoteIntention {
  /** Intenção nacional de voto no governo (a do cartão Eleições). */
  national: number;
  shift: number;
  /** Votação estimada por UF (sigla → fração). */
  ufs: Record<string, number>;
}

/**
 * Intenção de voto estimada por UF (PLANO_GLOBO.md §5.3, camada 3): a aprovação de cada UF (que já inclui o
 * alinhamento com o perfil) deslocada pelo mesmo termo comum até fechar com a intenção nacional de voto. É uma
 * ESTIMATIVA — a votação real ainda leva o clima do eleitor, o ruído e, no 2º turno, a oposição. `null` sem dados
 * regionais ou sem eleições no cenário.
 */
export function regionalVoteIntention(state: Readonly<GameState>, content: GameContent): RegionalVoteIntention | null {
  const ufs = regionsOf(content);
  if (ufs.length === 0 || !content.scenario.elections) return null;
  const solved = solveCommonShift(
    regionsView(state, content).map((u) => u.approval),
    electorateWeights(ufs, state),
    votingIntentionOf(state, content.calibration),
  );
  return {
    national: solved.national,
    shift: solved.shift,
    ufs: Object.fromEntries(ufs.map((u, i) => [u.id, solved.shares[i]])),
  };
}
