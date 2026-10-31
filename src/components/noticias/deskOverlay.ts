import type { DeskLayout, ScreenRect } from './deskCamera';

/** Onde as camadas da interface ficam sobre a mesa 3D (jornal e tela das redes). Funções puras, sem React. */

export type Insets = { top: number; bottom: number; left: number; right: number };

export const rectStyle = (r: ScreenRect) => ({ left: r.x, top: r.y, width: r.width, height: r.height });

/** Margem entre o jornal e as bordas (e o notebook). */
const GAP = 12;
/** Largura máxima do jornal: num tablet deitado ele não cobre a mesa inteira. */
export const PAPER_MAX_WIDTH = 820;
/** Largura mínima para o jornal ficar ao lado do notebook; abaixo disso ele vai para baixo do notebook. */
const SIDE_MIN_WIDTH = 320;
/** Fração máxima da largura da tela que o jornal ocupa ao lado do notebook. */
const SIDE_MAX_FRACTION = 0.7;

/**
 * Onde o jornal fica: ao lado (à esquerda) do notebook quando a tela é larga o bastante; senão, abaixo dele.
 * Nunca cobre o notebook, que é o caminho para as redes, e respeita a área segura (entalhe, gaveta de gestos),
 * centralizando dentro dela.
 */
export function newspaperRect(size: { width: number; height: number }, layout: DeskLayout, insets: Insets): ScreenRect {
  const { width: w, height: h } = size;
  const left = insets.left + GAP;
  const right = w - insets.right - GAP;
  const top = insets.top + GAP;
  const bottom = h - Math.max(GAP, insets.bottom);
  if (w >= h) {
    const sideRight = Math.min(layout.laptop.x - GAP, w * SIDE_MAX_FRACTION);
    const width = Math.min(PAPER_MAX_WIDTH, sideRight - left);
    if (width >= SIDE_MIN_WIDTH) return { x: left, y: top, width, height: bottom - top };
  }
  // Abaixo do notebook (retrato e telas quase quadradas).
  const y = Math.max(top, layout.laptop.y + layout.laptop.height + GAP);
  const width = Math.min(PAPER_MAX_WIDTH, right - left);
  return { x: left + (right - left - width) / 2, y, width, height: bottom - y };
}

/** Onde as redes aparecem: sobre a tela do notebook; em retrato, a câmera entra na tela e ela ocupa tudo. */
export function socialScreenRect(
  size: { width: number; height: number },
  layout: DeskLayout,
  insets: Insets,
): ScreenRect {
  const { width: w, height: h } = size;
  if (w >= h) {
    const s = layout.screen;
    const x = Math.max(insets.left, s.x);
    const y = Math.max(insets.top, s.y);
    return {
      x,
      y,
      width: Math.min(w - insets.right, s.x + s.width) - x,
      height: Math.min(h - insets.bottom, s.y + s.height) - y,
    };
  }
  return {
    x: insets.left + 8,
    y: insets.top + 8,
    width: w - insets.left - insets.right - 16,
    height: h - insets.top - Math.max(8, insets.bottom) - 8,
  };
}

/** Margem do jornal aberto em relação à área segura. */
const OPEN_GAP = 10;

/** O jornal aberto diante do jogador: ocupa a tela (dentro da área segura), até a largura máxima, centralizado. */
export function openPaperRect(size: { width: number; height: number }, insets: Insets): ScreenRect {
  const left = insets.left + OPEN_GAP;
  const right = size.width - insets.right - OPEN_GAP;
  const top = insets.top + OPEN_GAP;
  const bottom = size.height - Math.max(OPEN_GAP, insets.bottom);
  const width = Math.min(PAPER_MAX_WIDTH, right - left);
  return { x: left + (right - left - width) / 2, y: top, width, height: bottom - top };
}

/** Fração do espaço do jornal na mesa que o jornal dobrado ocupa (sobra mesa em volta). */
const FOLDED_FILL = 0.9;

/**
 * O jornal dobrado ao meio sobre a mesa: é a metade de cima do jornal aberto, em escala, centralizada no espaço
 * do jornal na mesa. `scale` leva o jornal aberto ao dobrado.
 */
export function foldedPaperRect(slot: ScreenRect, open: ScreenRect): ScreenRect & { scale: number } {
  const half = open.height / 2;
  const scale = Math.min(1, (slot.width * FOLDED_FILL) / open.width, (slot.height * FOLDED_FILL) / half);
  const width = open.width * scale;
  const height = half * scale;
  return { x: slot.x + (slot.width - width) / 2, y: slot.y + (slot.height - height) / 2, width, height, scale };
}
