import { describe, expect, it } from 'vitest';

import { CITIES, cityPointBuffers, cityWeight, MIN_BRIGHTNESS } from './cities';
import { pointInRing } from './geo';
import { findUf, ufBySigla } from './ufs';

// PLANO_GLOBO.md §4.3
describe('luzes das cidades: dados', () => {
  it('são ~150 municípios, sem nomes repetidos', () => {
    expect(CITIES).toHaveLength(150);
    expect(new Set(CITIES.map((c) => c.name)).size).toBe(CITIES.length);
  });

  it('todos dentro da caixa do Brasil, com população positiva e inteira', () => {
    for (const c of CITIES) {
      expect(c.lon, c.name).toBeGreaterThan(-74);
      expect(c.lon, c.name).toBeLessThan(-34);
      expect(c.lat, c.name).toBeGreaterThan(-34);
      expect(c.lat, c.name).toBeLessThan(5.5);
      expect(Number.isInteger(c.pop), c.name).toBe(true);
      expect(c.pop, c.name).toBeGreaterThan(100_000);
    }
  });

  it('estão ordenados do mais ao menos populoso', () => {
    for (let i = 1; i < CITIES.length; i++) expect(CITIES[i - 1].pop).toBeGreaterThanOrEqual(CITIES[i].pop);
    expect(CITIES[0].name).toBe('São Paulo');
    expect(CITIES[1].name).toBe('Rio de Janeiro');
  });

  it('cada sede cai na própria UF (ou a menos de ~10 km do contorno simplificado, no litoral)', () => {
    for (const c of CITIES) {
      const uf = ufBySigla(c.uf);
      expect(uf, `${c.name}: UF ${c.uf}`).toBeDefined();
      const inside = uf!.polygons.some((ring) => pointInRing(c.lon, c.lat, ring));
      if (inside) {
        expect(findUf(c.lon, c.lat)?.sigla, c.name).toBe(c.uf);
      } else {
        const near = Math.min(
          ...uf!.polygons.flatMap((ring) => ring.map(([x, y]) => Math.hypot(x - c.lon, y - c.lat))),
        );
        expect(near, c.name).toBeLessThan(0.1);
      }
    }
  });

  it('o peso é proporcional ao log da população: de MIN_BRIGHTNESS (menor) a 1 (maior)', () => {
    expect(cityWeight(CITIES[0].pop)).toBeCloseTo(1, 12);
    expect(cityWeight(CITIES.at(-1)!.pop)).toBeCloseTo(MIN_BRIGHTNESS, 12);
    const mid = cityWeight(Math.sqrt(CITIES[0].pop * CITIES.at(-1)!.pop));
    expect(mid).toBeCloseTo((1 + MIN_BRIGHTNESS) / 2, 12);
    expect(cityWeight(1)).toBe(MIN_BRIGHTNESS);
    expect(cityWeight(1e9)).toBe(1);
  });

  it('os buffers dos pontos têm uma direção unitária e um peso por cidade', () => {
    const { positions, weights } = cityPointBuffers();
    expect(positions).toHaveLength(CITIES.length * 3);
    expect(weights).toHaveLength(CITIES.length);
    for (let i = 0; i < CITIES.length; i++) {
      expect(Math.hypot(positions[3 * i], positions[3 * i + 1], positions[3 * i + 2])).toBeCloseTo(1, 5);
      expect(weights[i]).toBeGreaterThanOrEqual(MIN_BRIGHTNESS - 1e-6);
      expect(weights[i]).toBeLessThanOrEqual(1 + 1e-6);
    }
  });
});
