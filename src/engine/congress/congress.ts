import type { Bloc } from '../../types/scenario';
import type { Instrument, Policy } from '../../types/policy';
import type { Rng } from '../rng';
import type { GameContent, GameState, House, MonthStep, VoteResult } from '../types';

/** STUB — implementado pelo agente do Congresso (POLITICAL_RULES.md §3, §6). Assinaturas são o contrato. */

export interface VoteStage {
  house: House;
  round: number;
  /** Votos "sim" exigidos nesta etapa. */
  required: number;
}

export interface VotePrediction extends VoteStage {
  /** Votos "sim" esperados, sem sorteio. */
  expectedYes: number;
  total: number;
}

/** Primeiro instrumento legislativo da política, ou `null` se ela é só ato do Executivo. */
export function legislativeInstrument(_policy: Policy): Instrument | null {
  throw new Error('não implementado');
}

/** Etapas de votação do instrumento, na ordem (Câmara antes do Senado). */
export function votingPlan(_instrument: Instrument): VoteStage[] {
  throw new Error('não implementado');
}

/** Relação atual do bloco com o governo (estado; se ausente, a do cenário). */
export function blocRelation(_state: Readonly<GameState>, _bloc: Bloc): number {
  throw new Error('não implementado');
}

/** Vota uma etapa, com sorteio pela semente. */
export function voteStage(
  _state: Readonly<GameState>,
  _policy: Policy,
  _stage: VoteStage,
  _content: GameContent,
  _rng: Rng,
): VoteResult {
  throw new Error('não implementado');
}

/** Previsão sem sorteio de cada etapa (mesa de despacho). */
export function predictVotes(_state: Readonly<GameState>, _policy: Policy, _content: GameContent): VotePrediction[] {
  throw new Error('não implementado');
}

/** Etapa mensal: aplica impulsos `relacao_congresso` às relações dos blocos. */
export const congressStep: MonthStep = (state) => ({ state: { ...state }, contributions: [] });
