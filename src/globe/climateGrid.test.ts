import { describe, expect, it } from 'vitest';

import { CITIES } from './cities';
import { decodeRle, UF_GRID_SIZE, ufIndexAt, ufIndexGrid } from './climateGrid';
import { UFS } from './ufs';

// O índice de UF vem do build (scripts/data/build_globe_climate.py) e é um ID de categoria: nunca interpolado.

describe('índice de UF do build', () => {
  const grid = ufIndexGrid();

  it('é uma grade 256² de bytes com as 27 UFs e fora do Brasil = 0', () => {
    expect(grid).toHaveLength(UF_GRID_SIZE * UF_GRID_SIZE);
    const present = new Set(grid);
    expect(present.has(0)).toBe(true);
    for (const uf of UFS) expect(present.has(uf.index), uf.sigla).toBe(true);
    expect(Math.max(...present)).toBe(27);
  });

  it('as 150 maiores cidades caem na própria UF, salvo no litoral (>= 90%)', () => {
    let ok = 0;
    for (const c of CITIES) {
      const uf = UFS.find((u) => u.sigla === c.uf)!;
      if (ufIndexAt(c.lon, c.lat) === uf.index) ok++;
    }
    expect(ok / CITIES.length).toBeGreaterThanOrEqual(0.9);
  });

  it('o oceano e os países vizinhos são 0; fora da caixa também', () => {
    expect(ufIndexAt(-30, -30)).toBe(0); // Atlântico
    expect(ufIndexAt(-65, -35)).toBe(0); // Argentina
    expect(ufIndexAt(-100, 0)).toBe(0); // fora da caixa
    expect(ufIndexAt(-50, 20)).toBe(0);
  });

  it('o DF (pequeno, dentro de GO) existe no índice e não é engolido', () => {
    expect(ufIndexAt(-47.9, -15.8)).toBe(UFS.find((u) => u.sigla === 'DF')!.index);
    expect(ufIndexAt(-49.3, -16.7)).toBe(UFS.find((u) => u.sigla === 'GO')!.index);
  });
});

describe('RLE do índice', () => {
  it('decodifica pares [valor, repetições] e recusa tamanhos que não fecham', () => {
    expect([...decodeRle([3, 2, 0, 1, 7, 3], 6)]).toEqual([3, 3, 0, 7, 7, 7]);
    expect(() => decodeRle([1, 3], 2)).toThrow(RangeError);
    expect(() => decodeRle([1, 1], 2)).toThrow(RangeError);
  });
});
