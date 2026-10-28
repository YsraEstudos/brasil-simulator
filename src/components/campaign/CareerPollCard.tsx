import { StyleSheet, View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';

import type { CareerPollViewModel } from './careerPollView';

export interface CareerPollCardProps {
  /** `null` = ainda não há pesquisa (antes de encerrar o primeiro turno). */
  view: CareerPollViewModel | null;
}

/**
 * Pesquisa da campanha antes da posse (PLANO_CAMPANHA.md Fase C2): intenção estimada com data e margem, o
 * reconhecimento por UF em faixas e o "Por que mudou?" em texto. Só leitura do estado persistido.
 */
export function CareerPollCard({ view }: CareerPollCardProps) {
  if (!view) {
    return (
      <Card title="Pesquisa nacional">
        <Text color="textSecondary">A primeira pesquisa sai quando você encerrar este turno.</Text>
      </Card>
    );
  }
  return (
    <>
      <Card title={view.title} subtitle={view.subtitle}>
        {view.rows.map((row) => (
          <View key={row.id} style={styles.row} accessibilityLabel={`${row.label}: ${row.share}`}>
            <Text variant={row.player ? 'heading' : 'body'}>{row.label}</Text>
            <Text variant={row.player ? 'heading' : 'body'}>{row.share}</Text>
          </View>
        ))}
        <Text variant="caption" color="textSecondary">
          {view.margin}
        </Text>
      </Card>
      <Card title="Seu reconhecimento por estado" subtitle="Estimativa da última pesquisa">
        {view.bands.map((b) => (
          <View key={b.band} style={styles.band}>
            <Text variant="heading">{b.label}</Text>
            <Text color="textSecondary">{b.ufs.join(', ')}</Text>
          </View>
        ))}
      </Card>
      {view.why.length > 0 && (
        <Card title="Por que mudou?">
          {view.why.map((line) => (
            <Text key={line}>{line}</Text>
          ))}
        </Card>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.one },
  band: { gap: Spacing.one, paddingVertical: Spacing.one },
});
