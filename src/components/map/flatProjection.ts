import { UFS, type Uf } from '@/globe/ufs';

/**
 * Projeção plana do Brasil para o mapa 2D (PLANO_GLOBO.md §3.4). Funções puras: os 27 contornos de
 * `src/globe/data/ufs.json` viram strings de path SVG num `viewBox` fixo, calculadas uma vez (módulo) e
 * reaproveitadas por todo `FlatBrazilMap`. O toque é tratado pelo `onPress` de cada path (sem ponto-em-polígono).
 */

/** Largura do `viewBox` (unidades SVG). A altura sai da proporção do Brasil projetado. */
export const VIEWBOX_WIDTH = 1000;
/** Folga ao redor do Brasil dentro do `viewBox` (unidades SVG), para o traço da seleção não ser cortado. */
export const VIEWBOX_PADDING = 12;
/** Latitude média do Brasil: o cosseno dela encolhe a longitude (equiretangular com escala de longitude). */
export const MEAN_LATITUDE_DEG = -14;
/**
 * Tolerância de Douglas-Peucker em unidades do `viewBox` (já projetadas). 1 unidade = 0,1% da largura: num
 * celular de 400 px são ~0,4 px, abaixo do que se enxerga. Medido: de 6557 vértices nos contornos do globo para
 * 2985 (45% a menos), bem abaixo da meta de 4000 no total.
 */
export const SIMPLIFY_TOLERANCE = 1;
/** Casas decimais das coordenadas do path (0,1 unidade já é menor que um pixel). */
const PATH_DECIMALS = 1;

export interface Point {
  x: number;
  y: number;
}

export interface FlatUf {
  sigla: string;
  nome: string;
  /** Path SVG (todos os anéis, inclusive ilhas), em coordenadas do `viewBox`. */
  d: string;
  /** Centroide projetado (para rótulos). */
  centroid: Point;
  /** Largura e altura da caixa do UF projetado, em unidades do `viewBox` (decide se cabe uma sigla). */
  width: number;
  height: number;
  /** Vértices dos anéis depois da simplificação. */
  vertices: number;
}

export interface FlatMap {
  viewBox: { width: number; height: number };
  /** Ordem de desenho: o DF vem por último, para ficar por cima de GO (que o envolve) e poder ser tocado. */
  ufs: readonly FlatUf[];
  /** Vértices dos contornos de origem e depois da simplificação (para medir o custo). */
  stats: { verticesBefore: number; verticesAfter: number };
  /** Inversa da projeção: ponto do viewBox → [lon, lat] (para achar a UF tocada com `findUf`). */
  unproject: (p: Point) => [number, number];
}

type LonLat = readonly (readonly number[])[];

const COS_LAT = Math.cos((MEAN_LATITUDE_DEG * Math.PI) / 180);

function bounds(ufs: readonly Uf[]) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const uf of ufs)
    for (const ring of uf.polygons)
      for (const [lon, lat] of ring) {
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
      }
  return { minLon, minLat, maxLon, maxLat };
}

/** Distância do ponto `p` ao segmento `a`–`b`. */
function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Douglas-Peucker numa polilinha aberta; mantém sempre os dois extremos. */
function simplifyLine(points: readonly Point[], tolerance: number): Point[] {
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number];
    let worst = -1;
    let worstDistance = tolerance;
    for (let i = first + 1; i < last; i++) {
      const d = segmentDistance(points[i], points[first], points[last]);
      if (d > worstDistance) {
        worst = i;
        worstDistance = d;
      }
    }
    if (worst >= 0) {
      keep[worst] = true;
      stack.push([first, worst], [worst, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Simplifica um anel fechado (sem repetir o primeiro ponto no fim). Ancora no ponto 0 e no mais distante dele e
 * simplifica as duas metades; nunca devolve menos de 3 pontos (ilhas minúsculas continuam visíveis e tocáveis).
 */
export function simplifyRing(ring: readonly Point[], tolerance: number): Point[] {
  if (ring.length <= 3) return [...ring];
  let far = 1;
  let farDistance = -1;
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i].x - ring[0].x, ring[i].y - ring[0].y);
    if (d > farDistance) {
      far = i;
      farDistance = d;
    }
  }
  const first = simplifyLine(ring.slice(0, far + 1), tolerance);
  const second = simplifyLine([...ring.slice(far), ring[0]], tolerance);
  const out = [...first, ...second.slice(1, -1)];
  return out.length >= 3 ? out : [...ring.slice(0, 3)];
}

function fmt(n: number): string {
  return n.toFixed(PATH_DECIMALS);
}

/** Path SVG de um anel fechado: `M x y L x y … Z`. */
export function ringToPath(ring: readonly Point[]): string {
  return ring.map((p, i) => `${i === 0 ? 'M' : 'L'}${fmt(p.x)} ${fmt(p.y)}`).join('') + 'Z';
}

/** Constrói o mapa plano a partir dos contornos dados (a versão do módulo usa `UFS`). */
export function buildFlatMap(ufs: readonly Uf[], tolerance = SIMPLIFY_TOLERANCE): FlatMap {
  const b = bounds(ufs);
  const scale = (VIEWBOX_WIDTH - 2 * VIEWBOX_PADDING) / ((b.maxLon - b.minLon) * COS_LAT);
  const height = Math.round((b.maxLat - b.minLat) * scale + 2 * VIEWBOX_PADDING);
  const project = ([lon, lat]: readonly number[]): Point => ({
    x: VIEWBOX_PADDING + (lon - b.minLon) * COS_LAT * scale,
    y: VIEWBOX_PADDING + (b.maxLat - lat) * scale,
  });
  const unproject = ({ x, y }: Point): [number, number] => [
    b.minLon + (x - VIEWBOX_PADDING) / (COS_LAT * scale),
    b.maxLat - (y - VIEWBOX_PADDING) / scale,
  ];

  let before = 0;
  let after = 0;
  const built: FlatUf[] = ufs.map((uf) => {
    const rings = uf.polygons.map((raw: LonLat) => {
      // O dado repete o primeiro ponto no fim do anel; o path fecha com Z.
      const open =
        raw.length > 1 && raw[0][0] === raw.at(-1)?.[0] && raw[0][1] === raw.at(-1)?.[1] ? raw.slice(0, -1) : raw;
      before += raw.length;
      const simplified = simplifyRing(open.map(project), tolerance);
      after += simplified.length;
      return simplified;
    });
    const all = rings.flat();
    const xs = all.map((p) => p.x);
    const ys = all.map((p) => p.y);
    return {
      sigla: uf.sigla,
      nome: uf.nome,
      d: rings.map(ringToPath).join(''),
      centroid: project(uf.centroid),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      vertices: rings.reduce((s, r) => s + r.length, 0),
    };
  });
  // DF depois de GO (que o envolve); o resto na ordem do dado.
  const ordered = [...built.filter((u) => u.sigla !== 'DF'), ...built.filter((u) => u.sigla === 'DF')];
  return {
    viewBox: { width: VIEWBOX_WIDTH, height },
    ufs: ordered,
    stats: { verticesBefore: before, verticesAfter: after },
    unproject,
  };
}

let memo: FlatMap | null = null;

/** O mapa plano dos 27 estados, calculado uma vez e reaproveitado. */
export function flatMap(): FlatMap {
  memo ??= buildFlatMap(UFS);
  return memo;
}
