/**
 * Tokens do sistema de design. Identidade: azul-marinho institucional + dourado (a mesma do globo),
 * com cores semânticas para indicadores. Componentes nunca usam cores literais: sempre `colors.<token>`.
 */

import '@/global.css';

import { Platform } from 'react-native';

export type ColorScheme = 'light' | 'dark';

const palette = {
  navy950: '#05070f',
  navy900: '#0b1020',
  navy850: '#111830',
  navy800: '#18213d',
  navy700: '#26314f',
  navy500: '#5b6685',
  navy300: '#a9b1c3',
  paper50: '#fbfaf6',
  paper100: '#f4f1e8',
  paper200: '#e9e4d6',
  paper300: '#d8d1bf',
  ink900: '#141826',
  ink600: '#4b5268',
  gold300: '#ffe27a',
  gold500: '#e0b43a',
  gold700: '#8a6a12',
  green400: '#5fd38d',
  green700: '#1e7a46',
  red400: '#ff7b72',
  red500: '#d95447',
  red700: '#b3261e',
  amber400: '#ffb547',
  amber700: '#9a5b00',
  blue400: '#7cb7ff',
  blue500: '#6f9fe0',
  blue700: '#1f5fae',
  // Modo para daltônicos: positivo azul, negativo laranja (ver COLOR_BLIND_TONES).
  blue800: '#1d5aa6',
  orange400: '#ff8a3d',
  orange700: '#a84400',
  blueSoft50: '#e2edf9',
  orangeSoft50: '#fbe9d6',
  blueSoft900: '#0f2238',
  orangeSoft900: '#3a2110',
} as const;

export interface ThemeColors {
  /** Fundo da tela */
  background: string;
  /** Superfície de cartões */
  surface: string;
  /** Superfície em destaque (selecionado, pressionado) */
  surfaceRaised: string;
  border: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  /** Cor da marca (dourado) */
  accent: string;
  /** Texto sobre `accent` */
  onAccent: string;
  positive: string;
  negative: string;
  warning: string;
  info: string;
  /** Fundos suaves para alertas */
  positiveSoft: string;
  negativeSoft: string;
  warningSoft: string;
  infoSoft: string;
  /** Espectro político do hemiciclo do Congresso (esquerda, centro, direita). */
  spectrumLeft: string;
  spectrumCenter: string;
  spectrumRight: string;
}

export const Colors: Record<ColorScheme, ThemeColors> = {
  light: {
    background: palette.paper100,
    surface: palette.paper50,
    surfaceRaised: palette.paper200,
    border: palette.paper300,
    text: palette.ink900,
    textSecondary: palette.ink600,
    textMuted: palette.navy500,
    accent: palette.gold700,
    onAccent: palette.paper50,
    positive: palette.green700,
    negative: palette.red700,
    warning: palette.amber700,
    info: palette.blue700,
    positiveSoft: '#e3f3e8',
    negativeSoft: '#fbe6e4',
    warningSoft: '#fdf0d9',
    infoSoft: '#e2edf9',
    spectrumLeft: palette.red700,
    spectrumCenter: palette.gold700,
    spectrumRight: palette.blue700,
  },
  dark: {
    background: palette.navy950,
    surface: palette.navy900,
    surfaceRaised: palette.navy800,
    border: palette.navy700,
    text: palette.paper100,
    textSecondary: palette.navy300,
    textMuted: palette.navy500,
    accent: palette.gold300,
    onAccent: palette.navy950,
    positive: palette.green400,
    negative: palette.red400,
    warning: palette.amber400,
    info: palette.blue400,
    positiveSoft: '#0f2a1d',
    negativeSoft: '#331617',
    warningSoft: '#33240c',
    infoSoft: '#0f2238',
    spectrumLeft: palette.red500,
    spectrumCenter: palette.gold500,
    spectrumRight: palette.blue500,
  },
};

/**
 * Modo para daltônicos: troca só os tons de bom/ruim. O positivo vira azul e o negativo laranja, para o sentido não
 * depender de distinguir verde de vermelho (a forma de deuteranopia e protanopia mais comum). Os alertas de aviso
 * (âmbar) e de informação (azul) seguem como estão, e a direção vem sempre com sinal `+`/`−` e seta (ver Indicator).
 *
 * Contraste WCAG medido (texto sobre o fundo e sobre a superfície elevada do mesmo tema; o mínimo é 4,5:1):
 * - claro: azul `#1d5aa6` 6,1:1 sobre `#f4f1e8`, 6,6:1 sobre `#fbfaf6`, 5,4:1 sobre `#e9e4d6`;
 *   laranja `#a84400` 5,3:1, 5,8:1 e 4,7:1 nos mesmos fundos. Sobre os fundos suaves (`#e2edf9` e `#fbe9d6`): 5,8:1 e 5,1:1.
 * - escuro: azul `#7cb7ff` 9,7:1 sobre `#05070f`, 9,1:1 sobre `#0b1020`, 7,6:1 sobre `#18213d`;
 *   laranja `#ff8a3d` 8,6:1, 8,1:1 e 6,8:1 nos mesmos fundos. Sobre os fundos suaves (`#0f2238` e `#3a2110`): 7,7:1 e 6,4:1.
 */
const COLOR_BLIND_TONES: Record<
  ColorScheme,
  Pick<ThemeColors, 'positive' | 'negative' | 'positiveSoft' | 'negativeSoft'>
> = {
  light: {
    positive: palette.blue800,
    negative: palette.orange700,
    positiveSoft: palette.blueSoft50,
    negativeSoft: palette.orangeSoft50,
  },
  dark: {
    positive: palette.blue400,
    negative: palette.orange400,
    positiveSoft: palette.blueSoft900,
    negativeSoft: palette.orangeSoft900,
  },
};

/**
 * Tokens de cor do esquema escolhido, com a variante para daltônicos quando `colorBlind` for verdadeiro. Função pura:
 * quem lê a preferência é o provedor de tema. Sem o modo, devolve o próprio `Colors[scheme]` (mesma referência).
 */
export function paletteFor(scheme: ColorScheme, colorBlind: boolean): ThemeColors {
  return colorBlind ? { ...Colors[scheme], ...COLOR_BLIND_TONES[scheme] } : Colors[scheme];
}

export type ThemeColor = keyof ThemeColors;

/** Escala de tipografia (tamanho e entrelinha em pt, antes da escala de texto do jogador). */
export const Typography = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  /** Números grandes de indicadores */
  number: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
} as const;

export type TextVariant = keyof typeof Typography;

export { TEXT_SCALES, type TextScale } from './textScale';

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'ui-serif', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', serif: 'serif', rounded: 'normal', mono: 'monospace' },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/** Alvo mínimo de toque (acessibilidade Android/iOS). */
export const MIN_TOUCH = 48;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
