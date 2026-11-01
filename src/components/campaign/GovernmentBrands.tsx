import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, formatMoneyMillions, formatPercent, Text } from '@/components/ui';
import { Radius, Spacing, type ThemeColors } from '@/constants/theme';
import {
  AGENDA_ACTIONS,
  BRAND_ACTION_ID,
  BRANDABLE_STATUSES,
  type GameContent,
  type GameState,
  type Proposal,
  termOf,
  validateActionTarget,
  type Decision,
} from '@/engine';
import type { PublicPolicyState, PublicProject } from '@/engine/publicPolicies/types';
import { useTheme } from '@/hooks/use-theme';
import { fits, gameStore, hasDecision, type AgendaDraft, useGame } from '@/store';

import { Icon, ICONS } from './GabineteBits';
import { PROPOSAL_STATUS_LABEL } from './labels';

const BRAND_LIMIT = 3;

const BRAND_ACTION = AGENDA_ACTIONS[BRAND_ACTION_ID];

export interface GovernmentBrandsProps {
  state: GameState;
  content: GameContent;
  actionsMax: number;
}

function decisionFor(proposalId: string, name: string): Decision {
  return { policyId: BRAND_ACTION_ID, agendaCost: BRAND_ACTION?.agendaCost ?? 1, params: { proposalId, name } };
}

function statusText(proposal: Proposal, project: PublicProject | undefined): string {
  const status = PROPOSAL_STATUS_LABEL[proposal.status];
  if (!project) return status;
  const phase = phaseLabel(project.phase);
  const progress = formatPercent(project.progress, 0);
  const delay =
    project.delayMonths > 0 ? ` · atraso ${project.delayMonths} ${project.delayMonths === 1 ? 'mês' : 'meses'}` : '';
  return `${status} · ${phase} · ${progress} executado${delay}`;
}

function phaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    planejamento: 'Planejamento',
    licenciamento: 'Licenciamento',
    licitacao: 'Licitação',
    obra: 'Obra',
    operacao: 'Operação',
    cancelado: 'Cancelado',
  };
  return labels[phase] ?? phase;
}

function parseName(name: string): string {
  return name.trim();
}

/** Marcas de governo: nomear só prepara a agenda; o motor valida ao encerrar o mês. */
export function GovernmentBrands({ state, content, actionsMax }: GovernmentBrandsProps) {
  const { colors } = useTheme();
  const draft = useGame((s) => s.draft);
  const publicState: PublicPolicyState = state.publicPolicies;
  const brands = publicState.brands;
  const projects = publicState.projects;
  const projectByProposal = new Map(projects.map((project) => [project.proposalId, project]));
  const eligibleProposals = state.proposals.filter(
    (proposal) =>
      BRANDABLE_STATUSES.has(proposal.status) && content.policies[proposal.policyId]?.delivery === 'projeto',
  );
  const brandedProposals = brands.flatMap((brand) => {
    const proposal = state.proposals.find((item) => item.id === brand.proposalId);
    return proposal && content.policies[proposal.policyId]?.delivery === 'projeto' ? [proposal] : [];
  });
  const proposals = [
    ...new Map([...eligibleProposals, ...brandedProposals].map((proposal) => [proposal.id, proposal])).values(),
  ];
  const pendingBrands = draft.decisions.filter((decision) => decision.policyId === BRAND_ACTION_ID);
  const pendingByProposal = new Map(
    pendingBrands.flatMap((decision) => {
      const proposalId = decision.params?.proposalId;
      const name = decision.params?.name;
      return typeof proposalId === 'string' && typeof name === 'string' ? [[proposalId, decision] as const] : [];
    }),
  );
  // O limite vale por mandato, como no motor (validateBrand).
  const term = termOf(state.monthIndex);
  const consumed =
    brands.filter((brand) => brand.term === term).length +
    pendingBrands.filter((decision) => {
      const proposalId = decision.params?.proposalId;
      return typeof proposalId === 'string' && !brands.some((brand) => brand.proposalId === proposalId);
    }).length;

  const toggle = (decision: Decision) => {
    if (hasDecision(draft, decision)) {
      gameStore.getState().toggleDecision(decision);
      return;
    }
    const validation = validateActionTarget(BRAND_ACTION!, decision, state, content);
    if (validation !== null) return;
    if (!fits(draft, decision, content, actionsMax) || consumed >= BRAND_LIMIT) return;
    gameStore.getState().toggleDecision(decision);
  };

  return (
    <Card
      title="Marcas de governo"
      subtitle={`Até ${BRAND_LIMIT} no mandato · ${consumed} consumida(s) · seleção entra na agenda`}>
      <View style={styles.meter}>
        <View
          accessible
          accessibilityLabel={`${consumed} de ${BRAND_LIMIT} marcas usadas no mandato`}
          style={styles.meterIcons}>
          {Array.from({ length: BRAND_LIMIT }, (_, i) => (
            <Icon key={i} name={ICONS.brands} size={22} color={i < consumed ? 'accent' : 'textMuted'} />
          ))}
        </View>
        <Text variant="caption" color="textSecondary" style={styles.meterText}>
          Dê um nome de até 60 caracteres a um projeto em tramitação, execução ou concluído. Custa 1 ação.
        </Text>
      </View>
      {proposals.length === 0 ? (
        <Text variant="body" color="textSecondary">
          Nenhum projeto elegível para marca neste momento.
        </Text>
      ) : (
        proposals.map((proposal) => {
          const existing = brands.find((brand) => brand.proposalId === proposal.id);
          const pending = pendingByProposal.get(proposal.id);
          const initialName = existing?.name ?? (typeof pending?.params?.name === 'string' ? pending.params.name : '');
          return (
            <BrandRow
              key={proposal.id}
              proposal={proposal}
              project={projectByProposal.get(proposal.id)}
              existingName={existing?.name}
              pendingName={initialName}
              state={state}
              content={content}
              draft={draft}
              actionsMax={actionsMax}
              consumed={consumed}
              colors={colors}
              onToggle={toggle}
            />
          );
        })
      )}
    </Card>
  );
}

function BrandRow({
  proposal,
  project,
  existingName,
  pendingName,
  state,
  content,
  draft,
  actionsMax,
  consumed,
  colors,
  onToggle,
}: {
  proposal: Proposal;
  project: PublicProject | undefined;
  existingName?: string;
  pendingName: string;
  state: GameState;
  content: GameContent;
  draft: AgendaDraft;
  actionsMax: number;
  consumed: number;
  colors: ThemeColors;
  onToggle: (decision: Decision) => void;
}) {
  const [name, setName] = useState(pendingName);
  const [touched, setTouched] = useState(false);
  const validation = existingName
    ? null
    : validateActionTarget(BRAND_ACTION!, decisionFor(proposal.id, parseName(name)), state, content);
  const trimmed = parseName(name);
  const invalid = trimmed.length === 0 || name.trim().length > 60;
  const decision = decisionFor(proposal.id, trimmed);
  const selected = hasDecision(draft, decision);
  const canInclude =
    selected ||
    (validation === null && !invalid && fits(draft, decision, content, actionsMax) && consumed < BRAND_LIMIT);
  const helper =
    invalid && touched
      ? 'Informe um nome entre 1 e 60 caracteres.'
      : validation && touched
        ? 'Este projeto deixou de ser elegível.'
        : undefined;

  return (
    <View style={[styles.row, { borderTopColor: colors.border }]}>
      <Text variant="label">{content.policies[proposal.policyId]?.name ?? proposal.policyId}</Text>
      <Text variant="caption" color="textSecondary">
        {statusText(proposal, project)}
      </Text>
      {project && (
        <Text variant="caption" color="textSecondary">
          {`Carteira: ${formatMoneyMillions(project.spentMillions)} de ${formatMoneyMillions(project.budgetMillions)} · manutenção anual ${formatMoneyMillions(project.maintenanceMillions)}`}
        </Text>
      )}
      {existingName ? (
        <View style={styles.meter}>
          <Icon name={ICONS.brands} size={18} />
          <Text variant="body" color="accent">{`Marca: ${existingName}`}</Text>
        </View>
      ) : (
        <>
          <TextInput
            accessibilityLabel={`Nome da marca para ${content.policies[proposal.policyId]?.name ?? proposal.policyId}`}
            autoCapitalize="sentences"
            autoCorrect
            maxLength={60}
            onBlur={() => setTouched(true)}
            onChangeText={setName}
            placeholder="Nome da marca de governo"
            returnKeyType="done"
            style={[styles.input, { color: colors.text, borderColor: helper ? colors.negative : colors.border }]}
            value={name}
          />
          {helper && (
            <Text variant="caption" color="negative">
              {helper}
            </Text>
          )}
          <Button
            label={selected ? 'Retirar da agenda' : 'Marcar na agenda (1 ação)'}
            variant={selected ? 'secondary' : 'primary'}
            disabled={!selected && !canInclude}
            accessibilityHint={
              !selected && !canInclude ? 'Informe um nome válido e verifique as ações de agenda' : undefined
            }
            onPress={() => onToggle(decision)}
            block
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  meter: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  meterIcons: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  meterText: { flex: 1, marginLeft: Spacing.one },
  row: { gap: Spacing.one, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two },
  input: {
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    fontSize: 16,
  },
});
