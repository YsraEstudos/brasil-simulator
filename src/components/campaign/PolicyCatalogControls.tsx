import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ministryIcon } from '@/components/painel/HudBits';
import { Text } from '@/components/ui';
import { MIN_TOUCH, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { FilterChip, Icon, ICONS, type IconName } from './GabineteBits';
import {
  areaFilterLabel,
  CATALOG_COSTS,
  CATALOG_SORTS,
  POLICY_KIND_LABEL,
  POLICY_KINDS,
  type AreaFilter,
  type CatalogQuery,
} from './policyCatalogModel';

/**
 * Controles do catálogo do Gabinete (PLANO_QUICK_WINS.md, Fase Q6): busca com botão de filtros, faixa de áreas com
 * contador, painel de tipo, custo, "cabe agora" e ordem, e a linha de resultados. Só desenham: o estado mora no
 * `catalogQueryStore` e as contas no `policyCatalogModel`.
 */

type Update = (patch: Partial<CatalogQuery>) => void;

/** Campo de busca e botão "Filtros" com quantos filtros estão ligados. */
export function CatalogToolbar({
  search,
  filterCount,
  panelOpen,
  onSearch,
  onTogglePanel,
}: {
  search: string;
  filterCount: number;
  panelOpen: boolean;
  onSearch: (text: string) => void;
  onTogglePanel: () => void;
}) {
  const { colors, textScale } = useTheme();
  const highlighted = panelOpen || filterCount > 0;
  return (
    <View style={styles.toolbar}>
      <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Icon name={ICONS.search} size={18} color="textMuted" />
        <TextInput
          value={search}
          onChangeText={onSearch}
          placeholder="Buscar por nome, área ou tipo"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Buscar decisões por nome, área ou tipo, sem acentos"
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={[styles.searchInput, { color: colors.text, fontSize: 15 * textScale }]}
        />
        {search !== '' && (
          <Pressable
            onPress={() => onSearch('')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Apagar a busca"
            style={styles.clearSearch}>
            <Icon name={ICONS.remove} size={16} color="textSecondary" />
          </Pressable>
        )}
      </View>
      <Pressable
        onPress={onTogglePanel}
        accessibilityRole="button"
        accessibilityState={{ expanded: panelOpen }}
        accessibilityLabel={
          filterCount > 0
            ? `Filtros e ordem, ${filterCount} ${filterCount === 1 ? 'filtro ligado' : 'filtros ligados'}`
            : 'Filtros e ordem'
        }
        style={({ pressed }) => [
          styles.filterButton,
          {
            borderColor: highlighted ? colors.accent : colors.border,
            backgroundColor: panelOpen ? colors.surfaceRaised : colors.surface,
          },
          pressed && styles.pressed,
        ]}>
        <Icon name={ICONS.filter} size={20} color={highlighted ? 'accent' : 'textSecondary'} />
        <Text variant="caption" color={highlighted ? 'accent' : 'textSecondary'} style={styles.bold}>
          Filtros
        </Text>
        {filterCount > 0 && (
          <View style={[styles.counter, { backgroundColor: colors.accent }]}>
            <Text variant="caption" color="onAccent" style={styles.counterText}>
              {filterCount}
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

/** Faixa de áreas com o número de decisões em andamento em cada uma ("Saúde · 3"). */
export function AreaFilterRow({
  areas,
  selected,
  onSelect,
}: {
  areas: readonly AreaFilter[];
  selected: string | null;
  onSelect: (area: string | null) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.areas}
      accessibilityLabel="Filtrar por área. O número diz quantas decisões estão em andamento">
      <FilterChip label="Todas" icon={ICONS.decisions} active={selected === null} onPress={() => onSelect(null)} />
      {areas.map((area) => (
        <FilterChip
          key={area.id}
          label={area.name}
          icon={ministryIcon([area.id])}
          count={area.active}
          accessibilityLabel={areaFilterLabel(area)}
          active={selected === area.id}
          onPress={() => onSelect(selected === area.id ? null : area.id)}
        />
      ))}
    </ScrollView>
  );
}

/** Painel que abre pelo botão "Filtros": tipo, custo, "cabe agora" e ordem. */
export function CatalogFilterPanel({
  query,
  actionsLeft,
  onChange,
}: {
  query: CatalogQuery;
  actionsLeft: number;
  onChange: Update;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <FilterGroup title="Tipo" hint="Decreto vale ao encerrar o mês; MP, projeto de lei e PEC passam pelo Congresso.">
        <FilterChip label="Todos" active={query.kind === null} onPress={() => onChange({ kind: null })} />
        {POLICY_KINDS.map((kind) => (
          <FilterChip
            key={kind}
            label={POLICY_KIND_LABEL[kind].short}
            icon={kind === 'decreto' ? ICONS.executive : ICONS.congress}
            accessibilityLabel={POLICY_KIND_LABEL[kind].long}
            active={query.kind === kind}
            onPress={() => onChange({ kind: query.kind === kind ? null : kind })}
          />
        ))}
      </FilterGroup>

      <FilterGroup title="Custo em ações de agenda">
        <FilterChip label="Qualquer" active={query.cost === null} onPress={() => onChange({ cost: null })} />
        {CATALOG_COSTS.map((cost) => (
          <FilterChip
            key={cost}
            label={cost === 1 ? '1 ação' : `${cost} ações`}
            icon={ICONS.actions}
            active={query.cost === cost}
            onPress={() => onChange({ cost: query.cost === cost ? null : cost })}
          />
        ))}
      </FilterGroup>

      <Pressable
        onPress={() => onChange({ onlyAffordable: !query.onlyAffordable })}
        accessibilityRole="switch"
        accessibilityState={{ checked: query.onlyAffordable }}
        accessibilityLabel={`Mostrar só o que cabe agora: ${actionsLeft} ${actionsLeft === 1 ? 'ação livre' : 'ações livres'}`}
        style={({ pressed }) => [styles.toggle, { borderColor: colors.border }, pressed && styles.pressed]}>
        <Icon
          name={query.onlyAffordable ? ICONS.checkboxOn : ICONS.checkboxOff}
          size={22}
          color={query.onlyAffordable ? 'accent' : 'textSecondary'}
        />
        <View style={styles.grow}>
          <Text variant="label">O que posso pagar agora</Text>
          <Text variant="caption" color="textSecondary">
            {`Esconde o que pede mais que ${actionsLeft === 1 ? 'a 1 ação livre' : `as ${actionsLeft} ações livres`} ou já está em andamento. Desligado, o que não cabe só fica esmaecido.`}
          </Text>
        </View>
      </Pressable>

      <FilterGroup title="Ordenar por" icon={ICONS.sort}>
        {CATALOG_SORTS.map((sort) => (
          <FilterChip
            key={sort.id}
            label={sort.label}
            accessibilityLabel={`Ordenar por ${sort.label.toLowerCase()}`}
            active={query.sort === sort.id}
            onPress={() => onChange({ sort: sort.id })}
          />
        ))}
      </FilterGroup>
    </View>
  );
}

function FilterGroup({
  title,
  hint,
  icon,
  children,
}: {
  title: string;
  hint?: string;
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={title}>
      <View style={styles.groupTitle}>
        {icon && <Icon name={icon} size={14} color="textMuted" />}
        <Text variant="caption" color="textMuted" style={styles.groupTitleText}>
          {title.toUpperCase()}
        </Text>
      </View>
      <View style={styles.chips}>{children}</View>
      {hint && (
        <Text variant="caption" color="textSecondary">
          {hint}
        </Text>
      )}
    </View>
  );
}

/** "8 de 24 decisões · Limpar filtros", anunciado ao leitor de tela quando muda. */
export function CatalogResultsBar({
  label,
  filtering,
  onClear,
}: {
  label: string;
  filtering: boolean;
  onClear: () => void;
}) {
  return (
    <View style={styles.results}>
      <Text variant="caption" color="textSecondary" accessibilityLiveRegion="polite" style={styles.bold}>
        {label}
      </Text>
      {filtering && (
        <Pressable onPress={onClear} hitSlop={8} accessibilityRole="button" accessibilityLabel="Limpar busca e filtros">
          <Text variant="caption" color="accent" style={styles.bold}>
            Limpar filtros
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/** Nada encontrado: diz por quê e oferece o caminho de volta. */
export function CatalogEmpty({ onClear }: { onClear: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.empty, { borderColor: colors.border }]}>
      <Icon name={ICONS.search} size={28} color="textMuted" />
      <Text variant="label" align="center">
        Nenhuma decisão com esses filtros
      </Text>
      <Text variant="caption" color="textSecondary" align="center">
        Tente outra palavra ou desligue algum filtro.
      </Text>
      <Pressable
        onPress={onClear}
        accessibilityRole="button"
        style={({ pressed }) => [styles.emptyButton, { borderColor: colors.accent }, pressed && styles.pressed]}>
        <Text variant="label" color="accent">
          Limpar busca e filtros
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'stretch', gap: Spacing.two },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    minHeight: MIN_TOUCH,
  },
  searchInput: { flex: 1, paddingVertical: Spacing.two, minWidth: 0 },
  clearSearch: { padding: Spacing.half },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    minHeight: MIN_TOUCH,
  },
  counter: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  counterText: { fontWeight: '700', fontSize: 11, lineHeight: 14 },
  areas: { gap: Spacing.one, paddingVertical: Spacing.half },
  panel: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.three },
  group: { gap: Spacing.one },
  groupTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  groupTitleText: { fontWeight: '700', letterSpacing: 0.6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two,
    minHeight: MIN_TOUCH,
  },
  grow: { flex: 1, gap: Spacing.half },
  results: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  empty: {
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Radius.lg,
    padding: Spacing.four,
  },
  emptyButton: {
    marginTop: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
  },
  bold: { fontWeight: '600' },
  pressed: { opacity: 0.75 },
});
