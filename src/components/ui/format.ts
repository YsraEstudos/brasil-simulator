/**
 * Formatação de números em pt-BR sem depender do Intl do aparelho (resultado idêntico em Hermes, web e testes).
 * Entradas em fração decimal, como no motor (ECONOMIC_MODEL.md §2).
 */

const MINUS = '−';

/** 1234567.891, 2 → "1.234.567,89" */
export function formatNumber(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '—';
  const fixed = Math.abs(value).toFixed(decimals);
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const body = frac ? `${grouped},${frac}` : grouped;
  return value < 0 && Number(fixed) !== 0 ? `${MINUS}${body}` : body;
}

/** 0.045 → "4,5%" */
export function formatPercent(fraction: number, decimals = 1): string {
  return Number.isFinite(fraction) ? `${formatNumber(fraction * 100, decimals)}%` : '—';
}

/** Variação em porcentagem com sinal: 0.018 → "+1,8%"; zero → "±0,0%" */
export function formatSignedPercent(fraction: number, decimals = 1): string {
  if (!Number.isFinite(fraction)) return '—';
  const rounded = Number((fraction * 100).toFixed(decimals));
  const sign = rounded > 0 ? '+' : rounded < 0 ? '' : '±';
  return `${sign}${formatPercent(fraction, decimals)}`;
}

/** Variação em pontos percentuais com sinal: 0.0012 → "+0,1 p.p." */
export function formatPointsDelta(fractionDelta: number, decimals = 1): string {
  if (!Number.isFinite(fractionDelta)) return '—';
  const rounded = Number((fractionDelta * 100).toFixed(decimals));
  const sign = rounded > 0 ? '+' : rounded < 0 ? '' : '±';
  return `${sign}${formatNumber(rounded, decimals)} p.p.`;
}

/** R$ milhões (unidade do motor) → texto curto: 15000 → "R$ 15,0 bi" */
export function formatMoneyMillions(millions: number): string {
  if (!Number.isFinite(millions)) return '—';
  const abs = Math.abs(millions);
  if (abs >= 1_000_000) return `R$ ${formatNumber(millions / 1_000_000, 2)} tri`;
  if (abs >= 1_000) return `R$ ${formatNumber(millions / 1_000, 1)} bi`;
  return `R$ ${formatNumber(millions, 0)} mi`;
}

/**
 * Unidade de exibição dos valores fiscais (preferência `fiscalUnit`, em `store/preferences.ts`). Só muda o texto:
 * o motor segue em R$ milhões e frações do PIB (ECONOMIC_MODEL.md §2).
 */
export type FiscalDisplayUnit = 'reais' | 'pib';

export interface FiscalFormatOptions {
  /** Casas decimais do modo "% do PIB" (padrão 1). No modo R$ a escala é automática: mi, bi ou tri. */
  decimals?: number;
  /** Sinal `+` em valores positivos. Negativos têm `−` sempre; zero não tem sinal. */
  signed?: boolean;
}

const DEFAULT_SHARE_DECIMALS = 1;

/** PIB utilizável para converter R$ em fração: finito e maior que zero. */
function hasGdp(gdpMillions: number | null | undefined): gdpMillions is number {
  return typeof gdpMillions === 'number' && Number.isFinite(gdpMillions) && gdpMillions > 0;
}

/** Acrescenta o sinal a um texto já formatado com magnitude positiva; zero nunca tem sinal. */
function withSign(negative: boolean, isZero: boolean, body: string, signed: boolean): string {
  if (isZero) return body;
  if (negative) return `${MINUS}${body}`;
  return signed ? `+${body}` : body;
}

/** Fração do PIB → "1,2% do PIB". A fração já está na escala certa, então não precisa do PIB. */
function formatShareOfGdp(share: number, opts: FiscalFormatOptions): string {
  if (!Number.isFinite(share)) return '—';
  const decimals = opts.decimals ?? DEFAULT_SHARE_DECIMALS;
  const body = `${formatNumber(Math.abs(share) * 100, decimals)}% do PIB`;
  const zero = `${formatNumber(0, decimals)}% do PIB`;
  return withSign(share < 0, body === zero, body, opts.signed ?? false);
}

/**
 * Valor fiscal em R$ milhões (unidade do motor) → texto na unidade escolhida.
 * - `reais`: "R$ 123,4 bi" (escala de `formatMoneyMillions`); negativo: "−R$ 1,5 bi".
 * - `pib`: "1,2% do PIB", com `valor / PIB nominal anual`.
 * Com `pib` mas PIB zero, negativo, NaN ou ausente, cai para R$ (não há como converter). Para frações do PIB que
 * o motor já guarda (ex.: `primaryBalance12m`), use `formatFiscalShare`.
 */
export function formatFiscal(
  valueMillions: number,
  annualNominalGdpMillions: number | null | undefined,
  unit: FiscalDisplayUnit,
  opts: FiscalFormatOptions = {},
): string {
  if (!Number.isFinite(valueMillions)) return '—';
  if (unit === 'pib' && hasGdp(annualNominalGdpMillions)) {
    return formatShareOfGdp(valueMillions / annualNominalGdpMillions, opts);
  }
  const body = formatMoneyMillions(Math.abs(valueMillions));
  return withSign(valueMillions < 0, body === formatMoneyMillions(0), body, opts.signed ?? false);
}

/**
 * Fração do PIB (anualizada, ou saldo) que o motor já guarda, como receita primária ou dívida bruta → texto.
 * - `pib`: "1,2% do PIB".
 * - `reais`: converte com o PIB nominal anual ("R$ 156,0 bi"). Sem PIB utilizável não há R$ para mostrar, então
 *   mostra a fração como "% do PIB", o único texto honesto nesse caso.
 */
export function formatFiscalShare(
  fraction: number,
  annualNominalGdpMillions: number | null | undefined,
  unit: FiscalDisplayUnit,
  opts: FiscalFormatOptions = {},
): string {
  if (!Number.isFinite(fraction)) return '—';
  if (unit === 'reais' && hasGdp(annualNominalGdpMillions)) {
    return formatFiscal(fraction * annualNominalGdpMillions, annualNominalGdpMillions, 'reais', opts);
  }
  return formatShareOfGdp(fraction, opts);
}

export type Trend = 'up' | 'down' | 'flat';
export type Sentiment = 'positive' | 'negative' | 'neutral';

/**
 * Tom da variação de um indicador. `goodWhen` diz se subir é bom (aprovação, PIB) ou ruim (inflação,
 * desemprego). Variações abaixo de `epsilon` contam como estáveis.
 */
export function deltaSentiment(
  delta: number,
  goodWhen: 'up' | 'down',
  epsilon = 1e-4,
): { trend: Trend; sentiment: Sentiment } {
  if (!Number.isFinite(delta) || Math.abs(delta) < epsilon) return { trend: 'flat', sentiment: 'neutral' };
  const trend: Trend = delta > 0 ? 'up' : 'down';
  return { trend, sentiment: trend === goodWhen ? 'positive' : 'negative' };
}
