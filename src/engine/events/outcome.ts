import type { GameState } from '../types';

import { hasFlag } from './events';

/**
 * Desfecho da campanha por eventos (GAME_DESIGN.md §7.1; POLITICAL_RULES.md §10). A condenação no Senado grava a
 * marca `impeachment_condenado` (via `setFlags` do evento de julgamento) e encerra a campanha como derrota.
 */

/** Marca gravada na condenação por crime de responsabilidade. */
export const IMPEACHMENT_CONVICTION_FLAG = 'impeachment_condenado';

/** Desfecho por eventos: `impeachment` encerra a campanha; `null` = a campanha segue. */
export function campaignOutcome(state: Readonly<GameState>): 'impeachment' | null {
  return hasFlag(state, IMPEACHMENT_CONVICTION_FLAG) ? 'impeachment' : null;
}
