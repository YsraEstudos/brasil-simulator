import { StyleSheet, View } from 'react-native';

import { Alert, Card, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import {
  AGENDA_ACTIONS,
  CAREER_ACTIONS,
  DEBATE_ACTION_ID,
  isCareerAction,
  pct,
  type GameContent,
  type MonthReport,
  type ProposalChange,
} from '@/engine';

import { careerTurnLabel, monthLabel, PROPOSAL_STATUS_LABEL, REJECTION_REASON_LABEL } from './labels';

/** Resumo do último mês encerrado: Copom, propostas, avisos e decisões recusadas (GAME_DESIGN.md §4.2). */
export function MonthSummary({ report, content }: { report: MonthReport; content: GameContent }) {
  const financialNames: Record<string, string> = {
    arrecadar_doacoes: 'Arrecadação de doações',
    aportar_campanha: 'Aporte pessoal',
    usar_caixa_dois: 'Caixa 2',
    pagar_divida_campanha: 'Pagamento de dívida',
  };
  const policyName = (id: string) =>
    financialNames[id] ??
    (isCareerAction(id) ? CAREER_ACTIONS[id].name : undefined) ??
    (id === DEBATE_ACTION_ID ? 'Debate na TV' : undefined) ??
    content.policies[id]?.name ??
    AGENDA_ACTIONS[id]?.name ??
    id;
  const copom = report.copom;
  let copomText: string | undefined;
  if (copom) {
    copomText =
      copom.next === copom.previous
        ? `Copom manteve a Selic em ${pct(copom.next, 2)}.`
        : `Copom ${copom.next < copom.previous ? 'cortou' : 'elevou'} a Selic de ${pct(copom.previous, 2)} para ${pct(copom.next, 2)}.`;
  }
  const finance = report.career?.expandedFinance;
  const simpleFinance = report.career?.finance;
  const hasFinancialChange =
    !!finance &&
    (finance.receipts.length > 0 ||
      finance.personalContribution > 0 ||
      finance.expenditures.length > 0 ||
      !!finance.closure);
  const nothingElse =
    report.proposalChanges.length === 0 &&
    report.rejected.length === 0 &&
    report.notes.length === 0 &&
    !hasFinancialChange &&
    !report.career?.illicit?.volume &&
    !(
      simpleFinance &&
      (simpleFinance.receipts.length > 0 ||
        simpleFinance.expenditures.length > 0 ||
        simpleFinance.closedBalance !== undefined)
    );

  return (
    <Card title={`Resumo de ${report.career ? careerTurnLabel(report.career) : monthLabel(report.monthIndex)}`}>
      {copomText && <Text variant="body">{copomText}</Text>}
      {!!report.career?.illicit?.volume && (
        <Text>Caixa 2: entrada de R$ {report.career.illicit.volume} mil marcada para o próximo turno.</Text>
      )}

      {simpleFinance && (
        <View style={styles.list}>
          <Text variant="label">Finanças da campanha (R$ mil)</Text>
          {simpleFinance.receipts.map((receipt, i) => (
            <Text key={`simple-receipt-${i}`}>• Recebimento: {receipt.amount}.</Text>
          ))}
          {simpleFinance.expenditures.map((expense, i) => (
            <Text key={`simple-expense-${i}`}>
              • {policyName(expense.actionId)}: {expense.amount} contratado.
            </Text>
          ))}
          {simpleFinance.closedBalance !== undefined && (
            <Text>• Campanha encerrada; sobra registrada: {simpleFinance.closedBalance}.</Text>
          )}
        </View>
      )}

      {report.career?.expandedFinance && (
        <View style={styles.list}>
          <Text variant="label">Finanças da campanha (R$ mil)</Text>
          {report.career.expandedFinance.receipts.map((receipt, i) => (
            <Text key={`receipt-${i}`}>
              • Recebimento: {receipt.amount} ({receipt.pocket === 'party' ? 'partido' : 'doações'}).
            </Text>
          ))}
          {report.career.expandedFinance.personalContribution > 0 && (
            <Text>• Aporte pessoal: {report.career.expandedFinance.personalContribution}.</Text>
          )}
          {report.career.expandedFinance.expenditures.map((expense, i) => (
            <Text key={`expense-${i}`}>
              • {policyName(expense.actionId)}: {expense.amount} contratado.
            </Text>
          ))}
          {report.career.expandedFinance.closure && (
            <Text>• Campanha encerrada; dívida registrada: {report.career.expandedFinance.closure.debt}.</Text>
          )}
        </View>
      )}

      {report.proposalChanges.length > 0 && (
        <View style={styles.list}>
          <Text variant="label">Propostas</Text>
          {report.proposalChanges.map((change, i) => (
            <Text key={`${change.proposalId}_${i}`} variant="body">
              • {proposalLine(change, policyName)}
            </Text>
          ))}
        </View>
      )}

      {report.rejected.length > 0 && (
        <View style={styles.list}>
          <Text variant="label" color="negative">
            Decisões não aceitas
          </Text>
          {report.rejected.map((r, i) => (
            <Text key={`${r.decision.policyId}_${i}`} variant="body">
              • {policyName(r.decision.policyId)}: {REJECTION_REASON_LABEL[r.reason]}
            </Text>
          ))}
        </View>
      )}

      {report.notes.map((note, i) => (
        <Alert key={`note_${i}`} tone="warning" title="Aviso do mês" message={note} />
      ))}

      {!copomText && nothingElse && (
        <Text variant="body" color="textSecondary">
          Nenhuma mudança de proposta ou decisão recusada no mês.
        </Text>
      )}
    </Card>
  );
}

function proposalLine(change: ProposalChange, policyName: (id: string) => string): string {
  const status = PROPOSAL_STATUS_LABEL[change.transition.status];
  const detail = change.transition.detail ? ` — ${change.transition.detail}` : '';
  return `${policyName(change.policyId)}: ${status}${detail}`;
}

const styles = StyleSheet.create({
  list: { gap: Spacing.half },
});
