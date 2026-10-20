import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';

/** Mensagem exibida nas subtelas do Painel quando nenhuma partida está aberta. */
export function NoCampaign() {
  return (
    <View style={styles.root}>
      <Text variant="body" color="textSecondary" align="center">
        Nenhuma partida aberta. Comece ou continue uma campanha no menu principal.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: Spacing.three },
});
