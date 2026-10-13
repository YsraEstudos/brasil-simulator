/**
 * Parâmetros do globo. ROOT, MAX_LEVEL, TILE_GRID e HEIGHT_* devem coincidir com
 * scripts/data/build_globe.py (que gera os tiles).
 */

/** Caixa da quadtree do Brasil, em graus: oeste, sul, leste, norte. */
export const ROOT = { west: -76, south: -36, east: -28, north: 12 } as const;
export const MAX_LEVEL = 5;
/** Pixels de cor por lado de tile. */
export const TILE_PIXELS = 256;
/** Células da malha por lado de tile (amostras de altitude = TILE_GRID + 1). */
export const TILE_GRID = 64;
/** altitude (m) = valor16 / HEIGHT_SCALE − HEIGHT_OFFSET */
export const HEIGHT_OFFSET = 500;
export const HEIGHT_SCALE = 10;

export const EARTH_RADIUS_M = 6_371_000;

/** Câmera: altitude em raios terrestres acima da superfície. */
export const CAMERA = {
  minAltitude: 0.03, // ~190 km: ~1,5–2 px por texel de 650 m no nível máximo
  maxAltitude: 3.2,
  initial: { lon: -52, lat: -14, altitude: 2.1 },
  fovDeg: 40,
  /** Inclinação máxima (graus) atingida perto do solo, para ver o relevo em perspectiva. */
  maxTiltDeg: 52,
} as const;

/** Exagero vertical do relevo em função da altitude da câmera (relevo real seria invisível). */
export function terrainExaggeration(altitude: number): number {
  return Math.min(32, Math.max(6, 6 + 26 * Math.sqrt(altitude)));
}

/** Px de tela por texel acima do qual um tile é subdividido. */
export const LOD_TEXEL_THRESHOLD = 1.0;
/** Máximo de blocos na GPU (atlas de até 4x4 tiles: ~5,6 MB de cor com mipmaps). */
export const TILE_CACHE_BLOCKS = 20;
export const MAX_CONCURRENT_LOADS = 4;

/** Tiles por lado de cada bloco (atlas) no nível z. Deve coincidir com build_globe.py. */
export function blockSide(z: number): number {
  return Math.min(4, 2 ** z);
}
