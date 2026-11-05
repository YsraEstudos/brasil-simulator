import { describe, expect, it } from 'vitest';

import { CAMERA } from './config';
import { countryById } from './countries';
import { BORDER_LINES, borderRadius, borderSegments, outlineSegments, polylineSegments } from './countryBorders';
import { labelRadius } from './labelLayout';

// PLANO_PAISES.md §6, P1 e D-P2: fronteiras numa malha de linhas só, sem regerar os tiles.

describe('fronteiras', () => {
  it('cada polilinha vira (pontos − 1) segmentos, cada um com dois vértices unitários', () => {
    const segments = polylineSegments([[0, 0, 10, 0, 10, 10]]);
    expect(segments.length).toBe(2 * 2 * 3);
    for (let i = 0; i < segments.length; i += 3) {
      expect(Math.hypot(segments[i], segments[i + 1], segments[i + 2])).toBeCloseTo(1, 6);
    }
  });

  it('anel fechado ganha o segmento de volta ao início', () => {
    expect(polylineSegments([[0, 0, 10, 0, 10, 10]], true).length).toBe(3 * 2 * 3);
  });

  it('as fronteiras do mundo cabem numa chamada de desenho modesta (menos de 30 mil vértices)', () => {
    const vertices = borderSegments().length / 3;
    expect(BORDER_LINES.length).toBeGreaterThan(300);
    expect(vertices).toBeLessThan(30_000);
  });

  it('o contorno do país selecionado sai do contorno simplificado', () => {
    const arg = countryById('ARG')!;
    const points = arg.outline.reduce((s, r) => s + r.length / 2, 0);
    expect(outlineSegments(arg).length).toBe(points * 2 * 3);
  });

  it('a linha flutua acima da esfera e abaixo dos rótulos, em toda a faixa da câmera', () => {
    for (const altitude of [CAMERA.minAltitude, 0.3, CAMERA.maxAltitude]) {
      expect(borderRadius(altitude)).toBeGreaterThan(1);
      expect(borderRadius(altitude)).toBeLessThan(labelRadius(altitude));
    }
  });
});
