import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Button, Card, Text } from '@/components/ui';
import { Spacing, TEXT_SCALES } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useGame } from '@/store';

import { enterAt } from './SetupBits';

/**
 * Presidência sem partida aberta: leva às telas próprias de NOVO JOGO e CARREGAR JOGO (o formulário de criação
 * mora só em `/novo-jogo`) e mantém aqui o ajuste do tamanho do texto.
 */
export function CampaignMenu() {
  const { textScale, setTextScale } = useTheme();
  const saved = useGame((s) => s.campaigns.length);

  return (
    <View style={styles.root}>
      <Animated.View entering={enterAt(0)}>
        <Card title="Nenhuma partida aberta" subtitle="Comece um novo mandato ou retome uma campanha salva">
          <View style={styles.row}>
            <Button label="Novo jogo" onPress={() => router.push('/novo-jogo')} />
            <Button
              label={saved > 0 ? `Carregar jogo (${saved})` : 'Carregar jogo'}
              variant="secondary"
              onPress={() => router.push('/carregar-jogo')}
            />
          </View>
        </Card>
      </Animated.View>

      <Animated.View entering={enterAt(1)} style={styles.section}>
        <Text variant="heading" color="accent">
          Tamanho do texto
        </Text>
        <View style={styles.row}>
          {TEXT_SCALES.map((s) => (
            <Button
              key={s}
              label={`${Math.round(s * 100)}%`}
              variant={s === textScale ? 'primary' : 'secondary'}
              onPress={() => setTextScale(s)}
            />
          ))}
        </View>
      </Animated.View>

      <Button label="Menu principal" variant="ghost" block onPress={() => router.navigate('/')} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.four },
  section: { gap: Spacing.two },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
