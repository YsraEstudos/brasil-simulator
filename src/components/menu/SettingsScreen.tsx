import { ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Text } from '@/components/ui';
import { MaxContentWidth, Spacing, TEXT_SCALES } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { gameStore, MAP_QUALITY_AUTO, MAP_QUALITY_OPTIONS, profileLabel, useGame } from '@/store';

import { enterAt, goBack, SetupHeader } from '../campaign/SetupBits';

/**
 * CONFIGURAÇÕES (rota `/configuracoes`): ajustes do jogador fora das abas, abertos pelo botão CONFIGURAÇÕES do
 * menu principal: o tamanho do texto (o ajuste que o jogador usa para ler melhor o jogo) e a qualidade do mapa do Painel
 * (Automático ou um perfil fixo; PLANO_GLOBO.md §3.1).
 */
export function SettingsScreen() {
  const { colors, textScale, setTextScale } = useTheme();
  const insets = useSafeAreaInsets();
  const mapQuality = useGame((s) => s.mapQuality);
  const autoProfile = useGame((s) => s.autoProfile);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Spacing.three + insets.top,
            paddingBottom: Spacing.six + insets.bottom,
            paddingLeft: Spacing.three + insets.left,
            paddingRight: Spacing.three + insets.right,
          },
        ]}>
        <SetupHeader title="CONFIGURAÇÕES" subtitle="Ajustes do jogo neste aparelho" onBack={goBack} />

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

        <Animated.View entering={enterAt(1)}>
          <Card title="Qualidade do mapa" subtitle="Como o mapa do Painel é desenhado neste aparelho">
            {MAP_QUALITY_OPTIONS.map((option) => (
              <View key={option.id} style={styles.option}>
                <Button
                  label={option.label}
                  variant={option.id === mapQuality ? 'primary' : 'secondary'}
                  onPress={() => void gameStore.getState().setMapQuality(option.id)}
                  accessibilityHint={option.id === mapQuality ? 'Qualidade atual' : option.description}
                  block
                />
                <Text variant="caption" color="textSecondary">
                  {option.description}
                  {option.id === MAP_QUALITY_AUTO && mapQuality === MAP_QUALITY_AUTO
                    ? ` Agora: ${profileLabel(autoProfile)}.`
                    : ''}
                </Text>
              </View>
            ))}
            <Text variant="caption" color="textSecondary">
              Escolher um perfil desliga o ajuste automático. Se o globo 3D não iniciar, o jogo usa o mapa 2D sozinho.
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
  option: { gap: Spacing.one },
});
