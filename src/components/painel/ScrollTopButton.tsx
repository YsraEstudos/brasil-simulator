import { Pressable, StyleSheet } from 'react-native';
import { Text } from '@/components/ui';
import { Hud } from './hudTheme';

export function ScrollTopButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Voltar ao topo" onPress={onPress} style={styles.button}>
      <Text style={styles.label}>↑ Topo</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-end',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    backgroundColor: Hud.board,
    borderRadius: 8,
  },
  label: { color: Hud.title, fontWeight: '700' },
});
