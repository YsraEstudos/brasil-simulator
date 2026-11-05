import { describe, expect, it } from 'vitest';

import { pointInRing } from './geo';
import { COUNTRIES, COUNTRY_ATLAS, countryById, countryByIndex } from './countries';
import { COUNTRY_GRID, countryAt, countryIndexAt, countryIndexGrid } from './countryGrid';
import { findUf } from './ufs';

// PLANO_PAISES.md §6, P1: todos os países do Natural Earth (ponto de vista do Brasil), sem o Brasil, com nome, toque e
// ficha de identidade.

/** Os anéis do contorno simplificado (`[lon, lat, …]`) como listas de pontos, para o ponto-em-polígono. */
function rings(flat: readonly number[]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
}

describe('dados gerados dos países', () => {
  it('248 unidades, sem o Brasil, com códigos únicos e índices 1…N', () => {
    expect(COUNTRIES).toHaveLength(248);
    expect(countryById('BRA')).toBeUndefined();
    expect(new Set(COUNTRIES.map((c) => c.id)).size).toBe(COUNTRIES.length);
    expect(COUNTRIES.map((c) => c.index)).toEqual(COUNTRIES.map((_, i) => i + 1));
    for (const c of COUNTRIES) expect(countryByIndex(c.index)).toBe(c);
  });

  it('todo país tem nome em português, região e um retângulo válido no atlas', () => {
    for (const c of COUNTRIES) {
      expect(c.name.trim(), c.id).not.toBe('');
      expect(c.continent, c.id).not.toBe('');
      expect(c.subregion, c.id).not.toBe('');
      const r = c.rect;
      expect(r.u0).toBeGreaterThanOrEqual(0);
      expect(r.v0).toBeGreaterThanOrEqual(0);
      expect(r.u1).toBeLessThanOrEqual(1);
      expect(r.v1).toBeLessThanOrEqual(1);
      expect(r.u1).toBeGreaterThan(r.u0);
      expect(r.v1).toBeGreaterThan(r.v0);
      expect([0, 1, 2]).toContain(r.channel);
    }
  });

  it('nomes no uso brasileiro, e não no de Portugal', () => {
    expect(countryById('VNM')?.name).toBe('Vietnã');
    expect(countryById('IRL')?.name).toBe('Irlanda');
    expect(countryById('CZE')?.name).toBe('Tchéquia');
    expect(countryById('ARG')?.name).toBe('Argentina');
    expect(countryById('USA')?.name).toBe('Estados Unidos');
  });

  it('nomes de país não se repetem (as duas metades de São Martinho têm nomes diferentes)', () => {
    const names = COUNTRIES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('os vizinhos do Brasil são os dez de sempre, com a França pela Guiana Francesa', () => {
    const neighbors = COUNTRIES.filter((c) => c.bordersBrazil)
      .map((c) => c.id)
      .sort();
    expect(neighbors).toEqual(['ARG', 'BOL', 'COL', 'FRA', 'GUY', 'PER', 'PRY', 'SUR', 'URY', 'VEN']);
  });

  it('situação: território aponta o país soberano; disputa e Antártida sem dono', () => {
    expect(countryById('GRL')).toMatchObject({ status: 'territorio', sovereign: 'Dinamarca' });
    expect(countryById('PRI')).toMatchObject({ status: 'territorio', sovereign: 'Estados Unidos' });
    expect(countryById('FLK')?.status).toBe('disputa');
    expect(countryById('FLK')?.sovereign).toBeUndefined();
    expect(countryById('TWN')?.status).toBe('disputa');
    expect(countryById('ATA')?.status).toBe('antartida');
    expect(countryById('FRA')?.status).toBe('pais');
    for (const c of COUNTRIES) if (c.status === 'territorio') expect(c.sovereign, c.id).toBeTruthy();
  });

  it('capitais oficiais onde o Natural Earth marca mais de uma', () => {
    expect(countryById('BOL')?.capital?.name).toBe('Sucre');
    expect(countryById('ARG')?.capital?.name).toBe('Buenos Aires');
    expect(countryById('ISR')?.capital?.note).toBe('status internacional em disputa');
  });

  it('distância de Brasília plausível (Buenos Aires ~2.300 km, Tóquio ~17.700 km)', () => {
    expect(countryById('ARG')?.distanceKm).toBeGreaterThan(2200);
    expect(countryById('ARG')?.distanceKm).toBeLessThan(2450);
    expect(countryById('JPN')?.distanceKm).toBeGreaterThan(17000);
    expect(countryById('JPN')?.distanceKm).toBeLessThan(18500);
  });

  it('o contorno do destaque tem anéis com pelo menos 3 pontos, e o maior contém o ponto do nome (países contínuos)', () => {
    for (const c of COUNTRIES) {
      expect(c.outline.length, c.id).toBeGreaterThan(0);
      for (const ring of c.outline) expect(ring.length, c.id).toBeGreaterThanOrEqual(6);
    }
    for (const id of ['ARG', 'DEU', 'KAZ', 'BOL', 'NGA']) {
      const c = countryById(id)!;
      expect(
        c.outline.some((r) => pointInRing(c.anchor[0], c.anchor[1], rings(r))),
        id,
      ).toBe(true);
    }
  });

  it('o atlas de campo de distância cabe na meta de memória (no máximo 512 mil pixels)', () => {
    expect(COUNTRY_ATLAS.width * COUNTRY_ATLAS.height).toBeLessThanOrEqual(1024 * 512);
    expect(COUNTRY_ATLAS.spread).toBeGreaterThan(COUNTRY_ATLAS.stroke);
  });
});

describe('grade do toque', () => {
  it('tem o tamanho declarado e só valores de países conhecidos', () => {
    const grid = countryIndexGrid();
    expect(grid.length).toBe(COUNTRY_GRID.width * COUNTRY_GRID.height);
    const max = Math.max(...COUNTRIES.map((c) => c.index));
    for (let i = 0; i < grid.length; i += 97) expect(grid[i]).toBeLessThanOrEqual(max);
  });

  it('acha o país pelas capitais e devolve nada no mar e no Brasil', () => {
    expect(countryAt(-58.38, -34.6)?.id).toBe('ARG'); // Buenos Aires
    expect(countryAt(-9.14, 38.72)?.id).toBe('PRT'); // Lisboa
    expect(countryAt(28.19, -25.75)?.id).toBe('ZAF'); // Pretória
    expect(countryAt(139.69, 35.69)?.id).toBe('JPN'); // Tóquio
    expect(countryAt(-30, -20)).toBeNull(); // Atlântico Sul
    expect(countryAt(-47.9, -15.8)).toBeNull(); // Brasília: o toque é da UF
    expect(findUf(-47.9, -15.8)?.sigla).toBe('DF');
  });

  it('enclaves por cima do país que os cerca (Lesoto dentro da África do Sul)', () => {
    expect(countryAt(28.25, -29.6)?.id).toBe('LSO');
  });

  it('a longitude dá a volta (180° e −180° são a mesma linha)', () => {
    expect(countryIndexAt(179.9, 66)).toBe(countryIndexAt(-180.1, 66));
    expect(countryIndexAt(0, 95)).toBe(0);
  });

  it('quase todo país tem célula própria (os minúsculos ficam no toque pelo nome)', () => {
    const present = new Set(countryIndexGrid());
    const missing = COUNTRIES.filter((c) => !present.has(c.index)).map((c) => c.id);
    expect(missing).toEqual(['MAF']);
  });
});
