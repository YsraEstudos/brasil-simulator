import { lonLatToVec3, type Vec3 } from './geo';

/**
 * Geometria das ferrovias no globo (PLANO_EXPANSAO EX-30). Funções puras, sem three.js: transformam a polilinha
 * lon/lat de um trecho numa fita de dois vértices por ponto, densificada pelo grande círculo para colar na esfera.
 * A largura não é geométrica: cada vértice leva a direção do deslocamento (`offsets`, já com o fator de esquina) e o
 * lado (−1/+1), e o shader soma a meia largura em px convertida pela distância da câmera. Assim a linha tem a mesma
 * espessura em qualquer zoom e na borda do disco.
 */

/** Uma linha da camada, como o globo a recebe (o modelo de visão converte a dele para esta forma). */
export interface GlobeRailLine {
  key: string;
  path: readonly (readonly [number, number])[];
  color: string;
  casing: string;
  widthPx: number;
  /** Traço e vão em px; `null` = contínua. */
  dash: readonly [number, number] | null;
  /** 1 = normal; < 1 = apagada (outro corredor está selecionado). */
  opacity: number;
}

/** Passo máximo entre pontos densificados (rad): 0,4° acompanha a curvatura sem custo (rede inteira < 4 mil pontos). */
export const MAX_STEP_RAD = (0.4 * Math.PI) / 180;
/** Limite do fator de esquina (miter): esquinas muito fechadas não viram espinhos. */
const MAX_MITER = 2;

function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** Interpolação esférica entre dois pontos unitários. */
function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const omega = Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
  if (omega < 1e-9) return a;
  const s = Math.sin(omega);
  const ka = Math.sin((1 - t) * omega) / s;
  const kb = Math.sin(t * omega) / s;
  return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
}

/** Pontos unitários ao longo do grande círculo de cada trecho, sem repetir as junções. */
export function densify(path: readonly (readonly [number, number])[], maxStep = MAX_STEP_RAD): Vec3[] {
  const points = path.map(([lon, lat]) => lonLatToVec3(lon, lat));
  const out: Vec3[] = points.length > 0 ? [points[0]!] : [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const angle = Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
    const steps = Math.max(1, Math.ceil(angle / maxStep));
    for (let k = 1; k <= steps; k++) out.push(slerp(a, b, k / steps));
  }
  return out;
}

export interface RibbonBuffers {
  /** Centro da linha na esfera unitária (3 por vértice; o shader escala para o raio da camada). */
  positions: Float32Array;
  /** Direção do deslocamento lateral no plano tangente, já multiplicada pelo fator de esquina (3 por vértice). */
  offsets: Float32Array;
  /** −1 ou +1 (1 por vértice). */
  sides: Float32Array;
  /** Comprimento acumulado ao longo da linha em radianos (1 por vértice): o shader faz o traço em px. */
  distances: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
}

/** Fita de várias polilinhas num buffer só (uma chamada de desenho por estilo). */
export function buildRibbon(paths: readonly (readonly (readonly [number, number])[])[]): RibbonBuffers {
  const lines = paths.map((p) => densify(p)).filter((pts) => pts.length >= 2);
  const vertexCount = lines.reduce((n, pts) => n + pts.length * 2, 0);
  const quadCount = lines.reduce((n, pts) => n + pts.length - 1, 0);
  const positions = new Float32Array(vertexCount * 3);
  const offsets = new Float32Array(vertexCount * 3);
  const sides = new Float32Array(vertexCount);
  const distances = new Float32Array(vertexCount);
  const indices = new Uint32Array(quadCount * 6);
  let v = 0;
  let q = 0;
  for (const pts of lines) {
    const first = v;
    let distance = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      if (i > 0) distance += Math.acos(Math.max(-1, Math.min(1, dot(pts[i - 1]!, p))));
      // Normal de cada trecho adjacente no plano tangente; na esquina, a média com o fator de miter.
      const before = i > 0 ? normalize(cross(p, normalize(sub(p, pts[i - 1]!)))) : null;
      const after = i < pts.length - 1 ? normalize(cross(p, normalize(sub(pts[i + 1]!, p)))) : null;
      let offset: Vec3 = (before ?? after)!;
      if (before && after) {
        const mid = normalize([before[0] + after[0], before[1] + after[1], before[2] + after[2]]);
        const k = Math.min(MAX_MITER, 1 / Math.max(1 / MAX_MITER, dot(mid, after)));
        offset = [mid[0] * k, mid[1] * k, mid[2] * k];
      }
      for (const side of [-1, 1]) {
        positions.set(p, v * 3);
        offsets.set(offset, v * 3);
        sides[v] = side;
        distances[v] = distance;
        v++;
      }
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = first + i * 2;
      indices.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], q * 6);
      q++;
    }
  }
  return { positions, offsets, sides, distances, indices, vertexCount };
}

/**
 * Agrupa linhas que podem dividir um material: mesma cor, contorno, largura, traço e opacidade. A ordem dos grupos
 * segue a primeira aparição (o modelo de visão já ordena do estilo mais fraco ao mais forte).
 */
export function groupRailLines(
  lines: readonly GlobeRailLine[],
): { key: string; sample: GlobeRailLine; paths: GlobeRailLine['path'][] }[] {
  const groups = new Map<string, { key: string; sample: GlobeRailLine; paths: GlobeRailLine['path'][] }>();
  for (const line of lines) {
    const key = `${line.color}|${line.casing}|${line.widthPx}|${line.dash?.join(',') ?? '-'}|${line.opacity}`;
    let group = groups.get(key);
    if (!group) groups.set(key, (group = { key, sample: line, paths: [] }));
    group.paths.push(line.path);
  }
  return [...groups.values()];
}
