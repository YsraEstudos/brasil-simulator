import type { Difficulty } from '@/engine';

import { isValidSeed, startPointsOf, type CampaignSetupForm } from './campaignSetup';

/**
 * Código de desafio (PLANO_SAVES_HISTORICO.md H2, D13): cenário, dificuldade e semente num texto curto para outra
 * pessoa jogar a mesma partida, por exemplo `BR27-EST-48290` (cenário BR27, Estratégica, semente 4829 e dígito
 * verificador 0). O perfil e o ponto de partida ficam de fora (decisão D-H1): o código fala só do ponto de partida
 * sorteado, e o resto o jogador escolhe. Funções puras, sem cenários carregados: as tabelas abaixo são fixas.
 *
 * Dígito verificador: algoritmo de Luhn sobre os algarismos do código, com cada letra do cenário e da dificuldade
 * trocada pelo seu valor em base 36 (dois algarismos). Pega qualquer algarismo da semente digitado errado e a troca
 * de dois algarismos vizinhos (exceto 0↔9); uma letra trocada quase sempre dá um cenário ou dificuldade inexistente.
 */

/**
 * Código de cada cenário embutido. Um código nunca muda de significado: um cenário novo ganha um código novo (o
 * `BR27` continua sendo a v0.8.0 mesmo depois que outra versão virar a padrão). O teste confere que todo cenário do
 * registro tem código.
 */
export const SCENARIO_CODES: Readonly<Record<string, string>> = {
  brasil_2027_01_v080: 'BR27',
  brasil_2027_01_v070: 'BR27V7',
  brasil_2027_01_v060: 'BR27V6',
  brasil_2027_01_v050: 'BR27V5',
  brasil_2027_01: 'BR27V4',
  prototipo_ficticio: 'PROTO',
};

export const DIFFICULTY_CODES: Readonly<Record<Difficulty, string>> = {
  casual: 'CAS',
  estrategica: 'EST',
  realismo: 'REA',
};

export const CHALLENGE_ERRORS = {
  empty: 'Cole ou digite um código de desafio.',
  format: 'Este texto não é um código de desafio. O formato é como BR27-EST-48290.',
  check: 'O código tem um erro de digitação: o dígito verificador não confere. Confira o código e tente de novo.',
  scenario: 'Este código usa um cenário que não existe nesta versão do jogo.',
  difficulty: 'A dificuldade do código não existe (use CAS, EST ou REA).',
  seed: 'A semente do código fica fora do intervalo aceito (0 a 4.294.967.295).',
} as const;

/** O que o código guarda. */
export interface ChallengeSetup {
  scenarioId: string;
  difficulty: Difficulty;
  seed: number;
}

export type ChallengeDecode = { ok: true; setup: ChallengeSetup } | { ok: false; error: string };

const own = <T>(table: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;

/** Algarismos que entram na conta do dígito verificador: letras em base 36 com dois algarismos, números como estão. */
function checkPayload(prefix: string, seedDigits: string): string {
  let out = '';
  for (const ch of prefix) out += parseInt(ch, 36).toString().padStart(2, '0');
  return out + seedDigits;
}

/** Dígito verificador de Luhn para os algarismos `digits`. */
function luhnDigit(digits: string): number {
  let sum = 0;
  // O dígito verificador vai à direita: o último algarismo do conteúdo é dobrado, o anterior não, e assim por diante.
  for (let i = digits.length - 1, double = true; i >= 0; i--, double = !double) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

/** Código da partida; `null` se o cenário não tem código ou a semente é inválida. */
export function encodeChallengeCode(setup: ChallengeSetup): string | null {
  const scenario = own(SCENARIO_CODES, setup.scenarioId);
  const difficulty = own(DIFFICULTY_CODES, setup.difficulty);
  if (!scenario || !difficulty || !isValidSeed(setup.seed)) return null;
  const seed = String(setup.seed);
  return `${scenario}-${difficulty}-${seed}${luhnDigit(checkPayload(scenario + difficulty, seed))}`;
}

/**
 * Lê um código digitado ou colado. Aceita minúsculas, espaços nas pontas e travessões no lugar dos hífens; recusa o
 * resto com uma mensagem para o jogador (formato, dígito verificador, cenário, dificuldade, semente).
 */
export function decodeChallengeCode(raw: unknown): ChallengeDecode {
  if (typeof raw !== 'string' || raw.trim() === '') return { ok: false, error: CHALLENGE_ERRORS.empty };
  const text = raw
    .trim()
    .toUpperCase()
    .replace(/[‐-―−]/g, '-')
    .replace(/\s*-\s*/g, '-');
  const match = /^([A-Z0-9]{1,12})-([A-Z]{3})-(\d{2,12})$/.exec(text);
  if (!match) return { ok: false, error: CHALLENGE_ERRORS.format };
  const [, scenarioCode, difficultyCode, digits] = match;
  const seedDigits = digits.slice(0, -1);
  if (luhnDigit(checkPayload(scenarioCode + difficultyCode, seedDigits)) !== Number(digits.slice(-1))) {
    return { ok: false, error: CHALLENGE_ERRORS.check };
  }
  const scenarioId = Object.keys(SCENARIO_CODES).find((id) => SCENARIO_CODES[id] === scenarioCode);
  if (!scenarioId) return { ok: false, error: CHALLENGE_ERRORS.scenario };
  const difficulty = (Object.keys(DIFFICULTY_CODES) as Difficulty[]).find(
    (d) => DIFFICULTY_CODES[d] === difficultyCode,
  );
  if (!difficulty) return { ok: false, error: CHALLENGE_ERRORS.difficulty };
  const seed = Number(seedDigits);
  if (!isValidSeed(seed)) return { ok: false, error: CHALLENGE_ERRORS.seed };
  return { ok: true, setup: { scenarioId, difficulty, seed } };
}

/**
 * Formulário do Novo Jogo com o código aplicado: cenário, dificuldade e semente trocados; nome e perfil ficam como
 * estavam. O ponto de partida fica se o cenário do código o oferece; senão volta à posse.
 */
export function formWithChallenge(form: CampaignSetupForm, setup: ChallengeSetup): CampaignSetupForm {
  const startPoint =
    form.startPoint && startPointsOf(setup.scenarioId).includes(form.startPoint) ? form.startPoint : 'posse';
  return {
    ...form,
    scenarioId: setup.scenarioId,
    difficulty: setup.difficulty,
    seedText: String(setup.seed),
    startPoint,
  };
}
