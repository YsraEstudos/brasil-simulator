import type { ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Alert } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useGame, type ActiveCampaign } from '@/store';

import { NoCampaign } from './NoCampaign';

/**
 * Esqueleto das abas de acompanhamento (Economia, Congresso, Notícias): carregamento, aviso de erro,
 * mensagem sem partida e rolagem que volta ao topo ao trocar de partida.
 */
export function TabScreen({ render }: { render: (campaign: ActiveCampaign) => ReactNode }) {
  const { colors } = useTheme();
  const status = useGame((s) => s.status);
  const error = useGame((s) => s.error);
  const active = useGame((s) => s.active);

  if (status === 'iniciando') {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  const alert = error ? <Alert tone="negative" title="Algo deu errado ao salvar ou carregar" message={error} /> : null;

  if (!active) {
    return (
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.content, styles.fill]}>
        {alert}
        <NoCampaign />
      </ScrollView>
    );
  }

  return (
    // key: trocar de partida recria a rolagem, voltando ao topo
    <ScrollView key={active.id} style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      {alert}
      {render(active)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  fill: { flexGrow: 1, justifyContent: 'center' },
});
