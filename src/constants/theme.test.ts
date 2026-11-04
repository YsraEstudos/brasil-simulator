import { describe, expect, it, vi } from 'vitest';

import { Colors, paletteFor, type ColorScheme, type ThemeColors } from './theme';

// O módulo importa `react-native` (Platform) e o CSS global: no Node basta um substituto.
vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (o: Record<string, unknown>) => o.default ?? o.web },
}));

/** Razão de contraste WCAG entre duas cores hex (#rrggbb). */
function luminance(hex: string): number {
  const [r, g, b] = hex
    .slice(1, 7)
    .match(/../g)!
    .map((pair) => parseInt(pair, 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const SCHEMES: ColorScheme[] = ['light', 'dark'];
const SEMANTIC_KEYS = ['positive', 'negative', 'positiveSoft', 'negativeSoft'] as const;

describe('paletteFor (modo para daltônicos)', () => {
  it('sem o modo, devolve a própria paleta do esquema (mesma referência)', () => {
    for (const scheme of SCHEMES) expect(paletteFor(scheme, false)).toBe(Colors[scheme]);
  });

  it('com o modo, troca só os tons de bom e ruim; o resto da paleta é igual', () => {
    for (const scheme of SCHEMES) {
      const normal = Colors[scheme];
      const blind = paletteFor(scheme, true);
      for (const key of Object.keys(normal) as (keyof ThemeColors)[]) {
        if (!(SEMANTIC_KEYS as readonly string[]).includes(key)) expect(blind[key]).toBe(normal[key]);
      }
      expect(blind.positive).not.toBe(normal.positive);
      expect(blind.negative).not.toBe(normal.negative);
    }
  });

  it('bom é azul (B domina) e ruim é laranja (R > G > B) nos dois esquemas', () => {
    for (const scheme of SCHEMES) {
      const blind = paletteFor(scheme, true);
      const [pr, , pb] = [1, 3, 5].map((i) => parseInt(blind.positive.slice(i, i + 2), 16));
      expect(pb).toBeGreaterThan(pr);
      const [nr, ng, nb] = [1, 3, 5].map((i) => parseInt(blind.negative.slice(i, i + 2), 16));
      expect(nr).toBeGreaterThan(ng);
      expect(ng).toBeGreaterThan(nb);
    }
  });

  it('texto de bom e de ruim tem contraste de pelo menos 4,5:1 sobre fundo, superfície, destaque e fundo suave', () => {
    for (const scheme of SCHEMES) {
      const blind = paletteFor(scheme, true);
      const grounds = [blind.background, blind.surface, blind.surfaceRaised];
      for (const text of [blind.positive, blind.negative]) {
        for (const ground of grounds) expect(contrast(text, ground)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(blind.positive, blind.positiveSoft)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(blind.negative, blind.negativeSoft)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
