import { StyleSheet, View } from 'react-native';

import { deltaSentiment, formatNumber, formatPercent, formatPointsDelta, Text, type Sentiment } from '@/components/ui';
import { Spacing, type ThemeColor } from '@/constants/theme';

const SENTIMENT_COLOR: Record<Sentiment, ThemeColor> = {
  positive: 'positive',
  negative: 'negative',
  neutral: 'textSecondary',
};

/** Fração com sinal explícito para positivos: 0,012 → "+1,2%", −0,004 → "−0,4%". */
export function signedPercent(fraction: number, decimals = 1): string {
  const text = formatPercent(fraction, decimals);
  return Number((fraction * 100).toFixed(decimals)) > 0 ? `+${text}` : text;
}

/** Inteiro com sinal explícito para positivos: 35 → "+35", −12 → "−12". */
export function signedInt(value: number): string {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${formatNumber(rounded)}` : formatNumber(rounded);
}

export type StatRowProps = {
  label: string;
  value: string;
  /** Variação em relação ao mês anterior, em fração (0,003 = +0,3 p.p.). Sem valor, não mostra variação. */
  delta?: number;
  /** Subir é bom (PIB, aprovação) ou ruim (inflação, desemprego). */
  goodWhen?: 'up' | 'down';
  /** Texto de contexto abaixo do rótulo. */
  context?: string;
};

/** Linha de indicador: rótulo e contexto à esquerda, valor e variação (com texto, não só cor) à direita. */
export function StatRow({ label, value, delta, goodWhen = 'up', context }: StatRowProps) {
  const sentiment = delta === undefined ? undefined : deltaSentiment(delta, goodWhen).sentiment;
  const deltaText = delta === undefined ? undefined : `Variação no mês: ${formatPointsDelta(delta)}`;
  const accessibilityLabel = [label, value, context, deltaText].filter(Boolean).join('. ');

  return (
    <View accessible accessibilityLabel={accessibilityLabel} style={styles.row}>
      <View style={styles.labels}>
        <Text variant="label">{label}</Text>
        {context ? (
          <Text variant="caption" color="textSecondary">
            {context}
          </Text>
        ) : null}
        {deltaText && sentiment ? (
          <Text variant="caption" color={SENTIMENT_COLOR[sentiment]}>
            {deltaText}
          </Text>
        ) : null}
      </View>
      <Text variant="heading" tabular align="right">
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
  labels: { flex: 1, gap: Spacing.half },
});
