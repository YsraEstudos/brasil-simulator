import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { View } from 'react-native';

import { GameConfirmHost } from '@/components/campaign/GameConfirmHost';
import { Hud } from '@/components/painel/hudTheme';
import { usePlayTime } from '@/hooks/use-play-time';
import { useTheme } from '@/hooks/use-theme';

/** O Painel (globo) é a casa do jogo: abrir a partida cai nele e o "voltar" das subtelas retorna a ele. */
export const unstable_settings = { anchor: 'painel' };

/**
 * Telas do jogo (grupo `(jogo)`), numa pilha sem cabeçalho e sem barra de abas: o Painel é a âncora e Gabinete,
 * Congresso, Economia, Notícias, Legado e Linha do tempo sobem sobre ele como subtelas, com o próprio botão "Voltar ao Painel".
 */
export default function JogoLayout() {
  const { scheme, colors } = useTheme();
  // Tempo de jogo: conta toques nas telas do jogo sem capturá-los (onTouchStart não bloqueia).
  const { onActivity } = usePlayTime();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  // Tema da navegação derivado dos tokens do sistema de design.
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.accent,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.negative,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <View style={{ flex: 1 }} onTouchStart={onActivity}>
        {/* Fundo escuro da mesa nas transições: sem piscar branco entre o Painel e as subtelas. */}
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Hud.board } }}>
          <Stack.Screen name="painel" />
          <Stack.Screen name="gabinete" options={{ animation: 'fade_from_bottom' }} />
          <Stack.Screen name="congresso" options={{ animation: 'fade_from_bottom' }} />
          <Stack.Screen name="economia" options={{ animation: 'fade_from_bottom' }} />
          <Stack.Screen name="noticias" options={{ animation: 'fade' }} />
          <Stack.Screen name="legado" options={{ animation: 'fade' }} />
          <Stack.Screen name="linha-do-tempo" options={{ animation: 'fade' }} />
        </Stack>
        {/* Confirmações (decisões irreversíveis, limpar a agenda) por cima de qualquer tela do jogo. */}
        <GameConfirmHost />
      </View>
    </ThemeProvider>
  );
}
