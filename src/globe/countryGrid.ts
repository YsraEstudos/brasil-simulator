import { decodeRle } from './climateGrid';
import { countryByIndex, type Country } from './countries';
import indexRaw from './data/countryIndex.json';

/**
 * Grade do toque nos países (PLANO_PAISES.md, P1): o mundo em células de 0,2°, linha 0 no norte, com o valor do país
 * (1…N, `Country.index`) ou 0 no mar e no Brasil (o toque no Brasil é das UFs). Gerada por
 * `scripts/data/build_countries.py`; RLE em JSON porque o React Native não decodifica PNG em memória. Lida só na CPU e
 * nunca interpolada. Fica fora de `countries.ts` para só o globo carregá-la.
 */

type IndexFile = { width: number; height: number; cellDeg: number; rle: number[] };

const INDEX = indexRaw as IndexFile;

/** Largura e altura da grade do mundo (equiretangular, linha 0 no norte) e o lado da célula em graus. */
export const COUNTRY_GRID = { width: INDEX.width, height: INDEX.height, cellDeg: INDEX.cellDeg };

let cached: Uint8Array | null = null;

/** A grade do toque (decodificada na primeira chamada e reaproveitada). 0 = mar ou Brasil. */
export function countryIndexGrid(): Uint8Array {
  cached ??= decodeRle(INDEX.rle, INDEX.width * INDEX.height);
  return cached;
}

/** Valor da grade no ponto (vizinho mais próximo, sem interpolar). */
export function countryIndexAt(lon: number, lat: number, grid: Uint8Array = countryIndexGrid()): number {
  let x = Math.floor((lon + 180) / INDEX.cellDeg);
  const y = Math.floor((90 - lat) / INDEX.cellDeg);
  if (y < 0 || y >= INDEX.height) return 0;
  x = ((x % INDEX.width) + INDEX.width) % INDEX.width; // a longitude dá a volta
  return grid[y * INDEX.width + x];
}

/** País no ponto (lon/lat), ou `null` no mar e no Brasil. */
export function countryAt(lon: number, lat: number): Country | null {
  const index = countryIndexAt(lon, lat);
  return index > 0 ? (countryByIndex(index) ?? null) : null;
}
