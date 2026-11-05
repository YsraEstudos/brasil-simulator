import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { MIN_TOUCH, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { figuresA11y, type EffectFigure } from './effectFigures';
import { costText } from './labels';

export interface ChoiceOptionProps {
  label: string;
  description: string;
  agendaCost: number;
  selected: boolean;
  /** Opção aplicada se o jogador não responder. */
  isDefault?: boolean;
  /**
   * O grupo ainda não tem resposta (Fase Q12, B46): a opção padrão ganha moldura tracejada e o aviso "vale se você
   * não responder", porque é ela que o motor aplica ao encerrar o mês.
   */
  unanswered?: boolean;
  /** Cabe nas ações de agenda (a já marcada sempre pode ser desmarcada). */
  enabled: boolean;
  onPress: () => void;
  /** Números da escolha (H9/D3): exatos no Casual, faixa nas outras dificuldades. */
  figures?: readonly EffectFigure[];
}

/**
 * Opção de resposta em grupo de escolha única (caixa de entrada: eventos, sanção ou veto): botão de rádio à esquerda,
 * selos de "padrão" e de custo ao lado do título, e a explicação embaixo. A cor nunca é o único sinal: o rádio
 * preenchido e o leitor de tela dizem qual está marcada.
 */
export function ChoiceOption({
  label,
  description,
  agendaCost,
  selected,
  isDefault,
  unanswered = false,
  enabled,
  onPress,
  figures = [],
}: ChoiceOptionProps) {
  const { colors } = useTheme();
  const pendingDefault = Boolean(isDefault) && unanswered && !selected;
  return (
    <Pressable
      onPress={() => {
        if (enabled) onPress();
      }}
      accessibilityRole="radio"
      accessibilityLabel={[
        `${label}, custo ${costText(agendaCost)}${isDefault ? (pendingDefault ? ', vale esta se você não responder' : ', padrão se não responder') : ''}`,
        figuresA11y(figures),
      ]
        .filter(Boolean)
        .join('. ')}
      accessibilityState={{ checked: selected, disabled: !enabled }}
      style={({ pressed }) => [
        styles.option,
        {
          borderColor: selected ? colors.accent : pendingDefault ? colors.warning : colors.border + '80',
          backgroundColor: selected
            ? colors.accent + '1f'
            : pressed && enabled
              ? colors.surfaceRaised
              : pendingDefault
                ? colors.warningSoft
                : colors.surface,
        },
        pendingDefault && styles.pendingDefault,
        !enabled && styles.disabled,
      ]}>
      <View style={[styles.radio, { borderColor: selected ? colors.accent : colors.textMuted }]}>
        {selected && <View style={[styles.radioDot, { backgroundColor: colors.accent }]} />}
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text variant="label" color={selected ? 'accent' : 'text'} style={styles.title}>
            {label}
          </Text>
          <View style={styles.chips}>
            {isDefault && (
              <View
                style={[
                  styles.chip,
                  pendingDefault ? { borderColor: colors.warning } : { borderColor: colors.textMuted },
                ]}>
                <Text variant="caption" color={pendingDefault ? 'warning' : 'textSecondary'} style={styles.chipText}>
                  padrão
                </Text>
              </View>
            )}
            <View
              style={[
                styles.chip,
                agendaCost > 0
                  ? { borderColor: colors.accent + '99', backgroundColor: colors.accent + '1a' }
                  : { borderColor: colors.border },
              ]}>
              <Text variant="caption" color={agendaCost > 0 ? 'accent' : 'textMuted'} tabular style={styles.chipText}>
                {agendaCost > 0 ? costText(agendaCost) : 'sem custo'}
              </Text>
            </View>
          </View>
        </View>
        <Text variant="caption" color="textSecondary">
          {description}
        </Text>
        <FigureChips figures={figures} />
        {pendingDefault && (
          <Text variant="caption" color="warning" style={styles.chipText}>
            Vale esta se você não responder até o fim do mês.
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const FIGURE_COLOR = { positive: 'positive', negative: 'negative', neutral: 'textSecondary' } as const;

/**
 * Números de um efeito em pílulas (H9/D3). O sinal e a palavra (Custo/Economia) vão no texto; a cor só reforça.
 * Fora do Casual, a primeira pílula diz "estimativa" para não parecer valor exato.
 */
export function FigureChips({ figures }: { figures: readonly EffectFigure[] }) {
  const { colors } = useTheme();
  if (figures.length === 0) return null;
  const estimate = figures.some((f) => !f.exact);
  return (
    <View style={styles.figures} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {estimate && (
        <Text variant="caption" color="textMuted" style={styles.figureNote}>
          estimativa
        </Text>
      )}
      {figures.map((f) => (
        <View key={f.key} style={[styles.figure, { borderColor: colors.border }]}>
          <Text variant="caption" color={FIGURE_COLOR[f.tone]} tabular>
            {f.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  figures: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.half },
  figure: { borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 7, paddingVertical: 1 },
  figureNote: { fontStyle: 'italic' },
  option: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  radio: {
    width: 18,
    height: 18,
    marginTop: 1,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 8, height: 8, borderRadius: 4 },
  body: { flex: 1, minWidth: 0, gap: Spacing.half },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.one },
  title: { flexShrink: 1 },
  chips: { flexDirection: 'row', gap: Spacing.half, marginLeft: 'auto' },
  chip: { borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 7, paddingVertical: 1 },
  chipText: { fontWeight: '700', letterSpacing: 0.2 },
  disabled: { opacity: 0.45 },
  pendingDefault: { borderStyle: 'dashed', borderWidth: 1.5 },
});
