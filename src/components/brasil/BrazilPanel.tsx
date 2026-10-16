import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, formatNumber, formatPercent, Text } from '@/components/ui';
import { MIN_TOUCH, Radius, Spacing } from '@/constants/theme';
import { loadContent } from '@/content';
import {
  initialRegions,
  REGION_NAMES,
  VISIT_ACTION_ID,
  type Decision,
  type GameContent,
  type GameState,
} from '@/engine';
import { GlobeView } from '@/globe/GlobeView';
import { useTheme } from '@/hooks/use-theme';
import { draftPoints, fits, gameStore, hasDecision, useGame, type ActiveCampaign } from '@/store';

import {
  binColor,
  explanationFor,
  formatPiece,
  formatValue,
  indicatorSpec,
  legendLabels,
  MAP_INDICATORS,
  mapFills,
  mapRows,
  type MapIndicator,
  type UfRow,
} from './regionalMetrics';

/**
 * Aba Brasil (GAME_DESIGN.md §4.5): o globo com o mapa de calor do indicador escolhido, a legenda, a lista
 * ordenada das UFs e o cartão da UF com os números, a explicação da diferença em relação à média, o governador
 * e a visita presidencial (que entra na mesma agenda do mês das outras abas).
 */
export function BrazilPanel({ campaign }: { campaign: ActiveCampaign }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { state, lastReport } = campaign;
  const content = loadContent(state.scenarioId);
  const [indicator, setIndicator] = useState<MapIndicator>('aprovacao');
  const [selected, setSelected] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const fly = useRef<((sigla: string) => void) | null>(null);

  const rows = useMemo(() => mapRows(indicator, state, content), [indicator, state, content]);
  const fills = useMemo(() => mapFills(rows), [rows]);
  const spec = indicatorSpec(indicator);
  const row = rows.find((r) => r.uf.id === selected) ?? null;
  // No mês da posse ainda não há relatório: a explicação inicial vem da própria distribuição.
  const explanations = useMemo(
    () => lastReport?.regional ?? (state.monthIndex === 0 ? initialRegions(state, content).explanations : null),
    [lastReport, state, content],
  );

  const choose = (sigla: string) => {
    setSelected(sigla);
    setListOpen(false);
    fly.current?.(sigla);
  };

  const panel = { backgroundColor: colors.surface, borderColor: colors.border };

  return (
    <GlobeView
      fills={fills}
      selectedId={selected}
      onSelect={setSelected}
      onReady={(api) => {
        fly.current = api.flyToUf;
      }}>
      <View
        pointerEvents="box-none"
        style={[styles.chips, { top: insets.top + 52, paddingLeft: insets.left, paddingRight: insets.right }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {MAP_INDICATORS.map((m) => (
            <Chip key={m.id} label={m.label} active={m.id === indicator} onPress={() => setIndicator(m.id)} />
          ))}
          <Chip label={listOpen ? 'Fechar lista' : 'Lista'} active={listOpen} onPress={() => setListOpen((v) => !v)} />
        </ScrollView>
      </View>

      {listOpen ? (
        <View
          style={[
            styles.list,
            panel,
            { top: insets.top + 104, left: Spacing.three + insets.left, right: Spacing.three + insets.right },
          ]}>
          <UfList rows={rows} indicator={indicator} onChoose={choose} />
        </View>
      ) : row ? (
        <View style={[styles.card, panel, { left: Spacing.three + insets.left, right: Spacing.three + insets.right }]}>
          <UfCard
            row={row}
            indicator={indicator}
            state={state}
            content={content}
            explanation={explanations?.find((x) => x.id === row.uf.id)}
            onClose={() => setSelected(null)}
            onFly={() => fly.current?.(row.uf.id)}
          />
        </View>
      ) : (
        <View
          style={[styles.legend, panel, { left: Spacing.three + insets.left, right: Spacing.three + insets.right }]}
          accessibilityRole="summary">
          <Text variant="label">{spec.legend}</Text>
          <View style={styles.legendRow}>
            {legendLabels(spec).map((label, i) => (
              <View key={label} style={styles.legendItem}>
                <View style={[styles.swatch, { backgroundColor: binColor(spec, i) }]} />
                <Text variant="caption" color="textSecondary">
                  {label}
                </Text>
              </View>
            ))}
          </View>
          <Text variant="caption" color="textMuted">
            Toque num estado para ver os números e o porquê da diferença.
          </Text>
        </View>
      )}
    </GlobeView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? colors.accent : colors.surface,
          borderColor: active ? colors.accent : colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <Text variant="label" color={active ? 'onAccent' : 'text'}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Lista das UFs ordenada pelo indicador (melhor primeiro): a versão em tabela do mapa. */
function UfList({
  rows,
  indicator,
  onChoose,
}: {
  rows: readonly UfRow[];
  indicator: MapIndicator;
  onChoose: (sigla: string) => void;
}) {
  const spec = indicatorSpec(indicator);
  const sorted = [...rows].sort((a, b) => (spec.goodWhen === 'up' ? b.value - a.value : a.value - b.value));
  return (
    <ScrollView contentContainerStyle={styles.listContent}>
      <Text variant="label">{spec.legend}</Text>
      {sorted.map((r) => (
        <Pressable
          key={r.uf.id}
          onPress={() => onChoose(r.uf.id)}
          accessibilityRole="button"
          accessibilityLabel={`${r.name}: ${formatValue(indicator, r.value)}`}
          style={({ pressed }) => [styles.listRow, { opacity: pressed ? 0.6 : 1 }]}>
          <View style={[styles.swatch, { backgroundColor: r.color }]} />
          <Text style={styles.listName}>
            {r.name} <Text color="textMuted">{r.uf.id}</Text>
          </Text>
          <Text tabular color="textSecondary">
            {formatValue(indicator, r.value)}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const RELATION_LABELS: readonly [number, string][] = [
  [40, 'aliado'],
  [10, 'próximo'],
  [-10, 'neutro'],
  [-40, 'distante'],
];

function relationLabel(relation: number): string {
  return RELATION_LABELS.find(([min]) => relation >= min)?.[1] ?? 'hostil';
}

function UfCard({
  row,
  indicator,
  state,
  content,
  explanation,
  onClose,
  onFly,
}: {
  row: UfRow;
  indicator: MapIndicator;
  state: GameState;
  content: GameContent;
  explanation: Parameters<typeof explanationFor>[1];
  onClose: () => void;
  onFly: () => void;
}) {
  const draft = useGame((s) => s.draft);
  const { uf } = row;
  const scenarioUf = content.scenario.regions?.ufs.find((u) => u.id === uf.id);
  const bloc = content.scenario.blocs.find((b) => b.id === scenarioUf?.governor.bloc);
  const national = state.indicators;
  const pieces = explanationFor(indicator, explanation);
  const visit: Decision = { policyId: VISIT_ACTION_ID, agendaCost: 1, params: { uf: uf.id } };
  const included = hasDecision(draft, visit);
  const pointsMax = state.resources.agendaPointsPerMonth;
  const blocked = !included && !fits(draft, visit, content, pointsMax);
  const pointsLeft = pointsMax - draftPoints(draft, content);
  const startShare = scenarioUf?.gdpShare ?? uf.share;

  const metrics: [string, string, string][] = [
    [
      'Crescimento em 12 meses',
      formatPercent(national.gdpGrowth12m + uf.growthGap12m),
      formatPercent(national.gdpGrowth12m),
    ],
    ['Desemprego', formatPercent(uf.unemployment), formatPercent(national.unemployment)],
    ['Aprovação do governo', formatPercent(uf.approval, 0), formatPercent(national.approval, 0)],
    ['PIB per capita (Brasil = 1)', formatNumber(uf.share / row.populationShare, 2), '1,00'],
    ['Participação no PIB', formatPercent(uf.share, 2), `${formatPercent(startShare, 2)} na posse`],
  ];

  return (
    <ScrollView contentContainerStyle={styles.cardContent}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text variant="heading">
            {row.name} <Text color="accent">{uf.id}</Text>
          </Text>
          <Text variant="caption" color="textSecondary">
            Região {REGION_NAMES[row.region] ?? row.region} · governador do bloco {bloc?.name ?? '—'}, relação{' '}
            {relationLabel(uf.governorRelation)} ({formatValue('governador', uf.governorRelation)})
          </Text>
        </View>
        <Button label="Ir" variant="ghost" onPress={onFly} />
        <Button label="Fechar" variant="ghost" onPress={onClose} />
      </View>

      {metrics.map(([label, value, reference]) => (
        <View key={label} style={styles.metric}>
          <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
            {label}
          </Text>
          <Text tabular variant="label">
            {value}
          </Text>
          <Text tabular variant="caption" color="textMuted" style={styles.reference}>
            {reference.includes('posse') ? reference : `Brasil ${reference}`}
          </Text>
        </View>
      ))}

      <Text variant="label">{whyTitle(indicator)}</Text>
      {pieces.length === 0 ? (
        <Text variant="caption" color="textMuted">
          A explicação aparece depois do primeiro mês encerrado.
        </Text>
      ) : (
        pieces.map((p) => (
          <View key={p.cause} style={styles.metric}>
            <Text variant="caption" style={{ flex: 1 }}>
              {p.label}
            </Text>
            <Text tabular variant="caption" color={p.delta >= 0 ? 'positive' : 'negative'}>
              {formatPiece(indicator, p.delta)}
            </Text>
          </View>
        ))
      )}

      <Button
        label={included ? 'Retirar a visita da agenda' : `Visitar o estado (1 ponto; restam ${pointsLeft})`}
        variant={included ? 'secondary' : 'primary'}
        disabled={blocked}
        accessibilityHint={
          blocked
            ? 'Pontos de agenda insuficientes neste mês'
            : 'Aprovação local e relação com o governador sobem; vale ao encerrar o mês'
        }
        onPress={() => gameStore.getState().toggleDecision(visit)}
        block
      />
    </ScrollView>
  );
}

function whyTitle(indicator: MapIndicator): string {
  if (indicator === 'desemprego') return 'Por que o desemprego difere da média nacional';
  if (indicator === 'aprovacao' || indicator === 'governador') return 'Por que a aprovação difere da média nacional';
  return 'Por que a economia está acima ou abaixo da tendência';
}

const styles = StyleSheet.create({
  chips: { position: 'absolute', left: 0, right: 0 },
  chipRow: { paddingHorizontal: Spacing.three, gap: Spacing.two },
  chip: {
    minHeight: 36,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  legend: {
    position: 'absolute',
    bottom: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  swatch: { width: 14, height: 14, borderRadius: 4 },
  card: {
    position: 'absolute',
    bottom: Spacing.three,
    maxHeight: '62%',
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  cardContent: { padding: Spacing.three, gap: Spacing.two },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.one },
  metric: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  reference: { minWidth: 96, textAlign: 'right' },
  list: {
    position: 'absolute',
    bottom: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  listContent: { padding: Spacing.three, gap: Spacing.one },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: MIN_TOUCH },
  listName: { flex: 1 },
});
