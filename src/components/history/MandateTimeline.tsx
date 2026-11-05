import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FilterChip } from '@/components/campaign/GabineteBits';
import { useMandateLog } from '@/components/charts/useIndicatorHistory';
import { FilterRow } from '@/components/congress/ProposalFilterBar';
import { Card, Text } from '@/components/ui';
import { MIN_TOUCH, Radius, Spacing } from '@/constants/theme';
import { loadContent } from '@/content';
import { useTheme } from '@/hooks/use-theme';
import type { ActiveCampaign } from '@/store';

import {
  buildTimeline,
  entryAccessibilityLabel,
  filterTimeline,
  groupByYear,
  TIMELINE_FILTERS,
  timelineCounts,
  type TimelineEntry,
  type TimelineFilter,
  type TimelineTone,
} from './timelineModel';

/**
 * Linha do tempo do mandato (PLANO_SAVES_HISTORICO.md H6, A40): o que aconteceu mês a mês, agrupado por ano, com
 * filtro por tipo. Cada entrada traz símbolo e rótulo do tipo, não só a cor; as crises ganham borda de destaque.
 */
export function MandateTimeline({ campaign }: { campaign: ActiveCampaign }) {
  const { state } = campaign;
  const content = useMemo(() => loadContent(state.scenarioId), [state.scenarioId]);
  const log = useMandateLog();
  const [filter, setFilter] = useState<TimelineFilter | null>(null);
  const entries = useMemo(() => buildTimeline(state, content, log), [state, content, log]);
  const counts = timelineCounts(entries);
  const years = groupByYear(filterTimeline(entries, filter));

  return (
    <>
      <Card
        title="Linha do tempo do mandato"
        subtitle="Leis, eventos e respostas, decisões, eleições e trocas de ministro, mês a mês desde a posse.">
        <FilterRow title="Tipo" label="Filtrar a linha do tempo por tipo">
          <FilterChip label="Tudo" active={filter === null} onPress={() => setFilter(null)} />
          {TIMELINE_FILTERS.map(({ id, label, symbol }) => (
            <FilterChip
              key={id}
              label={`${symbol} ${label}`}
              count={counts[id]}
              accessibilityLabel={`${label}: ${counts[id]} ${counts[id] === 1 ? 'registro' : 'registros'}`}
              active={filter === id}
              onPress={() => setFilter(filter === id ? null : id)}
            />
          ))}
        </FilterRow>
        {log === null && (
          <Text variant="caption" color="textMuted">
            Carregando eventos e decisões salvos…
          </Text>
        )}
      </Card>

      {years.length === 0 ? (
        <Card>
          <Text variant="body" color="textSecondary">
            {entries.length === 0
              ? 'Nada registrado ainda: encerre o primeiro mês do mandato.'
              : 'Nada com esse filtro.'}
          </Text>
        </Card>
      ) : (
        years.map((year) => (
          <Card
            key={year.year}
            title={String(year.year)}
            subtitle={`${year.count} ${year.count === 1 ? 'registro' : 'registros'}`}>
            {year.months.map((month) => (
              <View key={month.monthIndex} style={styles.month}>
                <Text variant="label" accessibilityRole="header">
                  {month.label}
                </Text>
                {month.entries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} />
                ))}
              </View>
            ))}
          </Card>
        ))
      )}
    </>
  );
}

const TONE_COLOR: Record<TimelineTone, 'positive' | 'negative' | 'warning' | 'textSecondary'> = {
  positive: 'positive',
  negative: 'negative',
  warning: 'warning',
  neutral: 'textSecondary',
};

function EntryRow({ entry }: { entry: TimelineEntry }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const label = entryAccessibilityLabel(entry);
  const body = (
    <>
      <Text variant="caption" color={TONE_COLOR[entry.tone]}>
        {`${entry.symbol} ${entry.tag.toUpperCase()}`}
      </Text>
      <Text variant="body">{entry.title}</Text>
      {entry.detail && open ? (
        <Text variant="caption" color="textSecondary">
          {entry.detail}
        </Text>
      ) : null}
    </>
  );
  const style = [
    styles.entry,
    {
      borderColor: entry.grave ? colors.negative : colors.border,
      borderWidth: entry.grave ? 2 : StyleSheet.hairlineWidth,
    },
  ];
  if (!entry.detail) {
    return (
      <View style={style} accessible accessibilityLabel={label}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={() => setOpen((v) => !v)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={open ? 'Oculta o detalhe' : 'Mostra o detalhe'}
      accessibilityState={{ expanded: open }}
      style={({ pressed }) => [...style, pressed && { backgroundColor: colors.surfaceRaised }]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  month: { gap: Spacing.one, paddingTop: Spacing.one },
  entry: { minHeight: MIN_TOUCH, borderRadius: Radius.md, padding: Spacing.two, gap: Spacing.half },
});
