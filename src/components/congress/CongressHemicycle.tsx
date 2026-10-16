import { memo, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Card, formatNumber, formatPercent, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { blocRelation, type GameContent, type GameState } from '@/engine';
import { useTheme } from '@/hooks/use-theme';

import {
  ALLY_RELATION,
  allySeats,
  arcSegments,
  governmentSupport,
  groupCounts,
  hemicycleSeats,
  PEC_CHAMBER,
  PEC_SENATE,
  type IdeologyGroup,
  type Seat,
} from './hemicycle';

/** Largura máxima do gráfico; acima disso o hemiciclo perde a proporção em telas largas (web). */
const MAX_CHART_WIDTH = 420;
/** O anel do arco fica logo fora da fileira externa, em fração do raio externo. */
const ARC_RADIUS = 1.08;
/** Segmentos do arco de apoio: mais segmentos, contorno mais liso. */
const ARC_SEGMENTS = 64;
/** Raio do ponto em fração do raio externo e mínimo em px para telas estreitas. */
const DOT_RATIO = 0.0175;
const MIN_DOT_RADIUS = 2.2;

export interface CongressHemicycleProps {
  state: GameState;
  content: GameContent;
  /** Pontos de agenda usados e disponíveis no mês, no resumo sob o gráfico. */
  pointsUsed: number;
  pointsMax: number;
}

/**
 * Topo da aba Congresso: hemiciclo da Câmara com as 513 cadeiras por grupo ideológico e o arco de apoio ao
 * governo (proporção vivida do arco = índice de apoio). Absorve o antigo cartão "Base aproximada", que vira a
 * legenda sob o gráfico. GAME_DESIGN.md aba Congresso; POLITICAL_RULES.md §6.
 */
export function CongressHemicycle({ state, content, pointsUsed, pointsMax }: CongressHemicycleProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const blocs = content.scenario.blocs;
  const seats = useMemo(() => hemicycleSeats(blocs), [blocs]);
  const counts = useMemo(() => groupCounts(blocs), [blocs]);
  const relationOf = (bloc: (typeof blocs)[number]) => blocRelation(state, bloc);
  const support = governmentSupport(blocs, relationOf);
  const allies = allySeats(blocs, relationOf);

  const chartWidth = Math.min(width, MAX_CHART_WIDTH);
  const label = `Apoio ao Governo: ${formatPercent(support, 0)}`;
  const summary = `Câmara: ${formatNumber(seats.length)} parlamentares. Esquerda: ${counts.esquerda}, Centro: ${counts.centro}, Direita: ${counts.direita}. ${label}.`;

  return (
    <Card>
      <View accessible accessibilityLabel={summary} style={styles.chartArea}>
        <Text variant="caption" color="textSecondary" align="center" tabular>
          {label}
        </Text>
        <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={styles.canvasRow}>
          {chartWidth > 0 ? (
            <HemicycleCanvas
              seats={seats}
              width={chartWidth}
              support={support}
              leftColor={colors.spectrumLeft}
              centerColor={colors.spectrumCenter}
              rightColor={colors.spectrumRight}
              trackColor={colors.border}
            />
          ) : null}
        </View>
      </View>
      <View style={styles.legend}>
        <LegendItem count={counts.esquerda} label="Esquerda" color={colors.spectrumLeft} align="flex-start" />
        <LegendItem count={counts.centro} label="Centro" color={colors.spectrumCenter} align="center" />
        <LegendItem count={counts.direita} label="Direita" color={colors.spectrumRight} align="flex-end" />
      </View>
      <View style={styles.footer}>
        <Text variant="caption" color="textMuted">
          Apoio ao Governo: índice de 0 a 100 da relação média dos blocos, ponderada pelas cadeiras da Câmara.
        </Text>
        <Text variant="caption" color="textSecondary" tabular>
          {`Base aliada (relação acima de ${ALLY_RELATION}): ${formatNumber(allies.chamber)} deputados, ${formatNumber(allies.senate)} senadores · PEC exige ${PEC_CHAMBER}/${PEC_SENATE}.`}
        </Text>
        <Text variant="caption" color="textSecondary" tabular>
          {`Pontos de agenda do mês: ${pointsUsed} de ${pointsMax}. Negociações e nomeações marcadas aqui entram na agenda e valem ao encerrar o mês na Presidência.`}
        </Text>
      </View>
    </Card>
  );
}

interface CanvasProps {
  seats: readonly Seat[];
  width: number;
  support: number;
  leftColor: string;
  centerColor: string;
  rightColor: string;
  trackColor: string;
}

/**
 * Desenho do hemiciclo com Views absolutas (sem SVG). `memo`: as 513 cadeiras só se recompõem quando o cenário
 * ou a largura medida mudam, não a cada ação do jogador em outros cartões.
 */
const HemicycleCanvas = memo(function HemicycleCanvas({
  seats,
  width,
  support,
  leftColor,
  centerColor,
  rightColor,
  trackColor,
}: CanvasProps) {
  const radius = width / (2 * ARC_RADIUS);
  const dotRadius = Math.max(MIN_DOT_RADIUS, DOT_RATIO * radius);
  const canvasHeight = ARC_RADIUS * radius + dotRadius + 2;
  const centerX = width / 2;
  const baselineY = canvasHeight - dotRadius - 2;
  const pointX = (x: number) => centerX + x * radius;
  const pointY = (y: number) => baselineY - y * radius;

  const segments = arcSegments(support, ARC_SEGMENTS);
  const segmentWidth = (Math.PI * ARC_RADIUS * radius * 1.15) / ARC_SEGMENTS;
  const segmentHeight = 3;
  const groupColor: Record<IdeologyGroup, string> = {
    esquerda: leftColor,
    centro: centerColor,
    direita: rightColor,
  };

  return (
    <View style={{ width, height: canvasHeight }}>
      {seats.map((seat, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: pointX(seat.x) - dotRadius,
            top: pointY(seat.y) - dotRadius,
            width: dotRadius * 2,
            height: dotRadius * 2,
            borderRadius: dotRadius,
            backgroundColor: groupColor[seat.group],
          }}
        />
      ))}
      {segments.map((segment, i) => {
        const angle = Math.PI * (1 - segment.t);
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: pointX(Math.cos(angle) * ARC_RADIUS) - segmentWidth / 2,
              top: pointY(Math.sin(angle) * ARC_RADIUS) - segmentHeight / 2,
              width: segmentWidth,
              height: segmentHeight,
              borderRadius: segmentHeight / 2,
              backgroundColor: segment.filled
                ? spectrumColor(segment.t, leftColor, centerColor, rightColor)
                : trackColor,
              transform: [{ rotate: `${180 * segment.t - 90}deg` }],
            }}
          />
        );
      })}
      <View pointerEvents="none" style={[styles.center, { bottom: dotRadius + 4 }]}>
        <Text variant="display" tabular align="center">
          {formatNumber(seats.length)}
        </Text>
        <Text variant="caption" color="textSecondary" align="center">
          Parlamentares
        </Text>
      </View>
    </View>
  );
});

/** Cor do espectro em `t` (0 = esquerda, 0,5 = centro, 1 = direita), interpolando os tokens do tema. */
function spectrumColor(t: number, left: string, center: string, right: string): string {
  return t <= 0.5 ? mixHex(left, center, t * 2) : mixHex(center, right, (t - 0.5) * 2);
}

/** Mistura dois hex `#rrggbb` (k = 0 devolve `a`, k = 1 devolve `b`). */
function mixHex(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const channel = (shift: number) =>
    Math.round(((pa >> shift) & 255) + (((pb >> shift) & 255) - ((pa >> shift) & 255)) * k);
  return `#${((1 << 24) | (channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).slice(1)}`;
}

function LegendItem({
  count,
  label,
  color,
  align,
}: {
  count: number;
  label: string;
  color: string;
  align: 'flex-start' | 'center' | 'flex-end';
}) {
  const textAlign = align === 'flex-start' ? 'left' : align === 'flex-end' ? 'right' : 'center';
  return (
    <View style={[styles.legendItem, { alignItems: align }]}>
      <Text variant="title" tabular style={{ color }}>
        {formatNumber(count)}
      </Text>
      <View style={styles.legendLabel}>
        <View style={[styles.legendDot, { backgroundColor: color }]} />
        <Text variant="caption" style={{ color }} align={textAlign}>
          {label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chartArea: { gap: Spacing.half },
  canvasRow: { width: '100%', alignItems: 'center' },
  center: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: Spacing.half },
  legend: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  legendItem: { flex: 1, gap: Spacing.half },
  legendLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  footer: { gap: Spacing.one },
});
