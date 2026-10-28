import { createStore } from 'zustand/vanilla';

import { advanceMonth, type GameContent, type GameState, type MonthInput, type MonthResult } from '@/engine';

/** GameState é serializável; a cópia impede que o laboratório compartilhe objetos com a campanha. */
function copyState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

export interface LearningLabState {
  state: GameState;
  lastResult: MonthResult | null;
  run(input: MonthInput): MonthResult;
  reset(): void;
}

/** Laboratório em memória: nunca abre banco nem grava a campanha real. */
export function createLearningLab(snapshot: GameState, content: GameContent) {
  const baseline = copyState(snapshot);
  return createStore<LearningLabState>((set, get) => ({
    state: copyState(baseline),
    lastResult: null,
    run(input) {
      const result = advanceMonth(copyState(get().state), input, content);
      set({ state: result.state, lastResult: result });
      return result;
    },
    reset() {
      set({ state: copyState(baseline), lastResult: null });
    },
  }));
}
