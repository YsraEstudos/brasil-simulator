import { ROOT } from './config';

export type Vec3 = [number, number, number];

export type TileKey = { z: number; x: number; y: number };

export type Bounds = { west: number; south: number; east: number; north: number };

const DEG = Math.PI / 180;

/**
 * Converte lon/lat (graus) em ponto na esfera de raio r.
 * Mesma convenção do THREE.SphereGeometry com textura equiretangular (u = 0 em lon −180°).
 */
export function lonLatToVec3(lonDeg: number, latDeg: number, r = 1): Vec3 {
  const lon = lonDeg * DEG;
  const lat = latDeg * DEG;
  const c = Math.cos(lat);
  return [r * c * Math.cos(lon), r * Math.sin(lat), -r * c * Math.sin(lon)];
}

export function vec3ToLonLat(v: Vec3): { lon: number; lat: number } {
  const [x, y, z] = v;
  const len = Math.hypot(x, y, z);
  return { lon: Math.atan2(-z, x) / DEG, lat: Math.asin(y / len) / DEG };
}

export function tileId(k: TileKey): string {
  return `${k.z}/${k.x}/${k.y}`;
}

export function tileBounds({ z, x, y }: TileKey): Bounds {
  const span = (ROOT.east - ROOT.west) / 2 ** z;
  const west = ROOT.west + x * span;
  const north = ROOT.north - y * span;
  return { west, south: north - span, east: west + span, north };
}

export function tileChildren({ z, x, y }: TileKey): TileKey[] {
  return [
    { z: z + 1, x: 2 * x, y: 2 * y },
    { z: z + 1, x: 2 * x + 1, y: 2 * y },
    { z: z + 1, x: 2 * x, y: 2 * y + 1 },
    { z: z + 1, x: 2 * x + 1, y: 2 * y + 1 },
  ];
}

/** Centro do tile na esfera e raio (corda) da esfera envolvente, em raios terrestres. */
export function tileBoundingSphere(k: TileKey, maxHeightRadii: number): { center: Vec3; radius: number } {
  const b = tileBounds(k);
  const center = lonLatToVec3((b.west + b.east) / 2, (b.south + b.north) / 2);
  let radius = 0;
  for (const [lon, lat] of [
    [b.west, b.north],
    [b.east, b.north],
    [b.west, b.south],
    [b.east, b.south],
    [(b.west + b.east) / 2, b.north],
    [(b.west + b.east) / 2, b.south],
  ]) {
    const p = lonLatToVec3(lon, lat);
    radius = Math.max(radius, Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2]));
  }
  return { center, radius: radius + maxHeightRadii };
}

/** Interseção de um raio com a esfera unitária (primeiro ponto), ou null. */
export function raySphere(origin: Vec3, dir: Vec3): Vec3 | null {
  const [ox, oy, oz] = origin;
  const [dx, dy, dz] = dir;
  const b = ox * dx + oy * dy + oz * dz;
  const c = ox * ox + oy * oy + oz * oz - 1;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  if (t < 0) return null;
  return [ox + t * dx, oy + t * dy, oz + t * dz];
}

export function pointInRing(lon: number, lat: number, ring: readonly (readonly number[])[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
