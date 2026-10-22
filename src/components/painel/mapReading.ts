import { formatNumber, formatPercent, formatPointsDelta } from '@/components/ui/format';
import type { RegionalPoint } from '@/database/campaignRepository';
import type { ElectionResult, GameContent, GameState } from '@/engine';
import {
  availableIndicators,
  formatValue,
  indicatorSpec,
  mapRows,
  type MapIndicator,
  type UfRow,
} from './regionalMetrics';

export const DIMMED_UF = '#10121a';
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
export function filterUfs(rows: readonly UfRow[], region: string | null, query = ''): UfRow[] {
  const q = normalize(query);
  return rows.filter(
    (r) => (!region || r.region === region) && (!q || normalize(r.name).includes(q) || normalize(r.uf.id) === q),
  );
}
export function rankUfs(id: MapIndicator, rows: readonly UfRow[]) {
  const sign = indicatorSpec(id).goodWhen === 'up' ? -1 : 1;
  const sorted = [...rows].sort((a, b) => sign * (a.value - b.value) || a.uf.id.localeCompare(b.uf.id));
  let rank = 1;
  return sorted.map((r, i) => {
    if (i === 0 || Math.abs(r.value - sorted[i - 1].value) > 1e-10) rank = i + 1;
    return { ...r, rank };
  });
}
export function rankingTitles(id: MapIndicator): readonly [string, string] {
  if (id === 'inclinacao') return ['5 mais à direita', '5 mais à esquerda'];
  if (id === 'chuva') return ['5 mais chuvosas', '5 mais secas'];
  if (id === 'intencao' || id === 'resultado') return ['5 maiores votos no governo', '5 menores votos no governo'];
  return ['5 melhores', '5 piores'];
}
export function absoluteValue(id: MapIndicator, row: UfRow, state: GameState): number {
  if (id === 'aprovacao') return state.indicators.approval + row.value;
  if (id === 'desemprego') return state.indicators.unemployment + row.value;
  if (id === 'crescimento') return state.indicators.gdpGrowth12m + row.value;
  return row.value;
}
export function readingValue(id: MapIndicator, value: number): string {
  return ['aprovacao', 'desemprego', 'crescimento'].includes(id) ? formatPercent(value, 1) : formatValue(id, value);
}
export function regionalSummary(id: MapIndicator, rows: readonly UfRow[], state: GameState) {
  const weight = rows.reduce((sum, r) => sum + r.populationShare, 0);
  if (weight <= 0) return null;
  const value = rows.reduce((sum, r) => sum + absoluteValue(id, r, state) * r.populationShare, 0) / weight;
  return { value, difference: rows.reduce((sum, r) => sum + r.value * r.populationShare, 0) / weight };
}
export function ufDescription(
  id: MapIndicator,
  row: UfRow,
  rank: number,
  total: number,
  state: GameState,
  badge?: string,
) {
  const spec = indicatorSpec(id);
  const reference = ['aprovacao', 'desemprego', 'crescimento'].includes(id)
    ? 'média nacional'
    : id === 'chuva'
      ? 'normal da UF'
      : id === 'inclinacao'
        ? 'centro dos eixos'
        : 'referência';
  const relative =
    spec.scale === 'diverging'
      ? Math.abs(row.value) < 1e-10
        ? `na ${reference}`
        : row.value > 0
          ? `acima da ${reference}`
          : `abaixo da ${reference}`
      : '';
  return [
    row.name,
    spec.label,
    readingValue(id, absoluteValue(id, row, state)),
    `${rank}º de ${total}`,
    relative,
    badge,
  ]
    .filter(Boolean)
    .join(', ');
}
export const COMPARISON_IDS = [
  'crescimento',
  'desemprego',
  'aprovacao',
  'renda',
  'chuva',
  'seca',
  'alinhamento',
  'intencao',
  'resultado',
] as const;
function changeText(id: MapIndicator, value: number, previous: number | undefined): string {
  if (previous === undefined || !Number.isFinite(previous)) return 'Sem dados anteriores';
  const delta = value - previous;
  const stable = Math.abs(delta) < (id === 'renda' ? 0.005 : 0.0005);
  const arrow = stable ? '→' : delta > 0 ? '↑' : '↓';
  const shown = stable ? 0 : delta;
  return `${arrow} ${id === 'renda' ? formatNumber(shown, 2) : formatPointsDelta(shown)}`;
}
export function comparisonRows(
  left: string,
  right: string,
  state: GameState,
  content: GameContent,
  history: readonly RegionalPoint[],
  election: ElectionResult | null,
) {
  const previous = history.find((p) => p.monthIndex === state.monthIndex - 1);
  return COMPARISON_IDS.map((id) => {
    const rows = mapRows(id, state, content, election);
    const a = rows.find((r) => r.uf.id === left)!;
    const b = rows.find((r) => r.uf.id === right)!;
    const missing = id === 'resultado' && !election;
    const unavailable = !availableIndicators(content).some((spec) => spec.id === id);
    const valueA = absoluteValue(id, a, state);
    const valueB = absoluteValue(id, b, state);
    const cell = (r: UfRow, value: number) => {
      const old =
        (id === 'resultado' ? undefined : previous?.observations?.[r.uf.id]?.[id]) ??
        (id === 'aprovacao'
          ? previous?.ufs[r.uf.id]?.approval
          : id === 'desemprego'
            ? previous?.ufs[r.uf.id]?.unemployment
            : undefined);
      return {
        text: unavailable ? 'Sem dados do cenário' : missing ? 'Sem resultado' : readingValue(id, value),
        change: id === 'resultado' ? 'Fotografia da eleição' : changeText(id, value, old),
      };
    };
    const difference = missing || unavailable ? null : valueA - valueB;
    return {
      id,
      label: indicatorSpec(id).label,
      left: cell(a, valueA),
      right: cell(b, valueB),
      difference,
      differenceText:
        difference === null ? '—' : id === 'renda' ? formatNumber(difference, 2) : formatPointsDelta(difference),
    };
  });
}
