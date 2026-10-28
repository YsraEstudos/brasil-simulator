import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from 'zustand';

import { Button, Card, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { useTheme } from '@/hooks/use-theme';
import { createGuidedTutorial } from '@/store/guidedTutorial';

import { monthLabel, REJECTION_REASON_LABEL } from './labels';

export function GuidedTutorialScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const content = useMemo(() => loadContent(DEFAULT_SCENARIO_ID), []);
  const [tutorial] = useState(() => createGuidedTutorial(content));
  const step = useStore(tutorial, (state) => state.step);
  const result = useStore(tutorial, (state) => state.lastResult);
  const followups = useStore(tutorial, (state) => state.followupReports);
  const current = useStore(tutorial, (state) => state.state);
  const lesson = tutorial.getState().lesson();
  const [error, setError] = useState<string | null>(null);
  const election = result?.state.career?.election;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + Spacing.four },
      ]}>
      <Button label="Voltar" variant="ghost" onPress={() => router.back()} />
      <Text variant="heading">Tutorial jogável</Text>
      <Text color="textSecondary">
        Oito escolhas em exercícios fictícios e descartáveis. Nada é gravado na sua campanha.
      </Text>
      {result && (
        <Card title="Resultado da escolha anterior">
          {result.report.rejected.map((item, i) => (
            <Text key={`${item.decision.policyId}-${i}`}>Escolha recusada: {REJECTION_REASON_LABEL[item.reason]}</Text>
          ))}
          {election && (
            <Text>
              {election.outcome.startsWith('derrotado')
                ? 'A candidatura perdeu a eleição.'
                : 'A candidatura venceu a eleição.'}
            </Text>
          )}
          {result.report.proposalChanges.map((item, i) => (
            <Text key={`${item.proposalId}-${i}`}>{item.transition.detail}</Text>
          ))}
          {result.report.eventsResolved.map((item) => {
            const event = content.events.find((entry) => entry.id === item.eventId);
            const choice = event?.choices.find((entry) => entry.id === item.choiceId);
            return (
              <Text
                key={`${item.eventId}-${item.choiceId}`}>{`${event?.title ?? item.eventId}: ${choice?.label ?? item.choiceId}.`}</Text>
            );
          })}
          {result.report.notes.slice(0, 6).map((note, i) => (
            <Text key={`${note}-${i}`}>{note}</Text>
          ))}
          {result.report.contributions.slice(0, 4).map((item, i) => (
            <Text key={`${item.cause}-${i}`}>{item.label}</Text>
          ))}
          <Text variant="caption" color="textSecondary">
            Os efeitos podem depender de tramitação, financiamento e tempo; o resultado imediato não é o resultado final
            da política.
          </Text>
        </Card>
      )}
      {followups.length > 0 && (
        <Card
          title="Depois da negociação"
          subtitle={`${followups.length} meses simulados no exercício, com respostas padrão aos demais eventos.`}>
          {followups
            .flatMap((report) =>
              report.proposalChanges
                .filter((change) => change.proposalId === result?.report.accepted[0]?.params?.proposalId)
                .map((change) => ({ month: report.monthIndex, change })),
            )
            .map(({ month, change }, i) => (
              <Text
                key={`${change.proposalId}-${month}-${i}`}>{`${monthLabel(month)}: ${change.transition.detail}`}</Text>
            ))}
          {(() => {
            const proposalId = result?.report.accepted[0]?.params?.proposalId;
            const proposal = current.proposals.find((item) => item.id === proposalId);
            if (!proposal) return <Text>A proposta não está mais disponível neste exercício.</Text>;
            if (proposal.status === 'em_execucao' || proposal.status === 'concluida')
              return <Text>A proposta entrou em execução; resultados podem chegar com defasagem.</Text>;
            if (proposal.status === 'rejeitada' || proposal.status === 'vetada')
              return <Text>A proposta não entrou em execução porque foi rejeitada ou vetada.</Text>;
            return <Text>A proposta segue pendente neste exercício; ela não foi tratada como lei aprovada.</Text>;
          })()}
        </Card>
      )}
      {lesson ? (
        <Card title={`${step + 1} de 8 · ${lesson.title}`} subtitle={lesson.description}>
          {lesson.options.map((option) => (
            <View key={option.id} style={styles.option}>
              <Button
                label={option.label}
                onPress={() => {
                  try {
                    setError(null);
                    tutorial.getState().choose(option.id);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  }
                }}
                block
              />
              <Text variant="caption" color="textSecondary">
                {option.detail}
              </Text>
            </View>
          ))}
          {error && <Text color="negative">{error}</Text>}
        </Card>
      ) : (
        <Card title="Percurso concluído">
          <Text>
            Você experimentou ações de campanha, eleição, orçamento, Congresso, crise e gabinete. No jogo, o contexto e
            os resultados variam.
          </Text>
          <Button
            label="Recomeçar tutorial"
            variant="secondary"
            onPress={() => {
              tutorial.getState().reset();
              setError(null);
            }}
            block
          />
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.three, gap: Spacing.three },
  option: { gap: Spacing.one },
});
