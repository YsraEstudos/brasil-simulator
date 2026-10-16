import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CampaignMenu } from '@/components/campaign/CampaignMenu';
import { CampaignView } from '@/components/campaign/CampaignView';
import { Alert } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useGame } from '@/store';

export default function PresidenciaScreen() {
  const { colors } = useTheme();
  const status = useGame((s) => s.status);
  const error = useGame((s) => s.error);
  const active = useGame((s) => s.active);
  const insets = useSafeAreaInsets();
  // Em paisagem o entalhe/gaveta fica nas laterais: o conteúdo rola dentro da área segura.
  const sideInsets = { paddingLeft: Spacing.three + insets.left, paddingRight: Spacing.three + insets.right };

  if (status === 'iniciando') {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    // key: trocar entre menu e partida recria a rolagem, voltando ao topo
    <ScrollView
      key={active?.id ?? 'menu'}
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, sideInsets]}>
      {error && <Alert tone="negative" title="Algo deu errado ao salvar ou carregar" message={error} />}
      {status === 'pronto' && (active ? <CampaignView campaign={active} /> : <CampaignMenu />)}
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
});
