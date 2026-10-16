import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import { shortMonthLabel } from '@/components/campaign/labels';
import { Text } from '@/components/ui';

import type { HudSeriesPoint } from './hudData';
import { Hud } from './hudTheme';

/** Altura do gráfico (a série do PIB é uma leitura rápida, não um painel de análise). */
const CHART_HEIGHT = 74;
/** Ponto e traço da linha. */
const STROKE = 2;
const DOT = 2.5;

export interface GdpChartProps {
  series: readonly HudSeriesPoint[];
  height?: number;
}

/**
 * Evolução do PIB em 12 meses (série do banco da partida), em Views — sem SVG, como o hemiciclo. Sem dois meses
 * encerrados não há o que ligar: a tela explica em vez de desenhar um gráfico vazio.
 */
export function GdpChart({ series, height = CHART_HEIGHT }: GdpChartProps) {
  const [width, setWidth] = useState(0);

  if (series.length < 2) {
    return (
      <Text style={{ color: Hud.textMuted, fontSize: 11, fontStyle: 'italic', paddingVertical: 6 }}>
        {series.length === 1
          ? 'O gráfico aparece quando houver um segundo mês para comparar.'
          : 'A série do PIB aparece depois do primeiro mês encerrado.'}
      </Text>
    );
  }

  const values = series.map((p) => p.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = Math.max((rawMax - rawMin) * 0.15, 0.002);
  const min = rawMin - pad;
  const max = rawMax + pad;
  const trendUp = series[series.length - 1].value >= series[0].value;
  const lineColor = trendUp ? Hud.positive : Hud.negative;

  const innerHeight = height - 4;
  const x = (i: number) => ((width - 8) * i) / (series.length - 1) + 4;
  const y = (v: number) => innerHeight - ((v - min) / (max - min)) * innerHeight + 2;

  const points = series.map((p, i) => ({ x: x(i), y: y(p.value) }));
  const last = series[series.length - 1];
  const lastPercent = `${last.value >= 0 ? '+' : ''}${(last.value * 100).toFixed(1).replace('.', ',')}%`;

  return (
    <View style={{ gap: 4 }}>
      <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
        {width > 0 && (
          <>
            {[0, 0.5, 1].map((t) => (
              <View
                key={t}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 2 + t * innerHeight,
                  height: 1,
                  backgroundColor: Hud.divider,
                }}
              />
            ))}
            {points.slice(1).map((p, i) => {
              const prev = points[i];
              const dx = p.x - prev.x;
              const dy = p.y - prev.y;
              const length = Math.hypot(dx, dy);
              const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
              return (
                <View
                  key={`seg-${i}`}
                  style={{
                    position: 'absolute',
                    left: (prev.x + p.x) / 2 - length / 2,
                    top: (prev.y + p.y) / 2 - STROKE / 2,
                    width: length,
                    height: STROKE,
                    borderRadius: STROKE / 2,
                    backgroundColor: lineColor,
                    transform: [{ rotate: `${angle}deg` }],
                  }}
                />
              );
            })}
            {points.map((p, i) => (
              <View
                key={`dot-${i}`}
                style={{
                  position: 'absolute',
                  left: p.x - DOT,
                  top: p.y - DOT,
                  width: DOT * 2,
                  height: DOT * 2,
                  borderRadius: DOT,
                  backgroundColor: i === points.length - 1 ? Hud.titleBright : lineColor,
                }}
              />
            ))}
            <Text
              tabular
              style={{
                position: 'absolute',
                right: 2,
                top: Math.max(0, points[points.length - 1].y - 18),
                color: lineColor,
                fontSize: 12,
                fontWeight: '800',
              }}>
              {lastPercent}
            </Text>
          </>
        )}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: Hud.textMuted, fontSize: 9.5 }}>{shortMonthLabel(series[0].monthIndex)}</Text>
        <Text style={{ color: Hud.textMuted, fontSize: 9.5 }}>
          PIB 12 meses · eixo em{' '}
          {`${(min * 100).toFixed(1).replace('.', ',')}% a ${(max * 100).toFixed(1).replace('.', ',')}%`}
        </Text>
        <Text style={{ color: Hud.textMuted, fontSize: 9.5 }}>{shortMonthLabel(last.monthIndex)}</Text>
      </View>
    </View>
  );
}
