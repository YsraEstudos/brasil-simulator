import { useStore } from 'zustand';

import { openDatabase } from '@/database/openDatabase';

import { createGameStore, type GameStoreState } from './gameStore';

/** Store do app, ligada ao banco do aparelho. */
export const gameStore = createGameStore({ openDb: () => openDatabase(), random: Math.random });

export function useGame<T>(selector: (s: GameStoreState) => T): T {
  return useStore(gameStore, selector);
}

export type { ActiveCampaign, GameStoreState } from './gameStore';
export type { IndicatorPoint, RegionalPoint, RegionalUfValues } from '@/database/campaignRepository';
export * from './agendaDraft';
export type { NewCampaignResult } from './gameStore';
export * from './campaignSetup';
export * from './mapQuality';
export * from './mapDayTime';
