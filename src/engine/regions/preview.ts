import type { RegionalKey } from '../../types/regions';
import { legislativeInstrument } from '../congress/congress';
import { isNovoBeneficio, vedacaoAtiva } from '../elections/vedacao';
import { fiscalDirection } from '../policyChannels';
import { previewProfilePush, type ProfilePushPreview } from '../politics/profile';
import { reissueBarredPolicies } from '../proposals/proposals';
import type { DecisionRejection, GameContent, GameState } from '../types';

import { adhesionProbabilities, expectedAdhesion, regionsOf, regionsView, ufIncidence } from './regions';

/**
 * Prévia regional de uma decisão (PLANO_GLOBO.md §5.2 e §7 PR 1; ECONOMIC_MODEL.md §5.15; POLITICAL_RULES.md §2.1).
 * Mostra, antes de decidir, para onde o dinheiro ou o tributo da política tende a ir, se é benefício ou custo e,
 * em programa por convênio, a chance de cada governador aderir.
 *
 * Tudo é **estimativa**, nunca garantia: a votação, o sorteio de adesão e as defasagens ainda podem mudar o
 * resultado (ver `uncertain`). Função pura: não sorteia, não avança `state.rng` e não altera o estado.
 */

/** O que ainda pode mudar o que a prévia mostra. */
export type RegionalUncertainty =
  /** Instrumento legislativo: o Congresso ainda vota (POLITICAL_RULES.md §3). */
  | 'votacao_congresso'
  /** Programa por convênio: cada governador adere por sorteio na execução (POLITICAL_RULES.md §2.1). */
  | 'adesao_sorteada'
  /** Algum efeito só chega depois de um ou mais meses (ECONOMIC_MODEL.md §5.11). */
  | 'efeito_defasado';

export interface RegionalPreviewUf {
  /** Sigla da UF. */
  id: string;
  /** Grande região (`norte`, `nordeste`, ...). */
  region: string;
  /** Parcela do dinheiro (ou do tributo) da política que cabe à UF; soma 1 entre as UFs. */
  weight: number;
  /**
   * `weight` ÷ participação da UF na população (1 = média nacional). Só mede concentração quando
   * `differential` é verdadeiro; sem perfil regional é a razão PIB ÷ população.
   */
  perCapitaRatio: number;
  /** Probabilidade de o governador aderir (0–1); `null` se a política não depende de adesão. */
  adhesionProbability: number | null;
}

export interface RegionalDecisionPreview {
  policyId: string;
  /**
   * A política tem perfil regional (`Policy.regional`) e, portanto, efeito diferente entre as UFs. Falso =
   * distribuição proporcional ao PIB de tendência, sem efeito regional diferenciado (ECONOMIC_MODEL.md §5.15).
   */
  differential: boolean;
  /** Chave de distribuição do perfil regional; `null` sem perfil. */
  key: RegionalKey | null;
  /** `benefit` para gasto ou desoneração; `cost` para corte ou tributo (mesmo critério dos pareceres). */
  direction: 'benefit' | 'cost';
  /** Uma entrada por UF, na ordem do cenário. */
  ufs: RegionalPreviewUf[];
  /** Adesão esperada (soma das probabilidades); `null` sem adesão (ou no Casual, em que todos aderem). */
  adhesion: { expectedStates: number; expectedPopulationShare: number } | null;
  /** Defasagem, em meses, dos impactos da política; `null` se nenhum impacto tem magnitude. */
  lagMonths: { earliest: number; longest: number } | null;
  /** Fatores que mantêm o resultado como estimativa. */
  uncertain: RegionalUncertainty[];
  /**
   * Para onde a política empurra o perfil ideológico do governo se for sancionada e quais UFs tendem a ganhar ou
   * perder aprovação relativa pelo alinhamento (PLANO_GLOBO.md §5.2, PR 4). Estimativa; sem inclinações no
   * cenário, `ufs` e `nationalTerm` ficam vazios/nulos (só o perfil se move).
   */
  profilePush: ProfilePushPreview | null;
  /** Impedimento para decidir agora (mesmos motivos do `screenInput`); `null` se nada impede. */
  barred: Extract<DecisionRejection, 'reedicao_vedada' | 'vedacao_eleitoral'> | null;
}

/**
 * Monta a prévia regional da política `policyId`. `null` se o cenário não tem UFs ou a política não existe.
 * Os pesos usam a participação de tendência atual de cada UF, a mesma que a distribuição do mês aplica.
 */
export function buildRegionalDecisionPreview(
  state: Readonly<GameState>,
  content: GameContent,
  policyId: string,
): RegionalDecisionPreview | null {
  const ufs = regionsOf(content);
  const policy = content.policies[policyId];
  if (ufs.length === 0 || !policy) return null;

  const view = regionsView(state, content);
  // Sem perfil, o gasto se reparte pela participação de tendência: nada diferente entre as UFs.
  const regional = policy.regional ?? { key: 'pib' as const, scope: [], boost: {} };
  const incidence = ufIncidence(
    ufs,
    view.map((u) => u.structuralShare),
    regional,
  );

  const hasAdhesion = policy.conditions.includes('adesao_estadual') && state.difficulty !== 'casual';
  const probabilities = hasAdhesion ? adhesionProbabilities(state, content) : null;
  const preview: RegionalPreviewUf[] = ufs.map((u, i) => ({
    id: u.id,
    region: u.region,
    weight: incidence[i].weight,
    perCapitaRatio: incidence[i].ratio,
    adhesionProbability: probabilities ? probabilities[i] : null,
  }));
  const expected = hasAdhesion ? expectedAdhesion(state, content) : null;
  const adhesion = expected
    ? { expectedStates: expected.states, expectedPopulationShare: expected.populationShare }
    : null;

  const lags = policy.impacts.filter((i) => i.magnitude !== 0).map((i) => i.lagMonths);
  const lagMonths = lags.length > 0 ? { earliest: Math.min(...lags), longest: Math.max(...lags) } : null;

  const uncertain: RegionalUncertainty[] = [];
  if (legislativeInstrument(policy) !== null) uncertain.push('votacao_congresso');
  if (hasAdhesion) uncertain.push('adesao_sorteada');
  if (lagMonths && lagMonths.longest > 0) uncertain.push('efeito_defasado');

  let barred: RegionalDecisionPreview['barred'] = null;
  if (reissueBarredPolicies(state, content).has(policyId)) barred = 'reedicao_vedada';
  else if (vedacaoAtiva(state, content) && isNovoBeneficio(policy)) barred = 'vedacao_eleitoral';

  return {
    policyId,
    differential: policy.regional !== undefined,
    key: policy.regional?.key ?? null,
    direction: fiscalDirection(policy),
    ufs: preview,
    adhesion,
    lagMonths,
    uncertain,
    profilePush: previewProfilePush(state, content, policyId),
    barred,
  };
}
