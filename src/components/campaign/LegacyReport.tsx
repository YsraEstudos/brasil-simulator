import { StyleSheet, View } from 'react-native';

import { Card, formatNumber, formatPercent, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { GameContent, GameState, IndicatorKey, Proposal } from '@/engine';

import { INDICATOR_META, INDICATOR_ORDER, PROPOSAL_STATUS_LABEL } from './labels';

/**
 * Relatório de legado (GAME_DESIGN.md §7.1): país recebido vs. entregue.
 *
 * Pontuação simples do protótipo (GDD §7.2): para cada um dos 5 indicadores, +1 se o valor final melhorou em
 * relação ao inicial (aprovação e PIB: subiu; inflação e desemprego: caiu; resultado primário: subiu), −1 se
 * piorou e 0 se ficou igual. A pontuação é a média desses 5 sinais, entre −1 e +1.
 */
export function legacyScore(
  initial: Readonly<Record<IndicatorKey, number>>,
  final: Readonly<Record<IndicatorKey, number>>,
): {
  signs: Record<IndicatorKey, -1 | 0 | 1>;
  score: number;
} {
  const signs = {} as Record<IndicatorKey, -1 | 0 | 1>;
  let total = 0;
  for (const key of INDICATOR_ORDER) {
    const delta = final[key] - initial[key];
    const better = INDICATOR_META[key].goodWhen === 'up' ? delta : -delta;
    const sign: -1 | 0 | 1 = better > 0 ? 1 : better < 0 ? -1 : 0;
    signs[key] = sign;
    total += sign;
  }
  return { signs, score: total / INDICATOR_ORDER.length };
}

export interface LegacyReportProps {
  state: GameState;
  content: GameContent;
}

/** Relatório de legado do fim do protótipo (GAME_DESIGN.md §7.1). */
export function LegacyReport({ state, content }: LegacyReportProps) {
  const initial = content.scenario.indicators;
  const initialValues = {
    approval: initial.approval.value,
    inflation12m: initial.inflation12m.value,
    unemployment: initial.unemployment.value,
    gdpGrowth12m: initial.gdpGrowth12m.value,
    primaryBalance12m: initial.primaryBalance12m.value,
  } satisfies Record<IndicatorKey, number>;
  const { signs, score } = legacyScore(initialValues, state.indicators);
  const improved = INDICATOR_ORDER.filter((k) => signs[k] === 1).length;

  const approved = state.proposals.filter((p) => ['aprovada', 'em_execucao', 'concluida'].includes(p.status));
  const rejected = state.proposals.filter((p) => p.status === 'rejeitada');
  const executed = state.proposals.filter((p) => p.status === 'em_execucao' || p.status === 'concluida');

  return (
    <View style={styles.root}>
      <Text variant="title">Relatório de legado</Text>

      <Card title="País recebido e país entregue" subtitle="Valor inicial (jan/2027) e final (dez/2027).">
        {INDICATOR_ORDER.map((key) => {
          const meta = INDICATOR_META[key];
          const fmt = (v: number) => formatPercent(v, meta.decimals);
          return (
            <View key={key} style={styles.row}>
              <Text variant="body" style={styles.label}>
                {meta.label}
              </Text>
              <Text variant="body" tabular color="textSecondary">
                {fmt(initialValues[key])} → <Text variant="label">{fmt(state.indicators[key])}</Text>
              </Text>
            </View>
          );
        })}
        <Text variant="caption" color="textMuted">
          Melhoraram {improved} de {INDICATOR_ORDER.length} indicadores.
        </Text>
      </Card>

      <Card title={`Pontuação: ${formatNumber(score, 2)}`} subtitle="Média dos sinais dos 5 indicadores, de −1 a +1.">
        <Text variant="body" color="textSecondary">
          Mede apenas a direção da mudança, não a magnitude nem a dificuldade do cenário.
        </Text>
      </Card>

      <ProposalGroup title="Propostas aprovadas" proposals={approved} content={content} />
      <ProposalGroup title="Propostas rejeitadas" proposals={rejected} content={content} />
      <ProposalGroup title="Propostas executadas" proposals={executed} content={content} />
    </View>
  );
}

function ProposalGroup({
  title,
  proposals,
  content,
}: {
  title: string;
  proposals: readonly Proposal[];
  content: GameContent;
}) {
  return (
    <Card title={`${title} (${proposals.length})`}>
      {proposals.length === 0 && (
        <Text variant="body" color="textSecondary">
          Nenhuma.
        </Text>
      )}
      {proposals.map((p) => (
        <Text key={p.id} variant="body">
          • {content.policies[p.policyId]?.name ?? p.policyId}: {PROPOSAL_STATUS_LABEL[p.status]}
        </Text>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.three },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: Spacing.two },
  label: { flexShrink: 1 },
});
