import type { Bloc } from '../../types/scenario';
import type { BlocState, GameContent, GameState } from '../types';

/** Escala da relação dos blocos com o governo (POLITICAL_RULES.md §6.1). */
export const RELACAO_ESCALA = 100;
export const RELACAO_MIN = -RELACAO_ESCALA;
export const RELACAO_MAX = RELACAO_ESCALA;

/** Relação atual do bloco com o governo (estado; se ausente, a do cenário). */
export function blocRelation(state: Readonly<GameState>, bloc: Bloc): number {
  return state.congress.blocs.find((b) => b.id === bloc.id)?.governmentRelation ?? bloc.governmentRelation;
}

/** Relações de todos os blocos do cenário, na ordem do cenário (completa as que faltam no estado). */
export function allRelations(state: Readonly<GameState>, content: GameContent): BlocState[] {
  return content.scenario.blocs.map((bloc) => ({ id: bloc.id, governmentRelation: blocRelation(state, bloc) }));
}

/** Soma `delta` à relação de um bloco, saturando em −100 … 100. Devolve uma lista nova. */
export function shiftRelation(blocs: readonly BlocState[], blocId: string, delta: number): BlocState[] {
  return blocs.map((b) =>
    b.id === blocId
      ? { ...b, governmentRelation: Math.min(RELACAO_MAX, Math.max(RELACAO_MIN, b.governmentRelation + delta)) }
      : b,
  );
}
