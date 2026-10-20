import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { Colors, type ColorScheme, type TextScale, type ThemeColors } from '@/constants/theme';
import { Hud } from '@/components/painel/hudTheme';
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
 * Paleta do HUD (GAME_DESIGN.md §4.2) no formato dos tokens do sistema de design: parte de `Colors.dark` e troca o
 * azul-marinho pelo verde-escuro da mesa, a borda pela moldura dourada e o acento pelo título dourado do `Hud`.
 * Assim `Card`, `Button`, `Indicator` e `Alert` das folhas e subtelas herdam o visual do Painel sem reestilizar
 * componente por componente. Texto claro sobre superfície escura (contraste acima de 7:1); as cores semânticas
 * (positivo, negativo, aviso, info) e o espectro político seguem as do tema escuro.
 */
export const HudColors: ThemeColors = {
  ...Colors.dark,
  background: Hud.board,
  // Painel sem a transparência do HUD: os cartões das subtelas ficam sobre o fundo da mesa, não sobre o globo.
  surface: '#0c1510',
  surfaceRaised: '#162117',
  border: Hud.border,
  text: Hud.text,
  textSecondary: Hud.textDim,
  // Um passo mais claro que `Hud.textMuted`: legendas pequenas precisam de contraste (cerca de 5,5:1).
  textMuted: '#8a9380',
  accent: Hud.title,
  onAccent: Hud.board,
};

/**
 * Aplica a paleta do HUD (`HudColors`) aos filhos, mantendo a escala de texto do jogador: o Painel, suas folhas e as
 * subtelas são sempre no visual da mesa (escuro, moldura dourada) e recebem componentes do sistema de design, que
 * leem as cores por `useTheme()`. O esquema segue `dark`, para quem escolhe estilos por ele.
 */
export function ForceHudTheme({ children }: { children: ReactNode }) {
  const { textScale, setTextScale: setScale } = useTheme();
  const value = useMemo<Theme>(
    () => ({ scheme: 'dark', colors: HudColors, textScale, setTextScale: setScale }),
    [textScale, setScale],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme precisa estar dentro de <AppThemeProvider>');
  return theme;
}
