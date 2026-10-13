import { StyleSheet, View } from 'react-native';

import { Spacing, type ThemeColor } from '@/constants/theme';

import { Card } from './Card';
import { deltaSentiment, formatPercent, formatPointsDelta, type Sentiment } from './format';
import { Text } from './Text';

export type IndicatorProps = {
  label: string;
  /** Valor atual em fração (0,045 = 4,5%). */
  value: number;
  /** Valor do mês anterior, para mostrar a variação. */
  previous?: number;
  /** Subir é bom (aprovação, PIB) ou ruim (inflação, desemprego)? */
  goodWhen: 'up' | 'down';
  /** Texto curto de contexto, ex.: "meta 3,0% ± 1,5 p.p." */
  context?: string;
  decimals?: number;
  /** Abre o "Por que mudou?" (GAME_DESIGN.md §12). */
  onPress?: () => void;
};

const COLOR: Record<Sentiment, ThemeColor> = { positive: 'positive', negative: 'negative', neutral: 'textSecondary' };
const ARROW = { up: '▲', down: '▼', flat: '■' } as const;
const WORD = { up: 'subiu', down: 'caiu', flat: 'estável' } as const;

/** Cartão de indicador: valor grande e variação com seta e cor (e texto equivalente para leitores de tela). */
export function Indicator({ label, value, previous, goodWhen, context, decimals = 1, onPress }: IndicatorProps) {
  const delta = previous === undefined ? undefined : value - previous;
  const tone = delta === undefined ? undefined : deltaSentiment(delta, goodWhen);
  const valueText = formatPercent(value, decimals);
  const deltaText = delta === undefined ? undefined : formatPointsDelta(delta, decimals);
  const a11y = [label, valueText, tone && deltaText && `${WORD[tone.trend]} ${deltaText}`, context]
    .filter(Boolean)
    .join(', ');

  return (
    <Card onPress={onPress} accessibilityLabel={a11y} style={styles.card}>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
      <Text variant="number" tabular>
        {valueText}
      </Text>
      <View style={styles.row}>
        {tone && deltaText && (
          <Text variant="caption" color={COLOR[tone.sentiment]} tabular>
            {ARROW[tone.trend]} {deltaText}
          </Text>
        )}
        {context && (
          <Text variant="caption" color="textMuted" numberOfLines={1} style={styles.context}>
            {context}
          </Text>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.one, flexGrow: 1, flexBasis: 150 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  context: { flexShrink: 1 },
});
