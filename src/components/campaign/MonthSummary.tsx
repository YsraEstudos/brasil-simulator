import { StyleSheet, View } from 'react-native';

import { Alert, Card, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { pct, type GameContent, type MonthReport, type ProposalChange } from '@/engine';

import { monthLabel, PROPOSAL_STATUS_LABEL, REJECTION_REASON_LABEL } from './labels';

/** Resumo do último mês encerrado: Copom, propostas, avisos e decisões recusadas (GAME_DESIGN.md §4.2). */
export function MonthSummary({ report, content }: { report: MonthReport; content: GameContent }) {
  const policyName = (id: string) => content.policies[id]?.name ?? id;
  const copom = report.copom;
  let copomText: string | undefined;
  if (copom) {
    copomText =
      copom.next === copom.previous
        ? `Copom manteve a Selic em ${pct(copom.next, 2)}.`
        : `Copom ${copom.next < copom.previous ? 'cortou' : 'elevou'} a Selic de ${pct(copom.previous, 2)} para ${pct(copom.next, 2)}.`;
  }
  const nothingElse = report.proposalChanges.length === 0 && report.rejected.length === 0 && report.notes.length === 0;

  return (
    <Card title={`Resumo de ${monthLabel(report.monthIndex)}`}>
      {copomText && <Text variant="body">{copomText}</Text>}

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
