import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/ui';
import { MIN_TOUCH, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { costText } from './labels';

export interface ChoiceOptionProps {
  label: string;
  description: string;
  agendaCost: number;
  selected: boolean;
  /** Opção aplicada se o jogador não responder. */
  isDefault?: boolean;
  /** Cabe nas ações de agenda (a já marcada sempre pode ser desmarcada). */
  enabled: boolean;
  onPress: () => void;
}

/** Opção de resposta em grupo de escolha única (caixa de entrada: eventos, sanção ou veto). */
export function ChoiceOption({
  label,
  description,
  agendaCost,
  selected,
  isDefault,
  enabled,
  onPress,
}: ChoiceOptionProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        if (enabled) onPress();
      }}
      accessibilityRole="radio"
      accessibilityLabel={`${label}, custo ${costText(agendaCost)}${isDefault ? ', padrão se não responder' : ''}`}
      accessibilityState={{ checked: selected, disabled: !enabled }}
      style={[
        styles.option,
        {
          borderColor: selected ? colors.accent : colors.border,
          backgroundColor: selected ? colors.surfaceRaised : colors.surface,
        },
        !enabled && styles.disabled,
      ]}>
      <Text variant="label">
        {selected ? '◉ ' : '○ '}
        {label}
        {isDefault ? ' (padrão se não responder)' : ''}
      </Text>
      <Text variant="body" color="textSecondary">
        {description}
      </Text>
      <Text variant="caption" color="textMuted" tabular>
        custo: {costText(agendaCost)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  option: {
    minHeight: MIN_TOUCH,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    padding: Spacing.two,
    gap: Spacing.half,
  },
  disabled: { opacity: 0.45 },
});
