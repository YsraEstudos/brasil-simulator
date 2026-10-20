import { SymbolView } from 'expo-symbols';
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ForceHudTheme } from '@/theme/ThemeProvider';

import { HudPanel } from './HudBits';
import { Hud } from './hudTheme';

/**
 * Detalhe de um painel da mesa (GAME_DESIGN.md §4.2): a folha sobe por cima do globo com fundo escurecido e
 * moldura dourada — a mesa não rola; cada botão abre exatamente a informação que precisa. Fecha no ✕, no toque
 * fora, e ao navegar para outra tela. O conteúdo usa sempre a paleta do HUD (`ForceHudTheme`), para aceitar
 * componentes do sistema de design (`Indicator`, `MonthSummary`…) sem destoar do HUD.
 */
export function InfoSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { height } = useWindowDimensions();
  // `useState` com inicializador: o valor animado é estável como um ref, mas pode ser lido no render (regras do lint).
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [anim]);

  const close = () => {
    Animated.timing(anim, { toValue: 0, duration: 190, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished) onClose();
      },
    );
  };

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [Math.max(height * 0.6, 320), 0] });
  const backdropOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropOpacity }]}>
        <Pressable
          style={styles.backdrop}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Fechar o painel"
        />
      </Animated.View>
      <View pointerEvents="box-none" style={styles.holder}>
        <Animated.View style={[styles.sheet, { maxHeight: height * 0.88, transform: [{ translateY }] }]}>
          <HudPanel
            title={title}
            accessory={<CloseButton onPress={close} />}
            style={styles.panel}
            bodyStyle={styles.panelBody}>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}>
              <ForceHudTheme>{children}</ForceHudTheme>
            </ScrollView>
          </HudPanel>
        </Animated.View>
      </View>
    </View>
  );
}

function CloseButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel="Fechar">
      {({ pressed }) => (
        <SymbolView
          name={{ ios: 'xmark', android: 'close', web: 'close' }}
          tintColor={pressed ? Hud.titleBright : Hud.textDim}
          size={13}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000099' },
  holder: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', padding: 10 },
  sheet: { width: '100%', maxWidth: 560 },
  panel: { flexShrink: 1 },
  panelBody: { padding: 0, flexShrink: 1 },
  scroll: { flexShrink: 1 },
  scrollContent: { padding: 10, gap: 8, paddingBottom: 14 },
});
