import { LABELS, type CandidateOptions, type UfLabelCandidate } from './labels';

/**
 * Marcadores de eventos, notícias, visitas e obras no globo e no mapa 2D (PLANO_GLOBO.md §3.4 e §7, PR 11 e PR 13). Regras
 * puras e sem renderizador, compartilhadas pelo globo (os quadriláteros vão no mesmo `BufferGeometry` e no mesmo atlas das
 * siglas, uma chamada de desenho) e pelo mapa 2D (ícones nativos). Um marcador por UF: o grupo de eventos, notícias,
 * visitas presidenciais recentes e obras em andamento da UF.
 * Marcadores não são iluminados pelo Sol (como os rótulos) e **vencem** os rótulos de UF numa colisão — a sigla da UF
 * some sob o marcador; o nome continua no cartão, na lista e no rótulo de acessibilidade do 2D.
 */

/** Evento e notícia (PR 11); visita presidencial recente e obra em andamento da UF (PR 13: não críticas, sem pulso). */
export type MarkerKind = 'event' | 'news' | 'visit' | 'work';

/**
 * Qual tipo dá a cara do marcador do grupo (glifo e cor) e a ordem dos itens: evento, notícia, obra, visita. O crítico
 * manda por cima de tudo (`critical`).
 */
export const MARKER_KIND_ORDER: readonly MarkerKind[] = ['event', 'news', 'work', 'visit'];

/** O que o desenho precisa saber de um marcador (o modelo do mapa acrescenta os itens e os textos). */
export interface GlobeMarker {
  sigla: string;
  /** O tipo de maior ordem do grupo (`MARKER_KIND_ORDER`): `event` se há evento; senão `news`, `work` ou `visit`. */
  kind: MarkerKind;
  /** Algum evento do grupo é crítico (`markersView`): cor de alerta e prioridade acima dos demais. */
  critical: boolean;
  /** Itens do grupo (eventos, notícias, visitas e obras): acima de 1 aparece o selo com o número. */
  count: number;
  /** Pulso breve: só marcadores com evento crítico novo (ver `markerPulse`). */
  pulse: boolean;
}

// ---------------------------------------------------------------- tamanho e cor

/** Diâmetro lógico (px, escala 1) do disco do marcador. */
export const MARKER_SIZE_PX = 20;
/**
 * Lado da caixa do quadrilátero do disco: o dobro do disco, o espaço do anel do pulso. Só o disco entra no layout e no
 * toque; o resto da caixa é transparente.
 */
export const MARKER_BOX_PX = MARKER_SIZE_PX * 2;
/** Fração do raio da caixa que o disco ocupa (coordenada local do shader: 0 no centro, 1 na borda da caixa). */
export const MARKER_DISC_FRACTION = MARKER_SIZE_PX / MARKER_BOX_PX;
/** Diâmetro do selo com o número de itens do grupo e a posição do centro dele (canto superior direito do disco). */
export const MARKER_BADGE_SIZE_PX = 14;
export const MARKER_BADGE_OFFSET_PX = { x: 9, y: -9 } as const;
/** Folga extra (px) em volta do disco para o toque: o dedo é maior que 20 dp. */
export const MARKER_HIT_PADDING_PX = 12;
/** Folga (px) da caixa do candidato de colisão em volta do disco (cobre o selo). */
const MARKER_COLLISION_PADDING_PX = 4;

/**
 * Cores do disco (hex sRGB): crítico em vermelho, evento em âmbar, notícia em azul, visita em verde e obra em violeta; o
 * selo é escuro.
 */
export const MARKER_COLORS = {
  critical: '#e5484d',
  event: '#f5a524',
  news: '#4f9dff',
  visit: '#2fbf8f',
  work: '#9b7bff',
  badge: '#10141c',
} as const;

/** Cor do disco de um marcador. A cor não é o único sinal: o glifo (`!`, `≡`, `⚑`, `⚒`) e o texto de acessibilidade também dizem. */
export function markerColor(marker: Pick<GlobeMarker, 'kind' | 'critical'>): string {
  return marker.critical ? MARKER_COLORS.critical : MARKER_COLORS[marker.kind];
}

/** `#rrggbb` → [r, g, b] em 0–1 (atributo `aTint` do shader). */
export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Texto do selo do grupo: "2" … "9", e "9+" de 10 itens para cima (as chaves de `MARKER_ATLAS.counts`). */
export function markerCountKey(count: number): string {
  return count > 9 ? '9+' : String(count);
}

// ---------------------------------------------------------------- prioridade e colisão

/**
 * Prioridade de um marcador: acima de qualquer sigla (`SIGLA_PRIORITY_BONUS` + posto ≤ 127), com o posto de população
 * da UF para desempatar e um bônus para o crítico, que vence os demais.
 */
export const MARKER_PRIORITY_BASE = 200;
export const MARKER_CRITICAL_BONUS = 100;

const RANK = new Map(LABELS.map((l) => [l.sigla, l.priority]));

export function markerPriority(marker: Pick<GlobeMarker, 'sigla' | 'critical'>): number {
  return MARKER_PRIORITY_BASE + (marker.critical ? MARKER_CRITICAL_BONUS : 0) + (RANK.get(marker.sigla) ?? 0);
}

/** Candidatos de colisão dos marcadores, no âncora interior da UF (o mesmo ponto da sigla). Passe-os a `layoutLabels`. */
export function buildMarkerCandidates(
  markers: readonly GlobeMarker[],
  opts: Pick<CandidateOptions, 'project' | 'scale'>,
): UfLabelCandidate[] {
  const out: UfLabelCandidate[] = [];
  const anchors = new Map(LABELS.map((l) => [l.sigla, l.anchor]));
  for (const m of markers) {
    const anchor = anchors.get(m.sigla);
    if (!anchor) continue;
    const p = opts.project(anchor[0], anchor[1]);
    if (!p) continue;
    const size = (MARKER_SIZE_PX + MARKER_COLLISION_PADDING_PX) * opts.scale;
    out.push({
      id: `${m.sigla}:marker`,
      sigla: m.sigla,
      kind: 'marker',
      x: p.x,
      y: p.y,
      w: size,
      h: size,
      priority: markerPriority(m),
      anchorX: p.x,
      anchorY: p.y,
    });
  }
  return out;
}

// ---------------------------------------------------------------- toque

/** Um marcador desenhado agora, com o centro na tela (px). */
export interface MarkerPoint {
  sigla: string;
  x: number;
  y: number;
}

/**
 * O marcador tocado em (`x`, `y`), em px da tela: o de centro mais próximo dentro do raio do disco mais a folga do dedo
 * (`MARKER_HIT_PADDING_PX`). Vale antes da seleção de UF: tocar no marcador não seleciona o estado.
 */
export function hitTestMarkers(points: readonly MarkerPoint[], x: number, y: number, scale: number): string | null {
  const reach = (MARKER_SIZE_PX / 2 + MARKER_HIT_PADDING_PX) * scale;
  let best: { sigla: string; d: number } | null = null;
  for (const p of points) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= reach && (best === null || d < best.d)) best = { sigla: p.sigla, d };
  }
  return best?.sigla ?? null;
}
