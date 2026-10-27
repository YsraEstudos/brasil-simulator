import { monthOfTerm } from '../calendar';
import { electedOutcome } from '../career/election';
import type { GameState } from '../types';

import { hasFlag } from './events';

/**
 * Desfecho da campanha (GAME_DESIGN.md §7.1; POLITICAL_RULES.md §10, §11.4; FASE_08.md §5). A condenação no
 * Senado grava a marca `impeachment_condenado` e encerra a campanha como derrota; a eleição geral perdida
 * (`derrota_eleitoral`) e a posse de um sucessor sem candidatura do presidente (`fim_de_mandato`) também
 * encerram. Antes da posse, a eleição perdida pelo candidato (`derrota_campanha`, PLANO_CAMPANHA.md Fase C5) encerra
 * a partida com o resumo da campanha. O desfecho é durável: uma vez gravado, a campanha não volta a andar.
 */

/** Marca gravada na condenação por crime de responsabilidade. */
export const IMPEACHMENT_CONVICTION_FLAG = 'impeachment_condenado';

/** Desfechos que encerram a campanha; `null` = a campanha segue. */
export type CampaignOutcome = 'impeachment' | 'derrota_eleitoral' | 'fim_de_mandato' | 'derrota_campanha';

export function campaignOutcome(state: Readonly<GameState>): CampaignOutcome | null {
  const election = state.career?.election;
  if (election && !electedOutcome(election.outcome)) return 'derrota_campanha';
  if (hasFlag(state, IMPEACHMENT_CONVICTION_FLAG)) return 'impeachment';
  const politics = state.politics;
  if (!politics) return null;
  const geral = politics.eleicao_geral;
  // Eleição geral perdida (como candidato ou com o sucessor apoiado).
  if (geral && !geral.venceu) return 'derrota_eleitoral';
  // Posse de novo mandato sem candidatura do presidente: o sucessor governa e o jogo acaba (D1).
  if (state.monthIndex > 0 && monthOfTerm(state.monthIndex) === 0 && !geral?.candidatura) return 'fim_de_mandato';
  return null;
}
