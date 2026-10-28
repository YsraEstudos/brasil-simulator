import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { Text } from '@/components/ui';
import { Radius } from '@/constants/theme';
import type { ProfileHistory } from '@/database/campaignRepository';
import { turnIndexOf, type GameContent, type GameState } from '@/engine';
import { gameStore } from '@/store';

import { EmptyNote, LinkRow, SheetHeading } from './HudBits';
import { Hud } from './hudTheme';
import { AXIS_LABELS, buildProfileView, PLANE_SIZE, type ProfileView } from './profileView';

/**
 * Folha "Perfil do governo" (PLANO_GLOBO.md §5.2): o plano de dois eixos (economia Estado ↔ Mercado, na horizontal;
 * costumes Progressista ↔ Conservador, na vertical) com o governo, o rastro dos últimos meses, as UFs como pontos
 * pequenos (cor da camada Alinhamento) e o eleitor mediano; mais o termo nacional e as decisões que mais moveram o
 * perfil. Os números vêm de `buildProfileView` (puro, testado); o rastro e as decisões são lidos do banco ao abrir.
 */

const NO_HISTORY: ProfileHistory = { trail: [], moves: [] };

const AXIS_FONT = 9;
const GOVERNMENT_RADIUS = 6;
const MEDIAN_RADIUS = 6.5;
const UF_RADIUS = 3.2;
const TRAIL_RADIUS = 2;

export function ProfileSheet({
  state,
  content,
  onShowLayer,
}: {
  state: GameState;
  content: GameContent;
  /** Liga a camada Alinhamento no mapa (quem chama fecha a folha). */
  onShowLayer?: () => void;
}) {
  const [history, setHistory] = useState<ProfileHistory>(NO_HISTORY);
  // Lido ao abrir a folha (e a cada turno gravado; na posse o mês do mandato não muda): sem histórico próprio.
  const turnIndex = turnIndexOf(state);
  useEffect(() => {
    let live = true;
    void gameStore
      .getState()
      .profileHistory()
      .then((h) => {
        if (live) setHistory(h);
      });
    return () => {
      live = false;
    };
  }, [turnIndex]);

  const view = useMemo(() => buildProfileView(state, content, history), [state, content, history]);

  return (
    <>
      <Text style={styles.sub}>{`Perfil atual: ${view.label}`}</Text>
      {view.plane ? (
        <>
          <Plane plane={view.plane} />
          <Legend />
          <Text style={styles.note}>{view.trailCaption}</Text>
          <Text tabular style={styles.national}>
            {view.nationalLine}
          </Text>
          <Text style={styles.note}>{view.nationalNote}</Text>
          <Text style={styles.sub}>{view.extremesLine}</Text>
          {onShowLayer && <LinkRow label="Ver no mapa (camada Alinhamento)" onPress={onShowLayer} />}
        </>
      ) : (
        <EmptyNote text={view.noLeanNote ?? ''} />
      )}
      <Moves view={view} />
    </>
  );
}

function Plane({ plane }: { plane: NonNullable<ProfileView['plane']> }) {
  const mid = PLANE_SIZE / 2;
  const trail = plane.trail.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={plane.description} style={styles.plane}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${PLANE_SIZE} ${PLANE_SIZE}`}>
        <Rect
          x={0.5}
          y={0.5}
          width={PLANE_SIZE - 1}
          height={PLANE_SIZE - 1}
          rx={6}
          fill={Hud.tile}
          stroke={Hud.tileBorder}
        />
        <Line x1={mid} y1={0} x2={mid} y2={PLANE_SIZE} stroke={Hud.divider} strokeDasharray="3 3" />
        <Line x1={0} y1={mid} x2={PLANE_SIZE} y2={mid} stroke={Hud.divider} strokeDasharray="3 3" />
        <SvgText x={4} y={mid - 4} fill={Hud.textMuted} fontSize={AXIS_FONT}>
          {AXIS_LABELS.economic.low}
        </SvgText>
        <SvgText x={PLANE_SIZE - 4} y={mid - 4} fill={Hud.textMuted} fontSize={AXIS_FONT} textAnchor="end">
          {AXIS_LABELS.economic.high}
        </SvgText>
        <SvgText x={mid} y={11} fill={Hud.textMuted} fontSize={AXIS_FONT} textAnchor="middle">
          {AXIS_LABELS.social.high}
        </SvgText>
        <SvgText x={mid} y={PLANE_SIZE - 4} fill={Hud.textMuted} fontSize={AXIS_FONT} textAnchor="middle">
          {AXIS_LABELS.social.low}
        </SvgText>
        {plane.ufs.map((uf) => (
          <Circle key={uf.id} cx={uf.x} cy={uf.y} r={UF_RADIUS} fill={uf.color} stroke="#00000080" strokeWidth={0.5} />
        ))}
        {plane.trail.length > 1 && (
          <Polyline points={trail} fill="none" stroke={Hud.title} strokeOpacity={0.7} strokeWidth={1.5} />
        )}
        {plane.trail.map((p) => (
          <Circle key={p.monthIndex} cx={p.x} cy={p.y} r={TRAIL_RADIUS} fill={Hud.title} fillOpacity={0.7} />
        ))}
        <Circle
          cx={plane.median.x}
          cy={plane.median.y}
          r={MEDIAN_RADIUS}
          fill="none"
          stroke={Hud.text}
          strokeWidth={1.5}
        />
        <Circle
          cx={plane.government.x}
          cy={plane.government.y}
          r={GOVERNMENT_RADIUS}
          fill={Hud.titleBright}
          stroke="#000000"
          strokeWidth={1}
        />
      </Svg>
    </View>
  );
}

function Legend() {
  return (
    <View style={styles.legend}>
      <LegendItem swatch={<View style={[styles.dot, { backgroundColor: Hud.titleBright }]} />} text="Governo" />
      <LegendItem swatch={<View style={[styles.dot, styles.ring]} />} text="Eleitor mediano" />
      <LegendItem swatch={<View style={[styles.dotSmall, { backgroundColor: '#3987e5' }]} />} text="Estado alinhado" />
      <LegendItem swatch={<View style={[styles.dotSmall, { backgroundColor: '#e34948' }]} />} text="Estado distante" />
      <LegendItem swatch={<View style={[styles.dotSmall, { backgroundColor: Hud.title }]} />} text="Rastro" />
    </View>
  );
}

function LegendItem({ swatch, text }: { swatch: ReactNode; text: string }) {
  return (
    <View style={styles.legendItem}>
      {swatch}
      <Text style={styles.legendText}>{text}</Text>
    </View>
  );
}

function Moves({ view }: { view: ProfileView }) {
  return (
    <>
      <SheetHeading text="Decisões que mais moveram o perfil" />
      {view.moves.length === 0 ? (
        <EmptyNote text={view.movesNote ?? ''} />
      ) : (
        view.moves.map((row) => (
          <View key={row.key} style={styles.moveRow}>
            <View style={styles.moveText}>
              <Text style={styles.moveLabel} numberOfLines={2}>
                {row.label}
              </Text>
              <Text style={styles.moveDetail}>{`${row.detail} · rumo a ${row.direction}`}</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.max(6, row.weight * 100)}%` }]} />
            </View>
          </View>
        ))
      )}
    </>
  );
}

const styles = {
  sub: { color: Hud.textDim, fontSize: 11, lineHeight: 15 },
  note: { color: Hud.textMuted, fontSize: 10.5, fontStyle: 'italic' },
  national: { color: Hud.titleBright, fontSize: 13, fontWeight: '700' },
  plane: { width: '100%', maxWidth: 320, aspectRatio: 1, alignSelf: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendText: { color: Hud.textDim, fontSize: 10 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  ring: { borderWidth: 1.5, borderColor: Hud.text },
  dotSmall: { width: 8, height: 8, borderRadius: 4 },
  moveRow: { gap: 4, paddingVertical: 3 },
  moveText: { gap: 1 },
  moveLabel: { color: Hud.text, fontSize: 12, fontWeight: '600' },
  moveDetail: { color: Hud.textDim, fontSize: 10.5 },
  track: { height: 3, borderRadius: Radius.sm, backgroundColor: Hud.track, overflow: 'hidden' },
  fill: { height: 3, backgroundColor: Hud.title },
} as const;
