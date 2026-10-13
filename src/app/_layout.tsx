import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import * as SplashScreen from 'expo-splash-screen';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useTheme } from '@/hooks/use-theme';
import { AppThemeProvider } from '@/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync();

// Enquanto o protótipo do globo é a única tela pronta, o app abre nele.
export const unstable_settings = { initialRouteName: 'brasil' };

const ICONS: Record<string, SymbolViewProps['name']> = {
  index: { ios: 'building.columns', android: 'account_balance', web: 'account_balance' },
  economia: { ios: 'chart.line.uptrend.xyaxis', android: 'trending_up', web: 'trending_up' },
  congresso: { ios: 'person.3', android: 'groups', web: 'groups' },
  brasil: { ios: 'globe.americas', android: 'public', web: 'public' },
  noticias: { ios: 'newspaper', android: 'newspaper', web: 'newspaper' },
};

const TITLES: Record<string, string> = {
  index: 'Presidência',
  economia: 'Economia',
  congresso: 'Congresso',
  brasil: 'Brasil',
  noticias: 'Notícias',
};

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppThemeProvider>
        <AppTabs />
      </AppThemeProvider>
    </GestureHandlerRootView>
  );
}

function AppTabs() {
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
          headerShown: route.name !== 'brasil' && route.name !== 'design',
          tabBarIcon: ({ color, size }) => <SymbolView name={ICONS[route.name]} tintColor={color} size={size} />,
        })}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="economia" />
        <Tabs.Screen name="congresso" />
        <Tabs.Screen name="brasil" />
        <Tabs.Screen name="noticias" />
        {/* Vitrine do sistema de design: acessível por /design, fora da barra de abas. */}
        <Tabs.Screen name="design" options={{ href: null }} />
      </Tabs>
    </ThemeProvider>
  );
}
