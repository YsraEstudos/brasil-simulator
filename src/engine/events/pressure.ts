import type { GameContent, GameState } from '../types';

import { IMPEACHMENT_PARAMS as P, RELATION_LIMIT } from './calibration';

/**
 * Pressão de impeachment (POLITICAL_RULES.md §10; FASE_07.md). Função pura do estado: não guarda nada, só lê
 * aprovação, relação com o Congresso, marcas de escândalo e CPI, excesso do limite de despesa e desemprego.
 */

/** Prefixos das marcas que contam como escândalo ou CPI (POLITICAL_RULES.md §9). */
const SCANDAL_PREFIXES = ['escandalo_', 'cpi_'] as const;

/** Média das relações dos blocos com o governo (−100…100). Sem bloco no estado, usa a do cenário. */
export function meanCongressRelation(state: Readonly<GameState>, content: Pick<GameContent, 'scenario'>): number {
  const blocs = content.scenario.blocs;
  if (blocs.length === 0) return 0;
  const total = blocs.reduce((sum, bloc) => {
    const current = state.congress.blocs.find((b) => b.id === bloc.id);
    return sum + (current?.governmentRelation ?? bloc.governmentRelation);
  }, 0);
  return total / blocs.length;
}

/**
 * Quantas marcas de escândalo ou CPI estão gravadas no estado. Uma CPI instalada e depois encerrada é uma só
 * (`cpi_instalada` e `cpi_encerrada` contam como uma marca).
 */
export function scandalFlagCount(state: Readonly<GameState>): number {
  const flags = Object.keys(state.events.flags);
  const count = flags.filter((flag) => SCANDAL_PREFIXES.some((p) => flag.startsWith(p))).length;
  const sameCpi = flags.includes('cpi_instalada') && flags.includes('cpi_encerrada');
  return sameCpi ? count - 1 : count;
}

/**
 * Pressão de impeachment em [0, 1]. Logit = intercepto + termos: baixa aprovação, relação ruim com o Congresso,
 * marcas de escândalo ou CPI (até `escandalos_max`), excesso do limite e desemprego acima do neutro. Cada termo
 * é zero ou cresce monotonicamente com o fator adverso, e a logística satura em 0 e 1.
 */
export function impeachmentPressure(state: Readonly<GameState>, content: Pick<GameContent, 'scenario'>): number {
  const { approval, unemployment } = state.indicators;
  const relation = meanCongressRelation(state, content);
  const scandals = Math.min(scandalFlagCount(state), P.escandalos_max.value);
  const excess = Math.max(0, state.economy.fiscal.limitExcess);
  const jobless = Math.max(0, unemployment - P.desemprego_neutro.value);
  const logit =
    P.intercepto.value +
    P.peso_aprovacao.value * (P.aprovacao_neutra.value - approval) -
    P.peso_relacao.value * (relation / RELATION_LIMIT) +
    P.peso_escandalo.value * scandals +
    P.peso_excesso_limite.value * (excess / P.escala_excesso_limite.value) +
    P.peso_desemprego.value * (jobless / P.escala_desemprego.value);
  return 1 / (1 + Math.exp(-logit));
}
