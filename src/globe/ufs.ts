import { pointInRing } from './geo';
import data from './data/ufs.json';

export type Uf = {
  index: number;
  code: number;
  sigla: string;
  nome: string;
  regiao: string;
  centroid: [number, number];
  polygons: number[][][];
};

export const UFS = data as Uf[];

/** Área aproximada do anel em graus² (fórmula do polígono), para desempatar anéis encaixados. */
function ringArea(ring: readonly (readonly number[])[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return Math.abs(a / 2);
}

/**
 * UF que contém o ponto (contornos simplificados ~2 km; suficiente para toque). O contorno de GO envolve o DF:
 * vale o menor anel que contém o ponto.
 */
export function findUf(lon: number, lat: number): Uf | null {
  let best: { uf: Uf; area: number } | null = null;
  for (const uf of UFS) {
    for (const ring of uf.polygons) {
      if (!pointInRing(lon, lat, ring)) continue;
      const area = ringArea(ring);
      if (!best || area < best.area) best = { uf, area };
    }
  }
  return best?.uf ?? null;
}

export function ufBySigla(sigla: string): Uf | undefined {
  return UFS.find((u) => u.sigla === sigla);
}
