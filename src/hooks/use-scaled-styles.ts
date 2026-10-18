import { useMemo } from 'react';

import { scaleTypography } from '@/components/noticias/scaledTypography';

import { useTheme } from './use-theme';

/** Folha de estilos com a escala de texto do jogador (fontSize e lineHeight), recalculada só quando ela muda. */
export function useScaledStyles<T extends Record<string, object>>(styles: T): T {
  const { textScale } = useTheme();
  return useMemo(() => scaleTypography(styles, textScale), [styles, textScale]);
}
