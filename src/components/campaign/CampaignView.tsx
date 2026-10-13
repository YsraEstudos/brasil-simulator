import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PROTOTYPE_MONTHS, loadContent } from '@/content';
import { Button, Indicator, formatNumber, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { AGENDA_ACTIONS, type IndicatorKey } from '@/engine';
import type { Policy } from '@/types/policy';
import { gameStore, useGame, type ActiveCampaign } from '@/store';

import { AgendaActions } from './AgendaActions';
import { DecisionPanel } from './DecisionPanel';
import { DIFFICULTY, INDICATOR_META, INDICATOR_ORDER, monthLabel } from './labels';
import { EventInbox, type PendingItem } from './EventInbox';
import { LegacyReport } from './LegacyReport';
import { MonthSummary } from './MonthSummary';
import { ProposalList } from './ProposalList';
import { WhyChanged } from './WhyChanged';

/** Partida aberta: mês, indicadores, caixa de entrada, agenda, propostas e encerrar o mês (GAME_DESIGN.md §4.2). */
export function CampaignView({ campaign }: { campaign: ActiveCampaign }) {
  const busy = useGame((s) => s.busy);
  const { state, previous, lastReport, finished } = campaign;
  const content = useMemo(() => loadContent(state.scenarioId), [state.scenarioId]);
  const eventsById = useMemo(() => new Map(content.events.map((e) => [e.id, e])), [content]);

  const [openIndicator, setOpenIndicator] = useState<IndicatorKey | null>(null);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [chosen, setChosen] = useState<Partial<Record<string, string>>>({});
  const [expandedPolicy, setExpandedPolicy] = useState<string | null>(null);
  const [openProposal, setOpenProposal] = useState<string | null>(null);

  const pointsMax = state.resources.agendaPointsPerMonth;

  const inbox: PendingItem[] = state.events.pending.flatMap((pending) => {
    const event = eventsById.get(pending.eventId);
    return event ? [{ event, pending }] : [];
  });

  const policyCost = (id: string): number => content.policies[id]?.agendaCost ?? AGENDA_ACTIONS[id]?.agendaCost ?? 0;
  const choiceCost = (eventId: string, choiceId: string | undefined): number =>
    eventsById.get(eventId)?.choices.find((c) => c.id === choiceId)?.agendaCost ?? 0;

  // Escolhas de eventos efetivamente marcadas (só as de eventos ainda pendentes).
  const chosenEntries = inbox.flatMap(({ event }) => {
    const choiceId = chosen[event.id];
    return choiceId === undefined ? [] : [{ eventId: event.id, choiceId, cost: choiceCost(event.id, choiceId) }];
  });
  const pointsUsed = selected.reduce((n, id) => n + policyCost(id), 0) + chosenEntries.reduce((n, e) => n + e.cost, 0);

  const canInclude = (policy: Policy): boolean =>
    selected.includes(policy.id) || pointsUsed + policy.agendaCost <= pointsMax;

  const canChoose = (eventId: string, choiceId: string): boolean => {
    const current = chosen[eventId];
    const releasing = current === undefined ? 0 : choiceCost(eventId, current);
    return pointsUsed - releasing + choiceCost(eventId, choiceId) <= pointsMax;
  };

  const togglePolicy = (policy: Policy) => {
    if (selected.includes(policy.id)) {
      setSelected((prev) => prev.filter((id) => id !== policy.id));
    } else if (canInclude(policy)) {
      setSelected((prev) => [...prev, policy.id]);
    }
  };

  const toggleAction = (id: string) => {
    const cost = policyCost(id);
    if (selected.includes(id)) {
      setSelected((prev) => prev.filter((x) => x !== id));
    } else if (pointsUsed + cost <= pointsMax) {
      setSelected((prev) => [...prev, id]);
    }
  };

  const chooseEvent = (eventId: string, choiceId: string) => {
    setChosen((prev) => ({ ...prev, [eventId]: prev[eventId] === choiceId ? undefined : choiceId }));
  };

  const endMonth = async () => {
    const before = state.monthIndex;
    await gameStore.getState().endMonth({
      decisions: selected.map((id) => ({ policyId: id, agendaCost: policyCost(id) })),
      eventChoices: chosenEntries.map((e) => ({ eventId: e.eventId, choiceId: e.choiceId })),
    });
    // Só limpa as seleções se o mês avançou; se a operação foi ignorada ou falhou, a agenda continua marcada.
    if (gameStore.getState().active?.state.monthIndex !== before) {
      setSelected([]);
      setChosen({});
      setExpandedPolicy(null);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text variant="caption" color="textSecondary">
          {campaign.name} · {DIFFICULTY[state.difficulty].name}
        </Text>
        <Text variant="display">{finished ? 'Fim do protótipo' : monthLabel(state.monthIndex)}</Text>
        <Text color="textSecondary">
          {finished
            ? 'Campanha encerrada em dezembro de 2027.'
            : `Mês ${state.monthIndex + 1} de ${PROTOTYPE_MONTHS} · ${pointsMax} pontos de agenda · capital político ${formatNumber(state.resources.politicalCapital)}`}
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

      {lastReport && <MonthSummary report={lastReport} content={content} />}

      {finished ? (
        <>
          <LegacyReport state={state} content={content} />
          <View style={styles.actions}>
            <Button
              label="Voltar ao menu"
              variant="secondary"
              block
              disabled={busy}
              onPress={() => gameStore.getState().leaveCampaign()}
            />
          </View>
        </>
      ) : (
        <>
          <EventInbox items={inbox} chosen={chosen} canChoose={canChoose} onChoose={chooseEvent} />

          <DecisionPanel
            state={state}
            content={content}
            selected={selected}
            expandedId={expandedPolicy}
            pointsUsed={pointsUsed}
            pointsMax={pointsMax}
            onExpand={setExpandedPolicy}
            onToggle={(id) => {
              const policy = content.policies[id];
              if (policy) togglePolicy(policy);
            }}
            canInclude={canInclude}
          />

          <AgendaActions
            state={state}
            content={content}
            selected={selected}
            canInclude={(cost) => pointsUsed + cost <= pointsMax}
            onToggle={toggleAction}
          />

          <ProposalList
            proposals={state.proposals}
            content={content}
            openId={openProposal}
            onToggle={(id) => setOpenProposal((cur) => (cur === id ? null : id))}
          />

          <View style={styles.actions}>
            <Button label="Encerrar o mês" block loading={busy} onPress={endMonth} />
            <Button
              label="Voltar ao menu"
              variant="secondary"
              block
              disabled={busy}
              onPress={() => gameStore.getState().leaveCampaign()}
            />
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
