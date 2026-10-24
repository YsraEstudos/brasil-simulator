import {
  CAPITAL_DOT_GAP_PX,
  CAPITAL_DOT_PX,
  LABELS,
  MARKER_ATLAS,
  PIN_SIZE_PX,
  type AtlasRect,
  type UfLabel,
} from './labels';
import { lonLatToVec3 } from './geo';
import {
  MARKER_BADGE_OFFSET_PX,
  MARKER_BADGE_SIZE_PX,
  MARKER_BOX_PX,
  MARKER_COLORS,
  hexToRgb,
  markerColor,
  markerCountKey,
  type GlobeMarker,
} from './markers';

/**
 * Geometria dos rótulos do globo (PLANO_GLOBO.md §3.2 e §7, PR 2): **um** `BufferGeometry` com um quadrilátero por
 * peça (sigla, pin, ponto da capital, nome da capital), desenhado numa só chamada. Os marcadores de eventos e notícias
 * (PR 11) entram no **mesmo** buffer, depois dos rótulos (desenham por cima): por UF, um disco + glifo e um selo + número,
 * ligados só quando a UF tem marcador; o glifo, a cor e o número mudam por atributo (`writeMarkerAttributes`), sem
 * recriar a geometria. Funções puras, sem three.js:
 * `GlobeLabels` só copia estes arrays para os atributos.
 *
 * Cada quadrilátero tem 4 vértices que repetem a **direção** do ponto na esfera (`position`, vetor unitário) e
 * diferem no canto, em pixels lógicos a partir do ponto projetado (`corner`, y para baixo, escala 1: o vertex shader
 * multiplica pela escala dos rótulos). `kind` diz ao fragment shader o que pintar.
 */

/**
 * O que o fragment shader pinta: texto do atlas, pin de UF pequena ou ponto da capital (círculos gerados no shader), disco
 * do marcador (colorido, com anel de pulso) ou disco do selo do grupo.
 */
export const QuadKind = { Text: 0, Pin: 1, Dot: 2, Marker: 3, Badge: 4 } as const;
export type QuadKindValue = (typeof QuadKind)[keyof typeof QuadKind];

export const VERTS_PER_QUAD = 4;
export const INDICES_PER_QUAD = 6;

/** Um rótulo lógico (id de `buildLabelCandidates`) e os quadrilátero que o compõem. */
export type LabelQuadGroup = { id: string; firstQuad: number; quadCount: number };

export type LabelQuadBuffers = {
  /** `x y z` por vértice: direção unitária do ponto na esfera. */
  positions: Float32Array;
  /** `x y` por vértice: deslocamento em px lógicos (escala 1) a partir do ponto projetado; y para baixo. */
  corners: Float32Array;
  /** `u v` por vértice: coordenadas do atlas (origem no canto superior esquerdo) ou 0..1 locais nos círculos. */
  uvs: Float32Array;
  /** Um valor por vértice: `QuadKind`. */
  kinds: Float32Array;
  /** `r g b` por vértice (0–1): cor do disco do marcador e do selo; 0 nos rótulos. Dinâmico (`writeMarkerAttributes`). */
  tints: Float32Array;
  /** Um valor por vértice: 1 no disco de marcador com pulso (anel), 0 nos demais. Dinâmico. */
  pulses: Float32Array;
  indices: Uint16Array;
  /** Um por rótulo lógico, na ordem dos quadriláteros. */
  groups: LabelQuadGroup[];
  /** Primeiro quadrilátero do marcador (disco + glifo) e do selo (disco + número) de cada UF, por sigla. */
  markerSlots: ReadonlyMap<string, { marker: number; badge: number }>;
  quadCount: number;
};

type Quad = {
  dir: readonly [number, number, number];
  /** Esquerda, topo, direita, base em px (y para baixo). */
  box: readonly [number, number, number, number];
  uv: readonly [number, number, number, number];
  kind: QuadKindValue;
};

/** Raio do ponto em `lonLatToVec3`; só a direção vai para o buffer (o raio vem do uniform `uRadius`). */
const UNIT_RADIUS = 1;

function atlasUv(r: AtlasRect): Quad['uv'] {
  return [r.u0, r.v0, r.u1, r.v1];
}

/** Caixa (esquerda, topo, direita, base) de um quadrilátero de `w`×`h` px com o centro em (`cx`, `cy`). */
function boxAt(cx: number, cy: number, w: number, h: number): Quad['box'] {
  return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
}

/** Quadriláteros do marcador (`SP:marker`: disco + glifo) e do selo (`SP:badge`: disco + número) de uma UF. */
function markerQuadsOf(l: UfLabel): { id: string; quads: Quad[] }[] {
  const anchor = lonLatToVec3(l.anchor[0], l.anchor[1], UNIT_RADIUS);
  const glyph = MARKER_ATLAS.glyphs.event;
  const count = MARKER_ATLAS.counts['2'];
  const badge = MARKER_BADGE_OFFSET_PX;
  return [
    {
      id: `${l.sigla}:marker`,
      quads: [
        { dir: anchor, box: boxAt(0, 0, MARKER_BOX_PX, MARKER_BOX_PX), uv: [0, 0, 1, 1], kind: QuadKind.Marker },
        // O glifo e o número ficam em telas de tamanho fixo no atlas: trocar o símbolo muda só o u/v.
        { dir: anchor, box: boxAt(0, 0, glyph.w, glyph.h), uv: atlasUv(glyph), kind: QuadKind.Text },
      ],
    },
    {
      id: `${l.sigla}:badge`,
      quads: [
        {
          dir: anchor,
          box: boxAt(badge.x, badge.y, MARKER_BADGE_SIZE_PX, MARKER_BADGE_SIZE_PX),
          uv: [0, 0, 1, 1],
          kind: QuadKind.Badge,
        },
        { dir: anchor, box: boxAt(badge.x, badge.y, count.w, count.h), uv: atlasUv(count), kind: QuadKind.Text },
      ],
    },
  ];
}

/** Quadriláteros de um rótulo, por id (`SP:sigla`, `SP:pin`, `SP:capital`). */
function quadsOf(l: UfLabel): { id: string; quads: Quad[] }[] {
  const anchor = lonLatToVec3(l.anchor[0], l.anchor[1], UNIT_RADIUS);
  const capital = lonLatToVec3(l.capital.lon, l.capital.lat, UNIT_RADIUS);
  const { w: sw, h: sh } = l.siglaRect;
  const pin = PIN_SIZE_PX / 2;
  const dot = CAPITAL_DOT_PX / 2;
  const nameTop = dot + CAPITAL_DOT_GAP_PX;
  return [
    {
      id: `${l.sigla}:sigla`,
      quads: [{ dir: anchor, box: [-sw / 2, -sh / 2, sw / 2, sh / 2], uv: atlasUv(l.siglaRect), kind: QuadKind.Text }],
    },
    {
      id: `${l.sigla}:pin`,
      quads: [{ dir: anchor, box: [-pin, -pin, pin, pin], uv: [0, 0, 1, 1], kind: QuadKind.Pin }],
    },
    {
      id: `${l.sigla}:capital`,
      quads: [
        { dir: capital, box: [-dot, -dot, dot, dot], uv: [0, 0, 1, 1], kind: QuadKind.Dot },
        {
          dir: capital,
          box: [-l.capital.w / 2, nameTop, l.capital.w / 2, nameTop + l.capital.h],
          uv: atlasUv(l.capital),
          kind: QuadKind.Text,
        },
      ],
    },
  ];
}

/**
 * Monta os buffers de todos os rótulos (27 UFs × sigla, pin, ponto e nome da capital) e, depois deles, os espaços dos
 * marcadores (27 UFs × disco + glifo e selo + número), que o desenho liga só onde há marcador.
 */
export function buildLabelQuadBuffers(labels: readonly UfLabel[] = LABELS): LabelQuadBuffers {
  const groups: LabelQuadGroup[] = [];
  const quads: Quad[] = [];
  for (const l of labels) {
    for (const g of quadsOf(l)) {
      groups.push({ id: g.id, firstQuad: quads.length, quadCount: g.quads.length });
      quads.push(...g.quads);
    }
  }
  const markerSlots = new Map<string, { marker: number; badge: number }>();
  for (const l of labels) {
    const [marker, badge] = markerQuadsOf(l);
    markerSlots.set(l.sigla, { marker: quads.length, badge: quads.length + marker.quads.length });
    for (const g of [marker, badge]) {
      groups.push({ id: g.id, firstQuad: quads.length, quadCount: g.quads.length });
      quads.push(...g.quads);
    }
  }
  const n = quads.length;
  const positions = new Float32Array(n * VERTS_PER_QUAD * 3);
  const corners = new Float32Array(n * VERTS_PER_QUAD * 2);
  const uvs = new Float32Array(n * VERTS_PER_QUAD * 2);
  const kinds = new Float32Array(n * VERTS_PER_QUAD);
  const tints = new Float32Array(n * VERTS_PER_QUAD * 3);
  const pulses = new Float32Array(n * VERTS_PER_QUAD);
  const indices = new Uint16Array(n * INDICES_PER_QUAD);
  quads.forEach((q, i) => {
    const [x0, y0, x1, y1] = q.box;
    const [u0, v0, u1, v1] = q.uv;
    // Vértices: 0 = topo-esquerda, 1 = topo-direita, 2 = base-esquerda, 3 = base-direita.
    const cs = [x0, y0, x1, y0, x0, y1, x1, y1];
    const ts = [u0, v0, u1, v0, u0, v1, u1, v1];
    for (let k = 0; k < VERTS_PER_QUAD; k++) {
      const v = i * VERTS_PER_QUAD + k;
      positions.set(q.dir, v * 3);
      corners.set([cs[k * 2], cs[k * 2 + 1]], v * 2);
      uvs.set([ts[k * 2], ts[k * 2 + 1]], v * 2);
      kinds[v] = q.kind;
    }
    const b = i * VERTS_PER_QUAD;
    indices.set([b, b + 2, b + 1, b + 1, b + 2, b + 3], i * INDICES_PER_QUAD);
  });
  return { positions, corners, uvs, kinds, tints, pulses, indices, groups, markerSlots, quadCount: n };
}

function setQuadUv(uvs: Float32Array, quad: number, rect: AtlasRect): void {
  const { u0, v0, u1, v1 } = rect;
  uvs.set([u0, v0, u1, v0, u0, v1, u1, v1], quad * VERTS_PER_QUAD * 2);
}

function setQuadTint(tints: Float32Array, quad: number, rgb: readonly [number, number, number]): void {
  for (let k = 0; k < VERTS_PER_QUAD; k++) tints.set(rgb, (quad * VERTS_PER_QUAD + k) * 3);
}

/**
 * Grava nos atributos dinâmicos o que muda com os marcadores: cor do disco (crítico, evento ou notícia), glifo (`!` ou
 * `≡`), pulso do disco e, nos grupos de mais de um item, o número do selo. Quem muda é só `uvs`, `tints` e `pulses`
 * (o chamador marca os três como `needsUpdate`); a geometria e a visibilidade ficam como estão.
 */
export function writeMarkerAttributes(buffers: LabelQuadBuffers, markers: readonly GlobeMarker[]): void {
  const { uvs, tints, pulses, markerSlots } = buffers;
  pulses.fill(0);
  const badgeRgb = hexToRgb(MARKER_COLORS.badge);
  for (const m of markers) {
    const slot = markerSlots.get(m.sigla);
    if (!slot) continue;
    setQuadTint(tints, slot.marker, hexToRgb(markerColor(m)));
    pulses.fill(m.pulse ? 1 : 0, slot.marker * VERTS_PER_QUAD, (slot.marker + 1) * VERTS_PER_QUAD);
    setQuadUv(uvs, slot.marker + 1, MARKER_ATLAS.glyphs[m.kind]);
    if (m.count > 1) {
      setQuadTint(tints, slot.badge, badgeRgb);
      setQuadUv(uvs, slot.badge + 1, MARKER_ATLAS.counts[markerCountKey(m.count)]);
    }
  }
}

/**
 * Escreve `aVisible` (um float por vértice): 1 nos quadriláteros dos rótulos de `shown`, 0 nos demais. Devolve
 * quantos rótulos lógicos ficaram visíveis.
 */
export function writeVisibility(
  target: Float32Array,
  groups: readonly LabelQuadGroup[],
  shown: ReadonlySet<string>,
): number {
  target.fill(0);
  let count = 0;
  for (const g of groups) {
    if (!shown.has(g.id)) continue;
    count++;
    target.fill(1, g.firstQuad * VERTS_PER_QUAD, (g.firstQuad + g.quadCount) * VERTS_PER_QUAD);
  }
  return count;
}
