import { ROOT } from './config';
import raw from './data/ufIndex.json';

/**
 * Índice de UF sobre a caixa da quadtree (PLANO_GLOBO.md §3.2): uma grade `UF_GRID_SIZE` × `UF_GRID_SIZE` de bytes
 * (0 = fora do Brasil, 1…27 = `index` de `ufs.json`), linha 0 no norte. Gerada por `scripts/data/build_globe_climate.py`
 * (não editar à mão) a partir dos mesmos polígonos do IBGE dos tiles; vai em JSON com RLE porque o React Native não
 * decodifica PNG em memória. É lida só na CPU (monta a textura de clima uma vez por mês) e **nunca filtrada**: um ID de
 * categoria não pode ser interpolado.
 */

/** Lado da grade do índice. Deve coincidir com `GRID` do script. */
export const UF_GRID_SIZE = 256;

interface UfIndexFile {
  size: number;
  box: [number, number, number, number];
  ufs: number;
  rle: number[];
}

const FILE = raw as UfIndexFile;

/** Decodifica o RLE `[valor, repetições, …]` para a grade achatada (linha a linha, norte primeiro). */
export function decodeRle(rle: readonly number[], length: number): Uint8Array {
  const out = new Uint8Array(length);
  let at = 0;
  for (let i = 0; i + 1 < rle.length; i += 2) {
    const count = rle[i + 1];
    if (at + count > length) throw new RangeError('RLE do índice de UF maior que a grade');
    out.fill(rle[i], at, at + count);
    at += count;
  }
  if (at !== length) throw new RangeError('RLE do índice de UF menor que a grade');
  return out;
}

let cached: Uint8Array | null = null;

/** A grade do índice de UF (decodificada na primeira chamada e reaproveitada). */
export function ufIndexGrid(): Uint8Array {
  if (!cached) {
    if (FILE.size !== UF_GRID_SIZE) throw new RangeError('ufIndex.json com tamanho diferente de UF_GRID_SIZE');
    cached = decodeRle(FILE.rle, UF_GRID_SIZE * UF_GRID_SIZE);
  }
  return cached;
}

/** Índice de UF (0 = fora do Brasil) no ponto lon/lat, pelo vizinho mais próximo (sem interpolar). */
export function ufIndexAt(lon: number, lat: number, grid: Uint8Array = ufIndexGrid(), size = UF_GRID_SIZE): number {
  const x = Math.floor(((lon - ROOT.west) / (ROOT.east - ROOT.west)) * size);
  const y = Math.floor(((ROOT.north - lat) / (ROOT.north - ROOT.south)) * size);
  if (x < 0 || y < 0 || x >= size || y >= size) return 0;
  return grid[y * size + x];
}
