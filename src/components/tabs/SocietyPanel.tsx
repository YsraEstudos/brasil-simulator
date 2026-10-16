import { StyleSheet, View } from 'react-native';

import { Card, formatNumber, formatPercent, formatPointsDelta, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { GameState } from '@/engine';
import type { SocietyExplanation, SocietyMetric, SocietyState } from '@/engine/society/types';

const SECTOR_LABEL: Record<string, string> = {
  agropecuaria: 'Agropecuária',
  extrativa: 'Extrativa',
  industria: 'Indústria',
  construcao: 'Construção',
  energia: 'Energia',
  servicos: 'Serviços',
  setor_publico: 'Setor público',
};

const QUINTILE_LABEL: Record<string, string> = {
  q1: '1º quintil',
  q2: '2º quintil',
  q3: '3º quintil',
  q4: '4º quintil',
  q5: '5º quintil',
};

const METRIC_LABEL: Record<SocietyMetric, string> = {
  sector_output: 'PIB setorial',
  real_income: 'Renda real',
  real_wage: 'Salário real médio',
  minimum_wage: 'Salário mínimo real',
  poverty_rate: 'Pobreza',
  unemployment: 'Desemprego',
};

const POLICY_CAUSE_PREFIXES = ['proposta:', 'diretriz:', 'projeto:', 'rotina:'];

function isPolicyExplanation(explanation: SocietyExplanation): boolean {
  return POLICY_CAUSE_PREFIXES.some((prefix) => explanation.cause.startsWith(prefix));
}

/** Mostra políticas recentes primeiro e preenche o espaço restante com causas gerais. */
function visibleExplanations(explanations: readonly SocietyExplanation[]): SocietyExplanation[] {
  const policy = explanations.filter(isPolicyExplanation).slice(-6).reverse();
  const general =
    policy.length >= 6
      ? []
      : explanations
          .filter((explanation) => !isPolicyExplanation(explanation))
          .slice(-(6 - policy.length))
          .reverse();
  return [...policy, ...general];
}

function formatIndexDelta(delta: number): string {
  const absolute = formatNumber(Math.abs(delta), 4);
  if (!Number.isFinite(delta)) return '—';
  if (delta > 0) return `+${absolute}`;
  if (delta < 0) return `−${absolute}`;
  return `±${absolute}`;
}

function formatMetricDelta(metric: SocietyMetric, delta: number): string {
  return metric === 'poverty_rate' || metric === 'unemployment' ? formatPointsDelta(delta, 1) : formatIndexDelta(delta);
}

/** Distribuição social reconciliada com o agregado: o painel só lê o estado produzido pelo motor. */
export function SocietyPanel({ state }: { state: GameState }) {
  const society: SocietyState = state.society;

  return (
    <View style={styles.root}>
      <Card title="Sociedade" subtitle="Valores PROVISÓRIOS de calibração do jogo; não são projeções oficiais.">
        <Text variant="body" color="textSecondary">
          PIB social reconciliado: <Text variant="label">{formatNumber(society.nationalOutput, 3)}</Text>
        </Text>
        <Text variant="body" color="textSecondary">
          Pobreza estimada: <Text variant="label">{formatPercent(society.povertyRate, 1)}</Text>
        </Text>
      </Card>

      <Card title="PIB por setor" subtitle="As seis parcelas somam o PIB social do mês.">
        {society.sectors.map((sector) => (
          <View key={sector.id} style={styles.row}>
            <Text variant="label">{SECTOR_LABEL[sector.id] ?? 'Setor'}</Text>
            <Text variant="body" tabular>
              {formatNumber(sector.output, 3)} · {formatPercent(sector.share, 1)} do PIB
            </Text>
            <Text variant="caption" color="textSecondary" tabular>
              Crescimento setorial: {formatPercent(sector.growth, 1)}
            </Text>
          </View>
        ))}
      </Card>

      <Card title="Renda real por quintil" subtitle="Participação na renda e índice de renda real do quintil.">
        {society.quintiles.map((quintile) => (
          <View key={quintile.id} style={styles.row}>
            <Text variant="label">{QUINTILE_LABEL[quintile.id] ?? 'Quintil'}</Text>
            <Text variant="body" tabular>
              Renda real {formatNumber(quintile.realIncome, 3)} · {formatPercent(quintile.incomeShare, 1)} da renda
            </Text>
          </View>
        ))}
      </Card>

      <Card title="Por que mudou?" subtitle="Causas de políticas aparecem primeiro; depois vêm os ajustes gerais.">
        {society.explanations.length === 0 ? (
          <Text variant="body" color="textSecondary">
            Nenhuma causa social registrada neste mês.
          </Text>
        ) : (
          visibleExplanations(society.explanations).map((explanation, index) => (
            <View key={`${explanation.metric}:${index}`} style={styles.row}>
              <Text variant="label">{explanation.label}</Text>
              <Text variant="caption" color="textSecondary">
                {`${METRIC_LABEL[explanation.metric]} · variação ${formatMetricDelta(explanation.metric, explanation.delta)}`}
              </Text>
            </View>
          ))
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.three },
  row: {
    gap: Spacing.half,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
    paddingTop: Spacing.one,
  },
});
