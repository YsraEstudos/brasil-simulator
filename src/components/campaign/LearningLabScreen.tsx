import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useStore } from 'zustand';

import { Button, Card, Text } from '@/components/ui';
import { loadContent } from '@/content';
import { DIRECTIVE_ACTION_ID, NEGOTIATE_ACTION_ID, isBudgetPolicy, isPreInauguration, type Decision } from '@/engine';
import { createLearningLab } from '@/store/learningLab';
import type { ActiveCampaign } from '@/store';
import { EMPTY_DRAFT, draftInput, hasDecision, toggleDecision, toggleEventChoice } from '@/store/agendaDraft';

import { CareerActionsCard } from './CareerActionsCard';
import { CareerFinanceCard } from './CareerFinanceCard';
import { REJECTION_REASON_LABEL } from './labels';

/** Uma cópia da campanha vive apenas enquanto esta tela está montada. */
export function LearningLabScreen({ campaign }: { campaign: ActiveCampaign }) {
  const content = useMemo(() => loadContent(campaign.state.scenarioId), [campaign.state.scenarioId]);
  const [lab] = useState(() => createLearningLab(campaign.state, content));
  const state = useStore(lab, (s) => s.state);
  const result = useStore(lab, (s) => s.lastResult);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const toggle = (decision: Decision) => setDraft((current) => toggleDecision(current, decision));
  const electoral = isPreInauguration(state);

  const choices = !electoral
    ? content.scenario.policies
        .map((id) => content.policies[id])
        .filter((policy) => policy !== undefined)
        .filter((policy) => policy.delivery !== 'rotina' && !isBudgetPolicy(policy.id))
        .map((policy) => ({
          id: policy.id,
          name: policy.name,
          summary: policy.summary,
          decision: { policyId: policy.id, agendaCost: policy.agendaCost } as Decision,
        }))
    : [];

  return (
    <View style={{ gap: 16 }}>
      <Card
        title="Experimente sem alterar sua partida"
        subtitle="Esta cópia fica apenas nesta tela. Os resultados são contrafactuais, não uma previsão do futuro da campanha.">
        <Text>
          Escolha ações ou avance sem agir. Reinicie para comparar outra escolha a partir da mesma situação e semente.
        </Text>
        <Button
          label={
            draft.decisions.length > 0 || Object.keys(draft.eventChoices).length > 0
              ? 'Simular escolhas'
              : 'Simular sem ação'
          }
          onPress={() => {
            lab.getState().run(draftInput(draft, content));
            setDraft(EMPTY_DRAFT);
          }}
          block
        />
        <Button
          label="Recomeçar experimento"
          variant="secondary"
          onPress={() => {
            lab.getState().reset();
            setDraft(EMPTY_DRAFT);
          }}
          block
        />
      </Card>
      {result && (
        <Card title="O que aconteceu na simulação">
          {result.report.rejected.map((item, i) => (
            <Text key={`${item.decision.policyId}-${i}`}>Ação recusada: {REJECTION_REASON_LABEL[item.reason]}</Text>
          ))}
          {result.report.notes.map((note, i) => (
            <Text key={`${note}-${i}`}>{note}</Text>
          ))}
          {result.report.eventsResolved.map((event) => {
            const definition = content.events.find((item) => item.id === event.eventId);
            const choice = definition?.choices.find((item) => item.id === event.choiceId);
            return (
              <Text
                key={`${event.eventId}-${event.choiceId}`}>{`${definition?.title ?? event.eventId}: ${choice?.label ?? event.choiceId}${event.automatic ? ' (resposta padrão)' : ''}.`}</Text>
            );
          })}
          {result.report.contributions.slice(0, 8).map((item, i) => (
            <Text key={`${item.cause}-${i}`}>{item.label}</Text>
          ))}
          {result.report.rejected.length === 0 &&
            result.report.notes.length === 0 &&
            result.report.eventsResolved.length === 0 &&
            result.report.contributions.length === 0 && (
              <Text>O turno foi processado sem alterações explicadas no relatório.</Text>
            )}
        </Card>
      )}
      {state.events.pending.map((pending) => {
        const event = content.events.find((item) => item.id === pending.eventId);
        if (!event) return null;
        return (
          <Card key={pending.instanceId} title={event.title} subtitle={event.description}>
            {event.choices.map((choice) => (
              <View key={choice.id}>
                <Button
                  label={choice.label}
                  variant={draft.eventChoices[event.id] === choice.id ? 'primary' : 'secondary'}
                  onPress={() => setDraft((current) => toggleEventChoice(current, event.id, choice.id))}
                  block
                />
                <Text variant="caption" color="textSecondary">
                  {choice.description}
                </Text>
              </View>
            ))}
          </Card>
        );
      })}
      {electoral && (
        <CareerActionsCard state={state} content={content} report={result?.report} draft={draft} onToggle={toggle} />
      )}
      {electoral && (
        <CareerFinanceCard state={state} content={content} report={result?.report} draft={draft} onToggle={toggle} />
      )}
      {!electoral &&
        state.proposals
          .filter((proposal) => proposal.status === 'em_tramitacao' || proposal.status === 'parada')
          .map((proposal) => (
            <Card
              key={proposal.id}
              title={`Negociar: ${content.policies[proposal.policyId]?.name ?? proposal.policyId}`}>
              {content.scenario.blocs.map((bloc) => {
                const decision: Decision = {
                  policyId: NEGOTIATE_ACTION_ID,
                  agendaCost: 1,
                  params: { proposalId: proposal.id, blocId: bloc.id },
                };
                return (
                  <Button
                    key={bloc.id}
                    label={`Negociar com ${bloc.name}`}
                    variant={hasDecision(draft, decision) ? 'primary' : 'secondary'}
                    onPress={() => toggle(decision)}
                    block
                  />
                );
              })}
            </Card>
          ))}
      {!electoral &&
        content.scenario.institutions?.ministries.map((ministry) => {
          const routines = content.scenario.policies
            .map((id) => content.policies[id])
            .filter((policy) => policy?.delivery === 'rotina' && ministry.areas.includes(policy.area));
          if (!routines.length) return null;
          return (
            <Card
              key={ministry.id}
              title={`Dotação: ${ministry.name}`}
              subtitle="Valor anual do catálogo; a execução depende do espaço disponível.">
              {routines.map((policy) => {
                const decision: Decision = {
                  policyId: DIRECTIVE_ACTION_ID,
                  agendaCost: 1,
                  params: { ministryId: ministry.id, policyId: policy.id, annualMillions: policy.cost.annualMillions },
                };
                return (
                  <Button
                    key={policy.id}
                    label={`${policy.name} · R$ ${policy.cost.annualMillions} mi/ano`}
                    variant={hasDecision(draft, decision) ? 'primary' : 'secondary'}
                    onPress={() => toggle(decision)}
                    block
                  />
                );
              })}
            </Card>
          );
        })}
      {!electoral && (
        <Card
          title="Escolha para testar"
          subtitle="A disponibilidade e os custos são verificados pelo mesmo motor da partida.">
          {choices.map((choice) => (
            <View key={choice.id}>
              <Button
                label={choice.name}
                variant={hasDecision(draft, choice.decision) ? 'primary' : 'secondary'}
                onPress={() => toggle(choice.decision)}
                block
              />
              <Text variant="caption" color="textSecondary">
                {choice.summary}
              </Text>
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}
