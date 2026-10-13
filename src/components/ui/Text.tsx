import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { Typography, type TextVariant, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  color?: ThemeColor;
  /** Dígitos de largura fixa, para números que mudam sem "pular". */
  tabular?: boolean;
  align?: 'left' | 'center' | 'right';
};

/** Texto do jogo: escala tipográfica + escala do jogador; a fonte de acessibilidade do sistema vale por cima (limitada). */
export function Text({ variant = 'body', color = 'text', tabular, align, style, ...rest }: TextProps) {
  const { colors, textScale } = useTheme();
  const t = Typography[variant];
  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      style={[
        {
          color: colors[color],
          fontSize: t.fontSize * textScale,
          lineHeight: t.lineHeight * textScale,
          fontWeight: t.fontWeight,
          textAlign: align,
          fontVariant: tabular ? ['tabular-nums'] : undefined,
        },
        style,
      ]}
      {...rest}
    />
  );
}
