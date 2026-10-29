import type { Policy } from '../../types/policy';
import { populationShares, regionsOf } from '../regions/regions';
import type {
  GameContent,
  GameState,
  IdeologyPoint,
  MonthStep,
  ProfileMove,
  ProfileMoveKind,
  ProposalChange,
} from '../types';

import {
  centerByPopulation,
  describeProfile,
  medianVoterOf,
  nationalTermOf,
  normalizedDistance,
  regionalAlignmentOf,
  type ProfileDescription,
} from './alignment';
import { profileParam } from './calibration';

/**
 * Perfil ideológico do governo (PLANO_GLOBO.md §5.1; POLITICAL_RULES.md §11.2). Cada decisão tem posição nos
 * eixos; o perfil é a média móvel com memória `perfil' = (1 − λ)·perfil + λ·alvo`, aplicada decisão a decisão:
 * sancionada ou executada pesa cheio; proposta enviada pesa pouco (intenção); veto total anda ao contrário.
 * Sem sorteio: não consome a semente nem muda a ordem dos sorteios dos demais sistemas.
 */

/** Causas da trilha de proposta (`proposals.ts`) em que a política passa a valer: peso cheio. */
const EXECUTED_CAUSES: ReadonlySet<string> = new Set([
  'ato_executivo',
  'sancao',
  'sancao_tacita',
  'veto_parcial',
  'promulgacao',
  'conversao_mp',
]);
/** Envio ao Congresso (primeira sessão): peso pequeno. */
const SENT_CAUSE = 'enviada';
/** Veto total do presidente: o perfil anda na direção oposta. */
const VETO_CAUSE = 'veto_total';

interface Push {
  sourceId: string;
  kind: ProfileMoveKind;
  label: string;
  position: IdeologyPoint;
  /** +1: o perfil anda para a posição; −1: anda para o oposto dela (veto). */
  sign: 1 | -1;
  /** Peso relativo à sanção (1). */
  weight: number;
  salience: number;
}

const clampAxis = (x: number): number => Math.min(1, Math.max(-1, x));

/**
 * Média móvel com memória: um passo do perfil em direção a `sign · posição`, com λ efetivo
 * `min(memoria_maxima, λ · peso · relevância)`. O resultado fica sempre em [−1, 1].
 */
export function movedProfile(
  profile: IdeologyPoint,
  position: IdeologyPoint,
  weight = 1,
  salience = 1,
  sign: 1 | -1 = 1,
): IdeologyPoint {
  const lambda = Math.min(
    profileParam('memoria_maxima'),
    Math.max(0, profileParam('memoria_decisao') * weight * salience),
  );
  return {
    economic: clampAxis((1 - lambda) * profile.economic + lambda * sign * position.economic),
    social: clampAxis((1 - lambda) * profile.social + lambda * sign * position.social),
  };
}

function pushFromProposal(change: ProposalChange, policy: Policy): Push | null {
  const cause = change.transition.cause;
  const base = { sourceId: policy.id, label: policy.name, position: policy.position, salience: policy.salience ?? 1 };
  if (EXECUTED_CAUSES.has(cause)) return { ...base, kind: 'sancao', sign: 1, weight: 1 };
  if (cause === SENT_CAUSE) return { ...base, kind: 'proposta', sign: 1, weight: profileParam('peso_proposta') };
  if (cause === VETO_CAUSE) return { ...base, kind: 'veto', sign: -1, weight: profileParam('peso_veto') };
  return null;
}

/**
 * Etapa do mês: move o perfil pelas decisões do mês (transições das propostas e escolhas de evento do jogador).
 * Roda depois de `proposalsStep` (que preenche `draft.proposalChanges`) e antes da economia e da opinião, de modo
 * que o termo nacional e a distribuição regional do mês já veem o perfil atualizado. As decisões mais
 * relevantes (maior deslocamento) vão para `draft.profileMoves`.
 */
export const governmentProfileStep: MonthStep = (state, ctx) => {
  const { policies, events } = ctx.content;
  const pushes: Push[] = [];
  for (const change of ctx.draft.proposalChanges) {
    const policy = policies[change.policyId];
    const push = policy ? pushFromProposal(change, policy) : null;
    if (push) pushes.push(push);
  }
  for (const resolved of ctx.draft.eventsResolved) {
    if (resolved.automatic) continue;
    const event = events.find((e) => e.id === resolved.eventId);
    const position = event?.choices.find((c) => c.id === resolved.choiceId)?.position;
    if (event && position) {
      pushes.push({
        sourceId: event.id,
        kind: 'evento',
        label: event.title,
        position,
        sign: 1,
        weight: profileParam('peso_evento'),
        salience: 1,
      });
    }
  }

  let profile = state.government.profile;
  const moves: ProfileMove[] = [];
  for (const push of pushes) {
    const next = movedProfile(profile, push.position, push.weight, push.salience, push.sign);
    const delta = { economic: next.economic - profile.economic, social: next.social - profile.social };
    profile = next;
    if (delta.economic !== 0 || delta.social !== 0) {
      moves.push({ sourceId: push.sourceId, kind: push.kind, label: push.label, delta });
    }
  }
  ctx.draft.profileMoves = topMoves(moves);
  if (profile === state.government.profile) return { state, contributions: [] };
  return { state: { ...state, government: { ...state.government, profile } }, contributions: [] };
};

const magnitude = (m: ProfileMove): number => Math.hypot(m.delta.economic, m.delta.social);

/** As decisões de maior deslocamento, da maior para a menor (empate: ordem em que ocorreram). */
export function topMoves(moves: readonly ProfileMove[]): ProfileMove[] {
  return moves
    .map((m, order) => ({ m, order }))
    .sort((a, b) => magnitude(b.m) - magnitude(a.m) || a.order - b.order)
    .slice(0, profileParam('movimentos_por_mes'))
    .map(({ m }) => m);
}

// ── Leituras para a interface (puras; não sorteiam nem alteram o estado) ───────────────────────────────

/** Eleitor mediano do cenário (média das inclinações das UFs ponderada pela população); `null` sem inclinações. */
export function medianVoter(content: Pick<GameContent, 'scenario'>): IdeologyPoint | null {
  const ufs = regionsOf(content);
  return medianVoterOf(ufs, populationShares(ufs));
}

/** Perfil atual do governo em palavras ("Mercado · Conservador"). */
export function governmentProfileLabel(state: Readonly<Pick<GameState, 'government'>>): ProfileDescription {
  return describeProfile(state.government.profile);
}

export interface UfAlignment {
  /** Sigla da UF. */
  id: string;
  /** Grande região. */
  region: string;
  /** Inclinação política da UF (dado do cenário). */
  lean: IdeologyPoint;
  /** Alinhamento do perfil com a UF, 0–1 (1 = pensam igual). */
  alignment: number;
  /** Alinhamento menos a média ponderada pela população. */
  relative: number;
  /**
   * Desvio de aprovação esperado por este alinhamento em relação à média nacional (fração; média ponderada zero).
   * É o termo que o motor aplica antes da saturação e da normalização regional do mês: leitura, não garantia.
   */
  approvalDeviation: number;
}

export interface AlignmentView {
  profile: IdeologyPoint;
  /** Eleitor mediano (média ponderada das inclinações). */
  median: IdeologyPoint;
  /** Distância normalizada (0–1) entre o perfil e o eleitor mediano. */
  distanceToMedian: number;
  /** Efeito do termo nacional na aprovação (estado estacionário, fração): positivo = ajuda, negativo = pesa. */
  nationalTerm: number;
  /** Alinhamento médio ponderado pela população. */
  meanAlignment: number;
  /** Uma entrada por UF, na ordem do cenário. */
  ufs: UfAlignment[];
}

/**
 * Alinhamento de cada UF com um perfil (padrão: o do governo no estado), mais o eleitor mediano e o termo
 * nacional. `null` quando o cenário não traz inclinações (cenários até a v0.7.0). Base da folha "Perfil do
 * governo" e da camada "Alinhamento" do mapa.
 */
export function alignmentView(
  state: Readonly<Pick<GameState, 'government'> & Partial<Pick<GameState, 'demography'>>>,
  content: Pick<GameContent, 'scenario'>,
  profile: IdeologyPoint = state.government.profile,
): AlignmentView | null {
  const ufs = regionsOf(content);
  const pop = populationShares(ufs, state);
  const median = medianVoterOf(ufs, pop);
  const regional = regionalAlignmentOf(profile, ufs, pop);
  if (!median || !regional) return null;
  const deviations = centerByPopulation(regional.raw, pop);
  return {
    profile,
    median,
    distanceToMedian: normalizedDistance(profile, median),
    nationalTerm: nationalTermOf(profile, median),
    meanAlignment: regional.mean,
    ufs: ufs.map((u, i) => ({
      id: u.id,
      region: u.region,
      lean: u.lean as IdeologyPoint,
      alignment: regional.alignments[i],
      relative: regional.alignments[i] - regional.mean,
      approvalDeviation: deviations[i],
    })),
  };
}

export interface ProfilePushPreview {
  policyId: string;
  /** Posição da política nos eixos. */
  position: IdeologyPoint;
  /** Perfil de hoje e o perfil se a política for sancionada (peso cheio, com a relevância da política). */
  before: IdeologyPoint;
  after: IdeologyPoint;
  /** `after − before`, por eixo. */
  shift: IdeologyPoint;
  /** Perfil de hoje e o de depois, em palavras. */
  descriptionBefore: ProfileDescription;
  descriptionAfter: ProfileDescription;
  /** Termo nacional (fração da aprovação) antes e depois; `null` sem inclinações no cenário. */
  nationalTerm: { before: number; after: number; delta: number } | null;
  /**
   * Mudança no desvio de aprovação de cada UF em relação à média (fração; soma ponderada zero), na ordem do
   * cenário; vazio sem inclinações. Positivo = a UF tende a ganhar aprovação relativa.
   */
  ufs: { id: string; alignmentBefore: number; alignmentAfter: number; deviationDelta: number }[];
  /** As UFs que mais tendem a ganhar e a perder, da maior mudança para a menor (só as que mudam de fato). */
  gainers: string[];
  losers: string[];
  /** Sempre verdadeiro: é estimativa (a política ainda pode não ser aprovada; o resto do perfil também anda). */
  estimate: true;
}

/**
 * Para onde a política empurra o perfil se for sancionada, e quais UFs tendem a ganhar ou perder aprovação
 * relativa pelo alinhamento (PLANO_GLOBO.md §5.2). Estimativa pura: não sorteia, não avança a semente e não
 * altera o estado. `null` se a política não existe no conteúdo.
 */
export function previewProfilePush(
  state: Readonly<Pick<GameState, 'government'> & Partial<Pick<GameState, 'demography'>>>,
  content: Pick<GameContent, 'scenario' | 'policies'>,
  policyId: string,
): ProfilePushPreview | null {
  const policy = content.policies[policyId];
  if (!policy) return null;
  const before = state.government.profile;
  const after = movedProfile(before, policy.position, 1, policy.salience ?? 1);
  const ufs = regionsOf(content);
  const pop = populationShares(ufs, state);
  const median = medianVoterOf(ufs, pop);
  const regionalBefore = regionalAlignmentOf(before, ufs, pop);
  const regionalAfter = regionalAlignmentOf(after, ufs, pop);

  const rows =
    regionalBefore && regionalAfter
      ? (() => {
          const devBefore = centerByPopulation(regionalBefore.raw, pop);
          const devAfter = centerByPopulation(regionalAfter.raw, pop);
          return ufs.map((u, i) => ({
            id: u.id,
            alignmentBefore: regionalBefore.alignments[i],
            alignmentAfter: regionalAfter.alignments[i],
            deviationDelta: devAfter[i] - devBefore[i],
          }));
        })()
      : [];
  const highlight = profileParam('ufs_destacadas_previa');
  const ranked = [...rows].sort((a, b) => b.deviationDelta - a.deviationDelta);
  const nationalBefore = nationalTermOf(before, median);
  const nationalAfter = nationalTermOf(after, median);
  return {
    policyId,
    position: policy.position,
    before,
    after,
    shift: { economic: after.economic - before.economic, social: after.social - before.social },
    descriptionBefore: describeProfile(before),
    descriptionAfter: describeProfile(after),
    nationalTerm: median
      ? { before: nationalBefore, after: nationalAfter, delta: nationalAfter - nationalBefore }
      : null,
    ufs: rows,
    gainers: ranked
      .filter((r) => r.deviationDelta > 0)
      .slice(0, highlight)
      .map((r) => r.id),
    losers: ranked
      .filter((r) => r.deviationDelta < 0)
      .reverse()
      .slice(0, highlight)
      .map((r) => r.id),
    estimate: true,
  };
}
