import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import { DEFAULT_CATALOG_QUERY, type CatalogQuery } from './policyCatalogModel';

/**
 * Busca, filtros e ordem do catálogo do Gabinete, guardados na memória do app (PLANO_QUICK_WINS.md, Fase Q6): a
 * escolha sobrevive à troca de aba e ao fechar e reabrir o Gabinete, mas não vai para o banco.
 */
interface CatalogQueryState {
  query: CatalogQuery;
  update: (patch: Partial<CatalogQuery>) => void;
  /** Limpa busca e filtros; mantém a ordem, que não esconde nada. */
  clear: () => void;
}

const catalogQueryStore = createStore<CatalogQueryState>((set) => ({
  query: DEFAULT_CATALOG_QUERY,
  update: (patch) => set((s) => ({ query: { ...s.query, ...patch } })),
  clear: () => set((s) => ({ query: { ...DEFAULT_CATALOG_QUERY, sort: s.query.sort } })),
}));

export function useCatalogQuery(): CatalogQueryState {
  return useStore(catalogQueryStore);
}
