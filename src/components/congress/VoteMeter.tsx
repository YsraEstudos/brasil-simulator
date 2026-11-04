import { StyleSheet, View } from 'react-native';

import { Icon, ICONS } from '@/components/campaign/GabineteBits';
import { Text } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import type { VoteEstimate } from '@/engine';
import { useTheme } from '@/hooks/use-theme';

import { voteGap } from './congressBoard';

const TONE_ICON = { positive: ICONS.check, warning: ICONS.warning, negative: ICONS.warning } as const;

/**
 * Uma etapa de votação (PLANO_QUICK_WINS.md, Fase Q8, B33): barra das cadeiras da Casa com os votos esperados (faixa,
 * fora do Casual), a linha do quórum e "faltam X votos". Os números são os mesmos da mesa de despacho.
 */
export function VoteMeter({ estimate }: { estimate: VoteEstimate }) {
  const { colors } = useTheme();
  const gap = voteGap(estimate);
  const pct = (n: number) => `${(Math.max(0, Math.min(estimate.total, n)) / estimate.total) * 100}%` as const;
  const votesText = estimate.exact
    ? `cerca de ${estimate.shown} votos`
    : `entre ${estimate.low} e ${estimate.high} votos`;
  const fill = gap.tone === 'negative' ? colors.negative : gap.tone === 'warning' ? colors.warning : colors.positive;

  return (
    <View
      style={styles.root}
      accessible
      accessibilityLabel={`${estimate.label}: ${votesText} para ${estimate.required} necessários, de ${estimate.total}. ${gap.text}.`}>
      <View style={styles.top}>
        <Text variant="label">{estimate.label}</Text>
        <Text variant="caption" color="textSecondary" tabular>
          {`${votesText} · quórum ${estimate.required}`}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        {/* Certeza até o piso da faixa; a faixa em si, mais clara. */}
        <View style={[styles.fill, { width: pct(estimate.low), backgroundColor: fill }]} />
        {!estimate.exact && (
          <View
            style={[
              styles.fill,
              {
                left: pct(estimate.low),
                width: pct(estimate.high - estimate.low),
                backgroundColor: fill,
                opacity: 0.35,
              },
            ]}
          />
        )}
        <View style={[styles.quorum, { left: pct(estimate.required), backgroundColor: colors.text }]} />
      </View>
      <View style={styles.gap}>
        <Icon name={TONE_ICON[gap.tone]} size={14} color={gap.tone} />
        <Text variant="caption" color={gap.tone} style={styles.bold}>
          {gap.text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.one },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  track: { height: 12, borderRadius: Radius.pill, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  quorum: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1 },
  gap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  bold: { fontWeight: '700' },
});
