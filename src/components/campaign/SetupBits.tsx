import { SymbolView } from 'expo-symbols';
import { useEffect, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  interpolateColor,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { MIN_TOUCH, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Peças animadas das telas NOVO JOGO e CARREGAR JOGO. As animações são curtas (até ~450 ms), de mola suave, e
 * respeitam "reduzir movimento" do sistema (padrão das animações de layout do Reanimated).
 */

/** Mola padrão das telas de campanha: assenta rápido, sem quicar demais. */
export const SPRING = { damping: 18, stiffness: 220, mass: 0.7 } as const;

/** Transição de layout quando um bloco cresce ou encolhe (efeitos, seções recolhíveis, lista). */
export const LAYOUT = LinearTransition.springify().damping(20).stiffness(180);

/** Entrada escalonada das seções: cada uma sobe e aparece um pouco depois da anterior. */
export function enterAt(index: number) {
  return FadeInDown.duration(420)
    .delay(60 + index * 70)
    .springify()
    .damping(18);
}

/** Cabeçalho das telas fora das abas: voltar, título dourado e subtítulo. */
export function SetupHeader({
  title,
  subtitle,
  onBack,
  backDisabled,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
  backDisabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(350)} style={styles.header}>
      <PressScale
        onPress={onBack}
        disabled={backDisabled}
        accessibilityLabel="Voltar ao menu principal"
        style={[styles.back, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <SymbolView
          name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
          size={20}
          tintColor={colors.accent}
        />
      </PressScale>
      <View style={styles.headerText}>
        <Text variant="title" color="accent" accessibilityRole="header" style={styles.titleText}>
          {title}
        </Text>
        <Text variant="caption" color="textSecondary">
          {subtitle}
        </Text>
      </View>
    </Animated.View>
  );
}

/** Tocável que encolhe levemente ao toque (mola), para dar resposta física aos botões e cartões. */
export function PressScale({
  onPress,
  disabled,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  accessibilityState,
  style,
  children,
}: {
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'radio' | 'checkbox';
  accessibilityState?: { selected?: boolean; checked?: boolean; expanded?: boolean };
  style?: ComponentProps<typeof Animated.View>['style'];
  children: ReactNode;
}) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => {
        scale.set(withSpring(0.97, SPRING));
      }}
      onPressOut={() => {
        scale.set(withSpring(1, SPRING));
      }}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ ...accessibilityState, disabled: !!disabled }}
      // Espelho em ARIA: o react-native-web lê só as props aria-*.
      aria-checked={accessibilityState?.checked}
      aria-selected={accessibilityState?.selected}
      aria-disabled={!!disabled}>
      <Animated.View style={[style, animated, disabled && styles.disabled]}>{children}</Animated.View>
    </Pressable>
  );
}

/**
 * Opção selecionável (dificuldade, cenário): a borda acende em dourado e o fundo clareia numa transição de
 * 220 ms; o selo de seleção entra com zoom. Seleção nunca é só cor: há o selo com ícone e o estado acessível.
 */
export function OptionCard({
  selected,
  onPress,
  accessibilityLabel,
  disabled,
  children,
}: {
  selected: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const progress = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    progress.set(withTiming(selected ? 1 : 0, { duration: 220 }));
  }, [progress, selected]);
  const animated = useAnimatedStyle(() => ({
    borderColor: interpolateColor(progress.get(), [0, 1], [colors.border, colors.accent]),
    backgroundColor: interpolateColor(progress.get(), [0, 1], [colors.background, colors.surfaceRaised]),
  }));
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected, checked: selected }}
      style={[styles.option, animated]}>
      <View style={styles.optionBody}>{children}</View>
      <View style={[styles.radio, { borderColor: selected ? colors.accent : colors.border }]}>
        {selected && (
          <Animated.View entering={ZoomIn.springify().damping(14)} exiting={FadeOut.duration(120)}>
            <View style={[styles.radioDot, { backgroundColor: colors.accent }]} />
          </Animated.View>
        )}
      </View>
    </PressScale>
  );
}

/** Selo curto ("Atual", "Encerrada"…), com borda para não depender só da cor. */
export function Badge({
  label,
  tone = 'accent',
}: {
  label: string;
  tone?: 'accent' | 'positive' | 'textSecondary' | 'warning';
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.badge, { borderColor: colors[tone] }]}>
      <Text variant="caption" color={tone} style={styles.badgeText}>
        {label}
      </Text>
    </View>
  );
}

/** Seção recolhível: a seta gira e o conteúdo entra deslizando; o restante da tela acompanha pela transição. */
export function Collapsible({
  title,
  hint,
  open,
  onToggle,
  children,
}: {
  title: string;
  hint?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const rotation = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    rotation.set(withSpring(open ? 1 : 0, SPRING));
  }, [open, rotation]);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.get() * 90}deg` }] }));
  return (
    <Animated.View layout={LAYOUT} style={styles.collapsible}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={hint}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        style={({ pressed }) => [styles.collapsibleHead, pressed && { opacity: 0.7 }]}>
        <Animated.View style={chevron}>
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
            size={18}
            tintColor={colors.accent}
          />
        </Animated.View>
        <Text variant="label" color="accent" style={styles.flexText}>
          {title}
        </Text>
      </Pressable>
      {open && (
        <Animated.View
          entering={FadeInDown.duration(260)}
          exiting={FadeOut.duration(150)}
          style={styles.collapsibleBody}>
          {children}
        </Animated.View>
      )}
    </Animated.View>
  );
}

/** Linha do resumo: o valor reaparece com um leve esmaecer sempre que muda. */
export function SummaryRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <View style={styles.summaryRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="caption" color="textSecondary" style={styles.summaryLabel}>
        {label}
      </Text>
      <Animated.View key={value} entering={FadeIn.duration(260)} style={styles.summaryValue}>
        <Text variant="label" color={muted ? 'textMuted' : 'text'} align="right">
          {value}
        </Text>
      </Animated.View>
    </View>
  );
}

/** Botão principal largo, dourado, com mola ao toque e indicador de carregamento. */
export function PrimaryAction({
  label,
  onPress,
  disabled,
  loading,
  hint,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  hint?: string;
}) {
  const { colors } = useTheme();
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={[styles.primary, { backgroundColor: colors.accent }]}>
      {loading ? (
        <Animated.View entering={FadeIn} style={styles.primaryRow}>
          <PulseDots color={colors.onAccent} />
          <Text variant="label" color="onAccent" style={styles.primaryText}>
            {label}
          </Text>
        </Animated.View>
      ) : (
        <Text variant="heading" color="onAccent" style={styles.primaryText}>
          {label}
        </Text>
      )}
    </PressScale>
  );
}

/** Três pontos pulsando em sequência (carregamento discreto dentro do botão). */
function PulseDots({ color }: { color: string }) {
  return (
    <View style={styles.dots}>
      {[0, 1, 2].map((i) => (
        <Dot key={i} delay={i * 140} color={color} />
      ))}
    </View>
  );
}

function Dot({ delay, color }: { delay: number; color: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const loop = (up: boolean) => {
      if (!alive) return;
      t.set(withTiming(up ? 1 : 0, { duration: 380 }));
      timer = setTimeout(() => loop(!up), 380);
    };
    timer = setTimeout(() => loop(true), delay);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [delay, t]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.35 + t.get() * 0.65,
    transform: [{ scale: 0.8 + t.get() * 0.3 }],
  }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

/**
 * Diálogo de confirmação sobre a tela (substituir campanha aberta, descartar rascunho, apagar): o fundo escurece e
 * o cartão entra com zoom de mola. Fica dentro da árvore da tela, sem `Modal`, para funcionar igual em todo lugar.
 */
export function ConfirmSheet({
  title,
  message,
  confirmLabel,
  cancelLabel = 'CANCELAR',
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={styles.backdrop}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onCancel}
        accessibilityLabel={cancelLabel}
        accessibilityRole="button"
      />
      <Animated.View
        entering={ZoomIn.springify().damping(17).stiffness(240)}
        accessibilityViewIsModal
        accessibilityRole="alert"
        style={[
          styles.sheet,
          { backgroundColor: colors.surface, borderColor: danger ? colors.negative : colors.accent },
        ]}>
        <Text variant="heading" color={danger ? 'negative' : 'accent'}>
          {title}
        </Text>
        <Text variant="body">{message}</Text>
        <View style={styles.sheetActions}>
          <PressScale
            onPress={onCancel}
            accessibilityLabel={cancelLabel}
            style={[styles.sheetButton, { borderColor: colors.border }]}>
            <Text variant="label" color="textSecondary">
              {cancelLabel}
            </Text>
          </PressScale>
          <PressScale
            onPress={onConfirm}
            accessibilityLabel={confirmLabel}
            style={[
              styles.sheetButton,
              {
                backgroundColor: danger ? colors.negative : colors.accent,
                borderColor: danger ? colors.negative : colors.accent,
              },
            ]}>
            <Text variant="label" color="onAccent">
              {confirmLabel}
            </Text>
          </PressScale>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  headerText: { flex: 1, flexShrink: 1, gap: Spacing.half },
  titleText: { letterSpacing: 1.5 },
  back: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: MIN_TOUCH / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.45 },
  option: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    padding: Spacing.three,
  },
  optionBody: { flex: 1, flexShrink: 1, gap: Spacing.one },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  badgeText: { fontWeight: '700', letterSpacing: 0.4 },
  collapsible: { gap: Spacing.two },
  collapsibleHead: { minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  collapsibleBody: { gap: Spacing.three },
  flexText: { flex: 1, flexShrink: 1 },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.three },
  summaryLabel: { flexShrink: 0, paddingTop: 2 },
  summaryValue: { flex: 1, flexShrink: 1, alignItems: 'flex-end' },
  primary: {
    minHeight: MIN_TOUCH + 8,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  primaryRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  primaryText: { letterSpacing: 2, fontWeight: '800' },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  sheet: {
    width: '100%',
    maxWidth: 460,
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  sheetActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: Spacing.two },
  sheetButton: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
