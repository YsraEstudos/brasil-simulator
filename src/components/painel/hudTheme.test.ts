import { describe, expect, it, vi } from 'vitest';

import { paletteFor } from '@/constants/theme';

import { deltaArrow, Hud, hudSentimentColor, toneColor } from './hudTheme';

// O módulo importa `react-native` (via constants/theme): no Node basta um substituto para `Platform`.
vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (o: Record<string, unknown>) => o.default ?? o.web },
}));

describe('cores do HUD por sentido (modo para daltônicos)', () => {
  it('sem o modo, bom e ruim seguem verde e vermelho, como antes', () => {
    expect(toneColor('positive')).toBe(Hud.positive);
    expect(toneColor('negative')).toBe(Hud.negative);
    expect(toneColor('positive', false)).toBe(Hud.positive);
    expect(hudSentimentColor('positive')).toBe(Hud.positive);
    expect(hudSentimentColor('negative')).toBe(Hud.negative);
    expect(hudSentimentColor('neutral')).toBe(Hud.textDim);
  });

  it('com o modo, bom é o azul do tema escuro e ruim o laranja; aviso e neutro não mudam', () => {
    const blind = paletteFor('dark', true);
    expect(toneColor('positive', true)).toBe(blind.positive);
    expect(toneColor('negative', true)).toBe(blind.negative);
    expect(toneColor('warning', true)).toBe(Hud.warning);
    expect(toneColor('neutral', true)).toBe(Hud.neutral);
    expect(hudSentimentColor('positive', true)).toBe(blind.positive);
    expect(hudSentimentColor('negative', true)).toBe(blind.negative);
    expect(hudSentimentColor('neutral', true)).toBe(Hud.textDim);
    expect(blind.positive).not.toBe(Hud.positive);
    expect(blind.negative).not.toBe(Hud.negative);
  });
});

describe('seta da variação (modo para daltônicos)', () => {
  it('▲ para alta e ▼ para queda, lendo o sinal do próprio texto', () => {
    expect(deltaArrow('+4,0 p.p.')).toBe('▲');
    expect(deltaArrow('−1,2 p.p.')).toBe('▼');
    expect(deltaArrow('-1,2%')).toBe('▼');
    expect(deltaArrow('  +0,3%')).toBe('▲');
  });

  it('sem variação ou sem texto, não há seta', () => {
    expect(deltaArrow('±0,0 p.p.')).toBe('');
    expect(deltaArrow('')).toBe('');
    expect(deltaArrow(undefined)).toBe('');
  });
});
