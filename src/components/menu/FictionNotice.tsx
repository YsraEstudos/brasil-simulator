import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { gameStore, useGame } from '@/store';

import { Menu } from './menuTheme';

/** Linha fixa do rodapé do menu (GAME_DESIGN.md §13). */
export const FICTION_FOOTER_TEXT = 'Simulação fictícia, sem afiliação a órgãos do governo.';

/** Texto completo da folha de abertura (GAME_DESIGN.md §13), um parágrafo por item. */
export const FICTION_NOTICE_PARAGRAPHS = [
  'Simulação fictícia e independente, sem afiliação a qualquer órgão do governo brasileiro.',
  'Personagens, partidos e notícias são fictícios. Nenhuma conduta é atribuída a pessoas reais.',
] as const;

/**
 * Folha de abertura do aviso de ficção: aparece uma vez (chave `aviso_ficcao_visto`). Só abre depois da leitura
 * inicial da store, para não piscar enquanto o banco ainda abre. "Entendi" e o botão Voltar do Android a fecham;
 * se o banco falhou, a folha fecha só em memória e não volta nesta sessão.
 */
export function FictionNotice() {
  const status = useGame((s) => s.status);
  const seen = useGame((s) => s.fictionNoticeSeen);
  const visible = status !== 'iniciando' && !seen;

  const dismiss = () => {
    void gameStore.getState().markFictionNoticeSeen();
  };

  return (
    <Modal animationType="fade" onRequestClose={dismiss} transparent visible={visible}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.sheet}>
          {FICTION_NOTICE_PARAGRAPHS.map((text) => (
            <Text key={text} style={styles.text}>
              {text}
            </Text>
          ))}
          <Pressable
            accessibilityLabel="Entendi"
            accessibilityRole="button"
            onPress={dismiss}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
            <Text style={styles.buttonLabel}>Entendi</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.three,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    gap: Spacing.three,
    padding: Spacing.four,
    borderWidth: 2,
    borderRadius: Radius.md,
    borderColor: Menu.panelBorder,
    backgroundColor: Menu.panel,
  },
  text: { color: Menu.text, fontSize: 15, lineHeight: 22 },
  button: {
    alignSelf: 'flex-end',
    minWidth: 120,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderWidth: 1.5,
    borderRadius: Radius.sm,
    borderColor: Menu.buttonBorder,
    backgroundColor: Menu.button,
  },
  buttonPressed: { borderColor: Menu.buttonBorderBright, backgroundColor: Menu.buttonPressed },
  buttonLabel: { color: Menu.text, fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
});
