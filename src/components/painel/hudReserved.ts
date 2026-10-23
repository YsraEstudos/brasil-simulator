import type { LabelViewport, Rect } from '@/globe/labels';

/**
 * Medidas do HUD do Painel e as áreas onde as siglas e capitais do mapa não podem aparecer (PLANO_GLOBO.md §7, PR 2:
 * "nunca por cima dos botões do HUD"). As constantes são as do `PainelScreen` (que as importa daqui), então o layout
 * dos botões e a área reservada andam juntos; os testes conferem os números em 320, 360 e 400 dp.
 */

/** Medidas fixas da mesa (px, sem as safe areas), para os trilhos laterais não passarem por baixo do topo/doca. */
export const TOP_INSET = { portrait: 118 + 56, compact: 56 } as const;
/** Retrato: a doca tem duas linhas — o Encerrar o mês (52) em cima e os quatro botões de subtela (54) embaixo. */
export const DOCK_HEIGHT_PORTRAIT = 54 + 6 + 52;
/** Paisagem: a doca (botões de 40) e o Encerrar compacto, com a folga até a base; os trilhos param acima dela. */
export const DOCK_HEIGHT_COMPACT = 6 + 40 + 8;
/** Faixa do `DemoBadge` acima da doca (selo + espaçamento). */
export const DEMO_BADGE_BAND = 28;

/** Tamanho dos botões redondos dos trilhos e o espaço entre eles. */
export const RAIL_BUTTON = { portrait: 48, compact: 40 } as const;
export const RAIL_GAP = { portrait: 10, compact: 6 } as const;
/** Distância dos trilhos à borda da tela (além da área segura) e folga extra ao redor de cada botão reservado. */
export const RAIL_EDGE = 8;
export const RESERVED_MARGIN = 4;
/** Espaço entre o trilho e a doca (retrato): os trilhos terminam acima dela. */
export const RAIL_DOCK_GAP = 10;

export type SafeInsets = { top: number; right: number; bottom: number; left: number };

export type PainelReserveInput = {
  width: number;
  height: number;
  insets: SafeInsets;
  /** Paisagem (largura maior que a altura). */
  compact: boolean;
  /** Selo "demonstração" acima da doca (sem partida). */
  demo: boolean;
  /** Botões do trilho esquerdo e do direito. */
  leftRailCount: number;
  rightRailCount: number;
};

/** Altura (px) da faixa de baixo ocupada pela doca, o Encerrar o mês e o selo de demonstração. */
export function bottomBandHeight({ compact, demo, insets }: Pick<PainelReserveInput, 'compact' | 'demo' | 'insets'>) {
  const dock = compact ? DOCK_HEIGHT_COMPACT : RAIL_EDGE + DOCK_HEIGHT_PORTRAIT;
  return dock + (demo ? DEMO_BADGE_BAND : 0) + insets.bottom;
}

/** Altura (px) da faixa de cima (barra do topo com os números, em retrato duas linhas de números). */
export function topBandHeight({ compact, insets }: Pick<PainelReserveInput, 'compact' | 'insets'>) {
  return (compact ? TOP_INSET.compact : TOP_INSET.portrait) + insets.top;
}

function railRect(count: number, x: number, input: PainelReserveInput): Rect | null {
  if (count <= 0) return null;
  const { compact, height } = input;
  const button = compact ? RAIL_BUTTON.compact : RAIL_BUTTON.portrait;
  const gap = compact ? RAIL_GAP.compact : RAIL_GAP.portrait;
  const railHeight = count * button + (count - 1) * gap;
  // Mesma conta do `PainelScreen`: a área dos trilhos vai do fim da barra do topo ao início da doca (+ folga) e o
  // trilho fica centrado nela (`alignItems: 'center'`).
  const top = topBandHeight(input);
  const bottomPad = bottomBandHeight(input) + (compact ? 0 : RAIL_DOCK_GAP);
  const free = height - top - bottomPad;
  const y = top + (free - railHeight) / 2;
  return {
    x: x - RESERVED_MARGIN,
    y: y - RESERVED_MARGIN,
    w: button + 2 * RESERVED_MARGIN,
    h: railHeight + 2 * RESERVED_MARGIN,
  };
}

/**
 * Onde os rótulos do mapa não podem ficar: as barras de cima e de baixo viram `insets` (a caixa precisa caber entre
 * elas) e cada trilho de botões vira um retângulo reservado. Os botões do HUD só ocupam essas áreas; o resto da
 * tela é do mapa.
 */
export function painelLabelReserve(input: PainelReserveInput): { rects: Rect[]; insets: LabelViewport['insets'] } {
  const { width, insets, compact } = input;
  const button = compact ? RAIL_BUTTON.compact : RAIL_BUTTON.portrait;
  const left = railRect(input.leftRailCount, RAIL_EDGE + insets.left, input);
  const right = railRect(input.rightRailCount, width - RAIL_EDGE - insets.right - button, input);
  return {
    rects: [left, right].filter((r): r is Rect => r !== null),
    insets: {
      top: topBandHeight(input),
      right: insets.right,
      bottom: bottomBandHeight(input),
      left: insets.left,
    },
  };
}
