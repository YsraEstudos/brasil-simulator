import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { FilterChip, ICONS } from '@/components/campaign/GabineteBits';
import { POLICY_KIND_LABEL } from '@/components/campaign/policyCatalogModel';
import { Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';

import { PROPOSAL_KINDS, PROPOSAL_SITUATIONS, type ProposalFilter, type ProposalSituation } from './congressBoard';

/**
 * Filtro das propostas do Congresso por situação e tipo (PLANO_QUICK_WINS.md, Fase Q8, B35). Cada situação mostra
 * quantas propostas tem, já com o filtro de tipo aplicado.
 */
export function ProposalFilterBar({
  filter,
  counts,
  onChange,
}: {
  filter: ProposalFilter;
  counts: Record<ProposalSituation, number>;
  onChange: (filter: ProposalFilter) => void;
}) {
  return (
    <View style={styles.root}>
      <FilterRow title="Situação" label="Filtrar propostas por situação">
        <FilterChip
          label="Todas"
          active={filter.situation === null}
          onPress={() => onChange({ ...filter, situation: null })}
        />
        {PROPOSAL_SITUATIONS.map(({ id, label }) => (
          <FilterChip
            key={id}
            label={label}
            count={counts[id]}
            accessibilityLabel={`${label}: ${counts[id]} ${counts[id] === 1 ? 'proposta' : 'propostas'}`}
            active={filter.situation === id}
            onPress={() => onChange({ ...filter, situation: filter.situation === id ? null : id })}
          />
        ))}
      </FilterRow>
      <FilterRow title="Tipo" label="Filtrar propostas por tipo">
        <FilterChip label="Todos" active={filter.kind === null} onPress={() => onChange({ ...filter, kind: null })} />
        {PROPOSAL_KINDS.map((kind) => (
          <FilterChip
            key={kind}
            label={POLICY_KIND_LABEL[kind].short}
            icon={ICONS.congress}
            accessibilityLabel={POLICY_KIND_LABEL[kind].long}
            active={filter.kind === kind}
            onPress={() => onChange({ ...filter, kind: filter.kind === kind ? null : kind })}
          />
        ))}
      </FilterRow>
    </View>
  );
}

/** Linha de chips com título, rolando na horizontal (também no histórico de votações e na linha do tempo, H6). */
export function FilterRow({ title, label, children }: { title: string; label: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text variant="caption" color="textMuted" style={styles.title}>
        {title.toUpperCase()}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        accessibilityLabel={label}>
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.two },
  row: { gap: Spacing.one },
  title: { fontWeight: '700', letterSpacing: 0.6 },
  chips: { gap: Spacing.one, paddingVertical: Spacing.half },
});
