import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { adviseDecision, type GameContent, type GameState, type Opinion } from '@/engine';
import { legislativeInstrument } from '@/engine/congress/congress';
import { useTheme } from '@/hooks/use-theme';
import type { Policy } from '@/types/policy';

import { INSTRUMENT_LABEL } from './labels';

export interface DispatchCardProps {
  policy: Policy;
  state: GameState;
  content: GameContent;
  /** A política já está na agenda deste mês. */
  included: boolean;
  /** Cabe nos pontos de agenda restantes (incluir só é permitido quando cabe). */
  canInclude: boolean;
  onToggle: () => void;
}

const TONE: Record<Opinion['tone'], { color: ThemeColor; word: string }> = {
  favoravel: { color: 'positive', word: 'Favorável' },
  desfavoravel: { color: 'negative', word: 'Desfavorável' },
  neutro: { color: 'textSecondary', word: 'Neutro' },
};

/** Mesa de despacho (GAME_DESIGN.md §4.4): três pareceres curtos antes de incluir a decisão na agenda. */
export function DispatchCard({ policy, state, content, included, canInclude, onToggle }: DispatchCardProps) {
  const { colors } = useTheme();
  const advice = useMemo(() => adviseDecision(state, policy.id, content), [state, policy.id, content]);
  const instrument = legislativeInstrument(policy);
  const instrumentText = instrument
    ? `${INSTRUMENT_LABEL[instrument]} — passa pelo Congresso`
    : 'Ato do Executivo — não depende do Congresso';
  const voices: { title: string; opinion: Opinion }[] = [
    { title: 'Fazenda', opinion: advice.fazenda },
    { title: 'Articulação política', opinion: advice.articulacao },
    { title: 'Comunicação', opinion: advice.comunicacao },
  ];
  const blocked = !included && !canInclude;

  return (
    <View style={[styles.root, { borderTopColor: colors.border }]}>
      <Text variant="label" color="textSecondary">
        Mesa de despacho · {instrumentText}
      </Text>
      {voices.map(({ title, opinion }) => (
        <View key={title} style={[styles.voice, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <Text variant="label">{title}</Text>
          <Text variant="body">{opinion.text}</Text>
          <Text variant="caption" color={TONE[opinion.tone].color}>
            {TONE[opinion.tone].word}
          </Text>
        </View>
      ))}
      <Button
        label={included ? 'Retirar da agenda' : 'Incluir na agenda'}
        variant={included ? 'secondary' : 'primary'}
        disabled={blocked}
        accessibilityHint={blocked ? 'Pontos de agenda insuficientes neste mês' : undefined}
        onPress={onToggle}
        block
      />
      {blocked && (
        <Text variant="caption" color="warning">
          Pontos de agenda insuficientes para incluir esta decisão neste mês.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two },
  voice: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.sm, padding: Spacing.two, gap: Spacing.half },
});
