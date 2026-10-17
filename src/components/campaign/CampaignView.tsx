import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { campaignMonths, loadContent } from '@/content';
import { Button, Indicator, formatNumber, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import {
  SANCTION_ACTION_ID,
  isNovoBeneficio,
  standingOf,
  vedacaoAtiva,
  type Decision,
  type IndicatorKey,
  type SanctionChoice,
} from '@/engine';
import type { Policy } from '@/types/policy';
import { decisionCost, draftPoints, fits, gameStore, hasDecision, useGame, type ActiveCampaign } from '@/store';

import { AgendaActions } from './AgendaActions';
import { DecisionPanel } from './DecisionPanel';
import { ElectionsCard } from './ElectionsCard';
import type { CharacterBrief } from './characterView';
import { DIFFICULTY, INDICATOR_META, INDICATOR_ORDER, monthLabel } from './labels';
import { EventInbox, type PendingItem, type SanctionItem } from './EventInbox';
import { LegacyReport } from './LegacyReport';
import { MonthSummary } from './MonthSummary';
import { ProposalList } from './ProposalList';
import { PublicPoliciesPanel } from './PublicPoliciesPanel';
import { WhyChanged } from './WhyChanged';

/** Partida aberta: mês, indicadores, caixa de entrada, agenda, propostas e encerrar o mês (GAME_DESIGN.md §4.2). */
export function CampaignView({ campaign }: { campaign: ActiveCampaign }) {
  const busy = useGame((s) => s.busy);
  const { state, previous, lastReport, finished } = campaign;
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
  const [openIndicator, setOpenIndicator] = useState<IndicatorKey | null>(null);
  const [expandedPolicy, setExpandedPolicy] = useState<string | null>(null);
  const [openProposal, setOpenProposal] = useState<string | null>(null);

  const pointsMax = state.resources.agendaPointsPerMonth;
  const totalMonths = campaignMonths(state.scenarioId);
  const pointsUsed = draftPoints(draft, content);
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

  // Políticas e ações marcadas sem alvo; as com alvo (negociação, ministérios) aparecem na aba Congresso. Decisões
  // com apenas a quebra declarada da vedação contam como simples (a mesa de despacho as marca e desmarca).
  const selected = draft.decisions
    .filter((d) => d.params === undefined || Object.keys(d.params).every((key) => key === 'vedacao_bypass'))
    .map((d) => d.policyId);
  const simple = (id: string): Decision => {
    const decision: Decision = { policyId: id, agendaCost: 0 };
    return { ...decision, agendaCost: decisionCost(decision, content) };
  };

  const canInclude = (policy: Policy): boolean =>
    selected.includes(policy.id) || fits(draft, simple(policy.id), content, pointsMax);

  const choiceCost = (eventId: string, choiceId: string | undefined): number =>
    eventsById.get(eventId)?.choices.find((c) => c.id === choiceId)?.agendaCost ?? 0;
  const canChoose = (eventId: string, choiceId: string): boolean => {
    const current = draft.eventChoices[eventId];
    const releasing = current === undefined ? 0 : choiceCost(eventId, current);
    return pointsUsed - releasing + choiceCost(eventId, choiceId) <= pointsMax;
  };

  const toggleSimple = (id: string) => {
    const decision = simple(id);
    if (selected.includes(id) || fits(draft, decision, content, pointsMax)) toggleDecision(decision);
  };

  // Vedação eleitoral (Fase 08): incluir novo benefício na janela exige a quebra declarada (`vedacao_bypass`).
  const isVedada = (policy: Policy): boolean => vedacaoAtiva(state, content) && isNovoBeneficio(policy);
  const toggleBypass = (id: string) => {
    const decision: Decision = { ...simple(id), params: { vedacao_bypass: true } };
    if (selected.includes(id) || fits(draft, decision, content, pointsMax)) toggleDecision(decision);
  };

  const endMonth = async () => {
    const before = state.monthIndex;
    await gameStore.getState().endMonth();
    // A store limpa o rascunho só se o mês avançou; aqui fecha a mesa de despacho que estava aberta.
    if (gameStore.getState().active?.state.monthIndex !== before) setExpandedPolicy(null);
  };

  /**
   * Volta à tela de abertura (a pilha de abas não tem cabeçalho com "voltar"). A partida continua aberta em memória,
   * com o rascunho do mês: CONTINUAR retoma exatamente daqui. Os meses encerrados já estão gravados.
   */
  const leaveToMenu = () => router.navigate('/');

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text variant="caption" color="textSecondary">
          {campaign.name} · {DIFFICULTY[state.difficulty].name}
        </Text>
        <Text variant="display">{finished ? 'Fim da campanha' : monthLabel(state.monthIndex)}</Text>
        <Text color="textSecondary">
          {finished
            ? `Campanha encerrada em ${monthLabel(state.monthIndex - 1)}.`
            : `Mês ${state.monthIndex + 1} de ${totalMonths} · ${pointsMax} pontos de agenda · capital político ${formatNumber(state.resources.politicalCapital)}`}
        </Text>
      </View>

      <View style={styles.grid}>
        {INDICATOR_ORDER.map((key) => {
          const meta = INDICATOR_META[key];
          return (
            <Indicator
              key={key}
              label={meta.label}
              value={state.indicators[key]}
              previous={previous?.[key]}
              goodWhen={meta.goodWhen}
              decimals={meta.decimals}
              context={meta.context}
              onPress={() => setOpenIndicator((cur) => (cur === key ? null : key))}
            />
          );
        })}
      </View>
      {openIndicator && <WhyChanged indicator={openIndicator} report={lastReport} />}

      <ElectionsCard
        state={state}
        content={content}
        report={lastReport}
        draft={draft}
        onToggle={(decision) => {
          if (hasDecision(draft, decision) || fits(draft, decision, content, pointsMax)) toggleDecision(decision);
        }}
        fitsDecision={(decision) => fits(draft, decision, content, pointsMax)}
      />

      {lastReport && <MonthSummary report={lastReport} content={content} />}

      {finished ? (
        <>
          <LegacyReport state={state} content={content} />
          <View style={styles.actions}>
            <Button label="Voltar ao menu" variant="secondary" block disabled={busy} onPress={leaveToMenu} />
          </View>
        </>
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
            pointsUsed={pointsUsed}
            pointsMax={pointsMax}
            onExpand={setExpandedPolicy}
            onToggle={toggleSimple}
            canInclude={canInclude}
            isVedada={isVedada}
            onToggleBypass={toggleBypass}
          />

          <PublicPoliciesPanel state={state} content={content} pointsMax={pointsMax} />

          <AgendaActions
            state={state}
            content={content}
            selected={selected}
            canInclude={(cost) => pointsUsed + cost <= pointsMax}
            onToggle={toggleSimple}
          />

          <ProposalList
            proposals={state.proposals}
            content={content}
            openId={openProposal}
            onToggle={(id) => setOpenProposal((cur) => (cur === id ? null : id))}
          />

          <View style={styles.actions}>
            <Button label="Encerrar o mês" block loading={busy} onPress={endMonth} />
            <Button label="Voltar ao menu" variant="secondary" block disabled={busy} onPress={leaveToMenu} />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.four },
  header: { gap: Spacing.one },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  actions: { gap: Spacing.two },
});
