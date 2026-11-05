import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FilterChip, ICONS } from '@/components/campaign/GabineteBits';
import { shortMonthLabel } from '@/components/campaign/labels';
import { POLICY_KIND_LABEL, policyKind } from '@/components/campaign/policyCatalogModel';
import { Card, Text } from '@/components/ui';
import { MIN_TOUCH, Radius, Spacing } from '@/constants/theme';
import { legislativeInstrument, type GameContent, type GameState } from '@/engine';
import { useTheme } from '@/hooks/use-theme';

import { PROPOSAL_KINDS } from './congressBoard';
import { FilterRow } from './ProposalFilterBar';
import {
  BLOC_SIDE_LABEL,
  filterVotes,
  NO_VOTE_FILTER,
  outcomeCounts,
  VOTE_OUTCOMES,
  voteAccessibilityLabel,
  voteHistory,
  type VoteFilter,
  type VoteHistoryEntry,
} from './voteHistoryModel';

/**
 * Histórico de votações (PLANO_SAVES_HISTORICO.md H6, A39): todas as votações da partida, filtradas por resultado e
 * tipo (os chips da Q8). Tocar numa votação abre o voto de cada bloco.
 */
export function VoteHistoryCard({ state, content }: { state: GameState; content: GameContent }) {
  const [filter, setFilter] = useState<VoteFilter>(NO_VOTE_FILTER);
  const [openId, setOpenId] = useState<string | null>(null);
  const entries = useMemo(() => {
    const blocs = new Map(content.scenario.blocs.map((b) => [b.id, b.name]));
    return voteHistory(
      state.proposals,
      (id) => content.policies[id]?.name ?? id,
      (id) => {
        const policy = content.policies[id];
        return policyKind(policy ? legislativeInstrument(policy) : null);
      },
      (id) => blocs.get(id) ?? id,
    );
  }, [state.proposals, content]);

  if (entries.length === 0) {
    return (
      <Card title="Histórico de votações">
        <Text variant="body" color="textSecondary">
          Nenhuma votação ainda. Cada votação na Câmara, no Senado ou em sessão do veto aparece aqui.
        </Text>
      </Card>
    );
  }

  const counts = outcomeCounts(entries, filter.kind);
  const shown = filterVotes(entries, filter);

  return (
    <Card
      title={`Histórico de votações (${entries.length})`}
      subtitle="Da mais recente para a mais antiga. Toque numa votação para ver o voto de cada bloco.">
      <FilterRow title="Resultado" label="Filtrar votações por resultado">
        <FilterChip
          label="Todas"
          active={filter.outcome === null}
          onPress={() => setFilter({ ...filter, outcome: null })}
        />
        {VOTE_OUTCOMES.map(({ id, label, symbol }) => (
          <FilterChip
            key={id}
            label={`${symbol} ${label}`}
            count={counts[id]}
            accessibilityLabel={`${label}: ${counts[id]} ${counts[id] === 1 ? 'votação' : 'votações'}`}
            active={filter.outcome === id}
            onPress={() => setFilter({ ...filter, outcome: filter.outcome === id ? null : id })}
          />
        ))}
      </FilterRow>
      <FilterRow title="Tipo" label="Filtrar votações por tipo">
        <FilterChip label="Todos" active={filter.kind === null} onPress={() => setFilter({ ...filter, kind: null })} />
        {PROPOSAL_KINDS.map((kind) => (
          <FilterChip
            key={kind}
            label={POLICY_KIND_LABEL[kind].short}
            icon={ICONS.congress}
            accessibilityLabel={POLICY_KIND_LABEL[kind].long}
            active={filter.kind === kind}
            onPress={() => setFilter({ ...filter, kind: filter.kind === kind ? null : kind })}
          />
        ))}
      </FilterRow>
      {shown.length === 0 ? (
        <Text variant="body" color="textSecondary">
          Nenhuma votação com esse filtro.
        </Text>
      ) : (
        shown.map((entry) => (
          <VoteRow
            key={entry.id}
            entry={entry}
            open={openId === entry.id}
            onToggle={() => setOpenId((cur) => (cur === entry.id ? null : entry.id))}
          />
        ))
      )}
    </Card>
  );
}

function VoteRow({ entry, open, onToggle }: { entry: VoteHistoryEntry; open: boolean; onToggle: () => void }) {
  const { colors } = useTheme();
  const tone = entry.approved ? 'positive' : 'negative';
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={`${voteAccessibilityLabel(entry)} ${open ? 'Ocultar votos dos blocos' : 'Ver votos dos blocos'}`}
      accessibilityState={{ expanded: open }}
      style={({ pressed }) => [
        styles.item,
        { borderColor: colors.border, backgroundColor: pressed ? colors.surfaceRaised : 'transparent' },
      ]}>
      <View style={styles.head}>
        <Text variant="label" style={styles.name}>
          {entry.policyName}
        </Text>
        <Text variant="caption" color={tone}>
          {`${entry.approved ? '✓' : '✕'} ${entry.resultLabel}`}
        </Text>
      </View>
      <Text variant="body" color="textSecondary" tabular>
        {`${shortMonthLabel(entry.monthIndex)} · ${entry.summary}`}
      </Text>
      <Text variant="caption" color="textMuted">
        {`Quórum: ${entry.quorumLabel} · ${POLICY_KIND_LABEL[entry.kind].short}`}
      </Text>
      {open && (
        <View style={[styles.blocs, { borderTopColor: colors.border }]}>
          {entry.blocs.map((b) => (
            <Text key={b.blocId} variant="caption" color="textSecondary" tabular>
              {`${b.name}: ${BLOC_SIDE_LABEL[b.side]} (${b.yes} sim, ${b.no} não)`}
            </Text>
          ))}
        </View>
      )}
    </Pressable>
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
  head: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: Spacing.two },
  name: { flexShrink: 1 },
  blocs: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.one,
    paddingTop: Spacing.one,
    gap: Spacing.half,
  },
});
