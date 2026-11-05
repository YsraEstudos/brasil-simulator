import { shortMonthLabel } from '@/components/campaign/labels';
import { formatNumber, formatPointsDelta } from '@/components/ui/format';
import {
  ECONOMY_SERIES,
  PAINEL_SERIES,
  SERIES_META,
  seriesOf,
  type SeriesKey,
} from '@/components/painel/indicatorSeries';
import type { IndicatorPoint } from '@/database/campaignRepository';

/**
 * Comparar dois meses (PLANO_SAVES_HISTORICO.md, Fase H5, A27): os indicadores e as variáveis da série de longo
 * prazo, lado a lado, com a diferença. A série cobre a campanha inteira; setores e UFs ficam fora (só os últimos 12
 * meses têm o estado completo). Puro.
 */

export const COMPARE_KEYS: readonly SeriesKey[] = [...PAINEL_SERIES, ...ECONOMY_SERIES];

/** Casas decimais da diferença, as mesmas do valor. */
const DECIMALS: Record<SeriesKey, number> = {
  approval: 0,
  inflation12m: 1,
  unemployment: 1,
  gdpGrowth12m: 1,
  primaryBalance12m: 2,
  selic: 2,
  grossDebt: 1,
  exchangeRate: 2,
};

export interface CompareRow {
  key: SeriesKey;
  label: string;
  /** Valor em cada mês; "—" quando o mês não tem a variável (save antigo). */
  a: string;
  b: string;
  /** Diferença B − A, com sinal e unidade; "—" se faltar um dos lados. */
  difference: string;
  /** Leitura da diferença (subir é bom ou ruim); `neutral` sem leitura ou sem mudança. */
  sentiment: 'positive' | 'negative' | 'neutral';
  accessibilityLabel: string;
}

function differenceText(key: SeriesKey, diff: number): string {
  if (key === 'exchangeRate') {
    const rounded = Number(diff.toFixed(2));
    return `${rounded > 0 ? '+' : rounded < 0 ? '−' : '±'}R$ ${formatNumber(Math.abs(rounded), 2)}`;
  }
  return formatPointsDelta(diff, DECIMALS[key]);
}

export function compareMonths(history: readonly IndicatorPoint[], monthA: number, monthB: number): CompareRow[] {
  return COMPARE_KEYS.map((key) => {
    const meta = SERIES_META[key];
    const series = seriesOf(history, key);
    const va = series.find((p) => p.monthIndex === monthA)?.value;
    const vb = series.find((p) => p.monthIndex === monthB)?.value;
    const both = va !== undefined && vb !== undefined;
    const diff = both ? vb - va : 0;
    const shown = both && Math.abs(diff) >= 10 ** -(DECIMALS[key] + (key === 'exchangeRate' ? 0 : 2)) / 2;
    const sentiment: CompareRow['sentiment'] =
      !shown || meta.goodWhen === null ? 'neutral' : diff > 0 === (meta.goodWhen === 'up') ? 'positive' : 'negative';
    const a = va === undefined ? '—' : meta.format(va);
    const b = vb === undefined ? '—' : meta.format(vb);
    const difference = both ? differenceText(key, diff) : '—';
    return {
      key,
      label: meta.label,
      a,
      b,
      difference,
      sentiment,
      accessibilityLabel: `${meta.label}: ${a} em ${shortMonthLabel(monthA)}, ${b} em ${shortMonthLabel(monthB)}, diferença ${difference}`,
    };
  });
}

/** Meses que a série tem, em ordem: são os que dá para escolher. */
export function comparableMonths(history: readonly IndicatorPoint[]): number[] {
  return [...new Set(history.map((p) => p.monthIndex))].sort((x, y) => x - y);
}

/** Mês vizinho na lista (setas ◀ ▶), parando nas pontas. */
export function stepMonth(months: readonly number[], current: number, step: -1 | 1): number {
  const i = months.indexOf(current);
  if (i < 0) return months[step < 0 ? 0 : months.length - 1] ?? current;
  return months[Math.max(0, Math.min(months.length - 1, i + step))];
}
