import { StyleSheet, View } from 'react-native';

import { Button, Card, formatNumber, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import {
  AGENDA_ACTIONS,
  BC_BOARD_SIZE,
  boardShare,
  PRESSURE_ACTION_ID,
  type GameContent,
  type GameState,
} from '@/engine';

import { costText } from './labels';

export interface AgendaActionsProps {
  state: GameState;
  content: GameContent;
  selected: readonly string[];
  /** Se ainda cabe nos pontos de agenda do mês. */
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
  return (
    <View style={styles.root}>
      <Text variant="title">Ações de governo</Text>
      {Object.values(AGENDA_ACTIONS).map((action) => {
        const included = selected.includes(action.id);
        const blocked = !included && !canInclude(action.agendaCost);
        return (
          <Card key={action.id} title={action.name} subtitle={action.summary}>
            <Text variant="caption" color="textSecondary">
              Ação imediata · {costText(action.agendaCost)} de agenda
            </Text>
            {action.id === PRESSURE_ACTION_ID && (
              <Text variant="caption" color="warning">
                {pressureContext(state, content)}
              </Text>
            )}
            <Button
              label={included ? 'Retirar da agenda' : 'Incluir na agenda'}
              variant={included ? 'secondary' : 'primary'}
              disabled={blocked}
              accessibilityHint={blocked ? 'Pontos de agenda insuficientes neste mês' : undefined}
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
});
