import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { Text } from '@/components/ui';
import { formatPointsDelta } from '@/components/ui/format';
import type { ElectionResult, GameContent, GameState } from '@/engine';
import { REGION_NAMES } from '@/engine';
import { REGION_IDS } from '@/types/regions';
import type { RegionalPoint } from '@/store';
import { useScaledStyles } from '@/hooks/use-scaled-styles';
import { useTheme } from '@/hooks/use-theme';
import { Hud } from './hudTheme';
import { LayerBadge } from './HudBits';
import {
  type LayerBadgeInfo,
  type MapIndicator,
  type UfRow,
  indicatorSpec,
  mapRows,
  formatValue,
} from './regionalMetrics';
import {
  absoluteValue,
  comparisonRows,
  filterUfs,
  rankUfs,
  rankingTitles,
  readingValue,
  regionalSummary,
  ufDescription,
} from './mapReading';

function Search({ query, onChange }: { query: string; onChange: (value: string) => void }) {
  const { textScale } = useTheme();
  return (
    <TextInput
      accessibilityLabel="Buscar UF por sigla ou nome, sem acentos"
      placeholder="Sigla ou nome da UF"
      placeholderTextColor={Hud.textMuted}
      value={query}
      onChangeText={onChange}
      autoCorrect={false}
      style={{
        color: Hud.text,
        fontSize: 14 * textScale,
        padding: 10,
        minHeight: 44,
        borderColor: Hud.border,
        borderWidth: 1,
        borderRadius: 5,
      }}
    />
  );
}
export function ReadingList({
  rows,
  indicator,
  state,
  region,
  onRegion,
  badge,
  onChoose,
}: {
  rows: readonly UfRow[];
  indicator: MapIndicator;
  state: GameState;
  region: string | null;
  onRegion: (region: string | null) => void;
  badge?: LayerBadgeInfo | null;
  onChoose: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const s = useScaledStyles(styles);
  const ranked = rankUfs(indicator, rows);
  const filtered = filterUfs(ranked, region, query);
  const summary = regionalSummary(indicator, filterUfs(rows, region), state);
  const national = regionalSummary(indicator, rows, state);
  const titles = rankingTitles(indicator);
  const rowView = (row: UfRow) => {
    const rank = ranked.find((r) => r.uf.id === row.uf.id)!.rank;
    const description = ufDescription(indicator, row, rank, rows.length, state, badge?.text);
    return (
      <Pressable
        key={row.uf.id}
        accessibilityRole="button"
        accessibilityLabel={description}
        onPress={() => onChoose(row.uf.id)}
        style={s.row}>
        <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: row.color }} />
        <View style={s.body}>
          <Text style={s.name}>
            {row.name} · {row.uf.id}
          </Text>
          <Text style={s.note}>
            {rank}º de {rows.length}
          </Text>
        </View>
        <View style={s.values}>
          <Text tabular style={s.value}>
            {readingValue(indicator, absoluteValue(indicator, row, state))}
          </Text>
          {indicatorSpec(indicator).scale === 'diverging' && (
            <Text style={s.note}>
              {formatValue(indicator, row.value)}{' '}
              {['aprovacao', 'crescimento', 'desemprego'].includes(indicator) ? 'vs. Brasil' : ''}
            </Text>
          )}
        </View>
      </Pressable>
    );
  };
  return (
    <>
      <Text style={s.heading}>Estados · {indicatorSpec(indicator).label}</Text>
      {badge && <LayerBadge badge={badge} />}
      <View style={s.filters}>
        {[null, ...REGION_IDS].map((id) => (
          <Pressable
            key={id ?? 'all'}
            accessibilityRole="button"
            accessibilityState={{ selected: region === id }}
            onPress={() => onRegion(id)}
            style={[s.filter, region === id && { borderColor: Hud.title }]}>
            <Text style={s.value}>{id ? REGION_NAMES[id] : 'Brasil'}</Text>
          </Pressable>
        ))}
      </View>
      {region && summary && national && (
        <Text accessibilityLiveRegion="polite" style={s.name}>
          {REGION_NAMES[region]}: {indicatorSpec(indicator).label} {readingValue(indicator, summary.value)};{' '}
          {indicator === 'renda' || indicator === 'governador' || indicator === 'inclinacao'
            ? formatValue(indicator, summary.value - national.value)
            : formatPointsDelta(summary.value - national.value)}{' '}
          em relação ao Brasil. Média ponderada pela população.
        </Text>
      )}
      <Search query={query} onChange={setQuery} />
      {!query.trim() &&
        [filtered.slice(0, 5), filtered.slice(-5).reverse()].map((group, i) => (
          <View key={titles[i]}>
            <Text style={s.heading}>{titles[i]}</Text>
            {group.map(rowView)}
          </View>
        ))}
      <Text style={s.heading}>Todas as UFs{region ? ` · ${REGION_NAMES[region]}` : ''}</Text>
      {filtered.map(rowView)}
      {filtered.length === 0 && <Text style={s.note}>Nenhuma UF encontrada.</Text>}
    </>
  );
}

export function UfComparison({
  ufId,
  state,
  content,
  history,
  election,
}: {
  ufId: string;
  state: GameState;
  content: GameContent;
  history: readonly RegionalPoint[];
  election: ElectionResult | null;
}) {
  const [open, setOpen] = useState(false);
  const [other, setOther] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const s = useScaledStyles(styles);
  const rows = mapRows('aprovacao', state, content);
  const a = rows.find((r) => r.uf.id === ufId);
  const b = rows.find((r) => r.uf.id === other);
  if (!a) return null;
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setOpen(!open)} style={s.filter}>
        <Text style={s.name}>{open ? 'Fechar comparação' : 'Comparar'}</Text>
      </Pressable>
      {open && (
        <>
          <Search query={query} onChange={setQuery} />
          <Text style={s.note}>Escolha a segunda UF</Text>
          <View style={s.filters}>
            {filterUfs(rows, null, query)
              .filter((r) => r.uf.id !== ufId)
              .map((r) => (
                <Pressable
                  key={r.uf.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Comparar ${a.name} com ${r.name}`}
                  accessibilityState={{ selected: other === r.uf.id }}
                  onPress={() => setOther(r.uf.id)}
                  style={s.filter}>
                  <Text style={s.value}>{r.uf.id}</Text>
                </Pressable>
              ))}
          </View>
          {b && (
            <ScrollView horizontal>
              <View style={{ gap: 10 }}>
                <View style={s.comparisonRow}>
                  <Text style={s.cell}>Indicador</Text>
                  <Text style={s.cell}>{a.name}</Text>
                  <Text style={s.cell}>{b.name}</Text>
                  <Text style={s.cell}>
                    Diferença {a.uf.id} − {b.uf.id}
                  </Text>
                </View>
                {comparisonRows(ufId, b.uf.id, state, content, history, election).map((r) => (
                  <View
                    key={r.id}
                    accessible
                    accessibilityLabel={`${r.label}. ${a.name}: ${r.left.text}, ${r.left.change}. ${b.name}: ${r.right.text}, ${r.right.change}. Diferença: ${r.differenceText}`}
                    style={s.comparisonRow}>
                    <Text style={s.cell}>
                      {r.label}
                      {r.id === 'intencao' ? ' · estimativa' : r.id === 'resultado' ? ' · resultado' : ''}
                    </Text>
                    {[r.left, r.right].map((cell, i) => (
                      <View key={i} style={s.cell}>
                        <Text style={s.value}>{cell.text}</Text>
                        <Text style={s.note}>{cell.change}</Text>
                      </View>
                    ))}
                    <Text style={s.cell}>{r.differenceText}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
          <Text style={s.note}>
            Setas: variação desde o mês passado. Deslize a tabela para comparar. Resultado é fotografia da eleição, sem
            variação mensal.
          </Text>
        </>
      )}
    </>
  );
}
const styles = {
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, minHeight: 48, paddingVertical: 6 },
  body: { flex: 1, minWidth: 100 },
  values: { flexShrink: 1, gap: 2 },
  heading: { fontSize: 12, fontWeight: '800', color: Hud.title, paddingVertical: 8 },
  name: { fontSize: 13, lineHeight: 19, color: Hud.text },
  value: { fontSize: 12, lineHeight: 18, color: Hud.text },
  note: { fontSize: 11, lineHeight: 17, color: Hud.textDim },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filter: {
    minHeight: 44,
    justifyContent: 'center',
    padding: 8,
    borderWidth: 1,
    borderColor: Hud.border,
    borderRadius: 5,
  },
  comparisonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cell: { width: 132, color: Hud.text, fontSize: 12, lineHeight: 18 },
} as const;
