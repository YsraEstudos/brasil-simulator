import { paletteFor, type ThemeColors } from '@/constants/theme';
import { Hud } from '@/components/painel/hudTheme';

/** Cores de um gráfico: o HUD do Painel é sempre escuro; a aba Economia segue o tema escolhido. */
export interface ChartPalette {
  grid: string;
  text: string;
  muted: string;
  /** Último ponto. */
  highlight: string;
  positive: string;
  negative: string;
  /** Linha sem leitura de bom ou ruim (Selic, câmbio). */
  neutral: string;
  bandFill: string;
  bandLine: string;
  /** Moldura dos botões de escolha e a do botão ligado. */
  chipBorder: string;
  chipActive: string;
}

/** Paleta do HUD. Com `colorBlind`, bom é azul e ruim é laranja, como no resto do Painel. */
export function hudChartPalette(colorBlind: boolean): ChartPalette {
  const semantic = paletteFor('dark', colorBlind);
  return {
    grid: Hud.divider,
    text: Hud.text,
    muted: Hud.textMuted,
    highlight: Hud.titleBright,
    positive: semantic.positive,
    negative: semantic.negative,
    neutral: Hud.info,
    bandFill: semantic.positiveSoft,
    bandLine: Hud.textDim,
    chipBorder: Hud.border,
    chipActive: Hud.title,
  };
}

/** Paleta das telas comuns, a partir das cores do tema (que já trazem o modo para daltônicos). */
export function themeChartPalette(colors: ThemeColors): ChartPalette {
  return {
    grid: colors.border,
    text: colors.text,
    muted: colors.textMuted,
    highlight: colors.accent,
    positive: colors.positive,
    negative: colors.negative,
    neutral: colors.info,
    bandFill: colors.positiveSoft,
    bandLine: colors.textSecondary,
    chipBorder: colors.border,
    chipActive: colors.accent,
  };
}
