import { COUNTRIES, COUNTRY_ATLAS, type Country } from './countries';
import { lonLatToVec3 } from './geo';
import { INDICES_PER_QUAD, VERTS_PER_QUAD, type LabelQuadGroup } from './labelQuads';
import type { LabelCandidate } from './labels';

/**
 * Nomes dos países no globo (PLANO_PAISES.md, Fase P1). Regras puras, sem three.js: quais nomes podem aparecer na
 * altitude da câmera, os candidatos que entram na **mesma** colisão das siglas e capitais das UFs (`layoutGlobe`), os
 * buffers da malha dos nomes (uma chamada de desenho, atlas de campo de distância) e o toque no nome.
 */

/** Pixels por grau no mapa da web no zoom `z` (o mundo tem 256·2^z px de largura): a escala do `minZoom`. */
export function webZoomPixelsPerDegree(zoom: number): number {
  return (256 * 2 ** zoom) / 360;
}

/**
 * O nome do país pode aparecer com estes pixels por grau? Sim a partir do zoom em que o Natural Earth o mostra
 * (`minZoom`: países grandes desde o globo inteiro, os minúsculos só de perto) ou quando o nome cabe dentro do país na
 * tela, como as siglas das UFs (o Saara Ocidental tem `minZoom` alto, mas é grande). Quem cabe de fato decide a colisão.
 */
export function countryNameAllowed(
  country: Pick<Country, 'minZoom' | 'extent' | 'rect'>,
  pixelsPerDegree: number,
  scale = 1,
): boolean {
  if (pixelsPerDegree >= webZoomPixelsPerDegree(country.minZoom)) return true;
  const textW = (country.rect.w - 2 * COUNTRY_LABEL_PAD_PX) * scale;
  const textH = (country.rect.h - 2 * COUNTRY_LABEL_PAD_PX) * scale;
  return country.extent[0] * pixelsPerDegree >= textW && country.extent[1] * pixelsPerDegree >= textH;
}

/**
 * O nome de país perde de qualquer rótulo de UF: a prioridade dele fica abaixo de 1 (a menor prioridade de UF, a
 * capital da UF menos populosa).
 */
export const COUNTRY_PRIORITY_OFFSET = -1000;

/**
 * Folga (px lógicos) que o atlas guarda em volta de cada nome para o campo de distância: o quadrilátero desenhado a
 * inclui, a caixa da colisão não.
 */
export const COUNTRY_LABEL_PAD_PX = (COUNTRY_ATLAS.spread + 1) / COUNTRY_ATLAS.scale;

/** Id do candidato e do quadrilátero do nome do país. */
export function countryLabelId(countryId: string): string {
  return `${countryId}:country`;
}

export type CountryLabelCandidate = LabelCandidate & { countryId: string };

export type CountryCandidateOptions = {
  /** lon/lat → px de tela, ou `null` se o ponto não aparece (lado oculto do globo, fora da tela). */
  project: (lon: number, lat: number) => { x: number; y: number } | null;
  pixelsPerDegree: number;
  /** `labelScale(textScale)`. */
  scale: number;
};

/** Candidatos dos nomes de país na tela atual: centro no ponto do nome, caixa do texto sem a folga do atlas. */
export function buildCountryCandidates(
  opts: CountryCandidateOptions,
  countries: readonly Country[] = COUNTRIES,
): CountryLabelCandidate[] {
  const { project, pixelsPerDegree, scale } = opts;
  const out: CountryLabelCandidate[] = [];
  for (const c of countries) {
    if (!countryNameAllowed(c, pixelsPerDegree, scale)) continue;
    const p = project(c.anchor[0], c.anchor[1]);
    if (!p) continue;
    out.push({
      id: countryLabelId(c.id),
      countryId: c.id,
      kind: 'country',
      x: p.x,
      y: p.y,
      w: Math.max(1, c.rect.w - 2 * COUNTRY_LABEL_PAD_PX) * scale,
      h: Math.max(1, c.rect.h - 2 * COUNTRY_LABEL_PAD_PX) * scale,
      priority: c.priority + COUNTRY_PRIORITY_OFFSET,
    });
  }
  return out;
}

// ---------------------------------------------------------------- toque no nome

/** Um nome desenhado agora: a caixa (centro e tamanho, px) que o toque procura. */
export type CountryLabelPoint = { countryId: string; x: number; y: number; w: number; h: number };

/** Folga (px) em volta do nome para o toque: nomes de 10 px são alvos pequenos para o dedo. */
export const COUNTRY_LABEL_HIT_PADDING_PX = 8;

/**
 * O país cujo nome está sob o toque (`x`, `y`, px da tela), ou `null`. Com nomes vizinhos, vale o de centro mais perto.
 * É assim que se toca nos países que somem na grade do toque (Vaticano, Mônaco, São Martinho).
 */
export function hitTestCountryLabels(points: readonly CountryLabelPoint[], x: number, y: number): string | null {
  let best: { id: string; d: number } | null = null;
  for (const p of points) {
    const dx = Math.abs(x - p.x);
    const dy = Math.abs(y - p.y);
    if (dx > p.w / 2 + COUNTRY_LABEL_HIT_PADDING_PX || dy > p.h / 2 + COUNTRY_LABEL_HIT_PADDING_PX) continue;
    const d = dx * dx + dy * dy;
    if (!best || d < best.d) best = { id: p.countryId, d };
  }
  return best?.id ?? null;
}

// ---------------------------------------------------------------- malha dos nomes

export type CountryQuadBuffers = {
  /** `x y z` por vértice: direção unitária do ponto do nome. */
  positions: Float32Array;
  /** `x y` por vértice: deslocamento em px lógicos (escala 1) a partir do ponto projetado; y para baixo. */
  corners: Float32Array;
  /** `u v` por vértice no atlas (origem no topo). */
  uvs: Float32Array;
  /** `r g b` por vértice: 1 no canal do nome no atlas, 0 nos outros. */
  channels: Float32Array;
  indices: Uint16Array;
  /** Um grupo de um quadrilátero por país, na ordem de `COUNTRIES` (para `writeVisibility`). */
  groups: LabelQuadGroup[];
  quadCount: number;
};

/** Um quadrilátero por país, centrado no ponto do nome, com o retângulo inteiro do atlas (texto + folga). */
export function buildCountryQuadBuffers(countries: readonly Country[] = COUNTRIES): CountryQuadBuffers {
  const n = countries.length;
  const positions = new Float32Array(n * VERTS_PER_QUAD * 3);
  const corners = new Float32Array(n * VERTS_PER_QUAD * 2);
  const uvs = new Float32Array(n * VERTS_PER_QUAD * 2);
  const channels = new Float32Array(n * VERTS_PER_QUAD * 3);
  const indices = new Uint16Array(n * INDICES_PER_QUAD);
  const groups: LabelQuadGroup[] = [];
  countries.forEach((c, i) => {
    const dir = lonLatToVec3(c.anchor[0], c.anchor[1], 1);
    const { u0, v0, u1, v1, w, h, channel } = c.rect;
    // Vértices: 0 = topo-esquerda, 1 = topo-direita, 2 = base-esquerda, 3 = base-direita.
    const cs = [-w / 2, -h / 2, w / 2, -h / 2, -w / 2, h / 2, w / 2, h / 2];
    const ts = [u0, v0, u1, v0, u0, v1, u1, v1];
    const mask = [channel === 0 ? 1 : 0, channel === 1 ? 1 : 0, channel === 2 ? 1 : 0];
    for (let k = 0; k < VERTS_PER_QUAD; k++) {
      const v = i * VERTS_PER_QUAD + k;
      positions.set(dir, v * 3);
      corners.set([cs[k * 2], cs[k * 2 + 1]], v * 2);
      uvs.set([ts[k * 2], ts[k * 2 + 1]], v * 2);
      channels.set(mask, v * 3);
    }
    const b = i * VERTS_PER_QUAD;
    indices.set([b, b + 2, b + 1, b + 1, b + 2, b + 3], i * INDICES_PER_QUAD);
    groups.push({ id: countryLabelId(c.id), firstQuad: i, quadCount: 1 });
  });
  return { positions, corners, uvs, channels, indices, groups, quadCount: n };
}
