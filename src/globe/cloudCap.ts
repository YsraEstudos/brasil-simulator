import { ROOT } from './config';
import { lonLatToVec3 } from './geo';

/**
 * Calota das nuvens (PLANO_GLOBO.md §4.2): uma malha de `CLOUD_CAP_SEGMENTS`² quadrados sobre a caixa da quadtree, a
 * `CLOUD_CAP_RADIUS` do centro da Terra (acima do relevo exagerado, que chega a ~1,015). Módulo puro: devolve só os
 * buffers; a malha, o material e o descarte são do `GlobeScene`.
 */

export const CLOUD_CAP_SEGMENTS = 32;
/** Raio da calota: acima do pico mais alto com o exagero máximo do relevo (~1,015), para o relevo nunca atravessar a nuvem. */
export const CLOUD_CAP_RADIUS = 1.018;

export interface CloudCapBuffers {
  /** x, y, z de cada vértice na esfera de raio `CLOUD_CAP_RADIUS`. */
  positions: Float32Array;
  /** u para leste e v para o norte (0–1 sobre a caixa): as mesmas coordenadas da textura de clima. */
  uvs: Float32Array;
  indices: Uint16Array;
}

export function cloudCapBuffers(segments = CLOUD_CAP_SEGMENTS, radius = CLOUD_CAP_RADIUS): CloudCapBuffers {
  const side = segments + 1;
  const positions = new Float32Array(side * side * 3);
  const uvs = new Float32Array(side * side * 2);
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const u = i / segments;
      const v = j / segments;
      const at = j * side + i;
      positions.set(
        lonLatToVec3(ROOT.west + u * (ROOT.east - ROOT.west), ROOT.south + v * (ROOT.north - ROOT.south), radius),
        at * 3,
      );
      uvs.set([u, v], at * 2);
    }
  }
  const indices = new Uint16Array(segments * segments * 6);
  let k = 0;
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * side + i;
      const b = a + 1;
      const c = a + side;
      const d = c + 1;
      // Sentido anti-horário visto de fora da esfera (leste = +u, norte = +v).
      indices.set([a, b, c, b, d, c], k);
      k += 6;
    }
  }
  return { positions, uvs, indices };
}
