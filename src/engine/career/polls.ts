import { populationShares } from '../regions/regions';
import type { CareerPoll, CareerState, GameContent, GameState, MonthStep, RecognitionBand } from '../types';

import { careerParam } from './calibration';
import { keyedRng } from './draw';
import { aggregateTallies, apportion, tallyUf, type ElectorateParams, type Tally, type TallyMode } from './electorate';
import { ballotOptions, candidateIdentities } from './opponents';

/**
 * Pesquisas persistidas e leituras para a interface (PLANO_CAMPANHA.md Fase C2, tarefa C2.4). A pesquisa é feita
 * na última etapa do turno pré-posse, com sorteio pela chave (semente da campanha, `career`, `poll`, turno): abrir a
 * tela ou retomar o save mostra a mesma, e nada consome o PRNG principal. A atual fica no estado; as anteriores, no
 * relatório de cada turno (sujeitas à retenção).
 */

/** Parâmetros da partição tirados da calibração da carreira. */
export function electorateParams(): ElectorateParams {
  return {
    abstencao: careerParam('abstencao'),
    brancos_nulos: careerParam('brancos_nulos'),
    indecisos_peso: careerParam('indecisos_peso'),
    indecisos_brancos: careerParam('indecisos_brancos'),
  };
}

/**
 * Eleitorado por UF (inteiros que somam `eleitorado_total`), na ordem do cenário. **PROVISORIO:** proporcional à
 * população, como o peso do resultado regional (`electorateWeights` em `elections/regionalResult.ts`).
 */
export function ufElectorates(content: Pick<GameContent, 'scenario'>): number[] {
  const ufs = content.scenario.regions?.ufs ?? [];
  return apportion(careerParam('eleitorado_total'), populationShares(ufs));
}

/** Partição de cada UF e a nacional (soma inteira das UFs) para a carreira atual. */
export function tallyCareer(
  career: CareerState,
  content: Pick<GameContent, 'scenario'>,
  mode: TallyMode,
): { ufs: { id: string; tally: Tally }[]; national: Tally } {
  const ufs = content.scenario.regions?.ufs ?? [];
  const electorates = ufElectorates(content);
  const params = electorateParams();
  const byUf = ufs.map((u, i) => ({
    id: u.id,
    tally: tallyUf(electorates[i], ballotOptions(career, content, u.id), params, mode),
  }));
  const options = career.opponents.length + 1;
  return {
    ufs: byUf,
    national: aggregateTallies(
      byUf.map((u) => u.tally),
      options,
    ),
  };
}

/** Faixa do reconhecimento (I8): [0; baixo], (baixo; médio], (médio; alto], (alto; 1]. */
export function recognitionBand(r: number): RecognitionBand {
  if (r <= careerParam('faixa_baixo')) return 'desconhecido';
  if (r <= careerParam('faixa_medio')) return 'pouco_conhecido';
  if (r <= careerParam('faixa_alto')) return 'conhecido';
  return 'muito_conhecido';
}

/** Chave do sorteio da pesquisa do turno (nunca muda depois de publicada). */
export function pollKey(turnIndex: number): (string | number)[] {
  return ['career', 'poll', turnIndex];
}

/**
 * Pesquisa nacional do turno: a partição "se a eleição fosse hoje" (com indecisos), mais erro de amostra em cada
 * parcela, renormalizada para somar 1; e a faixa do reconhecimento do jogador por UF, com erro próprio.
 */
export function takePoll(
  state: Pick<GameState, 'seed'>,
  career: CareerState,
  content: GameContent,
  month: string,
): CareerPoll {
  const { national } = tallyCareer(career, content, 'pesquisa');
  const turnout = national.electorate - national.abstention;
  const rng = keyedRng(state.seed, pollKey(career.turnIndex));
  const noisy = (x: number) => Math.max(0, x + careerParam('ruido_nacional') * rng.normal());

  const raw = [...national.votes, national.undecided, national.blankNull].map((v) =>
    noisy(turnout > 0 ? v / turnout : 0),
  );
  const sum = raw.reduce((s, x) => s + x, 0);
  const shares = raw.map((x) => (sum > 0 ? x / sum : 0));
  const ids = candidateIdentities(career, content).map((c) => c.id);

  const ufs = content.scenario.regions?.ufs ?? [];
  const recognitionBands: Record<string, RecognitionBand> = {};
  for (const u of ufs) {
    const estimate = Math.min(1, Math.max(0, (career.recognition[u.id] ?? 0) + careerParam('ruido_uf') * rng.normal()));
    recognitionBands[u.id] = recognitionBand(estimate);
  }

  return {
    turnIndex: career.turnIndex,
    month,
    scope: 'nacional',
    margin: careerParam('pesquisa_margem'),
    intentions: ids.map((candidateId, i) => ({ candidateId, share: shares[i] })),
    undecided: shares[ids.length],
    blankNull: shares[ids.length + 1],
    recognitionBands,
  };
}

/**
 * Etapa da pesquisa: a última do turno pré-posse (depois da viabilidade). Não roda no turno da eleição (o resultado
 * substitui a pesquisa, Fase C5) nem na transição. Sem contribuições: a pesquisa é uma leitura, não muda o que mede.
 */
export const pollStep: MonthStep = (state, ctx) => {
  const career = state.career;
  const turn = career
    ? ctx.content.scenario.career?.startPoints[career.startPoint]?.turns[career.turnIndex]
    : undefined;
  if (
    !career ||
    !turn ||
    turn.stage === 'transicao' ||
    turn.stage === 'eleicao' ||
    (ctx.content.scenario.regions?.ufs.length ?? 0) === 0
  ) {
    return { state, contributions: [] };
  }
  const poll = takePoll(state, career, ctx.content, turn.to ?? turn.from);
  return { state: { ...state, career: { ...career, poll } }, contributions: [] };
};

/** Pesquisa atual para a interface, com os nomes dos candidatos; `null` sem carreira ou antes da primeira. */
export function currentPollView(
  state: Pick<GameState, 'career'>,
  content: Pick<GameContent, 'scenario'>,
): (CareerPoll & { names: Record<string, string> }) | null {
  const career = state.career;
  if (!career?.poll) return null;
  const names = Object.fromEntries(candidateIdentities(career, content).map((c) => [c.id, c.name]));
  return { ...career.poll, names };
}
