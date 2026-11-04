import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { startupCampaignId } from '@/components/menu/startupCampaign';
import { gameStore } from '@/store';
import { AppThemeProvider } from '@/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export const unstable_settings = { anchor: 'index' };

/** Tempo máximo com o splash na tela, mesmo se abrir o banco travar: o app nunca fica preso na abertura. */
const SPLASH_MAX_MS = 6000;

/** A decisão de abertura roda uma vez por abertura do app; o layout pode remontar (recarga em dev) e reusa a promessa. */
let startup: Promise<void> | null = null;
let splashHidden = false;

function hideSplash() {
  if (splashHidden) return;
  splashHidden = true;
  SplashScreen.hideAsync().catch(() => undefined);
}

/**
 * Abre o banco (migra se preciso) e carrega preferências e partidas. Com "abrir na última campanha" ligado, entra
 * direto na campanha ativa mais recente, pelo Painel; qualquer falha fica no menu. Só então o splash some, para o
 * menu não piscar antes da decisão.
 */
async function decideStartup(): Promise<void> {
  try {
    await gameStore.getState().init();
    const state = gameStore.getState();
    const id = startupCampaignId({
      status: state.status,
      openLastCampaign: state.prefs.openLastCampaign,
      campaigns: state.campaigns,
    });
    if (id !== null && (await gameStore.getState().continueCampaign(id))) router.push('/painel');
  } catch {
    // fica no menu
  }
}

/**
 * Raiz de navegação: o menu principal (`index`) abre o app em tela cheia e o jogo vive no grupo `(jogo)`
 * (Painel + subtelas, sem barra de abas). O menu fica numa pilha — e o "voltar" do Android leva de
 * volta ao menu.
 */
export default function RootLayout() {
  useEffect(() => {
    const safety = setTimeout(hideSplash, SPLASH_MAX_MS);
    startup ??= decideStartup();
    void startup.finally(() => {
      clearTimeout(safety);
      hideSplash();
    });
    return () => clearTimeout(safety);
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
