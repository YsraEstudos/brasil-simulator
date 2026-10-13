import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { MIN_TOUCH, Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  /** Ocupa a largura disponível. */
  block?: boolean;
  accessibilityHint?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  block,
  accessibilityHint,
}: ButtonProps) {
  const { colors } = useTheme();
  const inactive = disabled || loading;
  const look: Record<ButtonVariant, { bg: string; border: string; text: ThemeColor }> = {
    primary: { bg: colors.accent, border: colors.accent, text: 'onAccent' },
    secondary: { bg: 'transparent', border: colors.accent, text: 'accent' },
    ghost: { bg: 'transparent', border: 'transparent', text: 'accent' },
    danger: { bg: colors.negative, border: colors.negative, text: 'onAccent' },
  };
  const v = look[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: v.bg, borderColor: v.border },
        block && styles.block,
        pressed && styles.pressed,
        inactive && styles.inactive,
      ]}>
      {loading ? (
        <ActivityIndicator color={colors[v.text]} />
      ) : (
        <Text variant="label" color={v.text}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  block: { alignSelf: 'stretch' },
  pressed: { opacity: 0.75 },
  inactive: { opacity: 0.45 },
});
