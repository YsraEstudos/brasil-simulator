import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { RegionalPreviewCard } from '@/components/map/RegionalPreviewCard';
import { Alert, Button, Text } from '@/components/ui';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { adviseDecision, type GameContent, type GameState, type Opinion } from '@/engine';
import { legislativeInstrument } from '@/engine/congress/congress';
import { useTheme } from '@/hooks/use-theme';
import type { Policy } from '@/types/policy';

import { Icon, ICONS, type IconName } from './GabineteBits';
import { INSTRUMENT_LABEL } from './labels';

export interface DispatchCardProps {
  policy: Policy;
  state: GameState;
  content: GameContent;
  /** A política já está na agenda deste mês. */
  included: boolean;
  /** Cabe nas ações de agenda restantes (incluir só é permitido quando cabe). */
  canInclude: boolean;
  /** Vedação eleitoral: incluir exige a confirmação de quebra declarada (`vedacao_bypass`). */
  vedacao: boolean;
  onToggle: () => void;
  onToggleBypass: () => void;
}

const TONE: Record<Opinion['tone'], { color: ThemeColor; soft: ThemeColor; word: string; icon: IconName }> = {
  favoravel: { color: 'positive', soft: 'positiveSoft', word: 'Favorável', icon: ICONS.check },
  desfavoravel: { color: 'negative', soft: 'negativeSoft', word: 'Desfavorável', icon: ICONS.warning },
  neutro: { color: 'textSecondary', soft: 'surface', word: 'Neutro', icon: ICONS.info },
};

/** Mesa de despacho (GAME_DESIGN.md §4.4): três pareceres curtos antes de incluir a decisão na agenda. */
export function DispatchCard({
  policy,
  state,
  content,
  included,
  canInclude,
  vedacao,
  onToggle,
  onToggleBypass,
}: DispatchCardProps) {
  const { colors } = useTheme();
  const advice = useMemo(() => adviseDecision(state, policy.id, content), [state, policy.id, content]);
  const instrument = legislativeInstrument(policy);
  const instrumentText = instrument
    ? `${INSTRUMENT_LABEL[instrument]} — passa pelo Congresso`
    : 'Ato do Executivo — não depende do Congresso';
  const voices: { title: string; role: string; icon: IconName; opinion: Opinion }[] = [
    { title: 'Fazenda', role: 'contas públicas', icon: ICONS.fazenda, opinion: advice.fazenda },
    { title: 'Articulação política', role: 'votos no Congresso', icon: ICONS.articulacao, opinion: advice.articulacao },
    { title: 'Comunicação', role: 'opinião pública', icon: ICONS.comunicacao, opinion: advice.comunicacao },
  ];
  const blocked = !included && !canInclude;

  return (
    <View style={[styles.root, { borderTopColor: colors.border }]}>
      <View style={styles.heading}>
        <Icon name={instrument ? ICONS.congress : ICONS.executive} size={16} color={instrument ? 'info' : 'positive'} />
        <Text variant="label" color="textSecondary" style={styles.headingText}>
          Mesa de despacho · {instrumentText}
        </Text>
      </View>
      {voices.map(({ title, role, icon, opinion }) => {
        const tone = TONE[opinion.tone];
        return (
          <View
            key={title}
            style={[styles.voice, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <View style={styles.voiceTop}>
              <Icon name={icon} size={18} />
              <View style={styles.voiceTitle}>
                <Text variant="label">{title}</Text>
                <Text variant="caption" color="textMuted">
                  {role}
                </Text>
              </View>
              <View style={[styles.tone, { backgroundColor: colors[tone.soft], borderColor: colors[tone.color] }]}>
                <Icon name={tone.icon} size={12} color={tone.color} />
                <Text variant="caption" color={tone.color} style={styles.toneText}>
                  {tone.word}
                </Text>
              </View>
            </View>
            <Text variant="body">{opinion.text}</Text>
          </View>
        );
      })}
      <RegionalPreviewCard state={state} content={content} policyId={policy.id} />
      {vedacao && (
        <Alert
          tone="warning"
          title="Vedação eleitoral"
          message="Nos meses antes do pleito, criar ou ampliar benefícios é vedado (Lei 9.504/1997). Incluir na agenda exige quebra declarada: a Justiça Eleitoral pode multar e a intenção de voto sente."
        />
      )}
      <Button
        label={included ? 'Retirar da agenda' : vedacao ? 'Incluir com quebra declarada' : 'Incluir na agenda'}
        variant={included ? 'secondary' : 'primary'}
        disabled={blocked}
        accessibilityHint={blocked ? 'Ações de agenda insuficientes neste mês' : undefined}
        onPress={vedacao ? onToggleBypass : onToggle}
        block
      />
      {blocked && (
        <Text variant="caption" color="warning">
          Ações de agenda insuficientes para incluir esta decisão neste mês.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two },
  heading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  headingText: { flex: 1 },
  voice: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.md, padding: Spacing.two, gap: Spacing.one },
  voiceTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  voiceTitle: { flex: 1 },
  tone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  toneText: { fontWeight: '700' },
});
