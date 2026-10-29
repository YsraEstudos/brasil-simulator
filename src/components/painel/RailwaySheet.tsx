import { Pressable, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import {
  CONFIDENCE_LABEL,
  corridorLength,
  GAUGE_LABEL,
  GOVERNMENT_STAGE_LABEL,
  lengthText,
  RAILWAY_STYLES,
  segmentDescription,
  STATUS_LABEL,
  statusCounts,
  toggleFilter,
  USAGE_LABEL,
  type RailwayFilter,
  type RailwayLegendEntry,
  type RailwayListRow,
  type RailwayStyleId,
} from '@/components/map/railwayView';
import { Text } from '@/components/ui';
import { Radius } from '@/constants/theme';
import { RAILWAY_STATUSES, RAILWAY_USAGES, type RailwayNetwork } from '@/types/railways';

import { HudBar, SheetHeading } from './HudBits';
import { Hud } from './hudTheme';

/**
 * Folha Ferrovias do Painel (PLANO_EXPANSAO EX-30): a alternativa em lista ao desenho do mapa. Os filtros são os
 * mesmos do mapa (mudar aqui muda lá), cada corredor abre a ficha — uso, bitola, operador, UFs, conexões, extensão,
 * fonte — e os trechos com situação e grau de confiança. Tocar num corredor o destaca no mapa; nada disso altera a
 * simulação.
 */

/** Amostra de linha com o mesmo traço do mapa (cor + padrão), para a legenda e os trechos. */
export function RailSwatch({ styleId, width = 28 }: { styleId: RailwayStyleId; width?: number }) {
  const style = RAILWAY_STYLES[styleId];
  return (
    <Svg width={width} height={10}>
      <Line
        x1={1}
        y1={5}
        x2={width - 1}
        y2={5}
        stroke={style.casing}
        strokeWidth={style.widthPx + 3}
        strokeLinecap="round"
      />
      <Line
        x1={1}
        y1={5}
        x2={width - 1}
        y2={5}
        stroke={style.color}
        strokeWidth={style.widthPx}
        strokeDasharray={style.dash ? style.dash.join(' ') : undefined}
        strokeLinecap={style.dash ? 'butt' : 'round'}
      />
    </Svg>
  );
}

/** Legenda da camada: só os estilos que estão no mapa, e o aviso de traçado esquemático. */
export function RailwayLegend({ entries, caption }: { entries: readonly RailwayLegendEntry[]; caption: string }) {
  return (
    <View
      style={styles.legend}
      accessibilityLabel={`Legenda das ferrovias: ${entries.map((e) => e.label).join(', ')}. ${caption}`}>
      <View style={styles.legendItems}>
        {entries.map((e) => (
          <View key={e.styleId} style={styles.legendItem}>
            <RailSwatch styleId={e.styleId} width={22} />
            <Text style={styles.legendLabel}>{e.label}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.caption}>{caption}</Text>
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
  swatch,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  swatch?: RailwayStyleId;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: active }}
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.75 }]}>
      {swatch && <RailSwatch styleId={swatch} width={16} />}
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

function CorridorCard({
  row,
  expanded,
  onToggle,
  onShowOnMap,
}: {
  row: RailwayListRow;
  expanded: boolean;
  onToggle: () => void;
  onShowOnMap: () => void;
}) {
  const { corridor } = row;
  const statusText = row.hasGovernmentWork ? 'Obra do governo' : STATUS_LABEL[row.headline];
  return (
    <View style={[styles.card, expanded && styles.cardExpanded]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${corridor.name}, ${USAGE_LABEL[corridor.usage]}, ${statusText}. ${expanded ? 'Recolher' : 'Ver ficha e destacar no mapa'}`}
        style={({ pressed }) => [styles.cardHead, pressed && { opacity: 0.8 }]}>
        <View style={styles.cardTag}>
          <Text style={styles.cardTagText}>{corridor.shortName}</Text>
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {corridor.name}
          </Text>
          <Text style={styles.cardSub} numberOfLines={1}>
            {`${USAGE_LABEL[corridor.usage]} · ${corridor.ufs.join(', ')}`}
          </Text>
        </View>
        <RailSwatch styleId={row.hasGovernmentWork ? 'governo_feito' : row.headline} width={22} />
        <Text style={styles.chevron}>{expanded ? '˅' : '›'}</Text>
      </Pressable>
      {expanded && (
        <View style={styles.cardBody}>
          <View style={styles.facts}>
            <Fact label="Extensão" value={lengthText(corridorLength(corridor))} />
            <Fact label="Bitola" value={corridor.gauge ? GAUGE_LABEL[corridor.gauge] : 'Sem dado'} />
            <Fact label="Operador" value={corridor.operator ?? 'Sem operação'} />
            <Fact
              label="Conexões"
              value={corridor.connections.length > 0 ? corridor.connections.join('; ') : 'Sem conexão registrada'}
            />
          </View>
          <SheetHeading text="Trechos" />
          {row.segments.map(({ segment, work, status }) => (
            <View
              key={segment.id}
              style={styles.segment}
              accessible
              accessibilityLabel={segmentDescription(corridor, segment, status, work)}>
              <View style={styles.segmentHead}>
                <RailSwatch
                  styleId={
                    work && work.stage !== 'operacao'
                      ? work.stage === 'proposta'
                        ? 'governo_proposta'
                        : 'governo_feito'
                      : status
                  }
                  width={18}
                />
                <Text style={styles.segmentName} numberOfLines={2}>
                  {segment.name}
                </Text>
              </View>
              <Text style={styles.segmentMeta}>
                {[
                  work ? GOVERNMENT_STAGE_LABEL[work.stage] : STATUS_LABEL[status],
                  CONFIDENCE_LABEL[segment.confidence],
                  segment.lengthKm !== null ? `${segment.lengthKm.toLocaleString('pt-BR')} km` : 'extensão sem dado',
                ].join(' · ')}
              </Text>
              {work?.stage === 'obra' && (
                <View style={styles.progress}>
                  <View style={{ flex: 1 }}>
                    <HudBar value={work.progress} color={RAILWAY_STYLES.governo_feito.color} />
                  </View>
                  <Text style={styles.progressText}>{`${Math.round(work.progress * 100)}% executado`}</Text>
                </View>
              )}
              {segment.note && <Text style={styles.note}>{segment.note}</Text>}
            </View>
          ))}
          <Text style={styles.caption}>{`Fonte: ${corridor.source}`}</Text>
          <Pressable
            onPress={onShowOnMap}
            accessibilityRole="button"
            accessibilityLabel={`Mostrar ${corridor.name} no mapa`}
            style={({ pressed }) => [styles.mapButton, pressed && { opacity: 0.8 }]}>
            <Text style={styles.mapButtonText}>Mostrar no mapa</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export function RailwaySheet({
  network,
  rows,
  filter,
  onFilter,
  legend,
  caption,
  selectedId,
  onSelect,
  onShowOnMap,
  hasGovernmentWorks,
}: {
  network: RailwayNetwork;
  rows: readonly RailwayListRow[];
  filter: RailwayFilter;
  onFilter: (filter: RailwayFilter) => void;
  legend: readonly RailwayLegendEntry[];
  caption: string;
  selectedId: string | null;
  onSelect: (corridorId: string | null) => void;
  onShowOnMap: (corridorId: string) => void;
  /** A carteira tem obra ferroviária (mostra o chip "Obras do governo"). */
  hasGovernmentWorks: boolean;
}) {
  const counts = statusCounts(network, filter.usages);
  return (
    <>
      <Text style={styles.intro}>
        A rede existente e as obras do governo nunca dividem a mesma cor: o verde é sempre a sua carteira.
      </Text>
      <SheetHeading text="Situação" />
      <View style={styles.chips}>
        {RAILWAY_STATUSES.map((status) => (
          <Chip
            key={status}
            label={`${STATUS_LABEL[status]} (${counts[status]})`}
            swatch={status}
            active={filter.statuses.includes(status)}
            onPress={() => onFilter({ ...filter, statuses: toggleFilter(filter.statuses, status, RAILWAY_STATUSES) })}
          />
        ))}
        {hasGovernmentWorks && (
          <Chip
            label="Obras do governo"
            swatch="governo_feito"
            active={filter.government}
            onPress={() => onFilter({ ...filter, government: !filter.government })}
          />
        )}
      </View>
      <SheetHeading text="Uso" />
      <View style={styles.chips}>
        {RAILWAY_USAGES.map((usage) => (
          <Chip
            key={usage}
            label={USAGE_LABEL[usage]}
            active={filter.usages.includes(usage)}
            onPress={() => onFilter({ ...filter, usages: toggleFilter(filter.usages, usage, RAILWAY_USAGES) })}
          />
        ))}
      </View>
      <RailwayLegend entries={legend} caption={caption} />
      <SheetHeading text={`Corredores (${rows.length})`} />
      {rows.length === 0 && <Text style={styles.note}>Nenhum corredor com esses filtros.</Text>}
      {rows.map((row) => (
        <CorridorCard
          key={row.corridor.id}
          row={row}
          expanded={selectedId === row.corridor.id}
          onToggle={() => onSelect(selectedId === row.corridor.id ? null : row.corridor.id)}
          onShowOnMap={() => onShowOnMap(row.corridor.id)}
        />
      ))}
      <Text style={styles.caption}>{network.source}</Text>
    </>
  );
}

const styles = {
  intro: { color: Hud.textDim, fontSize: 11, lineHeight: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Hud.tileBorder,
    backgroundColor: Hud.tile,
    opacity: 0.6,
  },
  chipActive: { borderColor: Hud.title, opacity: 1 },
  chipLabel: { color: Hud.textDim, fontSize: 11, fontWeight: '600' },
  chipLabelActive: { color: Hud.text },
  legend: {
    gap: 4,
    padding: 8,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Hud.divider,
    backgroundColor: '#0a120d',
  },
  legendItems: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendLabel: { color: Hud.textDim, fontSize: 10 },
  caption: { color: Hud.textMuted, fontSize: 9.5, lineHeight: 13 },
  card: {
    borderWidth: 1,
    borderColor: Hud.tileBorder,
    borderRadius: Radius.sm,
    backgroundColor: Hud.tile,
    overflow: 'hidden',
  },
  cardExpanded: { borderColor: Hud.title },
  cardHead: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  cardTag: {
    minWidth: 40,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: '#22301f',
    alignItems: 'center',
  },
  cardTagText: { color: Hud.title, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4 },
  cardTitle: { color: Hud.text, fontSize: 12, fontWeight: '700' },
  cardSub: { color: Hud.textMuted, fontSize: 10 },
  chevron: { color: Hud.textMuted, fontSize: 16, fontWeight: '700', width: 12, textAlign: 'center' },
  cardBody: {
    gap: 6,
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: Hud.divider,
    paddingTop: 8,
  },
  facts: { gap: 4 },
  fact: { flexDirection: 'row', gap: 8 },
  factLabel: { color: Hud.textMuted, fontSize: 10.5, width: 66 },
  factValue: { flex: 1, color: Hud.text, fontSize: 10.5 },
  segment: { gap: 2, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#1c2619' },
  segmentHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  segmentName: { flex: 1, color: Hud.text, fontSize: 11, fontWeight: '600' },
  segmentMeta: { color: Hud.textDim, fontSize: 10, paddingLeft: 24 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 24 },
  progressText: { color: Hud.textDim, fontSize: 9.5 },
  note: { color: Hud.textMuted, fontSize: 10, fontStyle: 'italic', paddingLeft: 24 },
  mapButton: {
    alignSelf: 'flex-start',
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: Hud.title,
    marginTop: 2,
  },
  mapButtonText: { color: Hud.board, fontSize: 12, fontWeight: '800' },
} as const;
