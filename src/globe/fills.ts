import * as THREE from 'three';

import { lonLatToVec3, pointInRing } from './geo';
import { UFS } from './ufs';

/**
 * Preenchimento das UFs para o mapa de calor (aba Brasil): um polígono por anel, triangulado em lon/lat e
 * projetado logo acima da esfera. Anel de outra UF inteiramente dentro do anel (enclave) vira buraco, para as
 * cores não se somarem; vizinhas que só dividem fronteira não. Nos contornos atuais nenhuma UF é enclave: o DF
 * encosta em GO, mas não cai dentro dele. A geometria é criada uma vez e reutilizada; só a cor do material muda.
 */

/** Raio da camada: acima do globo base e abaixo do contorno da UF selecionada (1,0015). */
const FILL_RADIUS = 1.001;

/** Fração mínima dos vértices dentro do anel externo para o anel ser enclave (vértices de fronteira são ambíguos). */
const HOLE_MIN_INSIDE = 0.9;

/** O anel `inner` é enclave de `outer`? Testar só um vértice falha: ele costuma cair na fronteira comum. */
export function isHole(inner: readonly (readonly number[])[], outer: readonly (readonly number[])[]): boolean {
  if (inner.length === 0) return false;
  const inside = inner.filter(([lon, lat]) => pointInRing(lon, lat, outer)).length;
  return inside / inner.length >= HOLE_MIN_INSIDE;
}

let cache: Map<string, THREE.BufferGeometry> | null = null;

function ringToVectors(ring: readonly (readonly number[])[]): THREE.Vector2[] {
  const pts = ring.map(([lon, lat]) => new THREE.Vector2(lon, lat));
  // O primeiro ponto repetido no fim confunde a triangulação.
  if (pts.length > 1 && pts[0].equals(pts[pts.length - 1])) pts.pop();
  return pts;
}

function build(): Map<string, THREE.BufferGeometry> {
  const out = new Map<string, THREE.BufferGeometry>();
  const allRings = UFS.flatMap((uf) => uf.polygons.map((ring) => ({ sigla: uf.sigla, ring })));
  for (const uf of UFS) {
    const positions: number[] = [];
    const index: number[] = [];
    for (const ring of uf.polygons) {
      const contour = ringToVectors(ring);
      if (contour.length < 3) continue;
      const holes = allRings
        .filter((r) => r.sigla !== uf.sigla && isHole(r.ring, ring))
        .map((r) => ringToVectors(r.ring));
      const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
      const base = positions.length / 3;
      for (const p of [contour, ...holes].flat()) positions.push(...lonLatToVec3(p.x, p.y, FILL_RADIUS));
      for (const f of faces) index.push(base + f[0], base + f[1], base + f[2]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(index);
    out.set(uf.sigla, g);
  }
  return out;
}

/** Geometria de preenchimento de cada UF (por sigla). */
export function ufFillGeometries(): Map<string, THREE.BufferGeometry> {
  cache ??= build();
  return cache;
}
