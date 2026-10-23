import { describe, expect, it } from 'vitest';

import { findUf, UFS } from '@/globe/ufs';

import { buildFlatMap, flatMap, SIMPLIFY_TOLERANCE, simplifyRing } from './flatProjection';

// Mapa 2D (PLANO_GLOBO.md §3.4): 27 paths estáticos num viewBox fixo.

const numbers = (d: string) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

describe('projeção plana', () => {
  const map = flatMap();

  it('a inversa da projeção devolve o centróide e o toque nele acha a UF', () => {
    for (const uf of map.ufs) {
      const [lon, lat] = map.unproject(uf.centroid);
      const original = UFS.find((u) => u.sigla === uf.sigla)!;
      expect(lon).toBeCloseTo(original.centroid[0], 6);
      expect(lat).toBeCloseTo(original.centroid[1], 6);
    }
    const ba = map.ufs.find((u) => u.sigla === 'BA')!;
    expect(findUf(...map.unproject(ba.centroid))?.sigla).toBe('BA');
  });

  it('27 paths não vazios, um por UF, com o DF por último (por cima de GO)', () => {
    expect(map.ufs).toHaveLength(27);
    expect(new Set(map.ufs.map((u) => u.sigla)).size).toBe(27);
    for (const uf of map.ufs) {
      expect(uf.d.length).toBeGreaterThan(10);
      expect(uf.d.startsWith('M')).toBe(true);
      expect(uf.d.endsWith('Z')).toBe(true);
    }
    const order = map.ufs.map((u) => u.sigla);
    expect(order.at(-1)).toBe('DF');
    expect(order.indexOf('GO')).toBeLessThan(order.indexOf('DF'));
  });

  it('todas as coordenadas ficam dentro do viewBox, e os centroides também', () => {
    const { width, height } = map.viewBox;
    for (const uf of map.ufs) {
      const n = numbers(uf.d);
      expect(n.length % 2).toBe(0);
      for (let i = 0; i < n.length; i += 2) {
        expect(n[i]).toBeGreaterThanOrEqual(0);
        expect(n[i]).toBeLessThanOrEqual(width);
        expect(n[i + 1]).toBeGreaterThanOrEqual(0);
        expect(n[i + 1]).toBeLessThanOrEqual(height);
      }
      expect(uf.centroid.x).toBeGreaterThan(0);
      expect(uf.centroid.x).toBeLessThan(width);
      expect(uf.centroid.y).toBeGreaterThan(0);
      expect(uf.centroid.y).toBeLessThan(height);
    }
  });

  it('determinístico e memoizado', () => {
    expect(flatMap()).toBe(map);
    expect(buildFlatMap(UFS).ufs.map((u) => u.d)).toEqual(buildFlatMap(UFS).ufs.map((u) => u.d));
  });

  it('simplificação: menos de 4000 vértices no total, sem perder UFs nem ilhas', () => {
    expect(map.stats.verticesAfter).toBeLessThan(4000);
    expect(map.stats.verticesAfter).toBeLessThan(map.stats.verticesBefore);
    expect(map.ufs.reduce((s, u) => s + u.vertices, 0)).toBe(map.stats.verticesAfter);
    // Cada anel (inclusive ilhas de PA, MA…) continua separado: um `M` por anel.
    const rings = (sigla: string) => (map.ufs.find((u) => u.sigla === sigla)?.d.match(/M/g) ?? []).length;
    for (const uf of UFS) expect(rings(uf.sigla)).toBe(uf.polygons.length);
  });

  it('geografia: o norte fica acima do sul e o leste à direita do oeste', () => {
    const at = (s: string) => map.ufs.find((u) => u.sigla === s)!.centroid;
    expect(at('RR').y).toBeLessThan(at('RS').y);
    expect(at('AC').x).toBeLessThan(at('PE').x);
  });

  it('Douglas-Peucker: tira pontos colineares, mantém o formato e nunca devolve menos de 3 pontos', () => {
    const rect = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 20 },
      { x: 0, y: 20 },
    ];
    expect(simplifyRing(rect, SIMPLIFY_TOLERANCE)).toHaveLength(4);
    const tri = [
      { x: 0, y: 0 },
      { x: 0.1, y: 0 },
      { x: 0, y: 0.1 },
      { x: 0.05, y: 0.05 },
    ];
    expect(simplifyRing(tri, 100).length).toBeGreaterThanOrEqual(3);
  });
});
