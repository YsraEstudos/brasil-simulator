import { shortMonthLabel } from '@/components/campaign/labels';
import { formatNumber, formatPercent } from '@/components/ui/format';
import { TERM_MONTHS, type IndicatorKey, type Indicators } from '@/engine';
import type { IndicatorPoint } from '@/database/campaignRepository';

import { INFLATION_BAND, INFLATION_TARGET } from './indicatorGuide';

/**
 * Séries históricas dos indicadores (PLANO_SAVES_HISTORICO.md, Fase H4): o que cada gráfico desenha, o recorte do
 * período, a máxima e a mínima, a banda da meta de inflação e o ponto da posse para as variações "desde a posse".
 * Puro: recebe a `indicator_history` já lida do banco.
 */

/** Séries com gráfico: os cinco indicadores do Painel e três variáveis da aba Economia. */
export type SeriesKey = IndicatorKey | 'selic' | 'grossDebt' | 'exchangeRate';

export interface SeriesMeta {
  label: string;
  /** Subir é bom ou ruim (cor da linha); `null` quando não há leitura de bom ou ruim (Selic, câmbio). */
  goodWhen: 'up' | 'down' | null;
  format: (value: number) => string;
  /** Unidade escrita na legenda do eixo. */
  unit: string;
}

const pct = (decimals: number) => (v: number) => formatPercent(v, decimals);

export const SERIES_META: Readonly<Record<SeriesKey, SeriesMeta>> = {
  approval: { label: 'Aprovação', goodWhen: 'up', format: pct(0), unit: '% da população' },
  inflation12m: { label: 'Inflação', goodWhen: 'down', format: pct(1), unit: 'IPCA em 12 meses' },
  unemployment: { label: 'Desemprego', goodWhen: 'down', format: pct(1), unit: '% da força de trabalho' },
  gdpGrowth12m: { label: 'PIB', goodWhen: 'up', format: pct(1), unit: 'crescimento em 12 meses' },
  primaryBalance12m: { label: 'Primário', goodWhen: 'up', format: pct(2), unit: '% do PIB em 12 meses' },
  selic: { label: 'Selic', goodWhen: null, format: pct(2), unit: 'meta ao ano' },
  grossDebt: { label: 'Dívida bruta', goodWhen: 'down', format: pct(1), unit: '% do PIB' },
  exchangeRate: { label: 'Câmbio', goodWhen: null, format: (v) => `R$ ${formatNumber(v, 2)}`, unit: 'R$ por US$' },
};

export const PAINEL_SERIES: readonly SeriesKey[] = [
  'approval',
  'inflation12m',
  'unemployment',
  'gdpGrowth12m',
  'primaryBalance12m',
];

export const ECONOMY_SERIES: readonly SeriesKey[] = ['selic', 'grossDebt', 'exchangeRate'];

export interface SeriesPoint {
  monthIndex: number;
  value: number;
}

/** A série de uma variável. Meses sem o valor (saves antigos sem bloco econômico) ficam de fora, sem inventar. */
export function seriesOf(history: readonly IndicatorPoint[], key: SeriesKey): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (const point of history) {
    const value = key === 'selic' || key === 'grossDebt' || key === 'exchangeRate' ? point[key] : point.indicators[key];
    if (value !== null && Number.isFinite(value)) out.push({ monthIndex: point.monthIndex, value });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Período e posse
// ---------------------------------------------------------------------------------------------------------------

export type SeriesPeriod = '12m' | 'mandato' | 'campanha';

export const SERIES_PERIODS: readonly SeriesPeriod[] = ['12m', 'mandato', 'campanha'];

export const SERIES_PERIOD_LABEL: Record<SeriesPeriod, string> = {
  '12m': '12 meses',
  mandato: 'Mandato',
  campanha: 'Campanha',
};

/**
 * Mês da posse do mandato em curso. `monthIndex` é o mês a jogar; com a campanha encerrada ele passa do último
 * mês (`totalMonths`), e o mandato é o último.
 */
export function termStartMonth(monthIndex: number, totalMonths: number): number {
  const shown = Math.max(0, Math.min(monthIndex, totalMonths - 1));
  return Math.floor(shown / TERM_MONTHS) * TERM_MONTHS;
}

/** Recorte do período: 12 meses = os 13 últimos pontos (doze variações); mandato = desde a posse em curso. */
export function periodSlice(points: readonly SeriesPoint[], period: SeriesPeriod, termStart: number): SeriesPoint[] {
  if (period === 'campanha') return [...points];
  if (period === 'mandato') return points.filter((p) => p.monthIndex >= termStart);
  return points.slice(-13);
}

/** Indicadores do mês da posse em curso, para as variações "desde a posse" (B21); ausente se o ponto não existe. */
export function inaugurationIndicators(
  history: readonly IndicatorPoint[] | null,
  monthIndex: number,
  totalMonths: number,
): Indicators | undefined {
  const start = termStartMonth(monthIndex, totalMonths);
  return history?.find((p) => p.monthIndex === start)?.indicators;
}

export type DeltaBasis = 'mes' | 'posse';

export const DELTA_BASIS_LABEL: Record<DeltaBasis, string> = { mes: 'No mês', posse: 'Desde a posse' };

// ---------------------------------------------------------------------------------------------------------------
// Máxima, mínima e banda
// ---------------------------------------------------------------------------------------------------------------

export interface SeriesExtremes {
  max: SeriesPoint;
  min: SeriesPoint;
}

/** Máxima e mínima do recorte (D47). Empate: o mês mais antigo, a primeira vez que o valor foi atingido. */
export function seriesExtremes(points: readonly SeriesPoint[]): SeriesExtremes | null {
  if (points.length === 0) return null;
  let max = points[0];
  let min = points[0];
  for (const p of points) {
    if (p.value > max.value) max = p;
    if (p.value < min.value) min = p;
  }
  return { max, min };
}

export interface SeriesBand {
  low: number;
  high: number;
  center: number;
  label: string;
}

/** Banda da meta de inflação (A62): a mesma meta e tolerância das faixas do Painel (`indicatorGuide`). */
export function seriesBand(key: SeriesKey): SeriesBand | null {
  if (key !== 'inflation12m') return null;
  return {
    low: INFLATION_TARGET - INFLATION_BAND,
    high: INFLATION_TARGET + INFLATION_BAND,
    center: INFLATION_TARGET,
    label: `Meta ${formatPercent(INFLATION_TARGET, 1)} ± ${formatNumber(INFLATION_BAND * 100, 1)} p.p.`,
  };
}

/** Limites do eixo: a série com folga de 15% e, se houver, a banda inteira à vista. */
export function chartRange(values: readonly number[], band: SeriesBand | null = null): { min: number; max: number } {
  const all = band ? [...values, band.low, band.high] : [...values];
  const rawMin = Math.min(...all);
  const rawMax = Math.max(...all);
  const pad = Math.max((rawMax - rawMin) * 0.15, Math.abs(rawMax) * 0.02, 0.002);
  return { min: rawMin - pad, max: rawMax + pad };
}

// ---------------------------------------------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------------------------------------------

/** "Máxima no período: 63% (mar/2028) · mínima: 31% (jan/2027)". */
export function extremesLine(key: SeriesKey, extremes: SeriesExtremes, period: SeriesPeriod): string {
  const { format } = SERIES_META[key];
  const where = period === '12m' ? 'nos 12 meses' : period === 'mandato' ? 'no mandato' : 'na campanha';
  return (
    `Máxima ${where}: ${format(extremes.max.value)} (${shortMonthLabel(extremes.max.monthIndex)}) · ` +
    `mínima: ${format(extremes.min.value)} (${shortMonthLabel(extremes.min.monthIndex)})`
  );
}

/** Resumo do gráfico para o leitor de tela: o último valor, máxima, mínima, banda e quantos meses. */
export function seriesSummary(key: SeriesKey, points: readonly SeriesPoint[], period: SeriesPeriod): string {
  const meta = SERIES_META[key];
  if (points.length === 0) return `${meta.label}: sem dados no período.`;
  const last = points[points.length - 1];
  const extremes = seriesExtremes(points)!;
  const band = seriesBand(key);
  return [
    `Gráfico de ${meta.label}, ${meta.unit}, ${SERIES_PERIOD_LABEL[period].toLowerCase()}.`,
    `Agora: ${meta.format(last.value)} em ${shortMonthLabel(last.monthIndex)}.`,
    `${extremesLine(key, extremes, period)}.`,
    band ? `${band.label.replace(/\.$/, '')}.` : '',
    `${points.length} ${points.length === 1 ? 'mês' : 'meses'}.`,
  ]
    .filter(Boolean)
    .join(' ');
}

/** Sem dois pontos não há linha: a tela explica em vez de desenhar um gráfico vazio. */
export function emptySeriesNote(key: SeriesKey, count: number): string | null {
  if (count >= 2) return null;
  return count === 1
    ? 'O gráfico aparece quando houver um segundo mês para comparar.'
    : `A série de ${SERIES_META[key].label.toLowerCase()} aparece depois do primeiro mês encerrado.`;
}
