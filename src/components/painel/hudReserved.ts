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
/** Faixa da legenda fixa do mapa acima da doca, quando há camada ativa (Fase Q11, B42). */
export const LEGEND_BAND = 30;

/**
 * Canto do relógio e da bateria (PLANO_SAVES_HISTORICO.md H1, D33): uma faixa logo abaixo da barra do topo, no canto
 * do trilho "o mês" (destro: esquerda; canhoto: direita), o mais curto: só ele desce para dar lugar ao relógio. Medidas em escala 1 do texto; crescem com ela.
 */
export const CLOCK_BAND = 22;
export const CLOCK_WIDTH = 104;

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
  /** Legenda fixa do mapa acima da doca (camada ativa). */
  legend?: boolean;
  /**
   * Botões do trilho "o mês" (`leftRail` do `mesaNav`) e do trilho "o país" (`RIGHT_RAIL`). "Esquerdo" e "direito" são
   * os do modo destro: no canhoto os trilhos trocam de lado, a contagem continua a de cada um.
   */
  leftRailCount: number;
  rightRailCount: number;
  /** Modo canhoto (`prefs.leftHanded`): espelha os trilhos e o Encerrar o mês. Padrão: destro. */
  leftHanded?: boolean;
  /** Relógio do HUD ligado (`prefs.hudClock`): reserva o canto dele e o trilho "o mês" começa abaixo. */
  clock?: boolean;
  /** Escala do texto (Configurações): o canto do relógio cresce com ela. Padrão 1. */
  textScale?: number;
  /** Fim medido da barra do topo (px): o relógio nunca sobe acima dele, para não cobrir os números. */
  topBarBottom?: number;
};

/** Lado da tela onde fica um conjunto da mesa. */
export type MesaSide = 'left' | 'right';

/**
 * Lado de cada conjunto da mesa (preferência `prefs.leftHanded`, modo canhoto). Destro: o trilho "o mês" à esquerda, "o país"
 * à direita e o Encerrar o mês no canto inferior direito. Canhoto: os trilhos trocam de lado e o Encerrar vai para o
 * canto inferior esquerdo. A doca de subtelas não muda: ela é uma faixa centralizada ou esticada na largura toda.
 */
export function mesaSides(leftHanded: boolean): { monthRail: MesaSide; countryRail: MesaSide; endMonth: MesaSide } {
  return leftHanded
    ? { monthRail: 'right', countryRail: 'left', endMonth: 'left' }
    : { monthRail: 'left', countryRail: 'right', endMonth: 'right' };
}

/** Altura (px) da faixa de baixo ocupada pela doca, o Encerrar o mês e o selo de demonstração. */
export function bottomBandHeight({
  compact,
  demo,
  legend = false,
  insets,
}: Pick<PainelReserveInput, 'compact' | 'demo' | 'legend' | 'insets'>) {
  const dock = compact ? DOCK_HEIGHT_COMPACT : RAIL_EDGE + DOCK_HEIGHT_PORTRAIT;
  return dock + (demo ? DEMO_BADGE_BAND : 0) + (legend ? LEGEND_BAND : 0) + insets.bottom;
}

/** Altura (px) da faixa de cima (barra do topo com os números, em retrato duas linhas de números). */
export function topBandHeight({ compact, insets }: Pick<PainelReserveInput, 'compact' | 'insets'>) {
  return (compact ? TOP_INSET.compact : TOP_INSET.portrait) + insets.top;
}

/** Altura e largura (px) do canto do relógio na escala do texto. */
export function clockSize(textScale = 1): { w: number; h: number } {
  return { w: Math.ceil(CLOCK_WIDTH * textScale), h: Math.ceil(CLOCK_BAND * textScale) };
}

/** Topo (px) do canto do relógio: logo abaixo da barra do topo, a calculada ou a medida, a que for mais baixa. */
export function clockTop(input: Pick<PainelReserveInput, 'compact' | 'insets' | 'topBarBottom'>): number {
  return Math.max(topBandHeight(input), input.topBarBottom ?? 0);
}

/** Onde começa a área do trilho "o mês": abaixo da barra do topo e, com o relógio, abaixo do canto dele. */
export function monthRailTop(input: PainelReserveInput): number {
  return input.clock ? clockTop(input) + clockSize(input.textScale).h : topBandHeight(input);
}

/**
 * Quanto (px) o trilho "o mês" desce por causa do relógio: na tela vira `marginTop` dele, e como o trilho fica
 * centrado na linha, o centro desce metade disso, o mesmo que centrá-lo entre o relógio e a doca.
 */
export function clockRailShift(input: PainelReserveInput): number {
  return monthRailTop(input) - topBandHeight(input);
}

/**
 * Retângulo do relógio (com a folga `RESERVED_MARGIN`), ou `null` sem ele. Fica colado à borda da área segura do
 * lado do trilho "o mês" (`mesaSides`), então no canhoto vai para a direita.
 */
export function clockRect(input: PainelReserveInput): Rect | null {
  if (!input.clock) return null;
  const { w, h } = clockSize(input.textScale);
  const side = mesaSides(input.leftHanded ?? false).monthRail;
  const x = side === 'left' ? RAIL_EDGE + input.insets.left : input.width - RAIL_EDGE - input.insets.right - w;
  return {
    x: x - RESERVED_MARGIN,
    y: clockTop(input) - RESERVED_MARGIN,
    w: w + 2 * RESERVED_MARGIN,
    h: h + 2 * RESERVED_MARGIN,
  };
}

function railRect(count: number, x: number, input: PainelReserveInput, top: number): Rect | null {
  if (count <= 0) return null;
  const { compact, height } = input;
  const button = compact ? RAIL_BUTTON.compact : RAIL_BUTTON.portrait;
  const gap = compact ? RAIL_GAP.compact : RAIL_GAP.portrait;
  const railHeight = count * button + (count - 1) * gap;
  // Mesma conta do `PainelScreen`: a área dos trilhos vai do fim da barra do topo ao início da doca (+ folga) e o
  // trilho fica centrado nela (`alignItems: 'center'`).
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
  const { width, insets, compact, leftHanded = false } = input;
  const button = compact ? RAIL_BUTTON.compact : RAIL_BUTTON.portrait;
  const sides = mesaSides(leftHanded);
  // Os trilhos são colados às bordas da área segura; o lado de cada um vem de `mesaSides` (no canhoto, espelhado).
  const xOf = (side: MesaSide) =>
    side === 'left' ? RAIL_EDGE + insets.left : width - RAIL_EDGE - insets.right - button;
  const monthRect = railRect(input.leftRailCount, xOf(sides.monthRail), input, monthRailTop(input));
  const countryRect = railRect(input.rightRailCount, xOf(sides.countryRail), input, topBandHeight(input));
  return {
    rects: [monthRect, countryRect, clockRect(input)].filter((r): r is Rect => r !== null),
    insets: {
      top: topBandHeight(input),
      right: insets.right,
      bottom: bottomBandHeight(input),
      left: insets.left,
    },
  };
}
