import { StyleSheet, View } from 'react-native';

import { Card, deltaSentiment, Text } from '@/components/ui';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { explainIndicator, pp, type CauseContribution, type IndicatorKey, type MonthReport } from '@/engine';
import { useTheme } from '@/hooks/use-theme';

import { INDICATOR_META, VOTING_INTENTION_META } from './labels';

/** Quantas causas aparecem antes do agrupamento "outros". */
const TOP_CAUSES = 6;

/**
 * "Por que mudou?" de um indicador (GAME_DESIGN.md §12): causas do último mês encerrado, com sinal em p.p.
 * Aceita também o pseudo-indicador `votingIntention` (Fase 08), que não é indicador de economia.
 */
export function WhyChanged({
  indicator,
  report,
}: {
  indicator: IndicatorKey | 'votingIntention';
  report: MonthReport | undefined;
}) {
  const { colors } = useTheme();
  const meta = indicator === 'votingIntention' ? VOTING_INTENTION_META : INDICATOR_META[indicator];
  const title = `Por que mudou? — ${meta.label}`;

  if (!report) {
    return (
      <Card title={title}>
        <Text variant="body" color="textSecondary">
          Ainda não há mês encerrado.
        </Text>
      </Card>
    );
  }

  const causes = explainIndicator(report, indicator);
  if (causes.length === 0) {
    return (
      <Card title={title}>
        <Text variant="body" color="textSecondary">
          Nenhuma variação relevante neste mês.
        </Text>
      </Card>
    );
  }

  const top = causes.slice(0, TOP_CAUSES);
  const rest = causes.slice(TOP_CAUSES);
  const rows: { key: string; label: string; delta: number }[] = top.map(toRow);
  if (rest.length > 0) rows.push({ key: 'outros', label: 'outros', delta: sum(rest) });
  const total = sum(causes);

  return (
    <Card title={title} subtitle="Decomposição da variação do último mês encerrado.">
      {rows.map((row) => (
        <View key={row.key} style={styles.row}>
          <Text variant="body" style={styles.label}>
            {row.label}
          </Text>
          <Text variant="label" color={SENTIMENT_COLOR[deltaSentiment(row.delta, meta.goodWhen).sentiment]} tabular>
            {pp(row.delta, meta.decimals)}
          </Text>
        </View>
      ))}
      <View style={[styles.row, styles.total, { borderTopColor: colors.border }]}>
        <Text variant="label">Total no mês</Text>
        <Text variant="label" tabular>
          {pp(total, meta.decimals)}
        </Text>
      </View>
    </Card>
  );
}

function toRow(c: CauseContribution): { key: string; label: string; delta: number } {
  return { key: c.cause, label: c.label, delta: c.delta };
}

function sum(parts: readonly { delta: number }[]): number {
  return parts.reduce((n, p) => n + p.delta, 0);
}

const SENTIMENT_COLOR: Record<'positive' | 'negative' | 'neutral', ThemeColor> = {
  positive: 'positive',
  negative: 'negative',
  neutral: 'textSecondary',
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  label: { flexShrink: 1 },
  total: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two },
});
