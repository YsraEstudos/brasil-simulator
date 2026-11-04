import { StyleSheet, View } from 'react-native';

import { Icon, ICONS } from '@/components/campaign/GabineteBits';
import { Card, formatNumber, Text } from '@/components/ui';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { baseVerdict, CAMP_LABEL, type Camp, type HouseScore, type WeakLink } from './congressBoard';
import { ALLY_RELATION } from './hemicycle';

const CAMPS: readonly Camp[] = ['base', 'independentes', 'oposicao'];
const CAMP_COLOR: Readonly<Record<Camp, ThemeColor>> = {
  base: 'positive',
  independentes: 'textMuted',
  oposicao: 'negative',
};
const TONE_ICON = { positive: ICONS.check, warning: ICONS.warning, negative: ICONS.warning } as const;

/**
 * Placar da base nas duas Casas (PLANO_QUICK_WINS.md, Fase Q8, B38 e D38): barra base × independentes × oposição com
 * as linhas da maioria e da PEC, o veredito em texto e o elo mais fraco da base, com os motivos.
 */
export function BaseScoreboard({
  chamber,
  senate,
  weakLink,
}: {
  chamber: HouseScore;
  senate: HouseScore;
  weakLink: WeakLink | null;
}) {
  return (
    <Card
      title="Placar da base"
      subtitle={`Base: blocos com relação acima de +${ALLY_RELATION}. Oposição: abaixo de −${ALLY_RELATION}. Quem fica no meio é independente.`}>
      <HouseBar name="Câmara" score={chamber} />
      <HouseBar name="Senado" score={senate} />
      <WeakLinkBox weakLink={weakLink} />
    </Card>
  );
}

function HouseBar({ name, score }: { name: string; score: HouseScore }) {
  const { colors } = useTheme();
  const verdict = baseVerdict(score);
  const pct = (n: number) => `${(n / Math.max(1, score.total)) * 100}%` as const;
  const speech = `${name}: base ${score.base}, independentes ${score.independentes}, oposição ${score.oposicao}, de ${score.total}. Maioria: ${score.majority}. PEC: ${score.pec}. ${verdict.text}.`;

  return (
    <View style={styles.house} accessible accessibilityLabel={speech}>
      <View style={styles.houseTop}>
        <Text variant="label">{name}</Text>
        <Text variant="caption" color="textMuted" tabular>
          {`${formatNumber(score.total)} cadeiras`}
        </Text>
      </View>

      <View style={styles.barWrap}>
        <View style={[styles.bar, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          {CAMPS.map((camp) =>
            score[camp] > 0 ? (
              <View
                key={camp}
                style={{
                  width: pct(score[camp]),
                  backgroundColor: colors[CAMP_COLOR[camp]],
                  opacity: camp === 'independentes' ? 0.45 : 1,
                }}
              />
            ) : null,
          )}
        </View>
        <QuorumLine at={pct(score.majority)} label={`Maioria ${score.majority}`} />
        <QuorumLine at={pct(score.pec)} label={`PEC ${score.pec}`} below />
      </View>

      <View style={styles.legend}>
        {CAMPS.map((camp) => (
          <View key={camp} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: colors[CAMP_COLOR[camp]] }]} />
            <Text variant="caption" color="textSecondary">
              {CAMP_LABEL[camp]}
            </Text>
            <Text variant="caption" style={styles.bold} tabular>
              {score[camp]}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.verdict}>
        <Icon name={TONE_ICON[verdict.tone]} size={14} color={verdict.tone} />
        <Text variant="caption" color={verdict.tone} style={styles.bold}>
          {verdict.text}
        </Text>
      </View>
    </View>
  );
}

/** Linha vertical do quórum sobre a barra, com o número em cima (ou embaixo, para não encostar na outra). */
function QuorumLine({ at, label, below }: { at: `${number}%`; label: string; below?: boolean }) {
  const { colors } = useTheme();
  return (
    <View pointerEvents="none" style={[styles.quorum, { left: at }]}>
      <View style={[styles.quorumTick, { backgroundColor: colors.text }]} />
      <Text
        variant="caption"
        color="textSecondary"
        tabular
        numberOfLines={1}
        style={[styles.quorumLabel, below ? styles.quorumBelow : styles.quorumAbove]}>
        {label}
      </Text>
    </View>
  );
}

function WeakLinkBox({ weakLink }: { weakLink: WeakLink | null }) {
  const { colors } = useTheme();
  if (!weakLink) {
    return (
      <View style={[styles.weak, { borderColor: colors.border }]}>
        <Text variant="label">Elo mais fraco da base</Text>
        <Text variant="caption" color="textSecondary">
          Nenhum bloco está na base agora. Negociar e entregar pastas melhora a relação.
        </Text>
      </View>
    );
  }
  const urgent = weakLink.margin <= 5;
  return (
    <View
      style={[
        styles.weak,
        {
          borderColor: urgent ? colors.warning : colors.border,
          backgroundColor: urgent ? colors.warningSoft : 'transparent',
        },
      ]}>
      <View style={styles.weakTop}>
        <Icon name={ICONS.warning} size={16} color={urgent ? 'warning' : 'textSecondary'} />
        <Text variant="label" style={styles.grow}>
          {`Elo mais fraco: ${weakLink.bloc.name}`}
        </Text>
        <Text variant="label" color={urgent ? 'warning' : 'textSecondary'} tabular>
          {`+${Math.round(weakLink.relation)}`}
        </Text>
      </View>
      {weakLink.reasons.map((reason) => (
        <Text key={reason} variant="caption" color="textSecondary">
          {`• ${reason}`}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  house: { gap: Spacing.one, paddingVertical: Spacing.one },
  houseTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  barWrap: { marginVertical: Spacing.three },
  bar: {
    flexDirection: 'row',
    height: 16,
    borderRadius: Radius.pill,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  quorum: { position: 'absolute', top: -4, bottom: -4, alignItems: 'center', width: 0 },
  quorumTick: { width: 2, height: 24, borderRadius: 1 },
  quorumLabel: { position: 'absolute', left: -45, width: 90, textAlign: 'center', fontSize: 10, lineHeight: 12 },
  quorumAbove: { top: -15 },
  quorumBelow: { top: 25 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  weak: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.two, gap: Spacing.half, marginTop: Spacing.one },
  weakTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  grow: { flex: 1 },
  bold: { fontWeight: '700' },
});
