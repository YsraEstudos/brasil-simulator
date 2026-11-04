import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import {
  PROPOSAL_IN_PROGRESS,
  reissueBarredPolicies,
  type GameContent,
  type GameState,
  type Proposal,
  type ProposalStatus,
} from '@/engine';
import { legislativeInstrument } from '@/engine/congress/congress';
import { decisionCost } from '@/store';
import type { Policy } from '@/types/policy';

import { useCatalogQuery } from './catalogQueryStore';
import { ICONS, SectionHeader } from './GabineteBits';
import { areaLabel } from './labels';
import { PolicyCatalogCard } from './PolicyCatalogCard';
import {
  AreaFilterRow,
  CatalogEmpty,
  CatalogFilterPanel,
  CatalogResultsBar,
  CatalogToolbar,
} from './PolicyCatalogControls';
import {
  areaFilters,
  buildCatalog,
  isFiltering,
  panelFilterCount,
  queryCatalog,
  resultsLabel,
  type SaturationLimits,
} from './policyCatalogModel';

export interface DecisionPanelProps {
  state: GameState;
  content: GameContent;
  /** IDs das políticas marcadas para a agenda deste mês. */
  selected: readonly string[];
  /** Política com a mesa de despacho aberta. */
  expandedId: string | null;
  actionsMax: number;
  /** Ações de agenda ainda livres neste mês. */
  actionsLeft: number;
  onExpand: (id: string | null) => void;
  onToggle: (id: string) => void;
  /** Se incluir a política respeita as ações restantes. */
  canInclude: (policy: Policy) => boolean;
  /** Vedação eleitoral atingindo a política (novo benefício na janela): exige confirmação de quebra. */
  isVedada: (policy: Policy) => boolean;
  /** Inclui/retira a política com `params.vedacao_bypass` (quebra declarada). */
  onToggleBypass: (id: string) => void;
}

/**
 * Catálogo de decisões do Gabinete (GAME_DESIGN.md §4.2, §4.3; PLANO_QUICK_WINS.md, Fase Q6): busca, filtros por
 * área, tipo e custo, ordem e "o que posso pagar agora", com a mesa de despacho de cada decisão. A escolha de busca
 * e filtros fica no `catalogQueryStore` e sobrevive à troca de aba.
 */
export function DecisionPanel({
  state,
  content,
  selected,
  expandedId,
  actionsMax,
  actionsLeft,
  onExpand,
  onToggle,
  canInclude,
  isVedada,
  onToggleBypass,
}: DecisionPanelProps) {
  const { query, update, clear } = useCatalogQuery();
  const [panelOpen, setPanelOpen] = useState(false);

  const entries = useMemo(() => {
    const policies = content.scenario.policies.flatMap((id) => {
      const policy = content.policies[id];
      return policy && policy.delivery !== 'rotina' ? [policy] : [];
    });
    const latest = latestStatuses(state.proposals);
    return buildCatalog({
      policies,
      latestStatus: (id) => latest.get(id),
      inProgressStatuses: PROPOSAL_IN_PROGRESS,
      barred: reissueBarredPolicies(state, content),
      selected,
      actionsLeft,
      costOf: (policy) => decisionCost({ policyId: policy.id, agendaCost: 0 }, content),
      instrumentOf: legislativeInstrument,
      areaName: areaLabel,
      limits: saturationLimits(state, content),
    });
  }, [state, content, selected, actionsLeft]);

  const areas = useMemo(() => areaFilters(entries), [entries]);
  // Uma área escolhida em outra campanha pode não existir nesta: nesse caso, vale "Todas".
  const area = areas.some((item) => item.id === query.area) ? query.area : null;
  const effectiveQuery = useMemo(() => ({ ...query, area }), [query, area]);
  const visible = useMemo(() => queryCatalog(entries, effectiveQuery), [entries, effectiveQuery]);

  return (
    <View style={styles.root}>
      <SectionHeader
        icon={ICONS.decisions}
        title="Decisões de governo"
        description="Leis, medidas provisórias e decretos. Toque numa decisão para ouvir os ministros e incluí-la na agenda."
      />

      <CatalogToolbar
        search={query.search}
        filterCount={panelFilterCount(effectiveQuery)}
        panelOpen={panelOpen}
        onSearch={(search) => update({ search })}
        onTogglePanel={() => setPanelOpen((open) => !open)}
      />
      {panelOpen && <CatalogFilterPanel query={effectiveQuery} actionsLeft={actionsLeft} onChange={update} />}
      <AreaFilterRow areas={areas} selected={area} onSelect={(next) => update({ area: next })} />
      <CatalogResultsBar
        label={resultsLabel(visible.length, entries.length)}
        filtering={isFiltering(effectiveQuery)}
        onClear={clear}
      />

      {visible.length === 0 ? (
        <CatalogEmpty onClear={clear} />
      ) : (
        visible.map((entry) => (
          <PolicyCatalogCard
            key={entry.policy.id}
            entry={entry}
            state={state}
            content={content}
            expanded={expandedId === entry.policy.id}
            actionsMax={actionsMax}
            canInclude={canInclude(entry.policy)}
            vedada={isVedada(entry.policy)}
            onExpand={onExpand}
            onToggle={() => onToggle(entry.policy.id)}
            onToggleBypass={() => onToggleBypass(entry.policy.id)}
          />
        ))
      )}
    </View>
  );
}

/** Situação da proposta mais recente de cada política (a última criada vence). */
function latestStatuses(proposals: readonly Proposal[]): Map<string, ProposalStatus> {
  const latest = new Map<string, ProposalStatus>();
  for (const proposal of proposals) latest.set(proposal.policyId, proposal.status);
  return latest;
}

/** Aprovação e credibilidade agora, com os limites que o motor aplica a cada uma. */
function saturationLimits(state: GameState, content: GameContent): SaturationLimits {
  return {
    approval: {
      value: state.indicators.approval,
      min: content.calibration.aprovacao_min,
      max: content.calibration.aprovacao_max,
    },
    credibility: { value: state.economy.credibility, min: 0, max: 1 },
  };
}

const styles = StyleSheet.create({
  root: { gap: Spacing.two },
});
