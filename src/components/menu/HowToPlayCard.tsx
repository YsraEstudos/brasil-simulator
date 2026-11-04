import { router } from 'expo-router';

import { Button, Card, Text } from '@/components/ui';

/**
 * Cartão "Instruções básicas" (para as Configurações): leva à tela COMO JOGAR (`/como-jogar`), onde as regras
 * básicas ficam sempre à mão.
 */
export function HowToPlayCard() {
  return (
    <Card title="Instruções básicas" subtitle="Objetivo, Painel, mês, subtelas e salvamento">
      <Button
        label="Rever instruções básicas"
        onPress={() => router.push('/como-jogar')}
        accessibilityHint="Abre a tela com o resumo de como jogar"
        block
      />
      <Text variant="caption" color="textSecondary">
        Um resumo do jogo, sem tutorial: releia quando quiser.
      </Text>
    </Card>
  );
}
