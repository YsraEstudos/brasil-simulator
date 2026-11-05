import { useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';

import { shortMonthLabel } from '@/components/campaign/labels';
import { chartRange, seriesExtremes, type SeriesBand, type SeriesPoint } from '@/components/painel/indicatorSeries';
import { Text } from '@/components/ui';

import type { ChartPalette } from './chartPalette';
import type { MarkGroup } from './chartMarks';

/** Ponto e traço da linha. */
const STROKE = 2;
const DOT = 2.5;
/** Acima disso, só os pontos de destaque (último, máxima e mínima): 240 bolinhas viram uma faixa borrada. */
const MAX_DOTS = 40;
/** Altura da faixa das marcas e diâmetro de cada uma. */
const MARK_STRIP = 26;

export interface LineChartProps {
  points: readonly SeriesPoint[];
  format: (value: number) => string;
  /** Subir é bom ou ruim (cor da linha pela tendência do período); `null` = linha neutra. */
  goodWhen: 'up' | 'down' | null;
  palette: ChartPalette;
  /** Faixa desenhada atrás da linha (ex.: meta de inflação). */
  band?: SeriesBand | null;
  height?: number;
  /** Texto do meio da legenda do eixo (ex.: "IPCA em 12 meses"). */
  caption: string;
  /** Resumo em texto do gráfico inteiro, para o leitor de tela. */
  accessibilityLabel: string;
  /** Marcas de lei e crise (A28), já agrupadas e dentro do recorte; tocar numa abre o texto dela. */
  marks?: readonly MarkGroup[];
  /** Mês do grupo aberto. */
  selectedMark?: number | null;
  onMarkPress?: (group: MarkGroup) => void;
}

/**
 * Gráfico de linha em Views (sem SVG, como o hemiciclo): série mensal, banda opcional, máxima e mínima marcadas e o
 * último valor escrito. Chamar só com dois pontos ou mais; a tela explica a falta de dados antes.
 */
export function LineChart({
  points,
  format,
  goodWhen,
  palette,
  band = null,
  height = 150,
  caption,
  accessibilityLabel,
  marks = [],
  selectedMark = null,
  onMarkPress,
}: LineChartProps) {
  const [width, setWidth] = useState(0);
  const values = points.map((p) => p.value);
  const { min, max } = chartRange(values, band);
  const first = points[0];
  const last = points[points.length - 1];
  const rising = last.value >= first.value;
  const lineColor =
    goodWhen === null ? palette.neutral : (goodWhen === 'up') === rising ? palette.positive : palette.negative;
  const extremes = seriesExtremes(points);

  const innerHeight = height - 4;
  // Posição pelo mês, não pelo índice: as marcas caem no mês certo mesmo com lacunas na série.
  const span = Math.max(1, last.monthIndex - first.monthIndex);
  const x = (monthIndex: number) => ((width - 8) * (monthIndex - first.monthIndex)) / span + 4;
  const y = (v: number) => innerHeight - ((v - min) / (max - min)) * innerHeight + 2;
  const xy = points.map((p) => ({ x: x(p.monthIndex), y: y(p.value) }));
  const highlight = (i: number) =>
    i === points.length - 1 || points[i] === extremes?.max || points[i] === extremes?.min;

  return (
    <View style={{ gap: 4 }}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        style={{ height }}>
        {width > 0 && (
          <>
            {marks.map((group) => (
              <View
                key={`guide-${group.monthIndex}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: x(group.monthIndex),
                  width: 1,
                  backgroundColor: group.monthIndex === selectedMark ? palette.chipActive : palette.grid,
                }}
              />
            ))}
            {band && (
              <>
                <View
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: y(band.high),
                    height: Math.max(1, y(band.low) - y(band.high)),
                    backgroundColor: palette.bandFill,
                  }}
                />
                <View
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: y(band.center),
                    height: 0,
                    borderTopWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: palette.bandLine,
                  }}
                />
              </>
            )}
            {[0, 0.5, 1].map((t) => (
              <View
                key={t}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 2 + t * innerHeight,
                  height: 1,
                  backgroundColor: palette.grid,
                }}
              />
            ))}
            {xy.slice(1).map((p, i) => {
              const prev = xy[i];
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
            {xy.map((p, i) => {
              const strong = highlight(i);
              if (!strong && points.length > MAX_DOTS) return null;
              const r = strong ? DOT + 1 : DOT;
              return (
                <View
                  key={`dot-${i}`}
                  style={{
                    position: 'absolute',
                    left: p.x - r,
                    top: p.y - r,
                    width: r * 2,
                    height: r * 2,
                    borderRadius: r,
                    backgroundColor: i === points.length - 1 ? palette.highlight : lineColor,
                    borderWidth: strong && i !== points.length - 1 ? 1 : 0,
                    borderColor: palette.text,
                  }}
                />
              );
            })}
            <Text
              tabular
              style={{
                position: 'absolute',
                right: 2,
                top: Math.max(0, xy[xy.length - 1].y - 18),
                color: lineColor,
                fontSize: 12,
                fontWeight: '800',
              }}>
              {format(last.value)}
            </Text>
          </>
        )}
      </View>
      {marks.length > 0 && width > 0 && (
        <View style={{ height: MARK_STRIP }}>
          {marks.map((group) => {
            const selected = group.monthIndex === selectedMark;
            return (
              <Pressable
                key={`mark-${group.monthIndex}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Marca: ${group.description}`}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                onPress={() => onMarkPress?.(group)}
                style={{
                  position: 'absolute',
                  left: Math.min(width - MARK_STRIP, Math.max(0, x(group.monthIndex) - MARK_STRIP / 2)),
                  width: MARK_STRIP,
                  height: MARK_STRIP,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: MARK_STRIP / 2,
                  borderWidth: selected ? 1 : 0,
                  borderColor: palette.chipActive,
                }}>
                <Text
                  style={{
                    fontSize: 12,
                    color: group.symbol === '◆' ? palette.negative : selected ? palette.chipActive : palette.text,
                  }}>
                  {group.symbol}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>
        <Text style={{ color: palette.muted, fontSize: 9.5 }}>{shortMonthLabel(first.monthIndex)}</Text>
        <Text style={{ color: palette.muted, fontSize: 9.5, flexShrink: 1, textAlign: 'center' }}>
          {caption} · eixo de {format(min)} a {format(max)}
        </Text>
        <Text style={{ color: palette.muted, fontSize: 9.5 }}>{shortMonthLabel(last.monthIndex)}</Text>
      </View>
    </View>
  );
}
