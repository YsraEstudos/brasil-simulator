import { StyleSheet, View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { initialEducation, type GameState } from '@/engine';

import { educationView } from './educationView';

/** Educação por coorte (PLANO_EXPANSAO EX-19): só lê o estado produzido pelo motor. */
export function EducationPanel({ state }: { state: GameState }) {
  // Save anterior à v23 sem o bloco: mostra o ponto de partida em vez de quebrar.
  const view = educationView(state.education ?? initialEducation());
  return (
    <Card
      title="Educação"
      subtitle="Coortes por etapa, valores PROVISÓRIOS. Políticas mudam o fluxo e a aprendizagem; o efeito no PIB vem anos depois, com quem sai da escola.">
      <Text variant="label">{view.humanCapital}</Text>
      <Text variant="caption" color="textSecondary">
        {view.humanCapitalChange}
      </Text>
      {view.stages.map((stage) => (
        <View
          key={stage.id}
          style={styles.row}
          accessible
          accessibilityLabel={`${stage.label}: ${stage.enrolled}. ${stage.flows}. ${stage.learning}`}>
          <Text variant="label">{stage.label}</Text>
          <Text variant="body" tabular>
            {stage.enrolled}
          </Text>
          <Text variant="caption" color="textSecondary" tabular>
            {stage.flows}
          </Text>
          <Text variant="caption" color="textSecondary" tabular>
            {stage.learning}
          </Text>
        </View>
      ))}
      <View style={styles.row}>
        <Text variant="label">Escolaridade da força de trabalho</Text>
        {view.workforce.map((w) => (
          <Text key={w.id} variant="caption" color="textSecondary" tabular>
            {`${w.label}: ${w.share}`}
          </Text>
        ))}
      </View>
      <View style={styles.row}>
        <Text variant="label">Alavancas do governo federal</Text>
        {view.levers.map((lever) => (
          <Text key={lever.id} variant="caption" color={lever.active ? 'text' : 'textSecondary'}>
            {`${lever.label}: ${lever.text}`}
          </Text>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.half, paddingTop: Spacing.one },
});
