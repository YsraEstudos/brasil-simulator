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

/** UF que contém o ponto (contornos simplificados ~2 km; suficiente para toque). */
export function findUf(lon: number, lat: number): Uf | null {
  for (const uf of UFS) {
    for (const ring of uf.polygons) if (pointInRing(lon, lat, ring)) return uf;
  }
  return null;
}
