import { ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Text } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useGame } from '@/store';

import { enterAt, goBack, SetupHeader } from '../campaign/SetupBits';
import { HOW_TO_PLAY_SECTIONS } from './howToPlay';

/**
 * COMO JOGAR (rota `/como-jogar`): as instruções básicas do jogo numa tela fixa, sem tutorial nem dicas. Aberta pelo
 * cartão "Instruções básicas" em Configurações. O texto mora em `howToPlay.ts`, para o tutorial da Fase 10 reaproveitar.
 */
export function HowToPlayScreen() {
  const { colors } = useTheme();
  const reduceMotion = useGame((s) => s.reduceMotion);
  const insets = useSafeAreaInsets();

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
        <SetupHeader title="COMO JOGAR" subtitle="Instruções básicas, em resumo" onBack={goBack} />

        {HOW_TO_PLAY_SECTIONS.map((section, index) => (
          <Animated.View key={section.id} entering={reduceMotion ? undefined : enterAt(index)}>
            <Card title={section.title}>
              {section.paragraphs.map((paragraph) => (
                <Text key={paragraph} variant="body" color="textSecondary">
                  {paragraph}
                </Text>
              ))}
            </Card>
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
});
