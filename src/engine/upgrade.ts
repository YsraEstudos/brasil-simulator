import { DEFAULT_CALIBRATION } from './economy/calibration';
import { initialEconomy } from './state';
import { STATE_SCHEMA_VERSION, type GameState } from './types';

/** O save foi gravado com uma estrutura de estado mais nova que a deste app. */
export class SaveTooNewError extends Error {
  constructor(readonly saveVersion: number) {
    super(`save com estado v${saveVersion}, app conhece até v${STATE_SCHEMA_VERSION}`);
    this.name = 'SaveTooNewError';
  }
}

type Raw = Record<string, unknown>;

/**
 * Atualiza um estado salvo para a estrutura atual (AI_INSTRUCTIONS.md §3: saves antigos são atualizados, não
 * recusados). Cada passo converte uma versão na seguinte; só saves **mais novos** que o app são recusados.
 */
export function upgradeGameState(version: number, raw: unknown): GameState {
  if (version > STATE_SCHEMA_VERSION) throw new SaveTooNewError(version);
  let state = raw as Raw;
  if (version < 2) state = v1ToV2(state);
  return state as unknown as GameState;
}

/**
 * v1 (Fase 01) → v2 (Fase 02): entram economia, Congresso, propostas, fila de impulsos e eventos.
 * Os saves v1 são do cenário fictício, que não tem bloco econômico: usa os valores provisórios padrão.
 * `congress.blocs` vazio = relação de cada bloco igual à do cenário (o Congresso cria a entrada ao mudar).
 */
function v1ToV2(s: Raw): Raw {
  return {
    ...s,
    schemaVersion: 2,
    economy: initialEconomy(null, DEFAULT_CALIBRATION),
    congress: { blocs: [] },
    proposals: [],
    impulses: [],
    events: { pending: [], lastFired: {}, count: {} },
  };
}
