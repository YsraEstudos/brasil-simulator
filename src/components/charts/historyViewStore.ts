import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import type { DeltaBasis, SeriesPeriod } from '@/components/painel/indicatorSeries';

/**
 * Escolhas de leitura do histórico (PLANO_SAVES_HISTORICO.md, Fase H4), guardadas na memória do app como o filtro
 * do catálogo: o período dos gráficos e a base das variações (no mês ou desde a posse). Não vão para o banco.
 */
interface HistoryViewState {
  period: SeriesPeriod;
  deltaBasis: DeltaBasis;
  setPeriod: (period: SeriesPeriod) => void;
  setDeltaBasis: (basis: DeltaBasis) => void;
}

export const historyViewStore = createStore<HistoryViewState>((set) => ({
  period: 'mandato',
  deltaBasis: 'mes',
  setPeriod: (period) => set({ period }),
  setDeltaBasis: (deltaBasis) => set({ deltaBasis }),
}));

export function useHistoryView(): HistoryViewState {
  return useStore(historyViewStore);
}
