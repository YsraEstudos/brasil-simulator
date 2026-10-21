import { describe, expect, it } from 'vitest';

import { UF_GRID_SIZE } from './climateGrid';
import {
  buildClimateTexels,
  CLIMATE_TEXTURE_SIZE,
  CLOUD_FLOOR,
  CLOUD_FULL_ABOVE,
  CLOUD_GONE_BELOW,
  CLOUD_HEATMAP_OPACITY,
  cloudCover,
  cloudOffset,
  cloudOpacity,
  DROUGHT_VISIBLE_FROM,
  hasDrought,
  heavyRain,
  HEAVY_RAIN_FROM,
  HEAVY_RAIN_TO,
  type UfClimateValues,
} from './climateTexture';

// PLANO_GLOBO.md §3.2 e §4.2: textura de clima 128² RGBA (R nuvem, G seca, B chuva forte), campos contínuos suavizados,
// IDs de UF nunca borrados.

const NEUTRAL: UfClimateValues = { cloud: 0.5, dryness: 0, heavyRain: 0 };

/** Índice sintético `n`×`n` (linha 0 no norte): coluna esquerda = UF 1, direita = UF 2, as 2 linhas do sul = fora. */
function twoUfs(n: number): Uint8Array {
  const grid = new Uint8Array(n * n);
  for (let y = 0; y < n - 2; y++) for (let x = 0; x < n; x++) grid[y * n + x] = x < n / 2 ? 1 : 2;
  return grid;
}

const at = (texels: Uint8Array, size: number, x: number, row: number, channel: number) =>
  texels[(row * size + x) * 4 + channel];

describe('textura de clima: construtor', () => {
  it('tamanho, alfa e limites: 128² RGBA, alfa 255', () => {
    const t = buildClimateTexels({ values: [undefined, { cloud: 1, dryness: 1, heavyRain: 1 }, NEUTRAL] });
    expect(t).toHaveLength(CLIMATE_TEXTURE_SIZE * CLIMATE_TEXTURE_SIZE * 4);
    for (let i = 3; i < t.length; i += 4) expect(t[i]).toBe(255);
  });

  it('clima neutro: seca e chuva forte zeradas em toda a textura; a nuvem segue a normal', () => {
    const values: (UfClimateValues | undefined)[] = [undefined];
    for (let i = 1; i <= 27; i++) values.push({ cloud: cloudCover(150, 0), dryness: 0, heavyRain: heavyRain(0) });
    const t = buildClimateTexels({ values });
    let cloud = 0;
    for (let i = 0; i < t.length; i += 4) {
      expect(t[i + 1]).toBe(0);
      expect(t[i + 2]).toBe(0);
      cloud = Math.max(cloud, t[i]);
    }
    expect(cloud).toBe(Math.round(cloudCover(150, 0) * 255));
  });

  it('sem suavização cada UF fica com o seu valor exato e a divisa é nítida (ID de categoria não é borrado)', () => {
    const n = 16;
    const values: (UfClimateValues | undefined)[] = [
      undefined,
      { cloud: 0.2, dryness: 0.8, heavyRain: 0 },
      { cloud: 0.6, dryness: 0, heavyRain: 1 },
    ];
    const t = buildClimateTexels({ values, size: n, ufIndex: twoUfs(n), ufIndexSize: n, blurSigma: 0 });
    // As 2 primeiras linhas da textura (sul) são mar; da terceira em diante é terra.
    for (let row = 2; row < n; row++) {
      for (let x = 0; x < n; x++) {
        const left = x < n / 2;
        expect(at(t, n, x, row, 1)).toBe(Math.round((left ? 0.8 : 0) * 255));
        expect(at(t, n, x, row, 2)).toBe(Math.round((left ? 0 : 1) * 255));
        expect(at(t, n, x, row, 0)).toBe(Math.round((left ? 0.2 : 0.6) * 255));
      }
    }
  });

  it('a linha 0 da textura é o sul (o índice vem com o norte primeiro)', () => {
    const n = 8;
    const t = buildClimateTexels({
      values: [undefined, { cloud: 0.5, dryness: 1, heavyRain: 0 }, NEUTRAL],
      size: n,
      ufIndex: twoUfs(n),
      ufIndexSize: n,
      blurSigma: 0,
    });
    expect(at(t, n, 1, 0, 1)).toBe(0);
    expect(at(t, n, 1, 1, 1)).toBe(0);
    expect(at(t, n, 1, 2, 1)).toBe(255);
    expect(at(t, n, 1, n - 1, 1)).toBe(255);
  });

  it('suavização: transição gradual na divisa, miolo intacto e nenhum valor passa do maior de entrada', () => {
    const n = 64;
    const values: (UfClimateValues | undefined)[] = [
      undefined,
      { cloud: 0.2, dryness: 1, heavyRain: 0 },
      { cloud: 0.2, dryness: 0, heavyRain: 0 },
    ];
    const t = buildClimateTexels({ values, size: n, ufIndex: twoUfs(n), ufIndexSize: n, blurSigma: 1.5 });
    const row = 30;
    const g = (x: number) => at(t, n, x, row, 1);
    expect(g(4)).toBe(255);
    expect(g(n - 5)).toBe(0);
    const edge = [n / 2 - 2, n / 2 - 1, n / 2, n / 2 + 1].map(g);
    for (let i = 1; i < edge.length; i++) expect(edge[i]).toBeLessThan(edge[i - 1]);
    expect(g(n / 2 - 1)).toBeGreaterThan(0);
    expect(g(n / 2)).toBeLessThan(255);
  });

  it('o mar esmaece perto da terra e some longe dela', () => {
    const n = 32;
    const grid = new Uint8Array(n * n);
    for (let y = 0; y < 8; y++) for (let x = 0; x < n; x++) grid[y * n + x] = 1; // terra só no norte
    const t = buildClimateTexels({
      values: [undefined, { cloud: 1, dryness: 0, heavyRain: 0 }, NEUTRAL],
      size: n,
      ufIndex: grid,
      ufIndexSize: n,
      blurSigma: 1,
    });
    const col = 16;
    const rowOf = (imageRow: number) => n - 1 - imageRow;
    const land = at(t, n, col, rowOf(4), 0);
    const nearSea = at(t, n, col, rowOf(9), 0);
    const farSea = at(t, n, col, rowOf(28), 0);
    expect(land).toBe(255);
    expect(nearSea).toBeGreaterThan(0);
    expect(nearSea).toBeLessThan(land);
    expect(farSea).toBe(0);
  });

  it('o lado do índice precisa ser múltiplo do lado da textura', () => {
    expect(() => buildClimateTexels({ values: [], size: 100, ufIndex: new Uint8Array(1), ufIndexSize: 256 })).toThrow(
      RangeError,
    );
  });

  it('com o índice real do build: clima neutro dá G = B = 0 e nuvem só sobre o Brasil e o litoral', () => {
    const values: (UfClimateValues | undefined)[] = [undefined];
    for (let i = 1; i <= 27; i++) values.push({ cloud: 0.4, dryness: 0, heavyRain: 0 });
    const t = buildClimateTexels({ values });
    expect(UF_GRID_SIZE % CLIMATE_TEXTURE_SIZE).toBe(0);
    let lit = 0;
    for (let i = 0; i < t.length; i += 4) {
      expect(t[i + 1]).toBe(0);
      expect(t[i + 2]).toBe(0);
      if (t[i] > 0) lit++;
    }
    const share = lit / (CLIMATE_TEXTURE_SIZE * CLIMATE_TEXTURE_SIZE);
    // o Brasil ocupa ~1/4 da caixa da quadtree (48° × 48°), mais a franja de mar
    expect(share).toBeGreaterThan(0.15);
    expect(share).toBeLessThan(0.45);
  });

  it('seca num estado aparece no lugar certo do mapa real e em mais nenhum canto distante', () => {
    const values: (UfClimateValues | undefined)[] = [undefined];
    for (let i = 1; i <= 27; i++) values.push({ cloud: 0.3, dryness: i === 16 ? 1 : 0, heavyRain: 0 }); // 16 = BA
    const t = buildClimateTexels({ values });
    const size = CLIMATE_TEXTURE_SIZE;
    const texel = (lon: number, lat: number) => {
      const x = Math.floor(((lon + 76) / 48) * size);
      const row = Math.floor(((lat + 36) / 48) * size);
      return at(t, size, x, row, 1);
    };
    expect(texel(-41.7, -12.5)).toBeGreaterThan(200); // interior da Bahia
    expect(texel(-60, -3)).toBe(0); // Amazonas
    expect(texel(-47, -23)).toBe(0); // São Paulo
  });
});

describe('textura de clima: canais', () => {
  it('cobertura de nuvem: a normal do mês vezes a anomalia, entre o piso e 1', () => {
    expect(cloudCover(0, 0)).toBeCloseTo(CLOUD_FLOOR, 12);
    expect(cloudCover(300, 0)).toBeCloseTo(1, 12);
    expect(cloudCover(150, 0)).toBeGreaterThan(cloudCover(100, 0));
    expect(cloudCover(150, 0.4)).toBeGreaterThan(cloudCover(150, 0));
    expect(cloudCover(150, -0.4)).toBeLessThan(cloudCover(150, 0));
    expect(cloudCover(380, 0.6)).toBe(1);
    expect(cloudCover(0, -0.9)).toBeGreaterThanOrEqual(0);
  });

  it('chuva forte: zero até o limiar, 1 no teto do motor, monótona', () => {
    expect(heavyRain(-0.5)).toBe(0);
    expect(heavyRain(0)).toBe(0);
    expect(heavyRain(HEAVY_RAIN_FROM)).toBe(0);
    expect(heavyRain(HEAVY_RAIN_TO)).toBe(1);
    expect(heavyRain(2)).toBe(1);
    expect(heavyRain(0.3)).toBeGreaterThan(heavyRain(0.2));
  });

  it('há seca visível só a partir do piso', () => {
    const v = (dryness: number): UfClimateValues => ({ cloud: 0, dryness, heavyRain: 0 });
    expect(hasDrought([undefined, v(0), v(DROUGHT_VISIBLE_FROM / 2)])).toBe(false);
    expect(hasDrought([undefined, v(0), v(DROUGHT_VISIBLE_FROM)])).toBe(true);
    expect(hasDrought([])).toBe(false);
  });
});

describe('nuvens: abertura e deslocamento', () => {
  it('opacidade cheia longe, zero perto, 30% com mapa de calor', () => {
    expect(cloudOpacity(2.1, false)).toBe(1);
    expect(cloudOpacity(CLOUD_FULL_ABOVE, false)).toBe(1);
    expect(cloudOpacity(CLOUD_GONE_BELOW, false)).toBe(0);
    expect(cloudOpacity(0.08, false)).toBe(0); // zoom de estado
    const mid = cloudOpacity((CLOUD_FULL_ABOVE + CLOUD_GONE_BELOW) / 2, false);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(cloudOpacity(2.1, true)).toBeCloseTo(CLOUD_HEATMAP_OPACITY, 12);
    expect(cloudOpacity(0.2, true)).toBeLessThan(cloudOpacity(0.2, false));
  });

  it('o desenho muda de mês para mês e é estável para o mesmo mês', () => {
    expect(cloudOffset(7)).toEqual(cloudOffset(7));
    expect(cloudOffset(7)).not.toEqual(cloudOffset(8));
    for (const seed of [0, 1, 47, 239]) {
      for (const o of cloudOffset(seed)) {
        expect(o).toBeGreaterThanOrEqual(0);
        expect(o).toBeLessThan(1);
      }
    }
  });
});
