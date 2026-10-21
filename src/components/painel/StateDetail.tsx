import { Pressable, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { formatNumber, formatPercent, Text } from '@/components/ui';
import { Radius } from '@/constants/theme';
import {
  REGION_NAMES,
  VISIT_ACTION_ID,
  type Decision,
  type GameContent,
  type GameState,
  type UfExplanation,
  regionsView,
} from '@/engine';
import { draftCost, fits, gameStore, hasDecision, useGame, type RegionalPoint } from '@/store';

import { LinkRow } from './HudBits';
import { Hud } from './hudTheme';
import {
  bin,
  explanationFor,
  formatPiece,
  formatValue,
  indicatorSpec,
  legendLabels,
  type MapIndicator,
  type UfRow,
} from './regionalMetrics';
import {
  buildUfSeriesView,
  seriesMetricFor,
  sparklinePoints,
  type ComparisonTone,
  type ComparisonView,
  type UfSeriesView,
} from './regionalSeriesView';

/**
 * Estado no mapa (GAME_DESIGN.md §4.5): o cartão com os números da UF e do Brasil, o governador, "Por que esta UF
 * está diferente da média?" e a visita presidencial, mais a lista das UFs ordenada pelo indicador — as funções da
 * antiga aba Brasil, agora dentro das folhas da mesa do Painel.
 */

/** Rótulo da relação com o governador, na mesma escala das faixas do mapa (−100…100). */
function relationLabel(relation: number): string {
  const spec = indicatorSpec('governador');
  return legendLabels(spec)[bin(spec, relation)];
}

/** Título da seção de causas, conforme o indicador do mapa. */
function whyTitle(indicator: MapIndicator): string {
  if (indicator === 'desemprego') return 'Por que o desemprego difere da média nacional';
  if (indicator === 'aprovacao' || indicator === 'governador' || indicator === 'alinhamento') {
    return 'Por que a aprovação difere da média nacional';
  }
  if (indicator === 'chuva') return 'Como a chuva pesa na aprovação deste estado';
  if (indicator === 'seca') return 'Como a seca pesa na atividade deste estado';
  return 'Por que a economia está acima ou abaixo da tendência';
}

/** Tamanho e traço da mini-série dos 12 meses (barata: uma polilinha e um ponto). */
const SPARK_WIDTH = 220;
const SPARK_HEIGHT = 44;
const SPARK_PAD = 4;
const SPARK_STROKE = 2;
const SPARK_DOT = 3;

const TONE_COLOR: Record<ComparisonTone, string> = {
  positive: Hud.positive,
  negative: Hud.negative,
  neutral: Hud.textDim,
};

function Comparison({ view }: { view: ComparisonView }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel} numberOfLines={1}>
        {view.label}
      </Text>
      <Text tabular style={[styles.metricValue, { color: TONE_COLOR[view.tone] }]}>
        {view.text}
      </Text>
    </View>
  );
}

/** Variação, mini-série de 12 meses e posição da UF no indicador do mapa (dados de `regionalSeriesView`). */
function SeriesBlock({ view }: { view: UfSeriesView }) {
  const color = TONE_COLOR[view.seriesTone];
  const points = view.hasSeries ? sparklinePoints(view.series, SPARK_WIDTH, SPARK_HEIGHT, SPARK_PAD) : [];
  const last = points[points.length - 1];
  return (
    <>
      <Text style={styles.section}>{`Evolução · ${view.metric.label}`}</Text>
      <View style={styles.metricRow}>
        <Text style={styles.metricLabel}>Hoje</Text>
        <Text tabular style={styles.metricValue}>
          {view.valueText}
        </Text>
        {view.rankText ? (
          <Text tabular style={styles.metricReference} numberOfLines={1}>
            {view.rankText}
          </Text>
        ) : null}
      </View>
      <Comparison view={view.sinceLastMonth} />
      <Comparison view={view.sinceStart} />
      {view.hasSeries ? (
        <View
          accessible
          accessibilityLabel={`${view.seriesCaption}: de ${view.seriesStartText} para ${view.valueText}`}
          style={styles.spark}>
          <Svg width={SPARK_WIDTH} height={SPARK_HEIGHT}>
            <Polyline
              points={points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
              fill="none"
              stroke={color}
              strokeWidth={SPARK_STROKE}
            />
            {last ? <Circle cx={last.x} cy={last.y} r={SPARK_DOT} fill={color} /> : null}
          </Svg>
          <Text tabular style={styles.note}>
            {`${view.seriesCaption}: ${view.seriesStartText} → ${view.valueText}`}
          </Text>
        </View>
      ) : (
        <Text style={styles.note}>{view.seriesCaption}</Text>
      )}
    </>
  );
}

/** Cartão da UF na folha "estado": números contra o Brasil, o governador, as causas do mês e a visita. */
export function UfDetail({
  row,
  indicator,
  state,
  content,
  explanation,
  regionalHistory,
  onFly,
}: {
  row: UfRow;
  indicator: MapIndicator;
  state: GameState;
  content: GameContent;
  /** Explicação das causas do mês para a UF (relatório do mês); sem ela, a folha avisa que ela vem depois. */
  explanation: UfExplanation | undefined;
  /** Série por UF do banco (pode estar vazia ou com lacunas: o cartão avisa "Sem dados anteriores"). */
  regionalHistory: readonly RegionalPoint[];
  /** Leva a câmera do globo até a UF; quem chama fecha a folha para o mapa aparecer. */
  onFly: () => void;
}) {
  const draft = useGame((s) => s.draft);
  const baseline = useGame((s) => s.active?.baseline);
  const { uf } = row;
  const scenarioUf = content.scenario.regions?.ufs.find((u) => u.id === uf.id);
  const bloc = content.scenario.blocs.find((b) => b.id === scenarioUf?.governor.bloc);
  const national = state.indicators;
  const pieces = explanationFor(indicator, explanation);
  const visit: Decision = { policyId: VISIT_ACTION_ID, agendaCost: 1, params: { uf: uf.id } };
  const included = hasDecision(draft, visit);
  const actionsMax = state.resources.agendaActionsPerMonth;
  const blocked = !included && !fits(draft, visit, content, actionsMax);
  const actionsLeft = actionsMax - draftCost(draft, content);
  // A posse vem do próprio save (mês 0); sem o snapshot, valem os valores do cenário embutido.
  const startShare = baseline?.regions.ufs.find((u) => u.id === uf.id)?.share ?? scenarioUf?.gdpShare ?? uf.share;

  const seriesView = buildUfSeriesView({
    metric: seriesMetricFor(indicator),
    ufId: uf.id,
    monthIndex: state.monthIndex,
    currentUfs: regionsView(state, content),
    history: regionalHistory,
  });

  const metrics: readonly [string, string, string][] = [
    [
      'Crescimento em 12 meses',
      formatPercent(national.gdpGrowth12m + uf.growthGap12m),
      `Brasil ${formatPercent(national.gdpGrowth12m)}`,
    ],
    ['Desemprego', formatPercent(uf.unemployment), `Brasil ${formatPercent(national.unemployment)}`],
    ['Aprovação do governo', formatPercent(uf.approval, 0), `Brasil ${formatPercent(national.approval, 0)}`],
    ['PIB per capita (Brasil = 1)', formatNumber(uf.share / row.populationShare, 2), 'Brasil = 1,00'],
    ['Participação no PIB', formatPercent(uf.share, 2), `${formatPercent(startShare, 2)} na posse`],
  ];

  return (
    <>
      <Text style={styles.sub}>
        {`Região ${REGION_NAMES[row.region] ?? row.region} · governador do bloco ${bloc?.name ?? '—'}, relação `}
        {`${relationLabel(uf.governorRelation)} (${formatValue('governador', uf.governorRelation)})`}
      </Text>

      {metrics.map(([label, value, reference]) => (
        <View key={label} style={styles.metricRow}>
          <Text style={styles.metricLabel} numberOfLines={1}>
            {label}
          </Text>
          <Text tabular style={styles.metricValue}>
            {value}
          </Text>
          <Text tabular style={styles.metricReference} numberOfLines={1}>
            {reference}
          </Text>
        </View>
      ))}

      {seriesView ? <SeriesBlock view={seriesView} /> : null}

      <Text style={styles.section}>{whyTitle(indicator)}</Text>
      {pieces.length === 0 ? (
        <Text style={styles.note}>A explicação aparece depois do primeiro mês encerrado.</Text>
      ) : (
        pieces.map((piece) => (
          <View key={piece.cause} style={styles.metricRow}>
            <Text style={styles.metricLabel}>{piece.label}</Text>
            <Text tabular style={[styles.metricValue, { color: piece.delta >= 0 ? Hud.positive : Hud.negative }]}>
              {formatPiece(indicator, piece.delta)}
            </Text>
          </View>
        ))
      )}

      <Pressable
        onPress={() => gameStore.getState().toggleDecision(visit)}
        disabled={blocked}
        accessibilityRole="button"
        accessibilityState={{ selected: included, disabled: blocked }}
        accessibilityLabel={included ? 'Retirar a visita da agenda' : 'Visitar o estado'}
        style={({ pressed }) => [
          styles.visit,
          included && styles.visitIncluded,
          blocked && styles.visitDisabled,
          pressed && styles.visitPressed,
        ]}>
        <Text tabular style={styles.visitText}>
          {included ? 'Retirar a visita da agenda' : `Visitar o estado · 1 ação (restam ${actionsLeft})`}
        </Text>
      </Pressable>
      <LinkRow label="Ir até o estado" onPress={onFly} />
    </>
  );
}

/** Lista das UFs ordenada pelo indicador (melhor primeiro): o mapa em forma de tabela. */
export function UfList({
  rows,
  indicator,
  onChoose,
}: {
  rows: readonly UfRow[];
  indicator: MapIndicator;
  /** Escolhe uma UF (quem chama voa até ela e abre o cartão). */
  onChoose: (sigla: string) => void;
}) {
  const spec = indicatorSpec(indicator);
  const sorted = [...rows].sort((a, b) => (spec.goodWhen === 'up' ? b.value - a.value : a.value - b.value));
  return (
    <>
      <Text style={styles.section}>{`Estados · ${spec.label}`}</Text>
      <Text style={styles.note}>{spec.legend}</Text>
      {sorted.map((r) => (
        <Pressable
          key={r.uf.id}
          onPress={() => onChoose(r.uf.id)}
          accessibilityRole="button"
          accessibilityLabel={`${r.name}: ${formatValue(indicator, r.value)}`}
          style={({ pressed }) => [styles.stateRow, pressed && styles.stateRowPressed]}>
          <View style={[styles.swatch, { backgroundColor: r.color }]} />
          <Text style={styles.stateName} numberOfLines={1}>
            {r.name} <Text style={styles.stateSigla}>{r.uf.id}</Text>
          </Text>
          <Text tabular style={styles.stateValue}>
            {formatValue(indicator, r.value)}
          </Text>
        </Pressable>
      ))}
    </>
  );
}

const styles = {
  sub: { color: Hud.textDim, fontSize: 11, lineHeight: 15 },
  metricRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingVertical: 1 },
  metricLabel: { flex: 1, color: Hud.textDim, fontSize: 11 },
  metricValue: { color: Hud.text, fontSize: 12, fontWeight: '700' },
  metricReference: { minWidth: 92, textAlign: 'right', color: Hud.textMuted, fontSize: 10 },
  section: {
    color: Hud.title,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    paddingTop: 4,
  },
  spark: { gap: 2, paddingVertical: 2 },
  note: { color: Hud.textMuted, fontSize: 10.5, fontStyle: 'italic' },
  visit: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: Hud.title,
    borderRadius: Radius.sm,
    backgroundColor: '#3a2f14cc',
  },
  visitIncluded: { borderColor: Hud.border, backgroundColor: Hud.tile },
  visitDisabled: { opacity: 0.45 },
  visitPressed: { opacity: 0.75 },
  visitText: { color: Hud.titleBright, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 38, paddingVertical: 2 },
  stateRowPressed: { opacity: 0.6 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  stateName: { flex: 1, color: Hud.text, fontSize: 12 },
  stateSigla: { color: Hud.textMuted },
  stateValue: { color: Hud.textDim, fontSize: 11.5, fontWeight: '700' },
} as const;
