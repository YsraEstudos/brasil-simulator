/**
 * Ordem e filtro da lista de campanhas salvas (PLANO_MENU_SAVES_CONFIG.md M3.4), lembrados na chave
 * `lista_saves_ordem` da tabela `settings`. As fixadas ficam sempre no topo, em qualquer ordem.
 */
export const SAVED_LIST_PREFS_KEY = 'lista_saves_ordem';

/** `recentes`: última jogada (ou atualização) primeiro; `criacao`: criadas mais recentemente primeiro; `nome`: A–Z. */
export const SAVED_LIST_SORTS = ['recentes', 'criacao', 'nome'] as const;
export type SavedListSort = (typeof SAVED_LIST_SORTS)[number];

export const SAVED_LIST_FILTERS = ['todas', 'ativas', 'encerradas'] as const;
export type SavedListFilter = (typeof SAVED_LIST_FILTERS)[number];

export interface SavedListPrefs {
  sort: SavedListSort;
  filter: SavedListFilter;
}

export const DEFAULT_SAVED_LIST_PREFS: SavedListPrefs = { sort: 'recentes', filter: 'todas' };

/** Lê o valor gravado; campo ausente ou desconhecido volta ao padrão. */
export function resolveSavedListPrefs(raw: unknown): SavedListPrefs {
  const v = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    sort: (SAVED_LIST_SORTS as readonly unknown[]).includes(v.sort)
      ? (v.sort as SavedListSort)
      : DEFAULT_SAVED_LIST_PREFS.sort,
    filter: (SAVED_LIST_FILTERS as readonly unknown[]).includes(v.filter)
      ? (v.filter as SavedListFilter)
      : DEFAULT_SAVED_LIST_PREFS.filter,
  };
}
