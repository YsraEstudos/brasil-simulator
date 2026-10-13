import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { MIN_TOUCH, Radius, Spacing } from '@/constants/theme';
import type { PendingEvent } from '@/engine';
import { useTheme } from '@/hooks/use-theme';
import type { GameEvent } from '@/types/event';

import { costText, monthLabel } from './labels';

export interface PendingItem {
  event: GameEvent;
  pending: PendingEvent;
}

export interface EventInboxProps {
  items: readonly PendingItem[];
  /** Escolha marcada pelo jogador, por evento. */
  chosen: Readonly<Partial<Record<string, string>>>;
  /** Se a opção cabe nos pontos de agenda restantes (a já marcada sempre pode ser desmarcada). */
  canChoose: (eventId: string, choiceId: string) => boolean;
  onChoose: (eventId: string, choiceId: string) => void;
}

/** Caixa de entrada: eventos que pedem resposta neste mês (GAME_DESIGN.md §4.2). */
export function EventInbox({ items, chosen, canChoose, onChoose }: EventInboxProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.root}>
      <Text variant="title">Caixa de entrada</Text>
      {items.length === 0 && (
        <Text variant="body" color="textSecondary">
          Nenhum evento pede resposta neste mês.
        </Text>
      )}
      {items.map(({ event, pending }) => {
        const selectedId = chosen[event.id];
        const deadline = monthLabel(pending.monthIndex + 1);
        return (
          <Card key={event.id} title={event.title} subtitle={`Sem resposta até o fim de ${deadline}, vale o padrão.`}>
            <Text variant="body">{event.description}</Text>
            <View style={styles.options} accessibilityRole="radiogroup">
              {event.choices.map((choice) => {
                const isSelected = selectedId === choice.id;
                const isDefault = event.defaultChoice === choice.id;
                const enabled = isSelected || canChoose(event.id, choice.id);
                return (
                  <Pressable
                    key={choice.id}
                    onPress={() => {
                      if (enabled) onChoose(event.id, choice.id);
                    }}
                    accessibilityRole="radio"
                    accessibilityLabel={`${choice.label}, custo ${costText(choice.agendaCost)}${isDefault ? ', padrão se não responder' : ''}`}
                    accessibilityState={{ checked: isSelected, disabled: !enabled }}
                    style={[
                      styles.option,
                      {
                        borderColor: isSelected ? colors.accent : colors.border,
                        backgroundColor: isSelected ? colors.surfaceRaised : colors.surface,
                      },
                      !enabled && styles.disabled,
                    ]}>
                    <Text variant="label">
                      {isSelected ? '◉ ' : '○ '}
                      {choice.label}
                      {isDefault ? ' (padrão se não responder)' : ''}
                    </Text>
                    <Text variant="body" color="textSecondary">
                      {choice.description}
                    </Text>
                    <Text variant="caption" color="textMuted" tabular>
                      custo: {costText(choice.agendaCost)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.two },
  options: { gap: Spacing.two },
  option: {
    minHeight: MIN_TOUCH,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    padding: Spacing.two,
    gap: Spacing.half,
  },
  disabled: { opacity: 0.45 },
});
