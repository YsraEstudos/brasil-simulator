import { campaignMonths, DEFAULT_SCENARIO_ID, SCENARIOS } from '@/content/scenarios';
import type { Difficulty } from '@/engine';
import type { Scenario } from '@/types/scenario';

/**
 * Regras da configuração de uma nova campanha (tela NOVO JOGO): nome, dificuldade, cenário e semente. Funções
 * puras, usadas tanto pela tela (validação ao digitar, resumo) quanto pela store (validação final antes de gravar),
 * para que o que o jogador vê no resumo seja exatamente o que vai para o banco.
 */

/** Tamanho máximo do nome, em unidades UTF-16 (o mesmo que o `maxLength` do campo de texto). */
export const CAMPAIGN_NAME_MAX = 60;

/** Maior semente aceita: o motor converte a semente para inteiro sem sinal de 32 bits (`seedRng`: `seed >>> 0`). */
export const SEED_MAX = 0xffff_ffff;

/** Dificuldades na ordem de exibição (as mesmas do CHECK da tabela `campaigns`). */
export const DIFFICULTIES: readonly Difficulty[] = ['casual', 'estrategica', 'realismo'];

export const DEFAULT_DIFFICULTY: Difficulty = 'estrategica';

/** Chaves das últimas escolhas na tabela `settings`. */
export const LAST_DIFFICULTY_KEY = 'lastDifficulty';
export const LAST_SCENARIO_KEY = 'lastScenarioId';

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

export const NAME_ERRORS = {
  empty: 'Informe um nome para a campanha.',
  tooLong: `O nome pode ter no máximo ${CAMPAIGN_NAME_MAX} caracteres.`,
} as const;

export const SEED_ERRORS = {
  digits: 'A semente deve conter apenas algarismos de 0 a 9, sem sinal, ponto ou espaço no meio.',
  range: 'A semente deve ficar entre 0 e 4.294.967.295.',
} as const;

/** Quebras de linha (inclusive os separadores Unicode U+2028/U+2029) e tabulações, em sequência. */
const LINE_BREAKS = /[\r\n\t\v\f\u2028\u2029]+/;

/** Junta as linhas com um espaço, sem os espaços ao redor de cada quebra: "Governo \n de" vira "Governo de". */
function joinLines(s: string): string {
  const lines = s.split(LINE_BREAKS);
  if (lines.length === 1) return s;
  return lines
    .map((line, i) => (i === 0 ? line : line.trimStart()))
    .map((line, i, all) => (i === all.length - 1 ? line : line.trimEnd()))
    .join(' ');
}

/** Caracteres de controle C0/C1 que não são quebra de linha nem tabulação (ex.: o nulo U+0000): nunca vão ao banco. */
const CONTROL_CHARS = /[\u0000-\u0008\u000e-\u001f\u007f-\u009f]/g;

/**
 * Espaços e caracteres sem desenho (espaço de largura zero, marcas de direção, espaço Braille em branco, preenchimento
 * Hangul…). Um nome feito só deles apareceria vazio na lista de saves, então conta como vazio.
 */
const INVISIBLE = new RegExp(
  '\\u034f|[\\s\\u00ad\\u115f\\u1160\\u17b4\\u17b5\\u180e\\u200b-\\u200f\\u2060-\\u2064\\u2800\\u3164\\ufeff\\uffa0]',
  'g',
);

/** Remove metades soltas de pares substitutos (um corte no meio de um emoji), que não formam caractere válido. */
function dropLoneSurrogates(s: string): string {
  let out = '';
  // A iteração por código Unicode entrega um par válido inteiro (acima de U+FFFF) e cada metade solta sozinha.
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 0xd800 || c > 0xdfff) out += ch;
  }
  return out;
}

/**
 * Nome como será gravado: quebras de linha e tabulações coladas viram um espaço, caracteres de controle e metades
 * soltas de emoji somem, composição Unicode canônica (NFC) e sem espaços nas pontas. Valor que não é texto, ou feito
 * só de caracteres invisíveis, vira vazio.
 */
export function normalizeCampaignName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let s = dropLoneSurrogates(joinLines(raw).replace(CONTROL_CHARS, ''));
  try {
    s = s.normalize('NFC');
  } catch {
    // Sem tabelas Unicode no motor JS: segue sem normalizar a composição.
  }
  s = s.trim();
  return s.replace(INVISIBLE, '').length === 0 ? '' : s;
}

/** Valida o nome já normalizado: obrigatório e com até `CAMPAIGN_NAME_MAX` unidades. Nunca trunca. */
export function validateCampaignName(raw: unknown): Validation<string> {
  const name = normalizeCampaignName(raw);
  if (name.length === 0) return { ok: false, error: NAME_ERRORS.empty };
  if (name.length > CAMPAIGN_NAME_MAX) return { ok: false, error: NAME_ERRORS.tooLong };
  return { ok: true, value: name };
}

/** Semente numérica válida: inteiro seguro entre 0 e `SEED_MAX`. */
export function isValidSeed(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= SEED_MAX;
}

/**
 * Lê a semente digitada. Vazio (ou só espaços) = semente automática (`null`). Só algarismos decimais ASCII:
 * recusa sinal, ponto, vírgula, notação científica, hexadecimal, `NaN`/`Infinity` e texto misturado.
 */
export function parseSeedInput(raw: unknown): Validation<number | null> {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, error: SEED_ERRORS.digits };
  const text = raw.trim();
  if (text.length === 0) return { ok: true, value: null };
  if (!/^\d+$/.test(text)) return { ok: false, error: SEED_ERRORS.digits };
  // Mais de 10 algarismos (sem contar zeros à esquerda) já passa de 4.294.967.295.
  if (text.replace(/^0+(?=\d)/, '').length > 10) return { ok: false, error: SEED_ERRORS.range };
  const value = Number(text);
  if (!isValidSeed(value)) return { ok: false, error: SEED_ERRORS.range };
  return { ok: true, value };
}

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value);
}

/** Cenário embutido no app (busca pela chave própria: `constructor` ou `__proto__` não são cenários). */
export function isKnownScenario(value: unknown): value is string {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SCENARIOS, value);
}

/** Últimas escolhas da tela NOVO JOGO. */
export interface SetupPrefs {
  difficulty: Difficulty;
  scenarioId: string;
}

export const DEFAULT_SETUP_PREFS: SetupPrefs = { difficulty: DEFAULT_DIFFICULTY, scenarioId: DEFAULT_SCENARIO_ID };

/** Preferências lidas do banco (qualquer formato): valor desconhecido ou de tipo errado volta ao padrão. */
export function resolveSetupPrefs(raw: { difficulty?: unknown; scenarioId?: unknown } | null | undefined): SetupPrefs {
  return {
    difficulty: isDifficulty(raw?.difficulty) ? raw.difficulty : DEFAULT_SETUP_PREFS.difficulty,
    scenarioId: isKnownScenario(raw?.scenarioId) ? raw.scenarioId : DEFAULT_SETUP_PREFS.scenarioId,
  };
}

/** Como o cenário aparece na lista: o atual, versões anteriores do Brasil ou o protótipo fictício. */
export type ScenarioKind = 'atual' | 'historico' | 'experimental';

export interface ScenarioOption {
  id: string;
  scenario: Scenario;
  kind: ScenarioKind;
  /** Duração máxima da campanha em meses (eleições ou impeachment podem encerrar antes). */
  months: number;
}

/** Ordena versões semânticas ("0.10.0" depois de "0.9.0"). */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Cenários disponíveis para uma nova campanha, derivados do registro `SCENARIOS`: o atual (`DEFAULT_SCENARIO_ID`)
 * primeiro, depois as versões anteriores da mais nova para a mais antiga e, por último, o protótipo fictício.
 */
export function scenarioOptions(
  registry: Readonly<Record<string, Scenario>> = SCENARIOS,
  defaultId: string = DEFAULT_SCENARIO_ID,
): ScenarioOption[] {
  const kindOf = (id: string): ScenarioKind =>
    id === defaultId ? 'atual' : id.startsWith('prototipo') ? 'experimental' : 'historico';
  const rank: Record<ScenarioKind, number> = { atual: 0, historico: 1, experimental: 2 };
  return Object.keys(registry)
    .map((id) => ({ id, scenario: registry[id], kind: kindOf(id), months: campaignMonths(id) }))
    .sort((a, b) => rank[a.kind] - rank[b.kind] || compareVersions(b.scenario.version, a.scenario.version));
}

export interface CampaignSetupForm {
  name: string;
  difficulty: Difficulty;
  scenarioId: string;
  /** Texto do campo de semente (vazio = automática). */
  seedText: string;
}

export interface NewCampaignInput {
  name: string;
  difficulty: Difficulty;
  scenarioId?: string;
  /** Semente da simulação; ausente = sorteada pela store. */
  seed?: number;
}

export interface SetupErrors {
  name?: string;
  difficulty?: string;
  scenario?: string;
  seed?: string;
}

export type SetupCheck =
  | { ok: true; input: Required<Omit<NewCampaignInput, 'seed'>> & { seed: number | null } }
  | {
      ok: false;
      errors: SetupErrors;
    };

/** Valida a entrada da store (validação final, em tempo de execução, antes de qualquer gravação). */
export function checkNewCampaignInput(input: {
  name?: unknown;
  difficulty?: unknown;
  scenarioId?: unknown;
  seed?: unknown;
}): SetupCheck {
  const name = validateCampaignName(input.name);
  const { difficulty } = input;
  const scenarioId = input.scenarioId ?? DEFAULT_SCENARIO_ID;
  const seed = input.seed ?? null;
  const seedOk = seed === null || isValidSeed(seed);
  if (name.ok && isDifficulty(difficulty) && isKnownScenario(scenarioId) && seedOk) {
    return { ok: true, input: { name: name.value, difficulty, scenarioId, seed } };
  }
  const errors: SetupErrors = {};
  if (!name.ok) errors.name = name.error;
  if (!isDifficulty(difficulty)) errors.difficulty = 'Escolha uma dificuldade válida.';
  if (!isKnownScenario(scenarioId)) errors.scenario = 'Escolha um cenário disponível.';
  if (!seedOk) errors.seed = SEED_ERRORS.range;
  return { ok: false, errors };
}

/** Valida o formulário da tela (o campo de semente ainda é texto). */
export function checkSetupForm(form: CampaignSetupForm): SetupCheck {
  const seed = parseSeedInput(form.seedText);
  const base = checkNewCampaignInput({
    name: form.name,
    difficulty: form.difficulty,
    scenarioId: form.scenarioId,
    seed: seed.ok ? (seed.value ?? undefined) : undefined,
  });
  if (seed.ok) return base;
  return { ok: false, errors: { ...(base.ok ? {} : base.errors), seed: seed.error } };
}
