import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';

/** Mensagem exibida nas abas de acompanhamento quando nenhuma partida está aberta. */
export function NoCampaign() {
  return (
    <View style={styles.root}>
      <Text variant="body" color="textSecondary" align="center">
        Nenhuma partida aberta. Comece ou continue uma campanha na aba Presidência.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: Spacing.three },
});
