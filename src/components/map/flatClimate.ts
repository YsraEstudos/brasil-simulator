import { flatMap, type Point } from './flatProjection';

/**
 * Clima no mapa 2D completo (PLANO_GLOBO.md §3.4). Aqui só a geometria estática das marcas: a hachura é **um** padrão
 * SVG reaproveitado por todas as UFs (um caminho extra por UF hachurada, nunca um nó por pixel) e o ícone de nuvem é um
 * caminho único, sem animação. Quem escolhe as UFs é `climateView.buildClimateOverlay`.
 */

/** Id do padrão de hachura no `<Defs>` do mapa. */
export const HATCH_PATTERN_ID = 'climateHatch';
/** Lado (unidades do `viewBox`) do ladrilho do padrão e espessura/opacidade do traço (riscas a 45°). */
export const HATCH_TILE = 9;
export const HATCH_STROKE_WIDTH = 2;
export const HATCH_STROKE_OPACITY = 0.5;

/** Caixa do desenho da nuvem (unidades próprias, 24 × 16) e o caminho dela. */
export const CLOUD_ICON_BOX = { width: 24, height: 16 } as const;
export const CLOUD_ICON_PATH = 'M6.5 15 A5 5 0 0 1 6 5.1 A6.5 6.5 0 0 1 18.2 4.6 A5.2 5.2 0 0 1 17.5 15 Z';
/** Largura do ícone no `viewBox` do mapa (a UF menor, o DF, tem ~25 unidades). */
export const CLOUD_ICON_WIDTH = 22;
/** Quanto o ícone sobe em relação ao centroide, para a sigla da UF (texto nativo) ficar legível logo abaixo. */
export const CLOUD_ICON_LIFT = 9;

export interface CloudIconPlacement {
  sigla: string;
  /** Translação e escala do ícone dentro do `viewBox` (use em `transform`). */
  x: number;
  y: number;
  scale: number;
}

/** Posição do ícone de cada sigla pedida, ignorando as que não existem no mapa. */
export function cloudIconPlacements(siglas: readonly string[]): CloudIconPlacement[] {
  const map = flatMap();
  const scale = CLOUD_ICON_WIDTH / CLOUD_ICON_BOX.width;
  const out: CloudIconPlacement[] = [];
  for (const sigla of siglas) {
    const uf = map.ufs.find((u) => u.sigla === sigla);
    if (!uf) continue;
    const c: Point = uf.centroid;
    out.push({
      sigla,
      x: c.x - (CLOUD_ICON_BOX.width * scale) / 2,
      y: c.y - CLOUD_ICON_LIFT - (CLOUD_ICON_BOX.height * scale) / 2,
      scale,
    });
  }
  return out;
}

/** Caminhos (`d`) das UFs hachuradas, na ordem pedida, ignorando as siglas desconhecidas. */
export function hatchedPaths(siglas: readonly string[]): { sigla: string; d: string }[] {
  const map = flatMap();
  return siglas.flatMap((sigla) => {
    const uf = map.ufs.find((u) => u.sigla === sigla);
    return uf ? [{ sigla, d: uf.d }] : [];
  });
}
