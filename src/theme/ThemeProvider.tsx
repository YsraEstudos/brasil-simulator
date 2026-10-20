import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { Colors, type ColorScheme, type TextScale, type ThemeColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { gameStore, useGame } from '@/store';

export interface Theme {
  scheme: ColorScheme;
  colors: ThemeColors;
  /** Multiplicador escolhido pelo jogador; o sistema ainda aplica a fonte de acessibilidade por cima. */
  textScale: TextScale;
  setTextScale: (scale: TextScale) => void;
}

const ThemeContext = createContext<Theme | null>(null);

const setTextScale = (scale: TextScale) => void gameStore.getState().setTextScale(scale);

/** Cores do esquema do sistema e escala de texto (salva nas configurações do banco). */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const scheme: ColorScheme = system === 'dark' ? 'dark' : 'light';
  const textScale = useGame((s) => s.textScale);
  const value = useMemo(() => ({ scheme, colors: Colors[scheme], textScale, setTextScale }), [scheme, textScale]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Força o esquema escuro para os filhos, mantendo a escala de texto do jogador: o Painel, suas folhas e as subtelas
 * são sempre escuros (moldura do HUD) e recebem componentes do sistema de design, que leem as cores por `useTheme()`.
 */
export function ForceDarkTheme({ children }: { children: ReactNode }) {
  const { textScale, setTextScale: setScale } = useTheme();
  const value = useMemo<Theme>(
    () => ({ scheme: 'dark', colors: Colors.dark, textScale, setTextScale: setScale }),
    [textScale, setScale],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme precisa estar dentro de <AppThemeProvider>');
  return theme;
}
