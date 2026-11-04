import { ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Text } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useGame } from '@/store';

import { enterAt, goBack, SetupHeader } from '../campaign/SetupBits';
import { CHANGELOG } from './changelog';

/** HISTÓRICO (rota `/historico`): as versões do jogo, abertas ao tocar no número da versão no menu principal. */
export function ChangelogScreen() {
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
        <SetupHeader title="HISTÓRICO" subtitle="O que mudou em cada versão" onBack={goBack} />

        {CHANGELOG.map((entry, i) => (
          <Animated.View key={entry.version} entering={reduceMotion ? undefined : enterAt(i)}>
            <Card title={`Versão ${entry.version}`} subtitle={entry.date}>
              {entry.items.map((item) => (
                <Text key={item} variant="body" color="textSecondary">
                  {`• ${item}`}
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
