import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { MIN_TOUCH, Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { AgendaTotals } from './agendaModel';
import { Icon, ICONS, type IconName } from './GabineteBits';

/**
 * Rodapé da agenda do mês (PLANO_QUICK_WINS.md, Fase Q7): o custo total (ações, custo fiscal anual, respostas a
 * eventos) e as ferramentas Desfazer, Limpar agenda e Recomeçar o mês. Só desenha; quem pergunta e altera o
 * rascunho é o `GabineteView`.
 */
export function AgendaFooter({
  totals,
  actionsMax,
  money,
  canUndo,
  onUndo,
  onClear,
  onRestart,
}: {
  totals: AgendaTotals;
  actionsMax: number;
  /** Valor em R$ milhões já na unidade da preferência (R$ ou % do PIB). */
  money: (millions: number) => string;
  canUndo: boolean;
  onUndo: () => void;
  onClear: () => void;
  onRestart: () => void;
}) {
  const { colors } = useTheme();
  const fiscal = fiscalTotal(totals.annualMillions, money);
  const empty = totals.decisions === 0 && totals.eventAnswers === 0;

  return (
    <View style={[styles.root, { borderTopColor: colors.border }]}>
      <View
        style={styles.totals}
        accessible
        accessibilityLabel={`Total do mês: ${totalsSpeech(totals, actionsMax, fiscal)}`}>
        <Total label="Ações" value={`${totals.actions} de ${actionsMax}`} />
        <Total label="Custo fiscal" value={fiscal.value} caption={fiscal.caption} tone={fiscal.tone} />
        <Total
          label="Eventos"
          value={String(totals.eventAnswers)}
          caption={totals.eventAnswers === 1 ? 'resposta' : 'respostas'}
        />
      </View>
      <View style={styles.tools}>
        <Tool
          icon={ICONS.undo}
          label="Desfazer"
          hint="Desfaz a última mudança na agenda"
          disabled={!canUndo}
          onPress={onUndo}
        />
        <Tool
          icon={ICONS.clear}
          label="Limpar agenda"
          hint="Tira todas as decisões e mantém as respostas a eventos"
          disabled={totals.decisions === 0}
          onPress={onClear}
        />
        {totals.eventAnswers > 0 && (
          <Tool
            icon={ICONS.restart}
            label="Recomeçar o mês"
            hint="Tira decisões e respostas a eventos"
            disabled={empty}
            onPress={onRestart}
          />
        )}
      </View>
    </View>
  );
}

function fiscalTotal(
  millions: number,
  money: (millions: number) => string,
): { value: string; caption: string; tone: ThemeColor; speech: string } {
  if (Math.abs(millions) < 0.5)
    return { value: '—', caption: 'sem custo', tone: 'textSecondary', speech: 'sem custo fiscal' };
  const amount = money(Math.abs(millions));
  return millions > 0
    ? { value: amount, caption: 'a mais por ano', tone: 'warning', speech: `custo de ${amount} por ano` }
    : { value: amount, caption: 'de economia por ano', tone: 'positive', speech: `economia de ${amount} por ano` };
}

function totalsSpeech(totals: AgendaTotals, actionsMax: number, fiscal: { speech: string }): string {
  const answers = totals.eventAnswers === 1 ? '1 resposta a evento' : `${totals.eventAnswers} respostas a eventos`;
  return `${totals.actions} de ${actionsMax} ações, ${fiscal.speech}, ${answers}`;
}

function Total({
  label,
  value,
  caption,
  tone = 'text',
}: {
  label: string;
  value: string;
  caption?: string;
  tone?: ThemeColor;
}) {
  return (
    <View style={styles.total}>
      <Text variant="caption" color="textMuted" style={styles.totalLabel}>
        {label.toUpperCase()}
      </Text>
      <Text variant="label" color={tone} tabular numberOfLines={1}>
        {value}
      </Text>
      {caption && (
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {caption}
        </Text>
      )}
    </View>
  );
}

function Tool({
  icon,
  label,
  hint,
  disabled,
  onPress,
}: {
  icon: IconName;
  label: string;
  hint: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.tool,
        { borderColor: colors.border, backgroundColor: colors.surfaceRaised },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <Icon name={icon} size={16} color={disabled ? 'textMuted' : 'accent'} />
      <Text variant="caption" color={disabled ? 'textMuted' : 'text'} style={styles.toolLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two },
  totals: { flexDirection: 'row', gap: Spacing.two },
  total: { flex: 1, gap: 2, minWidth: 0 },
  totalLabel: { fontWeight: '700', letterSpacing: 0.6 },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  tool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    minHeight: MIN_TOUCH,
  },
  toolLabel: { fontWeight: '600' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
});
