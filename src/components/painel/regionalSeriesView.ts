import { formatNumber, formatPercent, formatPointsDelta } from '@/components/ui/format';
import type { RegionalField, RegionalPoint } from '@/database/campaignRepository';
import type { UfState } from '@/engine';

import type { MapIndicator } from './regionalMetrics';

/**
 * Série regional do cartão do estado (PLANO_GLOBO.md, PR 3): variação desde o mês passado e desde a posse, os
 * últimos 12 meses e a posição entre as 27 UFs. Funções puras sobre o estado atual (`UfState`) e a série gravada
 * no banco (`RegionalPoint`), que pode ter lacunas — nada é inventado: sem o mês de comparação o texto é "Sem
 * dados anteriores".
 */

/** Janela da mini-série do cartão: o mês atual e os 12 anteriores (12 meses de variação). */
export const REGIONAL_SERIES_WINDOW_MONTHS = 12;

/** Texto quando o mês de comparação não está na série (save anterior à série, retenção, leitura falha). */
export const NO_PREVIOUS_DATA = 'Sem dados anteriores';

export type SeriesUnit = 'fraction' | 'points';

export interface SeriesMetricSpec {
  field: RegionalField;
  /** Nome do indicador no cartão. */
  label: string;
  /** Subir é bom para o governo ou ruim (desemprego). */
  goodWhen: 'up' | 'down';
  /** Complemento de "3º de 27 …". */
  rankPhrase: string;
  /** `fraction`: valores como fração (%), variação em p.p.; `points`: escala própria (−100…100). */
  unit: SeriesUnit;
}

/** Indicadores com série no banco; os do mapa de calor se ligam a eles por `seriesMetricFor`. */
export const SERIES_METRICS: Record<'aprovacao' | 'desemprego' | 'crescimento' | 'governador', SeriesMetricSpec> = {
  aprovacao: {
    field: 'approval',
    label: 'Aprovação do governo',
    goodWhen: 'up',
    rankPhrase: 'em aprovação',
    unit: 'fraction',
  },
  desemprego: {
    field: 'unemployment',
    label: 'Desemprego',
    goodWhen: 'down',
    rankPhrase: 'com menor desemprego',
    unit: 'fraction',
  },
  crescimento: {
    field: 'growthGap12m',
    label: 'Crescimento em relação ao Brasil',
    goodWhen: 'up',
    rankPhrase: 'em crescimento',
    unit: 'fraction',
  },
  governador: {
    field: 'governorRelation',
    label: 'Relação com o governador',
    goodWhen: 'up',
    rankPhrase: 'em relação com o governador',
    unit: 'points',
  },
};

/**
 * Série do indicador do mapa; "renda" (derivada da participação no PIB) e "alinhamento" (já contido na aprovação,
 * que é o que o motor grava) não têm série própria e usam a aprovação.
 */
export function seriesMetricFor(indicator: MapIndicator): SeriesMetricSpec {
  return indicator === 'renda' || indicator === 'alinhamento' ? SERIES_METRICS.aprovacao : SERIES_METRICS[indicator];
}

export type ComparisonTone = 'positive' | 'negative' | 'neutral';

export interface ComparisonView {
  label: string;
  text: string;
  tone: ComparisonTone;
}

export interface SeriesPoint {
  monthIndex: number;
  value: number;
}

export interface UfSeriesView {
  metric: SeriesMetricSpec;
  valueText: string;
  sinceLastMonth: ComparisonView;
  sinceStart: ComparisonView;
  /** Mini-série ordenada por mês, terminando no mês atual (que vem do estado, não do banco). */
  series: SeriesPoint[];
  /** Legenda da mini-série ("Últimos 12 meses") ou o aviso de que ela ainda não existe. */
  seriesCaption: string;
  /** `true` quando há pelo menos dois pontos para ligar. */
  hasSeries: boolean;
  /** Valor do primeiro ponto da mini-série em texto (para a legenda "de … para …"); `null` sem série. */
  seriesStartText: string | null;
  /** Tom da mini-série (primeiro → último ponto). */
  seriesTone: ComparisonTone;
  /** "3º de 27 em aprovação"; `null` se não houver UFs para comparar. */
  rankText: string | null;
}

export function formatSeriesValue(metric: SeriesMetricSpec, value: number): string {
  return metric.unit === 'points' ? formatNumber(value, 0) : formatPercent(value, 1);
}

function formatSeriesDelta(metric: SeriesMetricSpec, delta: number): string {
  if (metric.unit === 'fraction') return formatPointsDelta(delta);
  const rounded = Number(delta.toFixed(0));
  return `${rounded > 0 ? '+' : rounded < 0 ? '' : '±'}${formatNumber(rounded, 0)} pts`;
}

function toneOf(metric: SeriesMetricSpec, delta: number): ComparisonTone {
  if (!Number.isFinite(delta) || formatSeriesDelta(metric, delta) === formatSeriesDelta(metric, 0)) return 'neutral';
  return delta > 0 === (metric.goodWhen === 'up') ? 'positive' : 'negative';
}

function compare(
  metric: SeriesMetricSpec,
  label: string,
  current: number,
  past: RegionalPoint | undefined,
  ufId: string,
): ComparisonView {
  const before = past?.ufs[ufId]?.[metric.field];
  if (before === undefined || !Number.isFinite(before)) return { label, text: NO_PREVIOUS_DATA, tone: 'neutral' };
  const delta = current - before;
  return { label, text: formatSeriesDelta(metric, delta), tone: toneOf(metric, delta) };
}

/** Posição da UF entre todas (1 = melhor, empates dividem a posição): melhor é mais alto, ou mais baixo no desemprego. */
export function rankOf(metric: SeriesMetricSpec, ufs: readonly UfState[], ufId: string): number | null {
  const self = ufs.find((u) => u.id === ufId);
  if (!self) return null;
  const mine = self[metric.field];
  const better = ufs.filter((u) => (metric.goodWhen === 'up' ? u[metric.field] > mine : u[metric.field] < mine));
  return better.length + 1;
}

/** Mini-série: pontos do banco na janela de 12 meses, com o mês atual vindo do estado (vale mesmo sem banco). */
export function seriesWindow(
  metric: SeriesMetricSpec,
  history: readonly RegionalPoint[],
  ufId: string,
  monthIndex: number,
  currentValue: number,
): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  for (const p of history) {
    const value = p.ufs[ufId]?.[metric.field];
    if (p.monthIndex >= monthIndex || p.monthIndex < monthIndex - REGIONAL_SERIES_WINDOW_MONTHS) continue;
    if (value === undefined || !Number.isFinite(value)) continue;
    points.push({ monthIndex: p.monthIndex, value });
  }
  points.sort((a, b) => a.monthIndex - b.monthIndex);
  points.push({ monthIndex, value: currentValue });
  return points;
}

/** Monta tudo o que o cartão da UF mostra sobre a série; `null` se a UF não existe no estado. */
export function buildUfSeriesView(input: {
  metric: SeriesMetricSpec;
  ufId: string;
  monthIndex: number;
  /** UFs do estado atual (as 27), fonte do valor de hoje e do ranking. */
  currentUfs: readonly UfState[];
  /** Série gravada no banco (pode estar vazia ou ter lacunas). */
  history: readonly RegionalPoint[];
}): UfSeriesView | null {
  const { metric, ufId, monthIndex, currentUfs, history } = input;
  const uf = currentUfs.find((u) => u.id === ufId);
  if (!uf) return null;
  const current = uf[metric.field];
  const byMonth = (m: number) => history.find((p) => p.monthIndex === m);

  const sinceLastMonth: ComparisonView =
    monthIndex <= 0
      ? { label: 'Desde o mês passado', text: 'Primeiro mês', tone: 'neutral' }
      : compare(metric, 'Desde o mês passado', current, byMonth(monthIndex - 1), ufId);
  const sinceStart: ComparisonView =
    monthIndex <= 0
      ? { label: 'Desde a posse', text: 'Mês da posse', tone: 'neutral' }
      : compare(metric, 'Desde a posse', current, byMonth(0), ufId);

  const series = seriesWindow(metric, history, ufId, monthIndex, current);
  const hasSeries = series.length >= 2;
  const first = series[0];
  const months = series[series.length - 1].monthIndex - first.monthIndex;
  const seriesCaption = hasSeries
    ? months === 1
      ? 'Último mês'
      : `Últimos ${months} meses`
    : monthIndex <= 0
      ? 'A série aparece depois do primeiro mês encerrado.'
      : NO_PREVIOUS_DATA;

  const rank = rankOf(metric, currentUfs, ufId);
  return {
    metric,
    valueText: formatSeriesValue(metric, current),
    sinceLastMonth,
    sinceStart,
    series,
    seriesCaption,
    hasSeries,
    seriesStartText: hasSeries ? formatSeriesValue(metric, first.value) : null,
    seriesTone: hasSeries ? toneOf(metric, current - first.value) : 'neutral',
    rankText: rank === null || currentUfs.length < 2 ? null : `${rank}º de ${currentUfs.length} ${metric.rankPhrase}`,
  };
}

/** Pontos (x, y) da mini-série numa caixa `width × height`, com `pad` de folga; o eixo x segue o mês, não o índice. */
export function sparklinePoints(
  series: readonly SeriesPoint[],
  width: number,
  height: number,
  pad: number,
): { x: number; y: number }[] {
  if (series.length === 0) return [];
  const months = series.map((p) => p.monthIndex);
  const values = series.map((p) => p.value);
  const m0 = Math.min(...months);
  const mSpan = Math.max(...months) - m0;
  const v0 = Math.min(...values);
  const vSpan = Math.max(...values) - v0;
  const innerW = width - 2 * pad;
  const innerH = height - 2 * pad;
  return series.map((p) => ({
    x: pad + (mSpan === 0 ? innerW / 2 : ((p.monthIndex - m0) / mSpan) * innerW),
    // Série sem variação vira uma linha no meio, em vez de dividir por zero.
    y: pad + (vSpan === 0 ? innerH / 2 : innerH - ((p.value - v0) / vSpan) * innerH),
  }));
}
