import { describe, expect, it } from 'vitest';

import { buildRibbon, densify, groupRailLines, MAX_STEP_RAD, type GlobeRailLine } from './railGeometry';

const angle = (a: number[], b: number[]) =>
  Math.acos(Math.max(-1, Math.min(1, a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!)));

describe('geometria das ferrovias no globo', () => {
  it('densifica pelo grande círculo sem passo maior que o limite e mantém os extremos', () => {
    const pts = densify([
      [-50, -6],
      [-44, -2.5],
    ]);
    expect(pts.length).toBeGreaterThan(10);
    for (let i = 1; i < pts.length; i++) expect(angle(pts[i - 1]!, pts[i]!)).toBeLessThanOrEqual(MAX_STEP_RAD + 1e-9);
    for (const p of pts) expect(Math.hypot(...p)).toBeCloseTo(1, 9);
  });

  it('fita: dois vértices por ponto, dois triângulos por passo, distância crescente', () => {
    const r = buildRibbon([
      [
        [-48, -15],
        [-47, -15.5],
        [-46, -15],
      ],
    ]);
    const n = r.vertexCount / 2;
    expect(r.indices.length).toBe((n - 1) * 6);
    expect([...r.sides.slice(0, 4)]).toEqual([-1, 1, -1, 1]);
    for (let v = 2; v < r.vertexCount; v += 2) expect(r.distances[v]!).toBeGreaterThan(r.distances[v - 2]!);
    // O deslocamento lateral é tangente à esfera (perpendicular ao raio) e a esquina não vira espinho.
    for (let v = 0; v < r.vertexCount; v++) {
      const p = [...r.positions.slice(v * 3, v * 3 + 3)];
      const o = [...r.offsets.slice(v * 3, v * 3 + 3)];
      expect(Math.abs(p[0]! * o[0]! + p[1]! * o[1]! + p[2]! * o[2]!)).toBeLessThan(1e-5);
      expect(Math.hypot(...o)).toBeLessThanOrEqual(2 + 1e-6);
    }
  });

  it('agrupa por estilo para uma chamada de desenho por estilo', () => {
    const line = (key: string, color: string, opacity = 1): GlobeRailLine => ({
      key,
      path: [
        [-48, -15],
        [-47, -15],
      ],
      color,
      casing: '#000',
      widthPx: 3,
      dash: null,
      opacity,
    });
    const groups = groupRailLines([line('a', '#fff'), line('b', '#fff'), line('c', '#0f0'), line('d', '#fff', 0.4)]);
    expect(groups.map((g) => g.paths.length)).toEqual([2, 1, 1]);
    expect(buildRibbon([]).vertexCount).toBe(0);
  });
});
