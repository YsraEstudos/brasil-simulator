import { StyleSheet, View } from 'react-native';

import { Alert, Button, Card, formatNumber, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  AGENDA_ACTIONS,
  BC_BOARD_SIZE,
  boardShare,
  PRESSURE_ACTION_ID,
  type GameContent,
  type GameState,
} from '@/engine';

import { Badge, CostPips, ICONS, IconTile, SectionHeader } from './GabineteBits';

export interface AgendaActionsProps {
  state: GameState;
  content: GameContent;
  selected: readonly string[];
  /** Se ainda cabe nas ações de agenda do mês. */
  canInclude: (cost: number) => boolean;
  onToggle: (id: string) => void;
}

const MONTHS_PER_YEAR = 12;

/** Contexto da pressão sobre o BC: diretoria indicada e pressões recentes (ECONOMIC_MODEL.md §5.4.1). */
function pressureContext(state: GameState, content: GameContent): string {
  const indicated = Math.round(boardShare(state.monthIndex, content.calibration) * BC_BOARD_SIZE);
  const recent = state.economy.bcPressure.months.filter((m) => m > state.monthIndex - MONTHS_PER_YEAR).length;
  const repeat =
    recent > 0
      ? ` Já houve ${formatNumber(recent)} pressão${recent > 1 ? 'ões' : ''} nos últimos 12 meses: a próxima custa mais credibilidade.`
      : '';
  return `Este governo indicou ${formatNumber(indicated)} de ${BC_BOARD_SIZE} membros da diretoria.${repeat}`;
}

/** Ações de agenda que não viram proposta (GAME_DESIGN.md §4.3), como pressionar o Banco Central. */
export function AgendaActions({ state, content, selected, canInclude, onToggle }: AgendaActionsProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.root}>
      <SectionHeader
        icon={ICONS.actions}
        title="Ações rápidas"
        description="Gestos do Presidente que não viram proposta nem passam pelo Congresso: o efeito vem ao encerrar o mês."
      />
      {Object.values(AGENDA_ACTIONS)
        .filter((action) => action.listed)
        .map((action) => {
          const included = selected.includes(action.id);
          const blocked = !included && !canInclude(action.agendaCost);
          return (
            <Card key={action.id} style={included && { borderColor: colors.accent, borderWidth: 1.5 }}>
              <View style={styles.top}>
                <IconTile name={action.id === PRESSURE_ACTION_ID ? ICONS.bank : ICONS.actions} />
                <View style={styles.title}>
                  <Text variant="label">{action.name}</Text>
                  <Text variant="caption" color="textSecondary">
                    {action.summary}
                  </Text>
                </View>
              </View>
              <View style={styles.badges}>
                <Badge icon={ICONS.executive} label="Ação imediata" tone="positive" />
                <CostPips cost={action.agendaCost} />
              </View>
              {action.id === PRESSURE_ACTION_ID && (
                <Alert tone="warning" title="Risco à credibilidade" message={pressureContext(state, content)} />
              )}
              <Button
                label={included ? 'Retirar da agenda' : 'Incluir na agenda'}
                variant={included ? 'secondary' : 'primary'}
                disabled={blocked}
                accessibilityHint={blocked ? 'Ações de agenda insuficientes neste mês' : undefined}
                onPress={() => onToggle(action.id)}
                block
              />
            </Card>
          );
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.two },
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  title: { flex: 1, gap: Spacing.half },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
});
