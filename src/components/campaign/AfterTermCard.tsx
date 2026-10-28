import { StyleSheet, View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { GameContent, GameState } from '@/engine';

import { afterTermView } from './afterTermView';

/**
 * "Depois do mandato" (PLANO_CAMPANHA.md Fase C7): influência política, situação jurídica e legado de governo, mais
 * as possibilidades que decorrem deles. Projeções a partir do estado final, não destinos.
 */
export function AfterTermCard({
  state,
  content,
  monthLimit,
}: {
  state: GameState;
  content: GameContent;
  monthLimit: number;
}) {
  const view = afterTermView(state, content, monthLimit);
  if (!view) return null;
  return (
    <Card
      title="Depois do mandato"
      subtitle="Projeções a partir do fim do mandato, não destinos definitivos. Os três aspectos são independentes.">
      {view.aspects.map((aspect) => (
        <View
          key={aspect.title}
          style={styles.aspect}
          accessible
          accessibilityLabel={`${aspect.title}: ${aspect.value}. ${aspect.details.join('. ')}`}>
          <View style={styles.head}>
            <Text variant="label">{aspect.title}</Text>
            <Text variant="label" color={aspect.tone}>
              {aspect.value}
            </Text>
          </View>
          {aspect.details.map((detail) => (
            <Text key={detail} variant="caption" color="textSecondary">
              {detail}
            </Text>
          ))}
        </View>
      ))}
      {view.accountability.length > 0 && (
        <View style={styles.aspect}>
          <Text variant="label">Prestação de contas</Text>
          {view.accountability.map((item, index) => (
            <View
              key={`${item.promise}-${index}`}
              style={styles.promise}
              accessible
              accessibilityLabel={`${item.promise}: ${item.status}. ${item.evidence}`}>
              <Text variant="label">{item.promise}</Text>
              <Text variant="caption" color={item.tone}>
                {item.status}
              </Text>
              <Text variant="caption" color="textSecondary">
                {item.evidence}
              </Text>
            </View>
          ))}
        </View>
      )}
      <View style={styles.aspect}>
        <Text variant="label">Possibilidades</Text>
        {view.possibilities.map((line) => (
          <Text key={line} variant="body" color="textSecondary">
            • {line}
          </Text>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  aspect: { gap: Spacing.half, paddingVertical: Spacing.one },
  promise: { gap: Spacing.half },
  head: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: Spacing.two },
});
