import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Peças visuais do Gabinete: ícones, cabeçalhos de seção com explicação, selos, marcadores de custo e barras. */

export type IconName = SymbolViewProps['name'];

/** Ícone do sistema (SF Symbols no iOS, Material Symbols no Android e na web). */
export function icon(ios: string, material: string): IconName {
  return { ios, android: material, web: material } as IconName;
}

export const ICONS = {
  agenda: icon('calendar', 'event'),
  decisions: icon('doc.text.fill', 'gavel'),
  ministries: icon('building.columns.fill', 'account_balance'),
  projects: icon('hammer.fill', 'construction'),
  brands: icon('rosette', 'workspace_premium'),
  actions: icon('bolt.fill', 'bolt'),
  congress: icon('person.3.fill', 'how_to_vote'),
  executive: icon('signature', 'draw'),
  fazenda: icon('dollarsign.circle.fill', 'payments'),
  articulacao: icon('person.2.fill', 'handshake'),
  comunicacao: icon('megaphone.fill', 'campaign'),
  check: icon('checkmark.circle.fill', 'check_circle'),
  add: icon('plus.circle', 'add_circle'),
  expand: icon('chevron.down', 'expand_more'),
  collapse: icon('chevron.up', 'expand_less'),
  inProgress: icon('hourglass', 'hourglass_top'),
  locked: icon('lock.fill', 'lock'),
  warning: icon('exclamationmark.triangle.fill', 'warning'),
  info: icon('info.circle', 'info'),
  bank: icon('banknote.fill', 'account_balance_wallet'),
  remove: icon('xmark', 'close'),
} as const;

export function Icon({ name, size = 18, color = 'accent' }: { name: IconName; size?: number; color?: ThemeColor }) {
  const { colors } = useTheme();
  return <SymbolView name={name} tintColor={colors[color]} size={size} />;
}

/** Ícone dentro de um quadrado arredondado (identidade visual de cada item). */
export function IconTile({ name, color = 'accent', size = 40 }: { name: IconName; color?: ThemeColor; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, backgroundColor: colors.surfaceRaised, borderColor: colors.border },
      ]}>
      <Icon name={name} size={Math.round(size * 0.5)} color={color} />
    </View>
  );
}

/** Cabeçalho de seção: ícone, título e uma linha dizendo para que a seção serve. */
export function SectionHeader({
  icon: name,
  title,
  description,
  accessory,
}: {
  icon: IconName;
  title: string;
  description: string;
  accessory?: ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <IconTile name={name} size={44} />
      <View style={styles.sectionText}>
        <Text variant="heading" accessibilityRole="header">
          {title}
        </Text>
        <Text variant="caption" color="textSecondary">
          {description}
        </Text>
      </View>
      {accessory}
    </View>
  );
}

/** Selo curto com ícone opcional (instrumento, custo, situação). */
export function Badge({
  label,
  icon: name,
  tone = 'textSecondary',
}: {
  label: string;
  icon?: IconName;
  tone?: ThemeColor;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.badge, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}>
      {name && <Icon name={name} size={12} color={tone} />}
      <Text variant="caption" color={tone} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Custo em ações como bolinhas (●●○), com o texto para leitores de tela. */
export function CostPips({ cost, max }: { cost: number; max?: number }) {
  const { colors } = useTheme();
  const total = Math.max(cost, max ?? cost);
  return (
    <View
      style={[styles.badge, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}
      accessible
      accessibilityLabel={`Custa ${cost} ${cost === 1 ? 'ação' : 'ações'} de agenda`}>
      <Icon name={ICONS.actions} size={12} />
      <View style={styles.pips}>
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={[
              styles.pip,
              i < cost ? { backgroundColor: colors.accent } : { borderColor: colors.textMuted, borderWidth: 1 },
            ]}
          />
        ))}
      </View>
      <Text variant="caption" color="accent">
        {cost === 0 ? 'grátis' : `${cost} ${cost === 1 ? 'ação' : 'ações'}`}
      </Text>
    </View>
  );
}

/** Barra de progresso fina (0 a 1). */
export function ProgressBar({ value, color = 'accent' }: { value: number; color?: ThemeColor }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.track, { backgroundColor: colors.surfaceRaised }]}>
      <View
        style={[styles.fill, { width: `${Math.min(100, Math.max(0, value * 100))}%`, backgroundColor: colors[color] }]}
      />
    </View>
  );
}

/** Aba do Gabinete: ícone + rótulo, com contador do que já está marcado nela. */
export function SectionTab({
  icon: name,
  label,
  active,
  count,
  onPress,
}: {
  icon: IconName;
  label: string;
  active: boolean;
  count?: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={count ? `${label}, ${count} na agenda` : label}
      style={({ pressed }) => [
        styles.tab,
        {
          borderColor: active ? colors.accent : colors.border,
          backgroundColor: active ? colors.surfaceRaised : colors.surface,
        },
        pressed && styles.pressed,
      ]}>
      <Icon name={name} size={20} color={active ? 'accent' : 'textSecondary'} />
      <Text
        variant="caption"
        color={active ? 'accent' : 'textSecondary'}
        numberOfLines={2}
        align="center"
        style={styles.tabLabel}>
        {label}
      </Text>
      {count ? (
        <View style={[styles.tabCount, { backgroundColor: colors.accent }]}>
          <Text variant="caption" color="onAccent" style={styles.tabCountText}>
            {count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Filtro em forma de pílula, com ícone. */
export function FilterChip({
  label,
  icon: name,
  active,
  onPress,
}: {
  label: string;
  icon?: IconName;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: active ? colors.accent : colors.border,
          backgroundColor: active ? colors.accent : 'transparent',
        },
        pressed && styles.pressed,
      ]}>
      {name && <Icon name={name} size={14} color={active ? 'onAccent' : 'textSecondary'} />}
      <Text variant="caption" color={active ? 'onAccent' : 'textSecondary'} style={styles.chipLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  sectionText: { flex: 1, gap: Spacing.half },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    maxWidth: '100%',
  },
  pips: { flexDirection: 'row', gap: 3 },
  pip: { width: 7, height: 7, borderRadius: 4 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  tab: {
    flex: 1,
    minWidth: 72,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  tabLabel: { fontWeight: '600' },
  tabCount: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabCountText: { fontWeight: '700', fontSize: 11, lineHeight: 14 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    minHeight: 36,
  },
  chipLabel: { fontWeight: '600' },
  pressed: { opacity: 0.75 },
});
