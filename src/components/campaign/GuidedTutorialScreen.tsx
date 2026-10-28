import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from 'zustand';

import { Button, Card, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { useTheme } from '@/hooks/use-theme';
import { useGame } from '@/store';
import {
  clearGuidedTutorialCache,
  guidedTutorialFor,
  lessonAt,
  TUTORIAL_STEPS,
  tutorialContentIssues,
} from '@/store/guidedTutorial';

import { monthLabel, readableIsoDates, REJECTION_REASON_LABEL } from './labels';
import { effectLine, splitEffects, tutorialElection, tutorialProject, tutorialStatus } from './tutorialView';

/**
 * Tutorial jogável (PLANO_CAMPANHA.md Fase C8.2). A tela mostra, em cada passo: a situação atual (números que a
 * escolha move), o que aconteceu no mês anterior **por causa da escolha** e a próxima decisão, com o lugar dela no
 * jogo real. O resultado vem antes da lição, na ordem em que o jogador vive o mês.
 */
export function GuidedTutorialScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const content = useMemo(() => loadContent(DEFAULT_SCENARIO_ID), []);
  const tutorial = useMemo(() => guidedTutorialFor(content), [content]);
  const step = useStore(tutorial, (state) => state.step);
  const state = useStore(tutorial, (store) => store.state);
  const result = useStore(tutorial, (store) => store.lastResult);
  const lastChoice = useStore(tutorial, (store) => store.lastChoice);
  const followups = useStore(tutorial, (store) => store.followupReports);
  const pendingAdvance = useStore(tutorial, (store) => store.pendingAdvance);
  const proposalId = useStore(tutorial, (store) => store.proposalId);
  const canGoBack = useStore(tutorial, (store) => store.history.length > 0);
  const lesson = useMemo(() => lessonAt(step, state, content, proposalId), [step, state, content, proposalId]);
  const issues = useMemo(() => tutorialContentIssues(content), [content]);
  const active = useGame((store) => store.active);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const previousStep = useRef(step);

  // Trocar de lição é o evento que o leitor de tela precisa ouvir; rolar ao topo evita esconder o resultado novo.
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    const title = lesson?.title;
    if (title) AccessibilityInfo.announceForAccessibility?.(`Etapa ${step + 1} de ${TUTORIAL_STEPS}. ${title}`);
  }, [step, lesson?.title]);

  const status = tutorialStatus(state, content, result?.report);
  const effects = result ? splitEffects(result.report) : null;
  const election = result ? tutorialElection(result.state, content) : null;
  const notes = (result?.report.notes ?? []).filter((note) => !(election && note.startsWith('Eleição:')));
  const proposal = proposalId ? state.proposals.find((item) => item.id === proposalId) : undefined;
  const project = state.publicPolicies.projects[0];

  const reset = () => {
    clearGuidedTutorialCache();
    tutorial.getState().reset();
    setError(null);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + Spacing.four },
      ]}>
      <Button label="Voltar" variant="ghost" onPress={() => router.back()} />
      <Text variant="heading">Tutorial jogável</Text>
      <Text color="textSecondary">
        Oito decisões em dois exercícios fictícios e descartáveis: três na campanha e cinco no governo. Nada é gravado
        na sua campanha.
      </Text>
      <View style={styles.row}>
        {canGoBack && (
          <Button
            label="Voltar uma escolha"
            variant="secondary"
            onPress={() => {
              tutorial.getState().back();
              setError(null);
            }}
          />
        )}
        <Button label="Recomeçar" variant="ghost" onPress={reset} />
      </View>
      {issues.length > 0 && (
        <Card
          title="Tutorial indisponível neste cenário"
          subtitle="O cenário não tem todos os itens que as lições usam; a tela não finge que ensinou.">
          {issues.map((issue) => (
            <Text key={issue} color="negative">
              {issue}
            </Text>
          ))}
        </Card>
      )}
      <Card title="Sua situação" subtitle={status.when}>
        {status.items.map((item) => (
          <Text key={item} variant="caption" color="textSecondary">
            {item}
          </Text>
        ))}
      </Card>
      {result && (
        <View accessibilityLiveRegion="polite">
          <Card title="Resultado do mês anterior" subtitle={lastChoice ? `Você escolheu: ${lastChoice}` : undefined}>
            {result.report.rejected.map((item, index) => (
              <Text key={`${item.decision.policyId}-${index}`} color="negative">
                {`Escolha recusada: ${REJECTION_REASON_LABEL[item.reason]}. Tente a outra alternativa.`}
              </Text>
            ))}
            {election && (
              <View style={styles.block}>
                <Text variant="label">{election.title}</Text>
                <Text variant="caption" color="textSecondary">
                  {election.subtitle}
                </Text>
                {election.rounds.map((round) => (
                  <View key={round.title} style={styles.block}>
                    <Text variant="caption">{round.title}</Text>
                    {round.lines.map((line) => (
                      <Text key={line} variant="caption" color="textSecondary">
                        {line}
                      </Text>
                    ))}
                  </View>
                ))}
                {election.pollVsResult && (
                  <Text variant="caption" color="textSecondary">
                    {election.pollVsResult}
                  </Text>
                )}
              </View>
            )}
            {result.report.proposalChanges.map((item, index) => (
              <Text key={`${item.proposalId}-${index}`}>{readableIsoDates(item.transition.detail)}</Text>
            ))}
            {result.report.eventsResolved.map((item) => {
              const event = content.events.find((entry) => entry.id === item.eventId);
              const choice = event?.choices.find((entry) => entry.id === item.choiceId);
              return (
                <Text key={`${item.eventId}-${item.choiceId}`}>
                  {`${event?.title ?? item.eventId}: ${choice?.label ?? item.choiceId}${item.automatic ? ' (resposta padrão)' : ''}.`}
                </Text>
              );
            })}
            {effects && effects.own.length > 0 && (
              <View style={styles.block}>
                <Text variant="label">O que a sua escolha mudou</Text>
                {effects.own.slice(0, 6).map((effect) => (
                  <Text key={`${effect.cause}|${effect.indicator}`} variant="caption">
                    {effectLine(effect)}
                  </Text>
                ))}
                {effects.own.length > 6 && (
                  <Text variant="caption" color="textSecondary">
                    {`e mais ${effects.own.length - 6} efeito${effects.own.length - 6 === 1 ? '' : 's'} da mesma escolha.`}
                  </Text>
                )}
              </View>
            )}
            {effects && effects.others.length > 0 && (
              <Text variant="caption" color="textSecondary">
                {`Além disso, ${effects.others.length} fator${effects.others.length === 1 ? '' : 'es'} do mês mudou sem passar pela sua escolha (economia, clima e eventos automáticos).`}
              </Text>
            )}
            {notes.slice(0, 6).map((note, index) => (
              <Text key={`${note}-${index}`}>{note}</Text>
            ))}
            {notes.length > 6 && (
              <Text variant="caption" color="textSecondary">
                {`e mais ${notes.length - 6} nota${notes.length - 6 === 1 ? '' : 's'} do mês.`}
              </Text>
            )}
            <Text variant="caption" color="textSecondary">
              Os efeitos podem depender de tramitação, financiamento e tempo; o resultado imediato não é o resultado
              final da política.
            </Text>
          </Card>
        </View>
      )}
      {followups.length > 0 && (
        <Card
          title="O que aconteceu no período"
          subtitle={`${followups.length} ${followups.length === 1 ? 'mês simulado' : 'meses simulados'} com respostas padrão aos demais eventos.`}>
          {followups
            .flatMap((report) =>
              report.proposalChanges
                .filter((change) => change.proposalId === proposalId)
                .map((change) => ({ month: report.monthIndex, change })),
            )
            .map(({ month, change }, index) => (
              <Text key={`${change.proposalId}-${month}-${index}`}>
                {`${monthLabel(month)}: ${readableIsoDates(change.transition.detail)}`}
              </Text>
            ))}
          {proposal ? (
            <Text>
              {proposal.status === 'em_execucao' || proposal.status === 'concluida'
                ? 'A proposta entrou em execução; resultados podem chegar com defasagem.'
                : proposal.status === 'rejeitada' || proposal.status === 'vetada'
                  ? 'A proposta não entrou em execução porque foi rejeitada ou vetada.'
                  : 'A proposta segue pendente neste exercício; ela não foi tratada como lei aprovada.'}
            </Text>
          ) : (
            <Text>A proposta não está mais disponível neste exercício.</Text>
          )}
        </Card>
      )}
      {project && (
        <Card
          title="Carteira de obras"
          subtitle="A obra anda pelo menor entre o dinheiro e a capacidade de gestão. Manutenção é custeio, não um segundo investimento.">
          {state.publicPolicies.projects.map((item) => {
            const view = tutorialProject(state, content, item);
            return (
              <View key={item.proposalId} style={styles.block}>
                <Text variant="label">{view.name}</Text>
                <Text variant="caption" color="textSecondary">
                  {`${view.phase} · ${view.progress} · ${view.budget}`}
                </Text>
                <Text variant="caption" color="textSecondary">
                  {`Gargalo: ${view.bottleneck} · manutenção ${view.maintenance}/ano`}
                </Text>
                {view.commitments && (
                  <Text variant="caption" color="textSecondary">
                    {`Saldo plurianual previsto: ${view.commitments}`}
                  </Text>
                )}
              </View>
            );
          })}
        </Card>
      )}
      {pendingAdvance ? (
        <Card
          title="A votação leva tempo"
          subtitle={
            pendingAdvance.months > 0
              ? `${pendingAdvance.months} ${pendingAdvance.months === 1 ? 'mês será simulado' : 'meses serão simulados'} com respostas padrão aos demais eventos.`
              : 'A proposta já está pronta para a votação.'
          }>
          <Text>
            A tramitação, a sanção e o início da execução não acontecem no mesmo mês. Avance o período para ver o que
            acontece com a proposta e com o governo.
          </Text>
          <Button
            label={pendingAdvance.months > 0 ? `Avançar ${pendingAdvance.months} meses` : 'Continuar'}
            onPress={() => {
              tutorial.getState().advance();
              setError(null);
              scrollRef.current?.scrollTo({ y: 0, animated: true });
            }}
            block
          />
        </Card>
      ) : lesson ? (
        <View accessibilityLiveRegion="polite">
          <Card title={`${step + 1} de ${TUTORIAL_STEPS} · ${lesson.title}`} subtitle={lesson.description}>
            <Text variant="caption" color="textSecondary">
              {lesson.where}
            </Text>
            {lesson.options.map((option) => (
              <View key={option.id} style={styles.option}>
                <Button
                  label={option.label}
                  accessibilityHint={option.detail}
                  onPress={() => {
                    try {
                      setError(null);
                      tutorial.getState().choose(option.id);
                    } catch (caught) {
                      setError(caught instanceof Error ? caught.message : String(caught));
                    }
                  }}
                  block
                />
                <Text variant="caption" color="textSecondary">
                  {option.detail}
                </Text>
                {option.stats && (
                  <Text variant="caption" color="accent">
                    {option.stats}
                  </Text>
                )}
              </View>
            ))}
            {lesson.options.length === 0 && (
              <Text color="negative">Esta lição não tem alternativas disponíveis; volte uma escolha ou recomece.</Text>
            )}
            {error && <Text color="negative">{error}</Text>}
          </Card>
        </View>
      ) : (
        <Card title="Percurso concluído">
          <Text>
            Você experimentou ações de campanha, eleição, orçamento, Congresso, crise e gabinete. No jogo, o contexto e
            os resultados variam.
          </Text>
          <Text variant="caption" color="textSecondary">
            Este tutorial não cobre PPA, LDO e LOA em detalhe, nem a rotina inteira da carteira. No jogo, isso fica no
            Gabinete e no laboratório de decisões.
          </Text>
          {active && (
            <Button
              label="Abrir o laboratório de decisões"
              variant="secondary"
              onPress={() => router.push('/laboratorio')}
              block
            />
          )}
          <Button label="Voltar ao jogo" variant="secondary" onPress={() => router.back()} block />
          <Button label="Recomeçar tutorial" variant="secondary" onPress={reset} block />
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.three, gap: Spacing.three },
  option: { gap: Spacing.one },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  block: { gap: Spacing.half },
});
