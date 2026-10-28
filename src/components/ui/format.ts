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

/** R$ mil (unidade da campanha) → texto curto: 800 → "R$ 800 mil"; 10000 → "R$ 10 mi". */
export function formatMoneyThousands(thousands: number): string {
  if (!Number.isFinite(thousands)) return '—';
  if (Math.abs(thousands) >= 1000) return formatMoneyMillions(thousands / 1000);
  return `R$ ${formatNumber(thousands, 0)} mil`;
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
