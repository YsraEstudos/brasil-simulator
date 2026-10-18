/**
 * Escala do texto escolhida pelo jogador aplicada a uma folha de estilos própria (jornal e redes da mesa de
 * notícias): multiplica `fontSize` e `lineHeight`, como o `Text` do sistema de design faz. Função pura, sem React.
 */
export function scaleTypography<T extends Record<string, object>>(styles: T, scale: number): T {
  if (scale === 1) return styles;
  const out: Record<string, object> = {};
  for (const [key, style] of Object.entries(styles)) {
    const { fontSize, lineHeight } = style as { fontSize?: unknown; lineHeight?: unknown };
    out[key] = {
      ...style,
      ...(typeof fontSize === 'number' && { fontSize: fontSize * scale }),
      ...(typeof lineHeight === 'number' && { lineHeight: lineHeight * scale }),
    };
  }
  return out as T;
}
