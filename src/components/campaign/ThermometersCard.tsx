import { StyleSheet, View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { GameContent, GameState } from '@/engine';

import { thermometerRows } from './thermometerView';

const BAND_COLOR = { calmo: 'positive', normal: 'textSecondary', tenso: 'warning', critico: 'negative' } as const;

/**
 * Termômetros (PLANO_CAMPANHA.md Fase C6g): Congresso, ruas, mercado e instituições, de 0 a 100, com os fatores
 * que mais pesam. Leitura dos indicadores do mês, não pesquisa de opinião.
 */
export function ThermometersCard({ state, content }: { state: GameState; content: GameContent }) {
  const rows = thermometerRows(state, content);
  return (
    <Card
      title="Termômetros"
      subtitle="Leitura dos indicadores deste mês, de 0 (calmo) a 100 (crítico). Não é pesquisa de opinião: cada número sai dos fatores mostrados.">
      {rows.map((row) => (
        <View
          key={row.id}
          style={styles.row}
          accessible
          accessibilityLabel={`${row.label}: ${row.value} de 100, ${row.bandLabel}. ${row.drivers.join('; ')}`}>
          <View style={styles.head}>
            <Text variant="label">{row.label}</Text>
            <Text variant="heading" color={BAND_COLOR[row.band]} tabular>
              {`${row.value} · ${row.bandLabel}`}
            </Text>
          </View>
          {row.drivers.length > 0 ? (
            <Text variant="caption" color="textSecondary">
              {row.drivers.join(' · ')}
            </Text>
          ) : null}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.half, paddingVertical: Spacing.one },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
