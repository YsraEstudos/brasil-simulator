import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { gameStore } from '@/store';
import { AppThemeProvider } from '@/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export const unstable_settings = { anchor: 'index' };

/**
 * Raiz de navegação: o menu principal (`index`) abre o app em tela cheia e o jogo vive no grupo `(jogo)`
 * (Painel + subtelas, sem barra de abas). O menu fica numa pilha — e o "voltar" do Android leva de
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
          <Stack.Screen name="(jogo)" options={{ animation: 'fade' }} />
          {/* Fluxos de campanha fora do jogo: sobem suavemente sobre o menu e voltam a ele. */}
          <Stack.Screen name="novo-jogo" options={{ animation: 'fade_from_bottom' }} />
          <Stack.Screen name="tutorial" options={{ animation: 'fade_from_bottom' }} />
          <Stack.Screen name="carregar-jogo" options={{ animation: 'fade_from_bottom' }} />
          {/* Ajustes do jogador, abertos pelo menu principal. */}
          <Stack.Screen name="configuracoes" options={{ animation: 'fade_from_bottom' }} />
          {/* Vitrine do sistema de design (/design): ferramenta de desenvolvimento, fora do fluxo do jogo. */}
          <Stack.Screen name="design" />
        </Stack>
      </AppThemeProvider>
    </GestureHandlerRootView>
  );
}
