import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { useTheme } from '@/hooks/use-theme';

export const unstable_settings = { anchor: 'presidencia' };

const ICONS: Record<string, SymbolViewProps['name']> = {
  presidencia: { ios: 'building.columns', android: 'account_balance', web: 'account_balance' },
  painel: { ios: 'square.grid.2x2', android: 'dashboard', web: 'dashboard' },
  economia: { ios: 'chart.line.uptrend.xyaxis', android: 'trending_up', web: 'trending_up' },
  congresso: { ios: 'person.3', android: 'groups', web: 'groups' },
  noticias: { ios: 'newspaper', android: 'newspaper', web: 'newspaper' },
};

const TITLES: Record<string, string> = {
  presidencia: 'Presidência',
  painel: 'Painel',
  economia: 'Economia',
  congresso: 'Congresso',
  noticias: 'Notícias',
};

/** Abas do jogo (grupo `(tabs)`): a Presidência é a primeira, como sempre foi. */
export default function TabsLayout() {
  const { scheme, colors } = useTheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  // Tema da navegação (abas e cabeçalhos) derivado dos tokens do sistema de design.
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
      <Tabs
        screenOptions={({ route }) => ({
          title: TITLES[route.name],
          headerShown: route.name !== 'painel' && route.name !== 'design',
          tabBarIcon: ({ color, size }) => <SymbolView name={ICONS[route.name]} tintColor={color} size={size} />,
        })}>
        <Tabs.Screen name="presidencia" />
        {/* O Painel é a mesa em tela cheia: sem barra de abas, com botão de voltar dentro da própria tela. */}
        <Tabs.Screen name="painel" options={{ tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="economia" />
        <Tabs.Screen name="congresso" />
        <Tabs.Screen name="noticias" />
        {/* Vitrine do sistema de design: acessível por /design, fora da barra de abas. */}
        <Tabs.Screen name="design" options={{ href: null }} />
      </Tabs>
    </ThemeProvider>
  );
}
