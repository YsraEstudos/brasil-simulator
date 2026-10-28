import { StyleSheet, View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';

import type { CareerElectionViewModel } from './careerElectionView';

export interface CareerElectionCardProps {
  view: CareerElectionViewModel;
}

/**
 * Resultado da eleição (PLANO_CAMPANHA.md Fase C5): os percentuais dos válidos em cada turno, do mais ao menos votado,
 * onde o jogador foi o mais votado e, se houve, o desempate. Só leitura do resultado gravado.
 */
export function CareerElectionCard({ view }: CareerElectionCardProps) {
  return (
    <Card title={view.title} subtitle={view.subtitle}>
      {view.rounds.map((round) => (
        <View key={round.title} style={styles.round}>
          <Text variant="label">{round.title}</Text>
          {round.rows.map((row) => (
            <View
              key={row.id}
              style={styles.row}
              accessibilityLabel={`${row.name}: ${row.share} dos válidos, ${row.votes}${row.winner ? ', eleita' : ''}`}>
              <Text variant={row.player ? 'heading' : 'body'}>
                {row.name}
                {row.winner ? ' ✓' : ''}
              </Text>
              <Text variant={row.player ? 'heading' : 'body'}>{row.share}</Text>
            </View>
          ))}
          <Text variant="caption" color="textSecondary">
            {round.turnout}
          </Text>
        </View>
      ))}
      {[...view.ufSummary, ...view.tiebreaks, ...(view.pollVsResult ? [view.pollVsResult] : [])].map((line) => (
        <Text key={line} color="textSecondary">
          {line}
        </Text>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  round: { gap: Spacing.one, paddingVertical: Spacing.one },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.half },
});
