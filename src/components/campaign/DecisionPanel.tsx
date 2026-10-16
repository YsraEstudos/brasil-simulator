import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { reissueBarredPolicies, type GameContent, type GameState, type Proposal } from '@/engine';
import { legislativeInstrument } from '@/engine/congress/congress';
import type { Policy } from '@/types/policy';

import { DispatchCard } from './DispatchCard';
import { INSTRUMENT_LABEL, PROPOSAL_IN_PROGRESS, PROPOSAL_STATUS_LABEL, areaLabel, costText } from './labels';

export interface DecisionPanelProps {
  state: GameState;
  content: GameContent;
  /** IDs das políticas marcadas para a agenda deste mês. */
  selected: readonly string[];
  /** Política com a mesa de despacho aberta. */
  expandedId: string | null;
  pointsUsed: number;
  pointsMax: number;
  onExpand: (id: string | null) => void;
  onToggle: (id: string) => void;
  /** Se incluir a política respeita os pontos restantes. */
  canInclude: (policy: Policy) => boolean;
}

/** Agenda presidencial: políticas do cenário, com a mesa de despacho de cada uma (GAME_DESIGN.md §4.2, §4.3). */
export function DecisionPanel({
  state,
  content,
  selected,
  expandedId,
  pointsUsed,
  pointsMax,
  onExpand,
  onToggle,
  canInclude,
}: DecisionPanelProps) {
  const policies = content.scenario.policies.flatMap((id) => {
    const policy = content.policies[id];
    return policy && policy.delivery !== 'rotina' ? [policy] : [];
  });
  const barred = reissueBarredPolicies(state, content);
  const areas = [...new Set(policies.map((policy) => policy.area))];
  const [area, setArea] = useState<string | null>(null);
  const visiblePolicies = area === null ? policies : policies.filter((policy) => policy.area === area);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text variant="title">Agenda presidencial</Text>
        <Text variant="body" color="textSecondary" tabular>
          Pontos usados: {pointsUsed} de {pointsMax}
        </Text>
      </View>
      <View style={styles.filters} accessibilityLabel="Filtrar catálogo de políticas por área">
        <Button label="Todas" variant={area === null ? 'secondary' : 'ghost'} onPress={() => setArea(null)} />
        {areas.map((id) => (
          <Button
            key={id}
            label={areaLabel(id)}
            variant={area === id ? 'secondary' : 'ghost'}
            onPress={() => setArea(id)}
          />
        ))}
      </View>
      {visiblePolicies.length === 0 && (
        <Text variant="body" color="textSecondary">
          Nenhuma política legislativa ou executiva disponível nesta área.
        </Text>
      )}
      {visiblePolicies.map((policy) => {
        const current = latestProposal(state.proposals, policy.id);
        const inProgress = current !== undefined && PROPOSAL_IN_PROGRESS.has(current.status);
        const isSelected = selected.includes(policy.id);
        const instrument = legislativeInstrument(policy);
        const instrumentText = instrument
          ? `${INSTRUMENT_LABEL[instrument]} — passa pelo Congresso`
          : 'Ato do Executivo';
        const meta = (
          <>
            <Text variant="caption" color="textSecondary">
              {instrumentText} · {costText(policy.agendaCost)} de agenda
            </Text>
            {current && (
              <Text variant="caption" color={inProgress ? 'warning' : 'textMuted'}>
                Situação: {PROPOSAL_STATUS_LABEL[current.status]}
              </Text>
            )}
          </>
        );

        if (inProgress || barred.has(policy.id)) {
          return (
            <Card key={policy.id} title={policy.name} subtitle={policy.summary}>
              {meta}
              <Text variant="caption" color="textMuted">
                {inProgress
                  ? 'Já está em andamento; não pode ser enviada de novo agora.'
                  : 'Medida provisória rejeitada ou caducada: só pode ser reeditada no ano que vem (CF art. 62 §10).'}
              </Text>
            </Card>
          );
        }

        const expanded = expandedId === policy.id;
        // A mesa de despacho fica fora do cartão: o cartão é um botão, e botões não podem conter botões.
        return (
          <View key={policy.id} style={styles.item}>
            <Card
              title={policy.name}
              subtitle={policy.summary}
              onPress={() => onExpand(expanded ? null : policy.id)}
              accessibilityLabel={`${policy.name}. ${isSelected ? 'Na agenda. ' : ''}${expanded ? 'Fechar mesa de despacho' : 'Abrir mesa de despacho'}`}>
              {meta}
              {isSelected && (
                <Text variant="caption" color="accent">
                  ● Na agenda deste mês
                </Text>
              )}
            </Card>
            {expanded && (
              <DispatchCard
                policy={policy}
                state={state}
                content={content}
                included={isSelected}
                canInclude={canInclude(policy)}
                onToggle={() => onToggle(policy.id)}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

/** Proposta mais recente da política (a última criada). */
function latestProposal(proposals: readonly Proposal[], policyId: string): Proposal | undefined {
  for (let i = proposals.length - 1; i >= 0; i--) {
    const p = proposals[i];
    if (p && p.policyId === policyId) return p;
  }
  return undefined;
}

const styles = StyleSheet.create({
  root: { gap: Spacing.two },
  header: { gap: Spacing.half },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  item: { gap: Spacing.two },
});
