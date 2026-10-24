import {
  CAPITAL_DOT_GAP_PX,
  CAPITAL_DOT_PX,
  LABELS,
  PIN_SIZE_PX,
  buildLabelCandidates,
  layoutLabels,
  type LabelViewport,
  type Rect,
  type UfLabelCandidate,
} from '@/globe/labels';
import {
  MARKER_BADGE_OFFSET_PX,
  MARKER_BADGE_SIZE_PX,
  MARKER_SIZE_PX,
  buildMarkerCandidates,
  type GlobeMarker,
} from '@/globe/markers';

import { flatMap } from './flatProjection';

/**
 * Siglas, pins e capitais do mapa 2D (PLANO_GLOBO.md §3.4 e §7, PR 2): as mesmas regras de `src/globe/labels.ts`
 * do globo (nível por tamanho, prioridade por população, colisão, áreas do HUD), aplicadas à projeção plana. Puro:
 * devolve posições em px; `FlatBrazilMap` só desenha `Text` e `View`. Os marcadores de eventos e notícias (PR 11) entram
 * no mesmo layout, com prioridade acima das siglas: a sigla da UF some sob o marcador dela.
 */

/**
 * O mapa 2D não tem zoom: só mostra nomes de capital quando o Brasil desenhado tem ao menos esta largura (px), isto é,
 * em tablet, paisagem larga ou web. Num celular em retrato (≈ 360 dp, ~9 px/°) os nomes só encobririam as siglas.
 */
export const FLAT_CAPITALS_MIN_MAP_WIDTH_PX = 640;

/** Tamanho lógico da fonte (px, escala 1) que o atlas do globo usa: o texto nativo fica do mesmo tamanho. */
export const FLAT_SIGLA_FONT_PX = 12;
export const FLAT_CAPITAL_FONT_PX = 10;

export type FlatLabelItem =
  | { id: string; kind: 'sigla'; text: string; box: Rect; fontSize: number }
  | {
      id: string;
      kind: 'marker';
      sigla: string;
      /** Disco do marcador (px do mapa). */
      box: Rect;
      /** Selo com o número de itens (grupo de mais de um); `null` com um item só. */
      badge: Rect | null;
    }
  | { id: string; kind: 'pin'; box: Rect }
  | { id: string; kind: 'capital'; text: string; dot: Rect; name: Rect; fontSize: number };

export type FlatLabelInput = {
  /** Tamanho do mapa na tela (o `FlatBrazilMap` inteiro), em px. */
  width: number;
  height: number;
  /** `labelScale(textScale)`. */
  scale: number;
  /** Áreas do HUD (px, origem no canto superior esquerdo do mapa) onde nenhum rótulo pode tocar. */
  reserved?: readonly Rect[];
  /** Faixas onde um rótulo não cabe por inteiro. */
  insets?: LabelViewport['insets'];
  /** Marcadores de eventos e notícias (um por UF); ausente = nenhum. */
  markers?: readonly GlobeMarker[];
};

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 } as const;

/** Escala (px por unidade do `viewBox`) e deslocamento que centralizam o mapa na área, como o `<Svg>` `meet`. */
export function flatFit(width: number, height: number) {
  const { viewBox } = flatMap();
  const scale = Math.min(width / viewBox.width, height / viewBox.height);
  return { scale, offsetX: (width - viewBox.width * scale) / 2, offsetY: (height - viewBox.height * scale) / 2 };
}

/** Largura (px) do Brasil desenhado na área dada. */
export function flatMapWidthPx(width: number, height: number): number {
  return flatMap().viewBox.width * flatFit(width, height).scale;
}

/** Os rótulos que cabem agora, com as posições finais (px) para o `FlatBrazilMap` desenhar. */
export function layoutFlatLabels(input: FlatLabelInput): FlatLabelItem[] {
  const { width, height, scale, reserved = [], insets = NO_INSETS, markers = [] } = input;
  if (width <= 0 || height <= 0) return [];
  const flat = flatMap();
  const fit = flatFit(width, height);
  const project = (lon: number, lat: number) => {
    const p = flat.project(lon, lat);
    return { x: fit.offsetX + p.x * fit.scale, y: fit.offsetY + p.y * fit.scale };
  };
  const candidates = [
    ...buildLabelCandidates({
      project,
      pixelsPerDegree: fit.scale * flat.unitsPerDegree,
      tier: { siglas: true, capitals: flat.viewBox.width * fit.scale >= FLAT_CAPITALS_MIN_MAP_WIDTH_PX },
      scale,
    }),
    ...buildMarkerCandidates(markers, { project, scale }),
  ];
  const shown = layoutLabels(candidates, { width, height, insets }, reserved);
  const byId = new Map<string, UfLabelCandidate>(candidates.map((c) => [c.id, c]));
  const names = new Map(LABELS.map((l) => [l.sigla, l]));
  const items: FlatLabelItem[] = [];
  for (const id of shown) {
    const c = byId.get(id);
    if (!c) continue;
    const label = names.get(c.sigla);
    if (!label) continue;
    if (c.kind === 'marker') {
      const marker = markers.find((m) => m.sigla === c.sigla);
      const size = MARKER_SIZE_PX * scale;
      const badgeSize = MARKER_BADGE_SIZE_PX * scale;
      items.push({
        id,
        kind: 'marker',
        sigla: c.sigla,
        box: { x: c.anchorX - size / 2, y: c.anchorY - size / 2, w: size, h: size },
        badge:
          marker && marker.count > 1
            ? {
                x: c.anchorX + MARKER_BADGE_OFFSET_PX.x * scale - badgeSize / 2,
                y: c.anchorY + MARKER_BADGE_OFFSET_PX.y * scale - badgeSize / 2,
                w: badgeSize,
                h: badgeSize,
              }
            : null,
      });
    } else if (c.kind === 'pin') {
      const size = PIN_SIZE_PX * scale;
      items.push({ id, kind: 'pin', box: { x: c.anchorX - size / 2, y: c.anchorY - size / 2, w: size, h: size } });
    } else if (c.kind === 'sigla') {
      items.push({
        id,
        kind: 'sigla',
        text: label.sigla,
        box: { x: c.x - c.w / 2, y: c.y - c.h / 2, w: c.w, h: c.h },
        fontSize: FLAT_SIGLA_FONT_PX * scale,
      });
    } else {
      const dot = CAPITAL_DOT_PX * scale;
      const nameW = label.capital.w * scale;
      const nameH = label.capital.h * scale;
      items.push({
        id,
        kind: 'capital',
        text: label.capital.name,
        dot: { x: c.anchorX - dot / 2, y: c.anchorY - dot / 2, w: dot, h: dot },
        name: {
          x: c.anchorX - nameW / 2,
          y: c.anchorY + dot / 2 + CAPITAL_DOT_GAP_PX,
          w: nameW,
          h: nameH,
        },
        fontSize: FLAT_CAPITAL_FONT_PX * scale,
      });
    }
  }
  return items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
