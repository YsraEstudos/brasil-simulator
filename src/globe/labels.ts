import { CAMERA } from './config';
import data from './data/labels.json';

/**
 * Siglas, capitais e colisões (PLANO_GLOBO.md §3.2, §3.4 e §7, PR 2). Lógica pura e sem renderizador: o globo (um
 * `Points`/malha com o atlas) e o mapa 2D (texto nativo sobre o SVG) usam as mesmas regras de visibilidade,
 * prioridade e colisão. `src/globe/data/labels.json` e `assets/globe/labels.png` são gerados por
 * `scripts/data/build_labels.py` (`npm run build:labels`) e não se editam à mão.
 *
 * Convenções de tela: pixels lógicos (dp), origem no canto superior esquerdo, y para baixo. Um candidato (`x`, `y`)
 * é o **centro** da caixa; um `Rect` é (`x`, `y`) = canto superior esquerdo.
 */

// ---------------------------------------------------------------- dados gerados

/** Retângulo de uma entrada no atlas: u/v em [0, 1] com origem no canto superior esquerdo do PNG (flipY = false). */
export type AtlasRect = {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  /** Tamanho lógico (px) da entrada na tela com escala 1: pixels do atlas ÷ `LABEL_ATLAS.scale`. */
  w: number;
  h: number;
};

export type CapitalLabel = AtlasRect & { name: string; lon: number; lat: number };

export type UfLabel = {
  sigla: string;
  nome: string;
  /** Ponto interior (lon, lat) onde a sigla é desenhada (polo de inacessibilidade do maior anel), não o centroide. */
  anchor: [number, number];
  areaKm2: number;
  /** Largura × altura da caixa do maior anel, em graus "equivalentes" (largura já multiplicada por cos(lat)). */
  extent: [number, number];
  /** Posto de população no cenário (1 = menos populosa … 27 = mais populosa): quem vence uma colisão. */
  priority: number;
  siglaRect: AtlasRect;
  capital: CapitalLabel;
};

/**
 * Glifos dos marcadores (PR 11 e PR 13): o "!" do evento, o "≡" da notícia, o "⚑" da visita presidencial, o "⚒" da obra
 * e o número do selo de grupo.
 */
export type MarkerAtlas = {
  glyphs: { event: AtlasRect; news: AtlasRect; visit: AtlasRect; work: AtlasRect };
  /** "2" … "9" e "9+", por texto do selo. */
  counts: Readonly<Record<string, AtlasRect>>;
};

type LabelsFile = {
  atlas: { width: number; height: number; scale: number };
  ufs: UfLabel[];
  markers: MarkerAtlas;
};

const FILE = data as unknown as LabelsFile;

/** Tamanho do PNG e fator de resolução: o atlas está desenhado em `scale`× o tamanho lógico. */
export const LABEL_ATLAS = FILE.atlas;
/** As 27 UFs, na mesma ordem de `UFS`. */
export const LABELS: readonly UfLabel[] = FILE.ufs;
/** Glifos dos marcadores no mesmo atlas das siglas (`markers.ts`). */
export const MARKER_ATLAS: MarkerAtlas = FILE.markers;

// ---------------------------------------------------------------- parâmetros

/** Abaixo desta altitude da câmera (raios terrestres, ~1900 km de largura visível) as capitais aparecem. */
export const CAPITAL_MAX_ALTITUDE = 0.3;
/** Siglas valem em toda a faixa da câmera; quem decide texto × pin é o tamanho da UF na tela. */
export const SIGLA_MAX_ALTITUDE = CAMERA.maxAltitude;
/**
 * A sigla vira texto quando a caixa da UF na tela é ao menos `TEXT_FIT_FACTOR` vezes a caixa do texto, nas duas
 * dimensões; senão vira pin. Com 1,0 e o globo inteiro numa tela de 800 dp (≈ 9 px/°), DF, SE e ES são pins e AL ainda
 * leva texto.
 */
export const TEXT_FIT_FACTOR = 1;
/** Diâmetro lógico (px) do pin de UF pequena e do ponto da capital (escala 1). */
export const PIN_SIZE_PX = 8;
export const CAPITAL_DOT_PX = 5;
/** Folga (px) entre o ponto da capital e o seu nome. */
export const CAPITAL_DOT_GAP_PX = 2;
/** Folga mínima (px) entre dois rótulos e entre um rótulo e uma área reservada. */
export const LABEL_PADDING_PX = 3;
/** Sigla e pin vencem qualquer capital: a prioridade deles soma este valor (> 27, o maior posto). */
export const SIGLA_PRIORITY_BONUS = 100;
/** Quanto do aumento do texto do aplicativo (0,9–1,3) vai para os rótulos: o atlas é raster, não cresce tanto. */
export const LABEL_SCALE_FOLLOW = 0.6;
export const LABEL_SCALE_MIN = 0.9;
export const LABEL_SCALE_MAX = 1.2;

// ---------------------------------------------------------------- escala e acessibilidade

/**
 * Tamanho dos rótulos a partir do ajuste de texto do aplicativo (`TEXT_SCALES` = 0,9 / 1 / 1,15 / 1,3).
 * Acompanha só parte do ajuste e fica entre `LABEL_SCALE_MIN` e `LABEL_SCALE_MAX`.
 */
export function labelScale(textScale: number): number {
  const scaled = 1 + (textScale - 1) * LABEL_SCALE_FOLLOW;
  return Math.min(LABEL_SCALE_MAX, Math.max(LABEL_SCALE_MIN, scaled));
}

// ---------------------------------------------------------------- tamanho na tela

const DEG = Math.PI / 180;

/**
 * Pixels por grau de superfície no centro da tela, para a câmera do globo (FOV vertical `fovDeg`, altitude em
 * raios terrestres). Mesma conta de `pixelsPerRadian` do LOD, vezes π/180.
 */
export function pixelsPerDegreeAtAltitude(
  altitude: number,
  viewportHeightPx: number,
  fovDeg: number = CAMERA.fovDeg,
): number {
  const pixelsPerRadian = viewportHeightPx / (2 * Math.tan((fovDeg * DEG) / 2) * altitude);
  return pixelsPerRadian * DEG;
}

/** Tamanho (px) da caixa da UF na tela, dados os pixels por grau. */
export function ufScreenSize(label: Pick<UfLabel, 'extent'>, pixelsPerDegree: number): { w: number; h: number } {
  return { w: label.extent[0] * pixelsPerDegree, h: label.extent[1] * pixelsPerDegree };
}

/** `text` quando a sigla cabe dentro da UF na tela; `pin` quando a UF é pequena demais (DF, SE, ES no zoom geral). */
export type UfLabelMode = 'text' | 'pin';

export function ufLabelMode(label: UfLabel, pixelsPerDegree: number, scale = 1): UfLabelMode {
  const size = ufScreenSize(label, pixelsPerDegree);
  const fits =
    size.w >= label.siglaRect.w * scale * TEXT_FIT_FACTOR && size.h >= label.siglaRect.h * scale * TEXT_FIT_FACTOR;
  return fits ? 'text' : 'pin';
}

// ---------------------------------------------------------------- níveis por altitude

export type LabelTier = {
  /** Siglas (texto ou pin) visíveis. */
  siglas: boolean;
  /** Nomes de capital visíveis. */
  capitals: boolean;
};

/** O que desenhar na altitude da câmera (raios terrestres). Siglas sempre; capitais só de perto. */
export function labelTier(altitude: number): LabelTier {
  return { siglas: altitude <= SIGLA_MAX_ALTITUDE, capitals: altitude <= CAPITAL_MAX_ALTITUDE };
}

// ---------------------------------------------------------------- colisão em tela

export type Rect = { x: number; y: number; w: number; h: number };

export type LabelKind = 'marker' | 'pin' | 'sigla' | 'capital';

export type LabelCandidate = {
  id: string;
  /** Centro da caixa, em px. */
  x: number;
  y: number;
  w: number;
  h: number;
  priority: number;
  kind: LabelKind;
};

export type LabelViewport = {
  width: number;
  height: number;
  /** Faixas (px) onde nenhum rótulo cabe por inteiro: barras de sistema, cabeçalho, botões fixos. */
  insets: { top: number; right: number; bottom: number; left: number };
};

/** Em empate de prioridade, marcadores vêm primeiro, depois pins e siglas, e por último capitais. */
const KIND_ORDER: Record<LabelKind, number> = { marker: -1, pin: 0, sigla: 1, capital: 2 };

export function candidateRect(c: Pick<LabelCandidate, 'x' | 'y' | 'w' | 'h'>): Rect {
  return { x: c.x - c.w / 2, y: c.y - c.h / 2, w: c.w, h: c.h };
}

/** Os retângulos se sobrepõem (ou ficam a menos de `gap` px um do outro)? */
export function rectsCollide(a: Rect, b: Rect, gap = LABEL_PADDING_PX): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

function insideViewport(r: Rect, v: LabelViewport): boolean {
  return (
    r.x >= v.insets.left &&
    r.y >= v.insets.top &&
    r.x + r.w <= v.width - v.insets.right &&
    r.y + r.h <= v.height - v.insets.bottom
  );
}

/**
 * Escolhe quais rótulos desenhar: guloso por prioridade (maior primeiro; empate: pin → sigla → capital, depois `id`).
 * Descarta o que sai da área segura da tela ou toca uma área reservada (botões do HUD), e o que colide — com
 * `LABEL_PADDING_PX` de folga — com um rótulo já aceito. Determinístico: não depende da ordem dos candidatos.
 */
export function layoutLabels<T extends LabelCandidate>(
  candidates: readonly T[],
  viewport: LabelViewport,
  reserved: readonly Rect[] = [],
): Set<string> {
  const order = [...candidates].sort(
    (a, b) =>
      b.priority - a.priority || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const accepted: Rect[] = [];
  const shown = new Set<string>();
  for (const c of order) {
    const r = candidateRect(c);
    if (!insideViewport(r, viewport)) continue;
    if (reserved.some((q) => rectsCollide(r, q))) continue;
    if (accepted.some((q) => rectsCollide(r, q))) continue;
    accepted.push(r);
    shown.add(c.id);
  }
  return shown;
}

// ---------------------------------------------------------------- candidatos por UF

/** Candidato de uma UF; `anchorX`/`anchorY` dizem ao renderizador onde fica o ponto (sigla, pin ou capital). */
export type UfLabelCandidate = LabelCandidate & {
  sigla: string;
  /** Ponto da UF na tela (âncora da sigla/pin ou o ponto da capital), em px. */
  anchorX: number;
  anchorY: number;
};

export type CandidateOptions = {
  /** lon/lat → px de tela, ou `null` se o ponto não aparece (lado oculto do globo, fora do mapa). */
  project: (lon: number, lat: number) => { x: number; y: number } | null;
  pixelsPerDegree: number;
  tier: LabelTier;
  /** Resultado de `labelScale(textScale)`. */
  scale: number;
};

/**
 * Candidatos de rótulo para a tela atual. Sigla = texto no âncora (UF grande) ou pin (UF pequena, ver `ufLabelMode`);
 * capital = ponto na sede com o nome logo abaixo (a caixa cobre o ponto e o texto; o nome fica na base da caixa). Passe o resultado a `layoutLabels`.
 */
export function buildLabelCandidates(opts: CandidateOptions): UfLabelCandidate[] {
  const { project, pixelsPerDegree, tier, scale } = opts;
  const out: UfLabelCandidate[] = [];
  for (const l of LABELS) {
    if (tier.siglas) {
      const p = project(l.anchor[0], l.anchor[1]);
      if (p) {
        const pin = ufLabelMode(l, pixelsPerDegree, scale) === 'pin';
        out.push({
          id: `${l.sigla}:${pin ? 'pin' : 'sigla'}`,
          sigla: l.sigla,
          kind: pin ? 'pin' : 'sigla',
          x: p.x,
          y: p.y,
          w: pin ? PIN_SIZE_PX * scale : l.siglaRect.w * scale,
          h: pin ? PIN_SIZE_PX * scale : l.siglaRect.h * scale,
          priority: l.priority + SIGLA_PRIORITY_BONUS,
          anchorX: p.x,
          anchorY: p.y,
        });
      }
    }
    if (tier.capitals) {
      const p = project(l.capital.lon, l.capital.lat);
      if (p) {
        const dot = CAPITAL_DOT_PX * scale;
        // A caixa cobre o ponto (em cima, centrado em `p`) e o nome logo abaixo.
        const h = dot + CAPITAL_DOT_GAP_PX + l.capital.h * scale;
        out.push({
          id: `${l.sigla}:capital`,
          sigla: l.sigla,
          kind: 'capital',
          x: p.x,
          y: p.y - dot / 2 + h / 2,
          w: Math.max(l.capital.w * scale, dot),
          h,
          priority: l.priority,
          anchorX: p.x,
          anchorY: p.y,
        });
      }
    }
  }
  return out;
}
