import { terrainExaggeration, EARTH_RADIUS_M } from './config';
import { lonLatToVec3, type Vec3 } from './geo';
import {
  buildLabelCandidates,
  labelTier,
  layoutLabels,
  pixelsPerDegreeAtAltitude,
  type LabelTier,
  type LabelViewport,
  type Rect,
  type UfLabelCandidate,
} from './labels';
import { buildMarkerCandidates, type GlobeMarker, type MarkerPoint } from './markers';

/**
 * Ligação entre a câmera do globo e as regras puras de `labels.ts` (PLANO_GLOBO.md §7, PR 2): raio dos rótulos,
 * projeção lon/lat → px, descarte do hemisfério oculto e o layout completo de um quadro. Sem three.js nem React —
 * o `GlobeLabels` e os testes usam as mesmas funções.
 */

/** Altitude típica (m) do relevo sobre a qual os rótulos flutuam: acima dos planaltos, abaixo de uma serra. */
const LABEL_TERRAIN_HEIGHT_M = 1000;
/** Folga (raios terrestres) acima do relevo, para o rótulo nunca ficar colado na malha. */
const LABEL_LIFT = 0.0004;

/**
 * Raio (unidades do globo) em que os rótulos flutuam. Acompanha o exagero do relevo da altitude da câmera
 * (`terrainExaggeration`), senão com a câmera inclinada perto do solo o rótulo se afastaria do ponto no chão.
 */
export function labelRadius(altitude: number): number {
  return 1 + LABEL_LIFT + (LABEL_TERRAIN_HEIGHT_M * terrainExaggeration(altitude)) / EARTH_RADIUS_M;
}

/**
 * Um ponto só aparece se `dot(normal, direção da câmera)` for maior que isto (≈ 6° de elevação). Perto do limbo o
 * texto ficaria espremido e cruzaria a atmosfera; o mesmo valor entra no vertex shader.
 */
export const LABEL_MIN_FACING = 0.1;

export type GlobeProjectorInput = {
  /** `projectionMatrix × matrixWorldInverse` da câmera, em ordem de coluna (como `Matrix4.elements`). */
  viewProjection: ArrayLike<number>;
  cameraPosition: Vec3;
  /** Tamanho da tela em px lógicos. */
  width: number;
  height: number;
  /** Raio dos rótulos (`labelRadius`). */
  radius: number;
};

/**
 * Projeção lon/lat → px de tela (origem no canto superior esquerdo), ou `null` se o ponto está no hemisfério oculto,
 * atrás da câmera ou fora da tela. Mesma conta do vertex shader.
 */
export function makeGlobeProjector({
  viewProjection: m,
  cameraPosition: cam,
  width,
  height,
  radius,
}: GlobeProjectorInput): (lon: number, lat: number) => { x: number; y: number } | null {
  return (lon, lat) => {
    const n = lonLatToVec3(lon, lat, 1);
    const px = n[0] * radius;
    const py = n[1] * radius;
    const pz = n[2] * radius;
    const tx = cam[0] - px;
    const ty = cam[1] - py;
    const tz = cam[2] - pz;
    const facing = (n[0] * tx + n[1] * ty + n[2] * tz) / Math.hypot(tx, ty, tz);
    if (facing < LABEL_MIN_FACING) return null;
    const cx = m[0] * px + m[4] * py + m[8] * pz + m[12];
    const cy = m[1] * px + m[5] * py + m[9] * pz + m[13];
    const cw = m[3] * px + m[7] * py + m[11] * pz + m[15];
    if (cw <= 0) return null;
    const x = (cx / cw + 1) * 0.5 * width;
    const y = (1 - cy / cw) * 0.5 * height;
    if (x < 0 || x > width || y < 0 || y > height) return null;
    return { x, y };
  };
}

export type GlobeLayoutInput = {
  project: (lon: number, lat: number) => { x: number; y: number } | null;
  altitude: number;
  /** FOV vertical efetivo da câmera, em graus. */
  fovDeg: number;
  viewport: LabelViewport;
  reserved: readonly Rect[];
  /** `labelScale(textScale)`. */
  scale: number;
  /** Sobrescreve o nível por altitude (testes). */
  tier?: LabelTier;
  /** Marcadores de eventos e notícias (um por UF): entram na colisão com prioridade acima das siglas. */
  markers?: readonly GlobeMarker[];
};

/** Candidatos de rótulo na tela agora (antes de colisão): o nível sai da altitude e o tamanho da UF dos px por grau. */
export function globeLabelCandidates(input: GlobeLayoutInput): UfLabelCandidate[] {
  const { project, altitude, fovDeg, viewport, scale } = input;
  return buildLabelCandidates({
    project,
    pixelsPerDegree: pixelsPerDegreeAtAltitude(altitude, viewport.height, fovDeg),
    tier: input.tier ?? labelTier(altitude),
    scale,
  });
}

/** Resultado de um quadro: os ids que cabem e, dos marcadores, onde estão na tela (para o toque). */
export type GlobeLayout = {
  /** Ids (`SP:sigla`, `DF:pin`, `SP:capital`, `CE:marker`, `CE:badge`) dos rótulos que cabem agora. */
  shown: Set<string>;
  markerPoints: MarkerPoint[];
};

/**
 * Layout completo de um quadro: rótulos e marcadores juntos, guloso por prioridade (marcador crítico > marcador >
 * sigla/pin > capital). O selo (`CE:badge`) vai junto do marcador mostrado quando o grupo tem mais de um item.
 */
export function layoutGlobe(input: GlobeLayoutInput): GlobeLayout {
  const markers = input.markers ?? [];
  const candidates = [
    ...globeLabelCandidates(input),
    ...buildMarkerCandidates(markers, { project: input.project, scale: input.scale }),
  ];
  const shown = layoutLabels(candidates, input.viewport, input.reserved);
  const markerPoints: MarkerPoint[] = [];
  for (const m of markers) {
    const c = candidates.find((x) => x.id === `${m.sigla}:marker`);
    if (!c || !shown.has(c.id)) continue;
    markerPoints.push({ sigla: m.sigla, x: c.x, y: c.y });
    if (m.count > 1) shown.add(`${m.sigla}:badge`);
  }
  return { shown, markerPoints };
}

/** Ids (`SP:sigla`, `DF:pin`, `SP:capital`) dos rótulos que cabem agora, depois de prioridade e colisões. */
export function layoutGlobeLabels(input: GlobeLayoutInput): Set<string> {
  return layoutGlobe(input).shown;
}
