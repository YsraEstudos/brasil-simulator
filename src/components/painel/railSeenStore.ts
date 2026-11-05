import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import type { RailSeen } from './railNews';

/**
 * O que o jogador já viu em cada partida (B24): o último relatório aberto e os ocupantes dos ministérios na última
 * vez que abriu a gaveta. Fica na memória do app, como o "visto" das Notícias; reabrir o app começa do zero.
 */
interface RailSeenState {
  byCampaign: Readonly<Record<string, RailSeen>>;
  mark: (campaignId: string, patch: Partial<RailSeen>, initial: RailSeen) => void;
}

const railSeenStore = createStore<RailSeenState>((set) => ({
  byCampaign: {},
  mark: (campaignId, patch, initial) =>
    set((s) => {
      const prev = s.byCampaign[campaignId] ?? initial;
      const next = { ...prev, ...patch };
      if (s.byCampaign[campaignId] && next.report === prev.report && next.ministries === prev.ministries) return s;
      return { byCampaign: { ...s.byCampaign, [campaignId]: next } };
    }),
}));

export function useRailSeen(): RailSeenState {
  return useStore(railSeenStore);
}
