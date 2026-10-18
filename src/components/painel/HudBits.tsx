import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, type StyleProp, View, type ViewStyle } from 'react-native';

import { binColor, legendLabels, type MapIndicatorSpec } from './regionalMetrics';
import { Text } from '@/components/ui';
import { Radius } from '@/constants/theme';

import type { HudAlert, HudGoalCheck, HudMinistry, HudRegion, HudSector, HudStat, HudTone } from './hudData';
import { Hud, toneColor } from './hudTheme';

/** Peças da mesa do Painel (GAME_DESIGN.md §4.2): painel com moldura dourada, barras, selos e linhas de dado. */

export function HudIcon({
  name,
  size = 15,
  color = Hud.title,
}: {
  name: SymbolViewProps['name'];
  size?: number;
  color?: string;
}) {
  return <SymbolView name={name} tintColor={color} size={size} />;
}

/** Ícones dos ministérios por área temática (primeira área conhecida; genérico como reserva). */
const AREA_ICONS: Readonly<Record<string, SymbolViewProps['name']>> = {
  economia: { ios: 'dollarsign.circle.fill', android: 'attach_money', web: 'attach_money' },
  fiscal: { ios: 'percent', android: 'percent', web: 'percent' },
  tributacao: { ios: 'percent', android: 'percent', web: 'percent' },
  estado: { ios: 'gearshape.fill', android: 'settings', web: 'settings' },
  previdencia: { ios: 'figure.walk', android: 'elderly', web: 'elderly' },
  social: { ios: 'person.3.fill', android: 'groups', web: 'groups' },
  infraestrutura: { ios: 'wrench.and.screwdriver.fill', android: 'construction', web: 'construction' },
  saude: { ios: 'cross.case.fill', android: 'health_and_safety', web: 'health_and_safety' },
  educacao: { ios: 'graduationcap.fill', android: 'school', web: 'school' },
  seguranca: { ios: 'shield.lefthalf.filled', android: 'shield', web: 'shield' },
  cidades: { ios: 'building.2.fill', android: 'location_city', web: 'location_city' },
  habitacao: { ios: 'house.fill', android: 'home', web: 'home' },
  saneamento: { ios: 'drop.fill', android: 'water_drop', web: 'water_drop' },
  agro: { ios: 'leaf.fill', android: 'agriculture', web: 'agriculture' },
  energia: { ios: 'bolt.fill', android: 'bolt', web: 'bolt' },
};

const GENERIC_ICON: SymbolViewProps['name'] = {
  ios: 'building.columns.fill',
  android: 'account_balance',
  web: 'account_balance',
};

export function ministryIcon(areas: readonly string[]): SymbolViewProps['name'] {
  for (const area of areas) {
    const icon = AREA_ICONS[area];
    if (icon) return icon;
  }
  return GENERIC_ICON;
}

export function HudPanel({
  title,
  accessory,
  style,
  bodyStyle,
  children,
}: {
  title: string;
  accessory?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  return (
    <View style={[styles.panel, style]}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>{title}</Text>
        {accessory}
      </View>
      <View style={[styles.panelBody, bodyStyle]}>{children}</View>
    </View>
  );
}

export function HudBar({ value, color, height = 4 }: { value: number; color: string; height?: number }) {
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      <View
        style={{
          width: `${Math.min(100, Math.max(0, value * 100))}%`,
          height: '100%',
          borderRadius: height / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

export function TrendGlyph({ tone, size = 12 }: { tone: HudTone; size?: number }) {
  const glyph = tone === 'positive' ? '▲' : tone === 'negative' ? '▼' : '—';
  return <Text style={{ color: toneColor(tone), fontSize: size, fontWeight: '700' }}>{glyph}</Text>;
}

/** Célula de número da faixa do topo (ou da faixa de baixo): rótulo, valor e variação/contexto. */
export function StatCell({
  stat,
  compact,
  value,
  line,
}: {
  stat: HudStat;
  compact?: boolean;
  /** Valor de exibição mais curto que o do dado (ex.: mês abreviado); o padrão é o do `HudStat`. */
  value?: string;
  /** Linha de baixo no lugar da variação/contexto do `HudStat`. */
  line?: string;
}) {
  // "203,1 milhões" e "R$ 11,40 tri" não cabem na célula estreita; a versão curta é só de exibição.
  const shown = (value ?? stat.value).replace(' milhões', ' mi').replace(/(,\d)\d (tri|bi)$/, '$1 $2');
  const shownLine = line ?? stat.delta ?? stat.context;
  const deltaColor =
    stat.sentiment === 'positive' ? Hud.positive : stat.sentiment === 'negative' ? Hud.negative : Hud.textDim;
  return (
    <View style={[styles.cell, compact && styles.cellCompact]} pointerEvents="none">
      <Text style={styles.cellLabel} numberOfLines={1}>
        {stat.label}
      </Text>
      <Text
        tabular
        style={[styles.cellValue, compact && styles.cellValueCompact]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.72}>
        {shown}
      </Text>
      {shownLine ? (
        <Text
          tabular
          numberOfLines={1}
          style={{
            fontSize: 9,
            fontWeight: stat.delta ? '700' : '400',
            color: stat.delta ? deltaColor : Hud.textMuted,
          }}>
          {shownLine}
        </Text>
      ) : null}
    </View>
  );
}

/** Botão redondo da mesa, sobre o globo: só o ícone, alvo de toque folgado (a informação vem no detalhe). */
export function RoundButton({
  icon,
  label,
  size = 48,
  badge,
  active,
  onPress,
}: {
  icon: SymbolViewProps['name'];
  label: string;
  size?: number;
  /** Contador no canto (ex.: eventos aguardando). */
  badge?: number;
  /** Botão ligado (ex.: camada do mapa ativa): moldura dourada e ícone aceso. */
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active ? { selected: true } : undefined}
      style={({ pressed }) => [
        styles.roundButton,
        { width: size, height: size, borderRadius: size / 2 },
        active && styles.roundButtonActive,
        pressed && styles.roundButtonPressed,
      ]}>
      <HudIcon name={icon} size={Math.round(size * 0.42)} color={active ? Hud.titleBright : Hud.title} />
      {badge != null && badge > 0 && (
        <View style={styles.roundBadge}>
          <Text style={styles.roundBadgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function DemoBadge() {
  return (
    <View style={styles.demoBadge}>
      <Text style={styles.demoBadgeText}>DEMONSTRAÇÃO</Text>
    </View>
  );
}

export function BellButton({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.bellWrap}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel="Eventos aguardando resposta">
      <HudIcon
        name={{ ios: 'bell.fill', android: 'notifications', web: 'notifications' }}
        size={20}
        color={count > 0 ? Hud.titleBright : Hud.textDim}
      />
      {count > 0 && (
        <View style={styles.bellBadge}>
          <Text style={styles.bellBadgeText}>{count > 9 ? '9+' : count}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Linha de ministério: ícone, pasta, ocupante, relação e seta de tendência. */
export function MinistryRow({ ministry }: { ministry: HudMinistry }) {
  const color = toneColor(ministry.tone);
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <HudIcon name={ministryIcon(ministry.areas)} size={15} color={Hud.title} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {ministry.name}
        </Text>
        <Text style={[styles.rowSub, { color }]} numberOfLines={1}>
          {ministry.occupant} · {ministry.status}
        </Text>
        {ministry.relation != null && <HudBar value={(ministry.relation + 100) / 200} color={color} height={3} />}
      </View>
      <TrendGlyph tone={ministry.tone} />
    </View>
  );
}

/** Cartão de evento aguardando resposta. */
export function AlertCard({ alert, onPress }: { alert: HudAlert; onPress: () => void }) {
  const color = toneColor(alert.tone);
  return (
    <Pressable onPress={onPress} style={[styles.alertCard, { borderLeftColor: color }]} accessibilityRole="button">
      <View style={styles.alertHead}>
        <Text style={styles.alertTitle} numberOfLines={1}>
          {alert.title}
        </Text>
        {alert.tag && (
          <View style={[styles.alertTag, { borderColor: color }]}>
            <Text style={[styles.alertTagText, { color }]}>{alert.tag}</Text>
          </View>
        )}
      </View>
      <Text style={styles.alertBody} numberOfLines={3}>
        {alert.body}
      </Text>
    </Pressable>
  );
}

export function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Text style={styles.link} onPress={onPress}>
      {label} ›
    </Text>
  );
}

/** Tile de um setor da economia (Indicadores Nacionais). */
export function SectorTile({ sector }: { sector: HudSector }) {
  const up = sector.growth >= 0;
  const color = up ? Hud.positive : Hud.negative;
  const growth = `${up ? '+' : ''}${(sector.growth * 100).toFixed(2).replace('.', ',')}%`;
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel} numberOfLines={1}>
        {sector.label}
      </Text>
      <Text tabular style={[styles.tileValue, { color }]}>
        {growth}
      </Text>
      <Text style={styles.tileContext}>no mês</Text>
      <HudBar value={Math.min(1, sector.share / 0.6)} color={Hud.title} height={3} />
      <Text style={styles.tileContext}>{`${(sector.share * 100).toFixed(0)}% do produto`}</Text>
    </View>
  );
}

export function RegionRow({ region }: { region: HudRegion }) {
  return (
    <View style={styles.regionRow}>
      <View style={[styles.regionDot, { backgroundColor: region.color }]} />
      <Text style={styles.regionName} numberOfLines={1}>
        {region.name}
      </Text>
      <View style={styles.regionBar}>
        <HudBar value={region.level} color={region.color} height={4} />
      </View>
      <Text tabular style={styles.regionValue}>
        {region.value}
      </Text>
    </View>
  );
}

/** Linha da camada do mapa (Camadas do Mapa): nome, o que mostra, prévia das cores e marca da camada ativa. */
export function MapLayerRow({
  label,
  hint,
  spec,
  active,
  disabled,
  onPress,
}: {
  label: string;
  hint: string;
  /** Indicador da camada; sem ele (Satélite) não há prévia de cores. */
  spec?: MapIndicatorSpec;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      style={({ pressed }) => [
        styles.layerRow,
        active && styles.layerRowActive,
        disabled && styles.layerRowDisabled,
        pressed && styles.layerRowPressed,
      ]}>
      <View style={styles.layerBody}>
        <Text style={styles.layerLabel}>{label}</Text>
        <Text style={styles.layerHint} numberOfLines={2}>
          {hint}
        </Text>
      </View>
      {spec && (
        <View style={styles.layerStrip}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={[styles.layerStripCell, { backgroundColor: binColor(spec, i) }]} />
          ))}
        </View>
      )}
      {active && (
        <HudIcon name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={14} color={Hud.titleBright} />
      )}
    </Pressable>
  );
}

/** Legenda compacta da camada ativa: o que cada faixa de cor quer dizer (mesmos rótulos do mapa da UF). */
export function MapLayerLegend({ spec }: { spec: MapIndicatorSpec }) {
  return (
    <View style={styles.layerLegend}>
      {legendLabels(spec).map((label, i) => (
        <View key={label} style={styles.layerLegendItem}>
          <View style={[styles.layerSwatch, { backgroundColor: binColor(spec, i) }]} />
          <Text style={styles.layerLegendLabel}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

export function GoalCheckRow({ check }: { check: HudGoalCheck }) {
  const color = check.met ? Hud.positive : Hud.negative;
  return (
    <View style={styles.goalRow}>
      <Text style={[styles.goalMark, { color }]}>{check.met ? '✔' : '✖'}</Text>
      <Text style={styles.goalLabel} numberOfLines={1}>
        {check.label}
      </Text>
      <Text tabular style={[styles.goalValue, { color }]}>
        {check.value}
      </Text>
    </View>
  );
}

export function EmptyNote({ text }: { text: string }) {
  return <Text style={styles.emptyNote}>{text}</Text>;
}

const styles = {
  panel: {
    borderWidth: 1,
    borderColor: Hud.border,
    borderRadius: Radius.sm,
    backgroundColor: '#0c1510',
    overflow: 'hidden',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: Hud.header,
    borderBottomWidth: 1,
    borderBottomColor: Hud.divider,
  },
  panelTitle: {
    color: Hud.title,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  panelBody: { padding: 8, gap: 6 },
  track: { backgroundColor: Hud.track, overflow: 'hidden' },
  cell: {
    flex: 1,
    minWidth: 0,
    gap: 1,
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Hud.glassBorder,
    borderRadius: Radius.sm,
    backgroundColor: Hud.glass,
  },
  cellCompact: { paddingVertical: 4 },
  cellLabel: { color: Hud.textMuted, fontSize: 8, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  cellValue: { color: Hud.text, fontSize: 12, fontWeight: '700' },
  cellValueCompact: { fontSize: 11.5 },
  roundButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Hud.glassBorder,
    backgroundColor: Hud.glass,
  },
  roundButtonPressed: { transform: [{ scale: 0.93 }], backgroundColor: Hud.tile },
  roundButtonActive: { borderColor: Hud.title, backgroundColor: '#3a2f14cc' },
  roundBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 15,
    height: 15,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: Hud.negative,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundBadgeText: { color: '#ffffff', fontSize: 9, fontWeight: '800' },
  demoBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Hud.warning,
    borderRadius: Radius.pill,
    backgroundColor: Hud.warningSoft,
  },
  demoBadgeText: { color: Hud.warning, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  bellWrap: { padding: 6 },
  bellBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 15,
    height: 15,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: Hud.negative,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadgeText: { color: '#ffffff', fontSize: 9, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  rowIcon: {
    width: 26,
    height: 26,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Hud.tileBorder,
    backgroundColor: Hud.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: 3 },
  rowTitle: { color: Hud.text, fontSize: 12, fontWeight: '600' },
  rowSub: { fontSize: 10.5 },
  alertCard: {
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: Hud.tileBorder,
    borderRadius: Radius.sm,
    backgroundColor: Hud.tile,
    padding: 8,
    gap: 4,
  },
  alertHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  alertTitle: { flex: 1, color: Hud.text, fontSize: 12, fontWeight: '700' },
  alertTag: { borderWidth: 1, borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 },
  alertTagText: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.6 },
  alertBody: { color: Hud.textDim, fontSize: 11, lineHeight: 15 },
  link: { color: Hud.titleBright, fontSize: 11.5, fontWeight: '600', paddingVertical: 2 },
  tile: {
    flex: 1,
    gap: 3,
    padding: 8,
    borderWidth: 1,
    borderColor: Hud.tileBorder,
    borderRadius: Radius.sm,
    backgroundColor: Hud.tile,
  },
  tileLabel: { color: Hud.textMuted, fontSize: 9.5, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  tileValue: { fontSize: 16, fontWeight: '800' },
  tileContext: { color: Hud.textMuted, fontSize: 9.5 },
  regionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  regionDot: { width: 8, height: 8, borderRadius: 4 },
  regionName: { color: Hud.textDim, fontSize: 11, width: 86 },
  regionBar: { flex: 1 },
  regionValue: { color: Hud.text, fontSize: 11, fontWeight: '700', width: 46, textAlign: 'right' },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  layerRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Hud.tileBorder,
    borderRadius: Radius.sm,
    backgroundColor: Hud.tile,
  },
  layerRowActive: { borderColor: Hud.title },
  layerRowDisabled: { opacity: 0.45 },
  layerRowPressed: { opacity: 0.75 },
  layerBody: { flex: 1, gap: 1 },
  layerLabel: { color: Hud.text, fontSize: 12, fontWeight: '700' },
  layerHint: { color: Hud.textMuted, fontSize: 9.5, lineHeight: 12 },
  layerStrip: { flexDirection: 'row', borderRadius: 3, overflow: 'hidden' },
  layerStripCell: { width: 13, height: 13 },
  layerLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 4, paddingHorizontal: 2 },
  layerLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  layerSwatch: { width: 10, height: 10, borderRadius: 3 },
  layerLegendLabel: { color: Hud.textDim, fontSize: 9.5 },
  goalMark: { fontSize: 11, fontWeight: '800' },
  goalLabel: { flex: 1, color: Hud.textDim, fontSize: 11 },
  goalValue: { fontSize: 11, fontWeight: '700' },
  emptyNote: { color: Hud.textMuted, fontSize: 11, fontStyle: 'italic', paddingVertical: 2 },
} as const;
