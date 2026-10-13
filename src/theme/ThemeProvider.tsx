import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { Colors, type ColorScheme, type TextScale, type ThemeColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export interface Theme {
  scheme: ColorScheme;
  colors: ThemeColors;
  /** Multiplicador escolhido pelo jogador; o sistema ainda aplica a fonte de acessibilidade por cima. */
  textScale: TextScale;
  setTextScale: (scale: TextScale) => void;
}

const ThemeContext = createContext<Theme | null>(null);

/** Fornece cores do esquema do sistema e a escala de texto (persistida nas configurações a partir do item 10). */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const scheme: ColorScheme = system === 'dark' ? 'dark' : 'light';
  const [textScale, setTextScale] = useState<TextScale>(1);
  const value = useMemo(() => ({ scheme, colors: Colors[scheme], textScale, setTextScale }), [scheme, textScale]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme precisa estar dentro de <AppThemeProvider>');
  return theme;
}
