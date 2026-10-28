import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Alert, Button, Card, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { GameContent, GameState } from '@/engine';
import { gameStore, useGame } from '@/store';

import { CareerElectionCard } from './CareerElectionCard';
import { careerCampaignSummary } from './careerElectionView';

export interface CareerCampaignReportProps {
  state: GameState;
  content: GameContent;
}

/**
 * Fim da campanha pela derrota na eleição (PLANO_CAMPANHA.md Fase C5, tarefa C5.2; D-C18 na recomendação "encerrar
 * com resumo útil e oferecer recomeçar"): o resultado nacional e por estado, os principais fatores, as escolhas com
 * mais efeito e o que não dependeu do jogador. Duas saídas: tentar de novo com a mesma candidatura ou outro jogo.
 */
export function CareerCampaignReport({ state, content }: CareerCampaignReportProps) {
  const busy = useGame((s) => s.busy);
  const [error, setError] = useState<string | null>(null);
  const summary = careerCampaignSummary(state, content);
  if (!summary) return null;

  const retry = async (mode: 'same' | 'new') => {
    setError(null);
    const r = await gameStore.getState().retryCareer(mode);
    if (r.ok) router.replace('/painel');
    else setError(r.error);
  };

  return (
    <View style={styles.root}>
      <Alert
        tone="negative"
        title="A campanha terminou na eleição"
        message="Ficção: a candidatura não venceu. O resumo abaixo mostra o resultado e o que pesou na disputa."
      />
      <CareerElectionCard view={summary.election} />
      <Card title="Principais fatores">
        {summary.factors.map((line) => (
          <Text key={line}>{line}</Text>
        ))}
      </Card>
      <Card title="Suas escolhas que mais pesaram">
        {summary.choices.map((line) => (
          <Text key={line}>{line}</Text>
        ))}
      </Card>
      <Card title="O que não dependeu de você">
        {summary.external.map((line) => (
          <Text key={line} color="textSecondary">
            {line}
          </Text>
        ))}
      </Card>
      <Card title="E agora?" subtitle="A partida perdida continua salva em CARREGAR JOGO.">
        {error && <Text color="negative">{error}</Text>}
        <Button
          label="Repetir com a mesma semente"
          onPress={() => void retry('same')}
          loading={busy}
          block
          accessibilityHint="Recomeça com a configuração e a semente originais"
        />
        <Button
          label="Tentar com outra semente"
          variant="secondary"
          onPress={() => void retry('new')}
          loading={busy}
          block
          accessibilityHint="Mantém a configuração original e sorteia outra semente"
        />
        <Button label="Outro jogo" variant="secondary" onPress={() => router.replace('/novo-jogo')} block />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.four },
});
