import { memo, useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import { hemicycleSeats, type IdeologyGroup, type Seat } from '@/components/congress/hemicycle';
import { Text } from '@/components/ui';
import type { Bloc } from '@/types/scenario';

import type { HudCongress } from './hudData';
import { Hud } from './hudTheme';

/** Raio do ponto em fração do raio externo e mínimo em px. */
const DOT_RATIO = 0.022;
const MIN_DOT_RADIUS = 1.8;
/** Folga do anel externo, em fração do raio (o arco não encosta na borda). */
const PADDING_RATIO = 1.02;

export interface MiniHemicycleProps {
  blocs: readonly Bloc[];
  congress: HudCongress;
}

/**
 * Hemiciclo compacto do Painel: as cadeiras da Câmara por grupo ideológico, em miniatura para o painel de
 * Congresso da mesa (GAME_DESIGN.md §4.4). Desenho com Views absolutas (sem SVG), como o da aba Congresso.
 */
export function MiniHemicycle({ blocs, congress }: MiniHemicycleProps) {
  const [width, setWidth] = useState(0);
  const seats = useMemo(() => hemicycleSeats(blocs), [blocs]);

  return (
    <View style={{ gap: 6 }}>
      <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ width: '100%' }}>
        {width > 0 && seats.length > 0 ? <Canvas seats={seats} width={width} /> : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <LegendItem count={congress.left} label="Esquerda" color={Hud.spectrumLeft} />
        <LegendItem count={congress.center} label="Centro" color={Hud.spectrumCenter} />
        <LegendItem count={congress.right} label="Direita" color={Hud.spectrumRight} />
      </View>
    </View>
  );
}

/** Canvas memoizado: as 513 cadeiras só se recompõem quando o cenário ou a largura mudam. */
const Canvas = memo(function Canvas({ seats, width }: { seats: readonly Seat[]; width: number }) {
  const radius = width / (2 * PADDING_RATIO);
  const dotRadius = Math.max(MIN_DOT_RADIUS, DOT_RATIO * radius);
  const canvasHeight = radius + dotRadius + 2;
  const centerX = width / 2;
  const baselineY = canvasHeight - dotRadius - 2;
  const groupColor: Record<IdeologyGroup, string> = {
    esquerda: Hud.spectrumLeft,
    centro: Hud.spectrumCenter,
    direita: Hud.spectrumRight,
  };

  return (
    <View
      style={{ width, height: canvasHeight }}
      accessible
      accessibilityLabel={`Câmara: ${seats.length} parlamentares`}>
      {seats.map((seat, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: centerX + seat.x * radius - dotRadius,
            top: baselineY - seat.y * radius - dotRadius,
            width: dotRadius * 2,
            height: dotRadius * 2,
            borderRadius: dotRadius,
            backgroundColor: groupColor[seat.group],
          }}
        />
      ))}
    </View>
  );
});

function LegendItem({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Text tabular style={{ color, fontSize: 12, fontWeight: '800' }}>
        {count}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
        <Text style={{ color: Hud.textDim, fontSize: 9.5 }}>{label}</Text>
      </View>
    </View>
  );
}
