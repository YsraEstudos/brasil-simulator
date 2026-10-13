import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

/** Tela provisória para áreas que serão implementadas nas próximas fases. */
export function PlaceholderScreen({ title, phase }: { title: string; phase: string }) {
  return (
    <ThemedView style={styles.root}>
      <ThemedText type="subtitle">{title}</ThemedText>
      <ThemedText themeColor="textSecondary">Em construção — {phase}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
});
