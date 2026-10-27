import type { Policy } from '../../types/policy';
import type { Bloc } from '../../types/scenario';
import { toCalendar } from '../calendar';
import { meanCongressRelation } from '../events/pressure';
import { keyedFloat } from '../rng';
import type { GameContent, GameState } from '../types';

import { vetoOverrideSupport } from './congress';

/**
 * Pauta-bomba (PLANO_CAMPANHA.md Fase C6c; POLITICAL_RULES.md §7.1): projeto de aumento de despesa ou de renúncia
 * aprovado pelo Congresso **por iniciativa própria**, contra o governo, que chega ao presidente para sanção ou veto.
 * Usa o caminho existente: sanção (ou sanção tácita), veto total e sessão do veto com derrubada por maioria absoluta
 * de cada Casa (§7); executada, a despesa entra no modelo fiscal pelos canais da política (ECONOMIC_MODEL.md §5.11).
 *
 * - **Quem propõe:** o bloco com maior apoio à derrubada de um veto ao texto (`vetoOverrideSupport`): interesse e
 *   afinidade com o texto menos a lealdade ao governo.
 * - **Quando chega:** só com a relação média com o Congresso abaixo de `bomba_relacao_limite`, fora de janeiro
 *   (recesso), pelo menos `bomba_intervalo_meses` depois da anterior; chance mensal cresce com a distância ao limite.
 *   Cada texto do cenário chega no máximo uma vez, na ordem do cenário.
 * - **Sorteio por chave** (`pauta_bomba`, mês): não consome o PRNG principal.
 *
 * Sem `institutions.fiscalBombs` no cenário, o sistema fica desligado.
 */

/** Sal do sorteio da pauta-bomba. Constante publicada: nunca muda. */
const FISCAL_BOMB_SALT = 0x626f6d62;
const JANEIRO = 1;

export function fiscalBombPolicies(content: GameContent): Policy[] {
  return (content.scenario.institutions?.fiscalBombs ?? []).flatMap((id) => {
    const policy = content.policies[id];
    return policy ? [policy] : [];
  });
}

export function isFiscalBomb(content: GameContent, policyId: string): boolean {
  return (content.scenario.institutions?.fiscalBombs ?? []).includes(policyId);
}

/** Último mês em que uma pauta-bomba chegou, ou `null`. */
export function lastFiscalBombMonth(state: Readonly<GameState>, content: GameContent): number | null {
  const months = state.proposals.filter((p) => isFiscalBomb(content, p.policyId)).map((p) => p.createdMonth);
  return months.length > 0 ? Math.max(...months) : null;
}

/** Próximo texto que ainda não chegou, na ordem do cenário, ou `null`. */
export function nextFiscalBomb(state: Readonly<GameState>, content: GameContent): Policy | null {
  const arrived = new Set(state.proposals.map((p) => p.policyId));
  return fiscalBombPolicies(content).find((p) => !arrived.has(p.id)) ?? null;
}

/** Chance da pauta-bomba no mês (0 se não elegível). */
export function fiscalBombChance(state: Readonly<GameState>, content: GameContent): number {
  const c = content.calibration;
  if (!nextFiscalBomb(state, content)) return 0;
  if (toCalendar(state.monthIndex).month === JANEIRO) return 0;
  const last = lastFiscalBombMonth(state, content);
  if (last !== null && state.monthIndex - last < c.bomba_intervalo_meses) return 0;
  const gap = c.bomba_relacao_limite - meanCongressRelation(state, content);
  if (gap <= 0) return 0;
  return Math.min(c.bomba_chance_max, c.bomba_chance_por_ponto * gap);
}

/** Bloco que propõe o texto: o de maior apoio à derrubada de um veto (empate: o primeiro do cenário). */
export function fiscalBombProposer(state: Readonly<GameState>, policy: Policy, content: GameContent): Bloc | null {
  let found: Bloc | null = null;
  let best = Number.NEGATIVE_INFINITY;
  for (const bloc of content.scenario.blocs) {
    const support = vetoOverrideSupport(state, policy, bloc, 'total', content);
    if (support > best) {
      found = bloc;
      best = support;
    }
  }
  return found;
}

/** Sorteio do mês: o texto que chega e quem o propôs, ou `null`. */
export function drawFiscalBomb(
  state: Readonly<GameState>,
  content: GameContent,
): { policy: Policy; proposer: Bloc } | null {
  const chance = fiscalBombChance(state, content);
  if (chance <= 0 || keyedFloat(state.seed, FISCAL_BOMB_SALT, ['pauta_bomba', state.monthIndex]) >= chance) {
    return null;
  }
  const policy = nextFiscalBomb(state, content);
  const proposer = policy ? fiscalBombProposer(state, policy, content) : null;
  return policy && proposer ? { policy, proposer } : null;
}

/** Custo anual em texto (R$ bilhões), para o jogador. */
export function fiscalBombCostText(policy: Policy): string {
  const billions = Math.round(Math.abs(policy.cost.annualMillions) / 100) / 10;
  const text = Number.isInteger(billions) ? String(billions) : billions.toFixed(1).replace('.', ',');
  return `cerca de R$ ${text} bilhões por ano`;
}
