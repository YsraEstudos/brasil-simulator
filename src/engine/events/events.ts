import type { MonthStep } from '../types';

/** STUB — implementado pelo agente de eventos (GAME_DESIGN.md §11.3). */
export const resolveEventsStep: MonthStep = (state) => ({ state: { ...state }, contributions: [] });
export const triggerEventsStep: MonthStep = (state) => ({ state: { ...state }, contributions: [] });
