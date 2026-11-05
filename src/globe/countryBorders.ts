import { EARTH_RADIUS_M, terrainExaggeration } from './config';
import type { Country } from './countries';
import borders from './data/countryBorders.json';
import { lonLatToVec3 } from './geo';

/**
 * Fronteiras terrestres e contorno do país selecionado (PLANO_PAISES.md, P1). Uma malha de linhas só, numa chamada de
 * desenho (`LineSegments`), em vez de pintar as fronteiras nos tiles: regerar os 114 tiles passaria do limite de 100
 * arquivos por PR. Funções puras: devolvem os vértices (pares de pontos), e o `GlobeScene` só os copia para a GPU.
 */

type BordersFile = { lines: number[][] };

const FILE = borders as BordersFile;

/** Polilinhas `[lon, lat, lon, lat, …]` das fronteiras terrestres (Natural Earth 1:50m, simplificadas a ~2 km). */
export const BORDER_LINES: readonly number[][] = FILE.lines;

/** Altitude típica (m) do relevo sobre a qual a linha flutua, abaixo da dos rótulos (1000 m). */
const BORDER_TERRAIN_HEIGHT_M = 300;
/** Folga (raios terrestres) acima da esfera. */
const BORDER_LIFT = 0.0002;

/** Raio (unidades do globo) das linhas: acompanha o exagero do relevo da altitude da câmera, como os rótulos. */
export function borderRadius(altitude: number): number {
  return 1 + BORDER_LIFT + (BORDER_TERRAIN_HEIGHT_M * terrainExaggeration(altitude)) / EARTH_RADIUS_M;
}

/** Vértices `x y z` (direção unitária) de cada segmento das polilinhas, em pares, para um `LineSegments`. */
export function polylineSegments(lines: readonly (readonly number[])[], closed = false): Float32Array {
  let count = 0;
  for (const l of lines) {
    const points = l.length / 2;
    if (points >= 2) count += closed ? points : points - 1;
  }
  const out = new Float32Array(count * 2 * 3);
  let at = 0;
  for (const l of lines) {
    const points = l.length / 2;
    if (points < 2) continue;
    const last = closed ? points : points - 1;
    for (let i = 0; i < last; i++) {
      const j = (i + 1) % points;
      out.set(lonLatToVec3(l[i * 2], l[i * 2 + 1], 1), at);
      out.set(lonLatToVec3(l[j * 2], l[j * 2 + 1], 1), at + 3);
      at += 6;
    }
  }
  return out;
}

/** As fronteiras terrestres do mundo, já em segmentos. */
export function borderSegments(): Float32Array {
  return polylineSegments(BORDER_LINES);
}

/** O contorno do país (anéis fechados), em segmentos: o traço dourado da seleção. */
export function outlineSegments(country: Pick<Country, 'outline'>): Float32Array {
  return polylineSegments(country.outline, true);
}
