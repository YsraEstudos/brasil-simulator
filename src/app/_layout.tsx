import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { gameStore } from '@/store';
import { AppThemeProvider } from '@/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export const unstable_settings = { initialRouteName: 'index' };

/**
 * Raiz de navegação: o menu principal (`index`) abre o app em tela cheia e o jogo vive no grupo `(tabs)`,
 * com as abas de sempre. Como o menu não é uma aba, ele fica numa pilha — e o "voltar" do Android leva de
 * volta ao menu.
 */
export default function RootLayout() {
  useEffect(() => {
    // Abre o banco (migra se preciso) e carrega preferências e partidas salvas.
    void gameStore
      .getState()
      .init()
      .finally(() => SplashScreen.hideAsync());
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppThemeProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          {/* Entrar no jogo é uma transição de abertura de jogo: esmaece em vez de deslizar. */}
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
          {/* Fluxos de campanha fora das abas: sobem suavemente sobre o menu e voltam a ele. */}
          <Stack.Screen name="novo-jogo" options={{ animation: 'fade_from_bottom' }} />
          <Stack.Screen name="carregar-jogo" options={{ animation: 'fade_from_bottom' }} />
        </Stack>
      </AppThemeProvider>
    </GestureHandlerRootView>
  );
}
