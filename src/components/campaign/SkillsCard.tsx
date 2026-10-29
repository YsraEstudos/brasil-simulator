import { StyleSheet, View } from 'react-native';

import { Button, Card, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { TRAIN_SKILL_ACTION_ID, type Decision, type GameContent, type GameState } from '@/engine';
import { decisionCost, fits, gameStore, hasDecision, useGame } from '@/store';

import { skillsView, trainingCostText } from './skillsView';

/**
 * Habilidades do presidente (PLANO_EXPANSAO EX-21): dois ramos com três níveis. Treinar ocupa uma ação de agenda e
 * capital político; um treino por mês. O cartão explica o canal de cada efeito.
 */
export function SkillsCard({
  state,
  content,
  actionsMax,
}: {
  state: GameState;
  content: GameContent;
  actionsMax: number;
}) {
  const draft = useGame((s) => s.draft);
  return (
    <Card title="Habilidades" subtitle={trainingCostText()}>
      {skillsView(state).map((view) => {
        const decision: Decision = {
          policyId: TRAIN_SKILL_ACTION_ID,
          agendaCost: decisionCost({ policyId: TRAIN_SKILL_ACTION_ID, agendaCost: 1 }, content) || 1,
          params: { branch: view.branch },
        };
        const selected = hasDecision(draft, decision);
        // Um treino por mês: escolher outro ramo troca o treino já marcado (mesma ação de agenda).
        const available = selected || (view.trainable && fits(draft, decision, content, actionsMax));
        return (
          <View key={view.branch} style={styles.branch}>
            <Text variant="label">{`${view.label} · ${view.level}`}</Text>
            <Text variant="caption" color="textSecondary">
              {view.progress}
            </Text>
            <Text variant="caption">{view.effect}</Text>
            {view.next && (
              <Text variant="caption" color="textSecondary">
                {`Próximo nível: ${view.next}`}
              </Text>
            )}
            <Button
              label={selected ? 'Retirar treino da agenda' : `Treinar ${view.label.toLowerCase()} (1 ação)`}
              variant={selected ? 'primary' : 'secondary'}
              disabled={!available}
              accessibilityHint={
                !view.trainable ? 'Nível máximo alcançado' : 'Substitui outro treino marcado neste mês'
              }
              onPress={() => gameStore.getState().toggleDecision(decision)}
              block
            />
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  branch: { gap: Spacing.one, paddingTop: Spacing.two },
});
