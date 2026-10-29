import { StyleSheet, View } from 'react-native';

import { Button, Card, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import {
  COMMUNICATE_ACTION_ID,
  PRESS_RESPONSE_ACTION_ID,
  type Decision,
  type GameContent,
  type GameState,
} from '@/engine';
import { fits, gameStore, hasDecision, useGame } from '@/store';

import { pressFootnote, pressView, type PressItemView } from './pressView';

const TONE_COLOR = {
  neutral: 'textSecondary',
  positive: 'positive',
  negative: 'negative',
  warning: 'warning',
} as const;

/**
 * Imprensa e confiança (PLANO_EXPANSAO EX-28): tom da comunicação de crise, o que os veículos publicam (fato,
 * estimativa, interpretação, rumor) e a resposta a rumores. Comunicar não dá aprovação: muda confiança e adesão.
 */
export function PressCard({
  state,
  content,
  actionsMax,
}: {
  state: GameState;
  content: GameContent;
  actionsMax: number;
}) {
  const draft = useGame((s) => s.draft);
  const view = pressView(state, content);
  if (!view) return null;

  const action = (decision: Decision, label: string, enabled: boolean, hint?: string) => {
    const selected = hasDecision(draft, decision);
    return (
      <Button
        key={`${decision.policyId}:${JSON.stringify(decision.params)}`}
        label={selected ? `Retirar da agenda: ${label}` : label}
        variant={selected ? 'primary' : 'secondary'}
        disabled={!selected && !(enabled && fits(draft, decision, content, actionsMax))}
        accessibilityHint={hint}
        onPress={() => gameStore.getState().toggleDecision(decision)}
        block
      />
    );
  };

  const item = (it: PressItemView) => (
    <View key={it.id} style={styles.item}>
      <Text variant="caption" color={TONE_COLOR[it.tone]}>
        {`${it.badge} · ${it.when}`}
      </Text>
      <Text variant="body">{it.headline}</Text>
      <Text variant="caption" color="textSecondary">
        {`${it.outlet} — ${it.outletInfo}`}
      </Text>
      {it.response && <Text variant="caption">{it.response}</Text>}
      {it.canRespond && (
        <View style={styles.row}>
          {action(
            { policyId: PRESS_RESPONSE_ACTION_ID, agendaCost: 1, params: { itemId: it.id, response: 'desmentir' } },
            'Desmentir (1 ação)',
            true,
            'Corta mais a circulação se for falso; se a checagem confirmar o rumor, a confiança cai muito',
          )}
          {action(
            { policyId: PRESS_RESPONSE_ACTION_ID, agendaCost: 1, params: { itemId: it.id, response: 'esclarecer' } },
            'Esclarecer com dados (1 ação)',
            true,
            'Corta menos a circulação, mas nunca contradiz os fatos',
          )}
        </View>
      )}
    </View>
  );

  return (
    <Card title="Imprensa e confiança" subtitle={pressFootnote()}>
      <Text variant="body">{view.trust}</Text>
      {view.trustWhy.map((line) => (
        <Text key={line} variant="caption" color="textSecondary">
          {line}
        </Text>
      ))}
      <Text variant="label">Comunicação de crise</Text>
      {view.tones.map((tone) => (
        <View key={tone.tone} style={styles.tone}>
          {tone.current ? (
            <Text variant="caption">{`Tom atual: ${tone.label}. ${tone.effect}`}</Text>
          ) : (
            action(
              { policyId: COMMUNICATE_ACTION_ID, agendaCost: 1, params: { tone: tone.tone } },
              `${tone.label} (1 ação)`,
              true,
              tone.effect,
            )
          )}
        </View>
      ))}
      {view.reading && (
        <Text variant="caption" color="textSecondary">
          {view.reading}
        </Text>
      )}
      {view.items.length === 0 ? (
        <Text variant="caption" color="textSecondary">
          Nenhuma cobertura de crise por enquanto.
        </Text>
      ) : (
        view.items.map(item)
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  item: { gap: 2, paddingTop: Spacing.two },
  row: { gap: Spacing.one },
  tone: { gap: Spacing.one },
});
