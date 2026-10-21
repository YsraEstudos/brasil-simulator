import data from './data/cities.json';
import { lonLatToVec3 } from './geo';

/**
 * Luzes das cidades à noite (PLANO_GLOBO.md §4.3): os ~150 maiores municípios, gerados por
 * `scripts/data/build_cities.py` (`src/globe/data/cities.json`, não editar à mão). Vale para o globo (uma malha de
 * pontos) e para o mapa 2D (círculos). Dado só visual.
 */

export type City = { name: string; uf: string; lon: number; lat: number; pop: number };

/** Do mais ao menos populoso. */
export const CITIES = data as City[];

/** Brilho relativo (0–1) por log da população: o maior município vale 1, o menor da lista vale `MIN_BRIGHTNESS`. */
export const MIN_BRIGHTNESS = 0.3;

const MAX_POP = Math.max(...CITIES.map((c) => c.pop));
const MIN_POP = Math.min(...CITIES.map((c) => c.pop));

/** Tamanho/brilho relativo da cidade: `MIN_BRIGHTNESS` (menor da lista) a 1 (maior), proporcional ao log da população. */
export function cityWeight(pop: number): number {
  const t = (Math.log(pop) - Math.log(MIN_POP)) / (Math.log(MAX_POP) - Math.log(MIN_POP));
  return MIN_BRIGHTNESS + (1 - MIN_BRIGHTNESS) * Math.min(1, Math.max(0, t));
}

/** Buffers da malha de pontos: direção na esfera (x, y, z unitários) e peso de cada cidade. */
export function cityPointBuffers(cities: readonly City[] = CITIES): { positions: Float32Array; weights: Float32Array } {
  const positions = new Float32Array(cities.length * 3);
  const weights = new Float32Array(cities.length);
  cities.forEach((c, i) => {
    positions.set(lonLatToVec3(c.lon, c.lat), i * 3);
    weights[i] = cityWeight(c.pop);
  });
  return { positions, weights };
}
