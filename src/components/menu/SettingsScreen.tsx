import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Text } from '@/components/ui';
import { MaxContentWidth, Spacing, TEXT_SCALES } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { enterAt, SetupHeader } from '../campaign/SetupBits';

/** Volta ao menu principal (ou à tela anterior, se ela existir na pilha). */
function backToMenu() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * CONFIGURAÇÕES (rota `/configuracoes`): ajustes do jogador fora das abas, abertos pelo botão CONFIGURAÇÕES do
 * menu principal. Por ora, o tamanho do texto — o ajuste que o jogador usa para ler melhor o jogo.
 */
export function SettingsScreen() {
  const { colors, textScale, setTextScale } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Spacing.three + insets.top,
            paddingBottom: Spacing.six + insets.bottom,
            paddingHorizontal: Spacing.three + (insets.left + insets.right) / 2,
          },
        ]}>
        <SetupHeader title="CONFIGURAÇÕES" subtitle="Ajustes do jogo neste aparelho" onBack={backToMenu} />

        <Animated.View entering={enterAt(0)}>
          <Card title="Tamanho do texto" subtitle="Vale para todas as telas do jogo">
            <View style={styles.row}>
              {TEXT_SCALES.map((s) => (
                <Button
                  key={s}
                  label={`${Math.round(s * 100)}%`}
                  variant={s === textScale ? 'primary' : 'secondary'}
                  onPress={() => setTextScale(s)}
                  accessibilityHint={s === textScale ? 'Tamanho atual' : 'Aplicar este tamanho'}
                />
              ))}
            </View>
            <Text variant="caption" color="textSecondary">
              O ajuste de acessibilidade do sistema continua valendo por cima desta escolha.
            </Text>
          </Card>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
