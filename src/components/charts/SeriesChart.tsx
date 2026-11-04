import { Pressable, View } from 'react-native';

import {
  emptySeriesNote,
  extremesLine,
  periodSlice,
  SERIES_META,
  SERIES_PERIOD_LABEL,
  SERIES_PERIODS,
  seriesBand,
  seriesExtremes,
  seriesOf,
  seriesSummary,
  type SeriesKey,
} from '@/components/painel/indicatorSeries';
import { Text } from '@/components/ui';
import type { IndicatorPoint } from '@/database/campaignRepository';

import type { ChartPalette } from './chartPalette';
import { useHistoryView } from './historyViewStore';
import { LineChart } from './LineChart';

/** Botão de escolha (variável ou período), com alvo de toque de 44 pt. */
function Choice({
  label,
  selected,
  palette,
  onPress,
  a11y,
}: {
  label: string;
  selected: boolean;
  palette: ChartPalette;
  onPress: () => void;
  a11y?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={a11y ?? label}
      onPress={onPress}
      style={{
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: 10,
        borderWidth: 1,
        borderRadius: 5,
        borderColor: selected ? palette.chipActive : palette.chipBorder,
      }}>
      <Text style={{ color: selected ? palette.chipActive : palette.text, fontSize: 12, fontWeight: '700' }}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Histórico de uma variável (A26, A62, D47): escolha da variável e do período, o gráfico com a banda da meta e a
 * máxima e mínima do período. O período fica na memória do app e vale para todos os gráficos.
 */
export function SeriesChart({
  history,
  keys,
  selected,
  onSelect,
  termStart,
  palette,
}: {
  history: readonly IndicatorPoint[] | null;
  keys: readonly SeriesKey[];
  selected: SeriesKey;
  onSelect: (key: SeriesKey) => void;
  /** Mês da posse em curso (recorte "Mandato"). */
  termStart: number;
  palette: ChartPalette;
}) {
  const { period, setPeriod } = useHistoryView();
  const meta = SERIES_META[selected];
  const points = periodSlice(seriesOf(history ?? [], selected), period, termStart);
  const note = emptySeriesNote(selected, points.length);
  const extremes = seriesExtremes(points);
  const band = seriesBand(selected);

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {keys.map((key) => (
          <Choice
            key={key}
            label={SERIES_META[key].label}
            selected={key === selected}
            palette={palette}
            a11y={`Gráfico de ${SERIES_META[key].label}`}
            onPress={() => onSelect(key)}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {SERIES_PERIODS.map((id) => (
          <Choice
            key={id}
            label={SERIES_PERIOD_LABEL[id]}
            selected={id === period}
            palette={palette}
            a11y={`Período: ${SERIES_PERIOD_LABEL[id]}`}
            onPress={() => setPeriod(id)}
          />
        ))}
      </View>
      {note ? (
        <Text style={{ color: palette.muted, fontSize: 11, fontStyle: 'italic', paddingVertical: 6 }}>{note}</Text>
      ) : (
        <>
          <LineChart
            points={points}
            format={meta.format}
            goodWhen={meta.goodWhen}
            palette={palette}
            band={band}
            caption={meta.unit}
            accessibilityLabel={seriesSummary(selected, points, period)}
          />
          {band && <Text style={{ color: palette.muted, fontSize: 10.5 }}>Faixa sombreada: {band.label}</Text>}
          {extremes && (
            <Text tabular style={{ color: palette.text, fontSize: 11.5 }}>
              {extremesLine(selected, extremes, period)}
            </Text>
          )}
        </>
      )}
    </View>
  );
}
