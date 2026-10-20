import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { MIN_TOUCH, Radius, Spacing } from '@/constants/theme';
import type { GameContent, Proposal } from '@/engine';
import { useTheme } from '@/hooks/use-theme';

import { PROPOSAL_STATUS_LABEL, shortMonthLabel } from './labels';

/** Trilha de auditoria de uma proposta: cada mudança de situação, com mês e detalhe (GAME_DESIGN.md §9, §12). */
export function ProposalTrail({ proposal }: { proposal: Proposal }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.history, { borderTopColor: colors.border }]}>
      {proposal.history.map((t, i) => (
        <Text key={`${t.monthIndex}_${i}`} variant="caption" color="textSecondary">
          {shortMonthLabel(t.monthIndex)} · {PROPOSAL_STATUS_LABEL[t.status]}
          {t.detail ? `: ${t.detail}` : ''}
        </Text>
      ))}
    </View>
  );
}

/**
 * Propostas já fora do Congresso (aprovadas, rejeitadas, vetadas, em execução…), da mais recente para a mais antiga,
 * cada uma com o histórico que se abre ao tocar. As que ainda tramitam aparecem em "Propostas no Congresso".
 */
export function ProposalList({ proposals, content }: { proposals: readonly Proposal[]; content: GameContent }) {
  const { colors } = useTheme();
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <Card
      title="Fora do Congresso"
      subtitle="À espera de sanção, em vigor ou encerradas. Toque numa proposta para ver o histórico de cada etapa.">
      {[...proposals].reverse().map((p) => {
        const name = content.policies[p.policyId]?.name ?? p.policyId;
        const last = p.history[p.history.length - 1];
        const open = openId === p.id;
        return (
          <Pressable
            key={p.id}
            onPress={() => setOpenId((cur) => (cur === p.id ? null : p.id))}
            accessibilityRole="button"
            accessibilityLabel={`${name}, ${PROPOSAL_STATUS_LABEL[p.status]}. ${open ? 'Ocultar histórico' : 'Ver histórico'}`}
            accessibilityState={{ expanded: open }}
            style={({ pressed }) => [
              styles.item,
              { borderColor: colors.border, backgroundColor: pressed ? colors.surfaceRaised : 'transparent' },
            ]}>
            <Text variant="label">{name}</Text>
            <Text variant="body" color="textSecondary">
              {PROPOSAL_STATUS_LABEL[p.status]}
              {last?.detail ? ` — ${last.detail}` : ''}
            </Text>
            {open && <ProposalTrail proposal={p} />}
          </Pressable>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  item: {
    minHeight: MIN_TOUCH,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  history: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.one,
    paddingTop: Spacing.one,
    gap: Spacing.half,
  },
});
