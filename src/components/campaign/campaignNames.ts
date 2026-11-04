import { CAMPAIGN_NAME_MAX } from '@/store/campaignSetup';

/**
 * Nomes sorteados para a campanha (botão do dado na tela NOVO JOGO). Listas curtas e neutras: nada de partido, pessoa
 * real ou slogan político. Função pura: a aleatoriedade chega por `random`, então os testes usam uma sequência fixa.
 */

/** Primeira palavra do nome. */
export const NAME_PREFIXES: readonly string[] = ['Governo', 'Mandato', 'Gestão', 'Gabinete', 'Projeto'];

/** Complemento depois do prefixo ("Governo da Reconstrução", "Projeto Ponte"). */
export const NAME_COMPLEMENTS: readonly string[] = [
  'da Reconstrução',
  'Horizonte',
  'do Equilíbrio',
  'das Águas',
  'do Cerrado',
  'Ponte',
  'Aurora',
  'do Interior',
  'Alvorada',
  'Travessia',
  'do Litoral',
];

/** Sorteios com nomes ainda livres antes de desistir e numerar um nome repetido. */
const DRAW_ATTEMPTS = 8;

/** Chance de, havendo ano do cenário, o nome levar o ano ("Governo 2027") em vez de um complemento. */
const YEAR_CHANCE = 0.25;

/** Índice sorteado com `random`. Valor fora de [0, 1) ou NaN é contido, para nunca sair da lista. */
function pickIndex(random: () => number, length: number): number {
  const r = random();
  if (!Number.isFinite(r)) return 0;
  const clamped = Math.min(Math.max(r, 0), 1);
  return Math.min(Math.floor(clamped * length), length - 1);
}

function pick(random: () => number, list: readonly string[]): string {
  const item = list[pickIndex(random, list.length)];
  if (item === undefined) throw new Error('Lista de nomes vazia.');
  return item;
}

/** Comparação de nomes: sem espaços nas pontas e sem diferença de maiúsculas. */
function keyOf(name: string): string {
  return name.trim().toLowerCase();
}

function draw(random: () => number, yearLabel: string | undefined): string {
  const prefix = pick(random, NAME_PREFIXES);
  if (yearLabel !== undefined && random() < YEAR_CHANCE) return `${prefix} ${yearLabel}`;
  return `${prefix} ${pick(random, NAME_COMPLEMENTS)}`;
}

/** Ano de um período do cenário ("2027-01" → 2027); outro formato não tem ano. */
export function yearOfPeriod(period: string | undefined): number | undefined {
  const match = period === undefined ? null : /^(\d{4})-\d{2}$/.exec(period);
  return match ? Number(match[1]) : undefined;
}

/**
 * `base` com o menor número ` (n)` (n ≥ 2) que ainda não existe entre `taken`, sem diferença de maiúsculas. A base é
 * cortada para o resultado caber em `CAMPAIGN_NAME_MAX`.
 */
export function numberedName(base: string, taken: readonly string[]): string {
  const used = new Set(taken.map(keyOf));
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const candidate = `${base.slice(0, CAMPAIGN_NAME_MAX - suffix.length).trimEnd()}${suffix}`;
    if (!used.has(keyOf(candidate))) return candidate;
  }
}

/**
 * Sorteia um nome de campanha. Tenta alguns sorteios até achar um que não esteja em `taken`; se todos colidirem,
 * numera o primeiro sorteio ("... (2)", "... (3)"). `year` (ano do cenário) entra às vezes no nome. O resultado nunca
 * passa de `CAMPAIGN_NAME_MAX` caracteres.
 */
export function randomCampaignName(random: () => number, taken: readonly string[], year?: number): string {
  const used = new Set(taken.map(keyOf));
  const yearLabel =
    year !== undefined && Number.isInteger(year) && year >= 1000 && year <= 9999 ? String(year) : undefined;
  const first = draw(random, yearLabel);
  if (!used.has(keyOf(first))) return first;
  for (let attempt = 1; attempt < DRAW_ATTEMPTS; attempt++) {
    const candidate = draw(random, yearLabel);
    if (!used.has(keyOf(candidate))) return candidate;
  }
  return numberedName(first, taken);
}
