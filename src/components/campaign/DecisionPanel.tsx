import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ministryIcon } from '@/components/painel/HudBits';
import { Text } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { reissueBarredPolicies, type GameContent, type GameState, type Proposal } from '@/engine';
import { legislativeInstrument } from '@/engine/congress/congress';
import { useTheme } from '@/hooks/use-theme';
import type { Policy } from '@/types/policy';

import { DispatchCard } from './DispatchCard';
import { Badge, CostPips, FilterChip, Icon, ICONS, IconTile, SectionHeader } from './GabineteBits';
import { INSTRUMENT_LABEL, PROPOSAL_IN_PROGRESS, PROPOSAL_STATUS_LABEL, areaLabel } from './labels';

export interface DecisionPanelProps {
  state: GameState;
  content: GameContent;
  /** IDs das políticas marcadas para a agenda deste mês. */
  selected: readonly string[];
  /** Política com a mesa de despacho aberta. */
  expandedId: string | null;
  actionsMax: number;
  onExpand: (id: string | null) => void;
  onToggle: (id: string) => void;
  /** Se incluir a política respeita as ações restantes. */
  canInclude: (policy: Policy) => boolean;
  /** Vedação eleitoral atingindo a política (novo benefício na janela): exige confirmação de quebra. */
  isVedada: (policy: Policy) => boolean;
  /** Inclui/retira a política com `params.vedacao_bypass` (quebra declarada). */
  onToggleBypass: (id: string) => void;
}

/** Agenda presidencial: políticas do cenário, com a mesa de despacho de cada uma (GAME_DESIGN.md §4.2, §4.3). */
export function DecisionPanel({
  state,
  content,
  selected,
  expandedId,
  actionsMax,
  onExpand,
  onToggle,
  canInclude,
  isVedada,
  onToggleBypass,
}: DecisionPanelProps) {
  const { colors } = useTheme();
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
      <SectionHeader
        icon={ICONS.decisions}
        title="Decisões de governo"
        description="Leis, medidas provisórias e decretos. Toque numa decisão para ouvir os ministros e incluí-la na agenda."
      />
      <View style={styles.legend}>
        <Badge icon={ICONS.executive} label="Ato do Executivo: vale ao encerrar o mês" tone="positive" />
        <Badge icon={ICONS.congress} label="Passa pelo Congresso: precisa de votos" tone="info" />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        accessibilityLabel="Filtrar catálogo de políticas por área">
        <FilterChip label="Todas" icon={ICONS.decisions} active={area === null} onPress={() => setArea(null)} />
        {areas.map((id) => (
          <FilterChip
            key={id}
            label={areaLabel(id)}
            icon={ministryIcon([id])}
            active={area === id}
            onPress={() => setArea(id)}
          />
        ))}
      </ScrollView>
      {visiblePolicies.length === 0 && (
        <Text variant="body" color="textSecondary">
          Nenhuma política legislativa ou executiva disponível nesta área.
        </Text>
      )}
      {visiblePolicies.map((policy) => {
        const current = latestProposal(state.proposals, policy.id);
        const inProgress = current !== undefined && PROPOSAL_IN_PROGRESS.has(current.status);
        const locked = inProgress || barred.has(policy.id);
        const isSelected = selected.includes(policy.id);
        const instrument = legislativeInstrument(policy);
        const expanded = !locked && expandedId === policy.id;
        const badges = (
          <View style={styles.badges}>
            {instrument ? (
              <Badge icon={ICONS.congress} label={INSTRUMENT_LABEL[instrument]} tone="info" />
            ) : (
              <Badge icon={ICONS.executive} label="Ato do Executivo" tone="positive" />
            )}
            <CostPips cost={policy.agendaCost} max={Math.min(actionsMax, 3)} />
            {current && (
              <Badge
                icon={inProgress ? ICONS.inProgress : undefined}
                label={PROPOSAL_STATUS_LABEL[current.status]}
                tone={inProgress ? 'warning' : 'textMuted'}
              />
            )}
          </View>
        );
        const body = (
          <>
            <View style={styles.cardTop}>
              <IconTile name={ministryIcon([policy.area])} color={locked ? 'textMuted' : 'accent'} />
              <View style={styles.cardTitle}>
                <Text variant="caption" color="textMuted">
                  {areaLabel(policy.area).toUpperCase()}
                </Text>
                <Text variant="label" color={locked ? 'textSecondary' : 'text'}>
                  {policy.name}
                </Text>
              </View>
              {locked ? (
                <Icon name={ICONS.locked} size={18} color="textMuted" />
              ) : isSelected ? (
                <Icon name={ICONS.check} size={22} />
              ) : (
                <Icon name={expanded ? ICONS.collapse : ICONS.expand} size={20} color="textSecondary" />
              )}
            </View>
            <Text variant="caption" color="textSecondary" numberOfLines={expanded ? undefined : 2}>
              {policy.summary}
            </Text>
            {badges}
            {locked && (
              <Text variant="caption" color="textMuted">
                {inProgress
                  ? 'Já está em andamento; não pode ser enviada de novo agora.'
                  : 'Medida provisória rejeitada ou caducada: só pode ser reeditada no ano que vem (CF art. 62 §10).'}
              </Text>
            )}
          </>
        );
        const frame = [
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: isSelected ? colors.accent : colors.border,
            borderWidth: isSelected ? 1.5 : StyleSheet.hairlineWidth,
          },
          locked && styles.locked,
        ];

        if (locked) {
          return (
            <View key={policy.id} style={frame}>
              {body}
            </View>
          );
        }
        // A mesa de despacho fica fora do botão do cartão: botões não podem conter botões.
        return (
          <View key={policy.id} style={frame}>
            <Pressable
              onPress={() => onExpand(expanded ? null : policy.id)}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={`${policy.name}. ${isSelected ? 'Na agenda. ' : ''}${expanded ? 'Fechar mesa de despacho' : 'Abrir mesa de despacho'}`}
              style={({ pressed }) => [styles.cardBody, pressed && styles.pressed]}>
              {body}
            </Pressable>
            {expanded && (
              <DispatchCard
                policy={policy}
                state={state}
                content={content}
                included={isSelected}
                canInclude={canInclude(policy)}
                vedacao={isVedada(policy)}
                onToggle={() => onToggle(policy.id)}
                onToggleBypass={() => onToggleBypass(policy.id)}
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
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  filters: { gap: Spacing.one, paddingVertical: Spacing.one },
  card: { borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.two },
  cardBody: { gap: Spacing.two },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cardTitle: { flex: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  locked: { opacity: 0.7 },
  pressed: { opacity: 0.75 },
});
