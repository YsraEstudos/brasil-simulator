import { StyleSheet, View } from 'react-native';

import { Card, deltaSentiment, Text } from '@/components/ui';
import { Spacing, type ThemeColor } from '@/constants/theme';
import type { IndicatorKey, MonthReport } from '@/engine';
import { useTheme } from '@/hooks/use-theme';
import { useGame } from '@/store';

import { buildIndicatorEquation } from './indicatorEquationModel';
import { indicatorLabel, INDICATOR_META } from './labels';

/**
 * Conta aberta do indicador (H9/D2): mês passado, as maiores parcelas do "Por que mudou?", "outros" e o valor de
 * agora. O sinal vai escrito em cada parcela (a cor só reforça). A lógica fica em `indicatorEquation.ts`.
 */
export function IndicatorEquation({
  indicator,
  report,
  current,
  previous,
}: {
  indicator: IndicatorKey;
  report: MonthReport | undefined;
  current: number;
  previous: number | undefined;
}) {
  const { colors } = useTheme();
  const unit = useGame((s) => s.prefs.fiscalUnit);
  if (!report) return null;
  const meta = INDICATOR_META[indicator];
  const label = indicatorLabel(indicator, unit);
  const eq = buildIndicatorEquation(report, indicator, current, previous, meta.decimals, label);
  const tone = (steps: number): ThemeColor => SENTIMENT_COLOR[deltaSentiment(steps, meta.goodWhen).sentiment];

  return (
    <Card title={`A conta — ${label}`} subtitle="Em pontos percentuais (p.p.), do mês passado para agora.">
      <View accessible accessibilityLabel={eq.line}>
        <Row label="No mês passado" value={eq.startText} />
        {eq.terms.map((term) => (
          <Row
            key={term.key}
            label={term.merged > 0 ? `outros (${term.merged} ${term.merged === 1 ? 'causa' : 'causas'})` : term.label}
            value={term.text}
            color={tone(term.steps)}
          />
        ))}
        {eq.roundingText && <Row label="arredondamento" value={eq.roundingText} color="textSecondary" />}
        <View style={[styles.row, styles.total, { borderTopColor: colors.border }]}>
          <Text variant="label">= Agora</Text>
          <Text variant="label" tabular>
            {eq.endText}
          </Text>
        </View>
      </View>
      {eq.roundingNote && (
        <Text variant="caption" color="textSecondary">
          {eq.roundingNote}
        </Text>
      )}
    </Card>
  );
}

function Row({ label, value, color = 'text' }: { label: string; value: string; color?: ThemeColor }) {
  return (
    <View style={styles.row}>
      <Text variant="body" style={styles.label}>
        {label}
      </Text>
      <Text variant="label" color={color} tabular>
        {value}
      </Text>
    </View>
  );
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
  total: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two, marginTop: Spacing.one },
});
