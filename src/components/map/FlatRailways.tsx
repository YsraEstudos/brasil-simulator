import { memo } from 'react';
import { G, Path } from 'react-native-svg';

import type { FlatMap } from './flatProjection';
import {
  CASING_PX,
  DIMMED_RAIL_OPACITY,
  RAILWAY_STYLES,
  SELECTED_RAIL_WIDTH,
  type RailwayLine,
  type RailwayOverlay,
} from './railwayView';

/**
 * Ferrovias no mapa 2D completo (PLANO_EXPANSAO EX-30): o mesmo `RailwayOverlay` do globo, desenhado como `<Path>` com
 * contorno escuro por baixo (legível sobre qualquer mapa de calor) e o traço da situação por cima. Estático: refeito
 * só quando a camada ou o tamanho do mapa mudam. Larguras em px lógicos, convertidas para unidades do `viewBox`.
 */

function pathData(flat: FlatMap, line: RailwayLine): string {
  return line.path
    .map(([lon, lat], i) => {
      const p = flat.project(lon, lat);
      return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    })
    .join('');
}

function FlatRailwaysImpl({
  overlay,
  flat,
  unitsPerPx,
}: {
  overlay: RailwayOverlay;
  flat: FlatMap;
  /** Unidades do `viewBox` por px lógico na tela. */
  unitsPerPx: number;
}) {
  const lines = overlay.lines.map((line) => ({ line, d: pathData(flat, line) }));
  return (
    <G pointerEvents="none">
      {/* Primeiro todos os contornos, depois todos os miolos: um cruzamento não corta a linha de baixo. */}
      {lines.map(({ line, d }) => {
        const style = RAILWAY_STYLES[line.styleId];
        const width = style.widthPx * (line.emphasis === 'selected' ? SELECTED_RAIL_WIDTH : 1);
        return (
          <Path
            key={`c:${line.key}`}
            d={d}
            fill="none"
            stroke={style.casing}
            strokeOpacity={line.emphasis === 'dimmed' ? DIMMED_RAIL_OPACITY : 0.85}
            strokeWidth={(width + 2 * CASING_PX) * unitsPerPx}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
      {lines.map(({ line, d }) => {
        const style = RAILWAY_STYLES[line.styleId];
        const width = style.widthPx * (line.emphasis === 'selected' ? SELECTED_RAIL_WIDTH : 1);
        return (
          <Path
            key={line.key}
            d={d}
            fill="none"
            stroke={style.color}
            strokeOpacity={line.emphasis === 'dimmed' ? DIMMED_RAIL_OPACITY : 1}
            strokeWidth={width * unitsPerPx}
            strokeDasharray={style.dash ? style.dash.map((v) => v * unitsPerPx).join(' ') : undefined}
            strokeLinecap={style.dash ? 'butt' : 'round'}
            strokeLinejoin="round"
          />
        );
      })}
    </G>
  );
}

export const FlatRailways = memo(FlatRailwaysImpl);
