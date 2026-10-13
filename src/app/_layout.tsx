import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import * as SplashScreen from 'expo-splash-screen';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

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
  const scheme = useColorScheme();
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Tabs
          screenOptions={({ route }) => ({
            title: TITLES[route.name],
            headerShown: route.name !== 'brasil',
            tabBarIcon: ({ color, size }) => <SymbolView name={ICONS[route.name]} tintColor={color} size={size} />,
          })}>
          <Tabs.Screen name="index" />
          <Tabs.Screen name="economia" />
          <Tabs.Screen name="congresso" />
          <Tabs.Screen name="brasil" />
          <Tabs.Screen name="noticias" />
        </Tabs>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
