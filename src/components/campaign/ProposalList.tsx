import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { MIN_TOUCH, Radius, Spacing } from '@/constants/theme';
import type { GameContent, Proposal } from '@/engine';
import { useTheme } from '@/hooks/use-theme';

import { PROPOSAL_STATUS_LABEL, shortMonthLabel } from './labels';

export interface ProposalListProps {
  proposals: readonly Proposal[];
  content: GameContent;
  /** ID da proposta com histórico aberto. */
  openId: string | null;
  onToggle: (id: string) => void;
}

/** Propostas da campanha (em andamento ou já encerradas) com a trilha de auditoria (GAME_DESIGN.md §9, §12). */
export function ProposalList({ proposals, content, openId, onToggle }: ProposalListProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.root}>
      <Text variant="title">Propostas</Text>
      {proposals.length === 0 && (
        <Text variant="body" color="textSecondary">
          Nenhuma proposta enviada nesta campanha.
        </Text>
      )}
      {[...proposals].reverse().map((p) => {
        const name = content.policies[p.policyId]?.name ?? p.policyId;
        const last = p.history[p.history.length - 1];
        const open = openId === p.id;
        return (
          <Pressable
            key={p.id}
            onPress={() => onToggle(p.id)}
            accessibilityRole="button"
            accessibilityLabel={`${name}, ${PROPOSAL_STATUS_LABEL[p.status]}. ${open ? 'Ocultar histórico' : 'Ver histórico'}`}
            accessibilityState={{ expanded: open }}
            style={({ pressed }) => [
              styles.item,
              { borderColor: colors.border, backgroundColor: pressed ? colors.surfaceRaised : colors.surface },
            ]}>
            <Text variant="label">{name}</Text>
            <Text variant="body" color="textSecondary">
              {PROPOSAL_STATUS_LABEL[p.status]}
              {last?.detail ? ` — ${last.detail}` : ''}
            </Text>
            {open && (
              <View style={[styles.history, { borderTopColor: colors.border }]}>
                {p.history.map((t, i) => (
                  <Text key={`${t.monthIndex}_${i}`} variant="caption" color="textSecondary">
                    {shortMonthLabel(t.monthIndex)} · {PROPOSAL_STATUS_LABEL[t.status]}
                    {t.detail ? `: ${t.detail}` : ''}
                  </Text>
                ))}
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.two },
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
