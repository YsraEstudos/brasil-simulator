import { StyleSheet, View } from 'react-native';

import { Button, Card, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import {
  ADJUST_TARIFF_ACTION_ID,
  NEGOTIATE_AGREEMENT_ACTION_ID,
  TRADE_MISSION_ACTION_ID,
  type Decision,
  type GameContent,
  type GameState,
} from '@/engine';
import { fits, gameStore, hasDecision, useGame } from '@/store';

import { StatRow } from '../tabs/StatRow';
import { tradeFootnote, tradeView } from './tradeView';

/**
 * Comércio exterior e diplomacia (PLANO_EXPANSAO F14, EX-25): tarifa por decreto, missões, acordos com ratificação e
 * choques externos. Cada botão é uma ação de agenda.
 */
export function TradeCard({
  state,
  content,
  actionsMax,
}: {
  state: GameState;
  content: GameContent;
  actionsMax: number;
}) {
  const draft = useGame((s) => s.draft);
  const view = tradeView(state, content);
  if (!view) return null;

  const action = (decision: Decision, label: string, enabled: boolean, hint?: string) => {
    const selected = hasDecision(draft, decision);
    return (
      <Button
        key={`${decision.policyId}:${JSON.stringify(decision.params)}`}
        label={selected ? `Retirar da agenda: ${label}` : label}
        variant={selected ? 'primary' : 'secondary'}
        disabled={!selected && !(enabled && fits(draft, decision, content, actionsMax))}
        accessibilityHint={hint}
        onPress={() => gameStore.getState().toggleDecision(decision)}
        block
      />
    );
  };

  return (
    <Card title="Comércio exterior e diplomacia" subtitle={tradeFootnote()}>
      <Text variant="body">{view.tariff}</Text>
      <View style={styles.row}>
        {action(
          { policyId: ADJUST_TARIFF_ACTION_ID, agendaCost: 1, params: { direction: 'elevar' } },
          'Elevar tarifa (1 ação)',
          view.canRaise,
          'Mais arrecadação e menos importação; preços sobem por um ano e os parceiros reagem',
        )}
        {action(
          { policyId: ADJUST_TARIFF_ACTION_ID, agendaCost: 1, params: { direction: 'reduzir' } },
          'Reduzir tarifa (1 ação)',
          view.canLower,
          'Menos arrecadação e mais importação; preços caem por um ano e as relações melhoram',
        )}
      </View>
      {view.flows.map((flow) => (
        <StatRow key={flow.label} label={flow.label} value={flow.value} />
      ))}
      {view.sectors && <Text variant="caption">{view.sectors}</Text>}
      {view.supplyShock && (
        <Text variant="caption" color="negative">
          {view.supplyShock}
        </Text>
      )}
      {view.partners.map((partner) => (
        <View key={partner.id} style={styles.partner}>
          <Text variant="label">{partner.name}</Text>
          <Text variant="caption" color="textSecondary">
            {partner.status}
          </Text>
          {partner.shock && (
            <Text variant="caption" color="negative">
              {partner.shock}
            </Text>
          )}
          {partner.agreement && <Text variant="caption">{partner.agreement}</Text>}
          {action(
            { policyId: TRADE_MISSION_ACTION_ID, agendaCost: 1, params: { partnerId: partner.id } },
            'Missão comercial (1 ação)',
            true,
          )}
          {partner.canNegotiate &&
            action(
              { policyId: NEGOTIATE_AGREEMENT_ACTION_ID, agendaCost: 1, params: { partnerId: partner.id } },
              partner.negotiateLabel,
              true,
              'O acordo assinado ainda precisa ser ratificado pelo Congresso',
            )}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.one },
  partner: { gap: Spacing.one, paddingTop: Spacing.two },
});
