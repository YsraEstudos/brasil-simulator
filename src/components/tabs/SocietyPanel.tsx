import { StyleSheet, View } from 'react-native';

import { sectorSensitivity, type SensitivityLevel } from '@/components/economy/economyInsights';
import { Card, formatNumber, formatPercent, formatPointsDelta, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { GameState } from '@/engine';
import { DEFAULT_SOCIETY_CALIBRATION } from '@/engine/society/calibration';
import type { SocietyExplanation, SocietyMetric, SocietyState } from '@/engine/society/types';
import type { TurnReading } from '@/store/recentTurns';

import { societyChanges, type ChangeDirection, type MonthChange } from './societyChangeModel';

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
export function SocietyPanel({ state, previous }: { state: GameState; previous?: TurnReading }) {
  const society: SocietyState = state.society;
  // Variação contra o turno anterior (H8, B41); sem turno anterior guardado, a tela diz isso.
  const changes = societyChanges(society, previous);

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

      <Card
        title="PIB por setor"
        subtitle="As seis parcelas somam o PIB social do mês. A etiqueta diz quanto o setor sente o preço das exportações, que anda com o câmbio e as commodities.">
        {society.sectors.map((sector) => (
          <View key={sector.id} style={styles.row}>
            <Text variant="label">{SECTOR_LABEL[sector.id] ?? 'Setor'}</Text>
            <Text variant="body" tabular>
              {formatNumber(sector.output, 3)} · {formatPercent(sector.share, 1)} do PIB
            </Text>
            <Text variant="caption" color="textSecondary" tabular>
              Crescimento setorial: {formatPercent(sector.growth, 1)}
            </Text>
            <MonthChangeLine change={changes?.sectors[sector.id] ?? null} />
            <SensitivityTag value={DEFAULT_SOCIETY_CALIBRATION.termsOfTradeSensitivity[sector.id]} />
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
            <MonthChangeLine change={changes?.quintiles[quintile.id] ?? null} />
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

const CHANGE_COLOR: Record<ChangeDirection, 'positive' | 'negative' | 'textSecondary'> = {
  up: 'positive',
  down: 'negative',
  flat: 'textSecondary',
};

/** Variação no mês (B41): seta e sinal dizem a direção; a cor (que segue o modo daltônico do tema) só reforça. */
function MonthChangeLine({ change }: { change: MonthChange | null }) {
  if (!change) {
    return (
      <Text variant="caption" color="textMuted">
        Sem o mês anterior para comparar
      </Text>
    );
  }
  return (
    <Text
      variant="caption"
      color={CHANGE_COLOR[change.direction]}
      tabular
      accessibilityLabel={change.accessibilityLabel}>
      {change.text}
    </Text>
  );
}

const LEVEL_DOTS: Record<SensitivityLevel, string> = { alta: '●●●', media: '●●○', baixa: '●○○' };
const LEVEL_COLOR: Record<SensitivityLevel, 'warning' | 'textSecondary'> = {
  alta: 'warning',
  media: 'textSecondary',
  baixa: 'textSecondary',
};

/** Etiqueta de sensibilidade do setor (Fase Q10, B75): pontos e texto, a cor só reforça. */
function SensitivityTag({ value }: { value: number }) {
  const { colors } = useTheme();
  const s = sectorSensitivity(value);
  return (
    <View accessible accessibilityLabel={s.label} style={[styles.tag, { borderColor: colors.border }]}>
      <Text variant="caption" color={LEVEL_COLOR[s.level]}>
        {LEVEL_DOTS[s.level]}
      </Text>
      <Text variant="caption" color="textSecondary">
        {s.label}
      </Text>
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
  tag: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
});
