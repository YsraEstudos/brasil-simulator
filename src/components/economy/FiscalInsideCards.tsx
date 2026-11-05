import { StyleSheet, View } from 'react-native';

import { Card, formatPercent, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { ThemeColors } from '@/constants/theme';
import type { RevenueGroup } from '@/engine';
import { useTheme } from '@/hooks/use-theme';

import type { FloorProjection, Squeeze, SqueezeSegmentId, TaxFatigue } from './fiscalHistoryModel';

/** Cor de cada parte da barra; o tema já traz o modo para daltônicos, e a legenda numerada repete a ordem. */
const SEGMENT_COLOR: Record<SqueezeSegmentId, keyof ThemeColors> = {
  obrigatorias: 'textMuted',
  vinculadas: 'info',
  piso: 'warning',
  acima_piso: 'positive',
};

/** Raio-X do esmagamento (H8, C3): barra empilhada, legenda numerada na ordem da barra e projeção até o piso. */
export function SqueezeCard({
  squeeze,
  projection,
  flow,
}: {
  squeeze: Squeeze;
  projection: FloorProjection;
  flow: (fraction: number, decimals?: number) => string;
}) {
  const { colors } = useTheme();
  const summary = squeeze.segments
    .map((s, i) => `${i + 1}. ${s.label}: ${formatPercent(s.share, 0)}, ${flow(s.value, 2)}`)
    .join('; ');
  return (
    <Card
      title="Raio-X do esmagamento"
      subtitle="Quanto da despesa o governo não escolhe, e quanto sobra acima do piso">
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Despesa primária sem exceções. ${summary}. Engessamento ${formatPercent(squeeze.rigidity, 0)}.`}
        style={[styles.bar, { borderColor: colors.border }]}>
        {squeeze.segments
          .filter((s) => s.share > 0)
          .map((s) => (
            <View
              key={s.id}
              style={{
                flex: s.share,
                backgroundColor: colors[SEGMENT_COLOR[s.id]],
                borderRightWidth: StyleSheet.hairlineWidth,
                borderRightColor: colors.surface,
              }}
            />
          ))}
      </View>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={styles.legend}>
        {squeeze.segments.map((s, i) => (
          <View key={s.id} style={styles.legendRow}>
            <View style={[styles.swatch, { backgroundColor: colors[SEGMENT_COLOR[s.id]] }]} />
            <Text variant="caption" tabular>
              {`${i + 1}. ${s.label}: ${formatPercent(s.share, 0)} · ${flow(s.value, 2)}`}
            </Text>
          </View>
        ))}
      </View>
      {squeeze.belowFloor > 0 ? (
        <Text variant="caption" color="negative">
          {`Faltam ${flow(squeeze.belowFloor, 2)} para voltar ao piso de funcionamento.`}
        </Text>
      ) : null}
      <Text
        variant="body"
        color={projection.kind === 'caindo' || projection.kind === 'abaixo' ? 'warning' : 'textSecondary'}>
        {projection.text}
      </Text>
      <Text variant="caption" color="textMuted">
        Tendência linear calculada pela tela com os meses guardados (até 12); o motor não prevê o futuro.
      </Text>
    </Card>
  );
}

const GROUP_LABEL: Record<RevenueGroup, string> = {
  renda: 'Renda',
  folha: 'Folha',
  consumo: 'Consumo',
  outras: 'Demais tributos',
  royalties: 'Royalties',
};

/** Fadiga tributária por base (H8, C7): barra de saturação da perda, com o número escrito ao lado. */
export function TaxFatigueCard({ fatigue }: { fatigue: TaxFatigue[] | null }) {
  const { colors } = useTheme();
  return (
    <Card
      title="Fadiga tributária por base"
      subtitle="Quanto da carga se perde em sonegação, elisão e informalidade quando a base passa do que aguenta">
      {fatigue === null ? (
        <Text variant="body" color="textSecondary">
          Este save ainda não tem o detalhe por base: ele aparece ao encerrar o próximo mês.
        </Text>
      ) : (
        fatigue.map((f) => {
          const tone = f.saturation >= 0.5 ? 'negative' : f.saturation > 0 ? 'warning' : 'positive';
          return (
            <View
              key={f.group}
              accessible
              accessibilityLabel={`${GROUP_LABEL[f.group]}: ${f.text}`}
              style={styles.fatigueRow}>
              <Text variant="label">{GROUP_LABEL[f.group]}</Text>
              <View style={[styles.track, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                <View style={{ width: `${Math.round(f.saturation * 100)}%`, backgroundColor: colors[tone] }} />
              </View>
              <Text variant="caption" color="textSecondary" tabular>
                {f.text}
              </Text>
            </View>
          );
        })
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    height: 18,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  legend: { gap: Spacing.half },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  fatigueRow: { gap: Spacing.half, paddingTop: Spacing.one },
  track: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
