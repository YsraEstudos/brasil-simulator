import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './Text';

export type CardProps = {
  title?: string;
  subtitle?: string;
  /** Torna o cartão tocável (ex.: abrir detalhes do indicador). */
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

export function Card({ title, subtitle, onPress, accessibilityLabel, style, children }: CardProps) {
  const { colors } = useTheme();
  const body = (
    <>
      {(title || subtitle) && (
        <View style={styles.header}>
          {title && <Text variant="heading">{title}</Text>}
          {subtitle && (
            <Text variant="caption" color="textSecondary">
              {subtitle}
            </Text>
          )}
        </View>
      )}
      {children}
    </>
  );
  const base = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }];
  if (!onPress) return <View style={[base, style]}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => [base, pressed && { backgroundColor: colors.surfaceRaised }, style]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.two },
  header: { gap: Spacing.half },
});
