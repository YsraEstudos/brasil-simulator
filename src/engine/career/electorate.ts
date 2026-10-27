/**
 * Contabilidade dos eleitores por UF (PLANO_CAMPANHA.md Fase C2, tarefa C2.2). Cada UF é **uma única partição** do
 * eleitorado: abstenção + brancos/nulos + indecisos (só em pesquisa) + Σ votos = eleitorado, sempre em inteiros. Um
 * eleitor nunca é contado duas vezes, e nenhum candidato passa do seu teto de elegibilidade (quem o conhece e não o
 * rejeita). Funções puras, sem sorteio.
 */

/** Opção na cédula: peso relativo e teto de elegibilidade como fração do comparecimento (0–1). */
export interface BallotOption {
  weight: number;
  ceiling: number;
}

/** Parâmetros da partição (`CAREER_PARAMS`). */
export interface ElectorateParams {
  abstencao: number;
  brancos_nulos: number;
  indecisos_peso: number;
  indecisos_brancos: number;
}

/** `pesquisa`: com a opção "indeciso"; `eleicao`: os indecisos votam (com o teto) ou viram branco/nulo. */
export type TallyMode = 'pesquisa' | 'eleicao';

/** Partição de um eleitorado (UF ou nacional). `votes` na ordem das opções. */
export interface Tally {
  electorate: number;
  abstention: number;
  blankNull: number;
  undecided: number;
  votes: number[];
}

/**
 * Reparte `pool` entre os pesos com teto e redistribuição (enchimento por nível): quem bate no teto fica nele, e o
 * excesso vai aos demais na proporção dos pesos. Devolve a partilha real e o que sobrou quando todos bateram no teto
 * (ou não há peso). Contínua; o arredondamento é feito em `roundWithCaps`.
 */
export function fillWithCaps(
  pool: number,
  weights: readonly number[],
  caps: readonly number[],
): { shares: number[]; leftover: number } {
  const shares = weights.map(() => 0);
  let active = weights.map((w, i) => i).filter((i) => weights[i] > 0 && caps[i] > 0);
  let remaining = pool;
  while (active.length > 0 && remaining > 0) {
    const total = active.reduce((s, i) => s + weights[i], 0);
    const over = active.filter((i) => shares[i] + (remaining * weights[i]) / total >= caps[i]);
    if (over.length === 0) {
      for (const i of active) shares[i] += (remaining * weights[i]) / total;
      remaining = 0;
      break;
    }
    for (const i of over) {
      remaining -= caps[i] - shares[i];
      shares[i] = caps[i];
    }
    active = active.filter((i) => !over.includes(i));
  }
  return { shares, leftover: Math.max(0, remaining) };
}

/**
 * Arredonda a partilha real de um total inteiro pelo método dos maiores restos, sem passar de tetos inteiros. As
 * unidades que nenhuma opção pode receber voltam como sobra (`rest`): Σ resultado + rest = total.
 */
export function roundWithCaps(
  total: number,
  shares: readonly number[],
  caps: readonly number[],
): { values: number[]; rest: number } {
  const values = shares.map((x, i) => Math.min(Math.floor(x), caps[i]));
  const assigned = values.reduce((s, v) => s + v, 0);
  const wanted = Math.min(total, Math.round(shares.reduce((s, x) => s + x, 0)));
  let units = Math.max(0, wanted - assigned);
  const order = shares
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
    .map((o) => o.i);
  for (const i of order) {
    if (units === 0) break;
    if (values[i] < caps[i] && shares[i] > values[i]) {
      values[i] += 1;
      units -= 1;
    }
  }
  return { values, rest: total - values.reduce((s, v) => s + v, 0) };
}

/** Distribui `pool` inteiro entre opções com teto; a sobra (inteira) não foi a ninguém. */
function distribute(pool: number, weights: readonly number[], caps: readonly number[]) {
  const intCaps = caps.map((c) => Math.max(0, Math.floor(c)));
  const { shares } = fillWithCaps(pool, weights, intCaps);
  return roundWithCaps(pool, shares, intCaps);
}

/**
 * Partição do eleitorado de uma UF (passos 1–6 da especificação mínima). Exige `abstencao + brancos_nulos < 1`
 * (D-C16: sem isso não haveria voto válido possível).
 */
export function tallyUf(
  electorate: number,
  options: readonly BallotOption[],
  p: ElectorateParams,
  mode: TallyMode,
): Tally {
  if (!Number.isInteger(electorate) || electorate < 0) throw new RangeError(`eleitorado inválido: ${electorate}`);
  if (p.abstencao + p.brancos_nulos >= 1) {
    throw new RangeError('abstenção + brancos/nulos ≥ 1: nenhum voto válido possível (D-C16)');
  }
  const abstention = Math.round(electorate * p.abstencao);
  const turnout = electorate - abstention;
  let blankNull = Math.round(turnout * p.brancos_nulos);
  const pool = turnout - blankNull;
  const caps = options.map((o) => o.ceiling * turnout);
  const weights = options.map((o) => o.weight);

  // Pesquisa: o indeciso é mais uma opção, sem teto além do próprio comparecimento.
  const first = distribute(pool, [...weights, p.indecisos_peso], [...caps, turnout]);
  const votes = first.values.slice(0, options.length);
  let undecided = first.values[options.length];
  blankNull += first.rest;

  if (mode === 'eleicao') {
    const toBlank = Math.round(undecided * p.indecisos_brancos);
    const room = caps.map((c, i) => Math.max(0, Math.floor(c) - votes[i]));
    const second = distribute(undecided - toBlank, weights, room);
    for (const [i, v] of second.values.entries()) votes[i] += v;
    blankNull += toBlank + second.rest;
    undecided = 0;
  }
  return { electorate, abstention, blankNull, undecided, votes };
}

/** Soma inteira das partições das UFs (o nacional nunca perde voto por arredondamento). */
export function aggregateTallies(tallies: readonly Tally[], options: number): Tally {
  const total: Tally = { electorate: 0, abstention: 0, blankNull: 0, undecided: 0, votes: Array(options).fill(0) };
  for (const t of tallies) {
    total.electorate += t.electorate;
    total.abstention += t.abstention;
    total.blankNull += t.blankNull;
    total.undecided += t.undecided;
    for (const [i, v] of t.votes.entries()) total.votes[i] += v;
  }
  return total;
}

/** Votos válidos (só os dados a candidatos). */
export function validVotes(t: Tally): number {
  return t.votes.reduce((s, v) => s + v, 0);
}

/** Percentuais sobre os válidos (somam 1). Nenhum voto válido é estado inválido (D-C16): erro, nunca divisão por zero. */
export function validShares(t: Tally): number[] {
  const valid = validVotes(t);
  if (valid === 0) throw new RangeError('nenhum voto válido (D-C16)');
  return t.votes.map((v) => v / valid);
}

/** Reparte um total inteiro pelos pesos (maiores restos), sem teto: soma exata. */
export function apportion(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  const shares = weights.map((w) => (total * w) / sum);
  return roundWithCaps(
    total,
    shares,
    shares.map(() => total),
  ).values;
}
