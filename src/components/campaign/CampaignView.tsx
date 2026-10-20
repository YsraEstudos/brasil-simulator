import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { loadContent } from '@/content';
import { Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import {
  SANCTION_ACTION_ID,
  isNovoBeneficio,
  standingOf,
  vedacaoAtiva,
  type Decision,
  type SanctionChoice,
} from '@/engine';
import type { Policy } from '@/types/policy';
import { decisionCost, draftCost, fits, gameStore, hasDecision, useGame, type ActiveCampaign } from '@/store';

import { AgendaActions } from './AgendaActions';
import { DecisionPanel } from './DecisionPanel';
import { ElectionsCard } from './ElectionsCard';
import type { CharacterBrief } from './characterView';
import { DIFFICULTY } from './labels';
import { EventInbox, type PendingItem, type SanctionItem } from './EventInbox';
import { LegacyReport } from './LegacyReport';
import { ProposalList } from './ProposalList';
import { PublicPoliciesPanel } from './PublicPoliciesPanel';

/**
 * Gabinete (GAME_DESIGN.md §4.2): as decisões do mês — caixa de entrada com sanções, mesa de despacho, políticas
 * públicas, agenda e propostas. O mês em si se joga no Painel: indicadores, relatório do mês, "Encerrar o mês" e menu
 * ficam lá. Com a campanha encerrada, mostra só o relatório de legado.
 */
export function CampaignView({ campaign }: { campaign: ActiveCampaign }) {
  const { state, lastReport, finished } = campaign;
  const content = useMemo(() => loadContent(state.scenarioId), [state.scenarioId]);
  const eventsById = useMemo(() => new Map(content.events.map((e) => [e.id, e])), [content]);
  const characters = useMemo<CharacterBrief[]>(
    () =>
      (content.scenario.characters ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        role: c.role,
        standing: standingOf(state.events.characters, content, c.id),
      })),
    [content, state.events.characters],
  );

  const draft = useGame((s) => s.draft);
  const [expandedPolicy, setExpandedPolicy] = useState<string | null>(null);
  const [openProposal, setOpenProposal] = useState<string | null>(null);

  const actionsMax = state.resources.agendaActionsPerMonth;
  const actionsUsed = draftCost(draft, content);
  const { toggleDecision, toggleEventChoice } = gameStore.getState();

  const inbox: PendingItem[] = state.events.pending.flatMap((pending) => {
    const event = eventsById.get(pending.eventId);
    return event ? [{ event, pending }] : [];
  });

  const sanctions: SanctionItem[] = state.proposals
    .filter((p) => p.status === 'aguardando_sancao' && p.voteMonth === state.monthIndex)
    .map((proposal) => ({ proposal, name: content.policies[proposal.policyId]?.name ?? proposal.policyId }));
  const sanctionChosen: Partial<Record<string, SanctionChoice>> = {};
  for (const d of draft.decisions) {
    const choice = d.params?.choice;
    if (d.policyId === SANCTION_ACTION_ID && typeof choice === 'string') {
      sanctionChosen[String(d.params?.proposalId)] = choice as SanctionChoice;
    }
  }

  // Políticas e ações marcadas sem alvo; as com alvo (negociação, ministérios) aparecem na subtela Congresso. Decisões
  // com apenas a quebra declarada da vedação contam como simples (a mesa de despacho as marca e desmarca).
  const selected = draft.decisions
    .filter((d) => d.params === undefined || Object.keys(d.params).every((key) => key === 'vedacao_bypass'))
    .map((d) => d.policyId);
  const simple = (id: string): Decision => {
    const decision: Decision = { policyId: id, agendaCost: 0 };
    return { ...decision, agendaCost: decisionCost(decision, content) };
  };

  const canInclude = (policy: Policy): boolean =>
    selected.includes(policy.id) || fits(draft, simple(policy.id), content, actionsMax);

  const choiceCost = (eventId: string, choiceId: string | undefined): number =>
    eventsById.get(eventId)?.choices.find((c) => c.id === choiceId)?.agendaCost ?? 0;
  const canChoose = (eventId: string, choiceId: string): boolean => {
    const current = draft.eventChoices[eventId];
    const releasing = current === undefined ? 0 : choiceCost(eventId, current);
    return actionsUsed - releasing + choiceCost(eventId, choiceId) <= actionsMax;
  };

  const toggleSimple = (id: string) => {
    const decision = simple(id);
    if (selected.includes(id) || fits(draft, decision, content, actionsMax)) toggleDecision(decision);
  };

  // Vedação eleitoral (Fase 08): incluir novo benefício na janela exige a quebra declarada (`vedacao_bypass`).
  const isVedada = (policy: Policy): boolean => vedacaoAtiva(state, content) && isNovoBeneficio(policy);
  const toggleBypass = (id: string) => {
    const decision: Decision = { ...simple(id), params: { vedacao_bypass: true } };
    if (selected.includes(id) || fits(draft, decision, content, actionsMax)) toggleDecision(decision);
  };

  return (
    <View style={styles.root}>
      <Text variant="caption" color="textSecondary">
        {campaign.name} · {DIFFICULTY[state.difficulty].name}
      </Text>

      <ElectionsCard
        state={state}
        content={content}
        report={lastReport}
        draft={draft}
        onToggle={(decision) => {
          if (hasDecision(draft, decision) || fits(draft, decision, content, actionsMax)) toggleDecision(decision);
        }}
        fitsDecision={(decision) => fits(draft, decision, content, actionsMax)}
      />

      {finished ? (
        <LegacyReport state={state} content={content} />
      ) : (
        <>
          <EventInbox
            items={inbox}
            chosen={draft.eventChoices}
            canChoose={canChoose}
            onChoose={toggleEventChoice}
            characters={characters}
            sanctions={sanctions}
            sanctionChosen={sanctionChosen}
            onSanction={(proposalId, choice) =>
              toggleDecision({ policyId: SANCTION_ACTION_ID, agendaCost: 0, params: { proposalId, choice } })
            }
          />

          <DecisionPanel
            state={state}
            content={content}
            selected={selected}
            expandedId={expandedPolicy}
            actionsUsed={actionsUsed}
            actionsMax={actionsMax}
            onExpand={setExpandedPolicy}
            onToggle={toggleSimple}
            canInclude={canInclude}
            isVedada={isVedada}
            onToggleBypass={toggleBypass}
          />

          <PublicPoliciesPanel state={state} content={content} actionsMax={actionsMax} />

          <AgendaActions
            state={state}
            content={content}
            selected={selected}
            canInclude={(cost) => actionsUsed + cost <= actionsMax}
            onToggle={toggleSimple}
          />

          <ProposalList
            proposals={state.proposals}
            content={content}
            openId={openProposal}
            onToggle={(id) => setOpenProposal((cur) => (cur === id ? null : id))}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.four },
});
