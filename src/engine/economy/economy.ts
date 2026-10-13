import type { MonthStep } from '../types';

/** STUB — implementado pelo agente da economia (ECONOMIC_MODEL.md §4–5). */
export const economyStep: MonthStep = (state) => ({ state: { ...state }, contributions: [] });
