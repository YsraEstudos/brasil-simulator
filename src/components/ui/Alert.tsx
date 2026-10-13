import { StyleSheet, View } from 'react-native';

import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Button } from './Button';
import { Text } from './Text';

export type AlertTone = 'info' | 'positive' | 'warning' | 'negative';

export type AlertProps = {
  tone?: AlertTone;
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
};

const SOFT: Record<AlertTone, ThemeColor> = {
  info: 'infoSoft',
  positive: 'positiveSoft',
  warning: 'warningSoft',
  negative: 'negativeSoft',
};

/** Aviso em destaque (risco jurídico, meta fiscal em perigo…). A cor nunca é o único sinal: há sempre título. */
export function Alert({ tone = 'info', title, message, action }: AlertProps) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={[styles.alert, { backgroundColor: colors[SOFT[tone]], borderLeftColor: colors[tone] }]}>
      <Text variant="label" color={tone}>
        {title}
      </Text>
      {message && <Text variant="body">{message}</Text>}
      {action && <Button label={action.label} onPress={action.onPress} variant="ghost" />}
    </View>
  );
}

const styles = StyleSheet.create({
  alert: { borderRadius: Radius.md, borderLeftWidth: 4, padding: Spacing.three, gap: Spacing.one },
});
