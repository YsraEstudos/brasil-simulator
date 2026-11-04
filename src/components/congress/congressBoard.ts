import type { Proposal, VoteEstimate } from '@/engine';
import type { PolicyKind } from '@/components/campaign/policyCatalogModel';
import type { Bloc } from '@/types/scenario';

import { ALLY_RELATION } from './hemicycle';

/**
 * Votos e base no Congresso (PLANO_QUICK_WINS.md, Fase Q8): placar base × independentes × oposição, elo mais fraco
 * da base, votos que faltam ou sobram em cada etapa e o filtro da lista de propostas. Puro: a tela só desenha.
 */

// ---------------------------------------------------------------------------------------------------------------
// Placar (B38)
// ---------------------------------------------------------------------------------------------------------------

export type Camp = 'base' | 'independentes' | 'oposicao';

export const CAMP_LABEL: Readonly<Record<Camp, string>> = {
  base: 'Base',
  independentes: 'Independentes',
  oposicao: 'Oposição',
};

/**
 * Lado do bloco pelo mesmo corte do hemiciclo: base acima de +`ALLY_RELATION`, oposição abaixo de −`ALLY_RELATION`,
 * independentes no meio.
 */
export function campOf(relation: number): Camp {
  if (relation > ALLY_RELATION) return 'base';
  if (relation < -ALLY_RELATION) return 'oposicao';
  return 'independentes';
}

export interface HouseScore {
  base: number;
  independentes: number;
  oposicao: number;
  total: number;
  /** Votos para maioria absoluta (PL, MP, PLP) e para PEC (3/5). */
  majority: number;
  pec: number;
}

export function houseScore(
  blocs: readonly Bloc[],
  relationOf: (bloc: Bloc) => number,
  seatsOf: (bloc: Bloc) => number,
  quorum: { majority: number; pec: number },
): HouseScore {
  const score: HouseScore = { base: 0, independentes: 0, oposicao: 0, total: 0, ...quorum };
  for (const bloc of blocs) {
    const seats = seatsOf(bloc);
    score[campOf(relationOf(bloc))] += seats;
    score.total += seats;
  }
  return score;
}

/** "Base tem maioria", "Base tem 3/5 (PEC)" ou "Faltam 30 para a maioria". */
export function baseVerdict(score: HouseScore): { text: string; tone: 'positive' | 'warning' | 'negative' } {
  if (score.base >= score.pec) return { text: 'A base sozinha aprova até PEC', tone: 'positive' };
  if (score.base >= score.majority) {
    return { text: `A base tem maioria; para PEC faltam ${score.pec - score.base}`, tone: 'positive' };
  }
  const missing = score.majority - score.base;
  if (score.base + score.independentes >= score.majority) {
    return { text: `Faltam ${missing} para a maioria: depende dos independentes`, tone: 'warning' };
  }
  return { text: `Faltam ${missing} para a maioria, mesmo com os independentes`, tone: 'negative' };
}

// ---------------------------------------------------------------------------------------------------------------
// Elo mais fraco (D38)
// ---------------------------------------------------------------------------------------------------------------

export interface WeakLinkFacts {
  /** Pastas que o bloco ocupa no governo. */
  ministries: number;
  /** O bloco cobra emendas (interesse `emendas` no cenário). */
  demandsAmendments: boolean;
  /** Casas que o bloco preside. */
  presides: readonly string[];
}

export interface WeakLink {
  bloc: Bloc;
  relation: number;
  /** Pontos de relação até deixar a base. */
  margin: number;
  reasons: string[];
}

/**
 * O bloco da base com a relação mais baixa, com o que o torna frágil ou caro de perder. `null` sem base. Empate:
 * o de mais deputados, porque perdê-lo pesa mais.
 */
export function weakestAlly(
  blocs: readonly Bloc[],
  relationOf: (bloc: Bloc) => number,
  factsOf: (bloc: Bloc) => WeakLinkFacts,
  chamber: HouseScore,
): WeakLink | null {
  const allies = blocs.filter((bloc) => campOf(relationOf(bloc)) === 'base');
  if (allies.length === 0) return null;
  const bloc = allies.reduce((a, b) => {
    const diff = relationOf(b) - relationOf(a);
    return diff < 0 || (diff === 0 && b.chamberSeats > a.chamberSeats) ? b : a;
  });
  const relation = relationOf(bloc);
  const margin = Math.max(0, Math.round(relation) - ALLY_RELATION);
  const facts = factsOf(bloc);

  const reasons = [`Está a ${margin} ${margin === 1 ? 'ponto' : 'pontos'} de deixar a base.`];
  const without = chamber.base - bloc.chamberSeats;
  if (chamber.base >= chamber.majority && without < chamber.majority) {
    reasons.push(`Sem os ${bloc.chamberSeats} deputados dele, a base perde a maioria na Câmara.`);
  } else if (chamber.base >= chamber.pec && without < chamber.pec) {
    reasons.push(`Sem os ${bloc.chamberSeats} deputados dele, a base deixa de ter 3/5 para PEC.`);
  }
  if (facts.ministries === 0) reasons.push('Não tem pasta no governo.');
  if (facts.demandsAmendments) reasons.push('Cobra emendas para votar.');
  if (facts.presides.length > 0) reasons.push(`Preside ${facts.presides.join(' e ')}: pode travar a pauta.`);
  return { bloc, relation, margin, reasons };
}

// ---------------------------------------------------------------------------------------------------------------
// Votos que faltam (B33)
// ---------------------------------------------------------------------------------------------------------------

export interface VoteGap {
  text: string;
  tone: 'positive' | 'warning' | 'negative';
}

const votes = (n: number) => `${n} ${n === 1 ? 'voto' : 'votos'}`;

/**
 * "Faltam 8 votos" / "Sobram 20 votos" no Casual; com faixa, "Faltam de 5 a 30 votos" ou "Pode faltar ou sobrar"
 * quando a faixa cruza o quórum. Nunca mais preciso que a estimativa da dificuldade.
 */
export function voteGap(estimate: Pick<VoteEstimate, 'low' | 'high' | 'shown' | 'exact' | 'required'>): VoteGap {
  const { low, high, required } = estimate;
  if (estimate.exact) {
    const diff = estimate.shown - required;
    return diff < 0
      ? { text: `Faltam ${votes(-diff)}`, tone: 'negative' }
      : {
          text: diff === 0 ? 'No limite: nenhum voto de folga' : `Sobram ${votes(diff)}`,
          tone: diff === 0 ? 'warning' : 'positive',
        };
  }
  if (high < required) return { text: `Faltam de ${required - high} a ${votes(required - low)}`, tone: 'negative' };
  if (low >= required) return { text: `Sobram de ${low - required} a ${votes(high - required)}`, tone: 'positive' };
  return { text: 'Pode faltar ou sobrar: a faixa cruza o quórum', tone: 'warning' };
}

// ---------------------------------------------------------------------------------------------------------------
// Filtro das propostas (B35)
// ---------------------------------------------------------------------------------------------------------------

export type ProposalSituation = 'votacao' | 'parada' | 'veto' | 'fora';

export const PROPOSAL_SITUATIONS: readonly { id: ProposalSituation; label: string }[] = [
  { id: 'votacao', label: 'Em votação' },
  { id: 'parada', label: 'Sem pauta' },
  { id: 'veto', label: 'Veto' },
  { id: 'fora', label: 'Fora do Congresso' },
];

/** Tipos que passam pelo Congresso (o decreto não vira proposta). */
export const PROPOSAL_KINDS: readonly PolicyKind[] = ['mp', 'pl', 'pec'];

/** Veto aos acréscimos de lei já em execução ainda aguarda sessão do Congresso. */
export function hasPendingVeto(p: Pick<Proposal, 'veto'>): boolean {
  return p.veto !== null && p.veto.overridden === null;
}

export function situationOf(p: Pick<Proposal, 'status' | 'veto'>): ProposalSituation {
  if (p.status === 'apreciacao_veto' || hasPendingVeto(p)) return 'veto';
  if (p.status === 'em_tramitacao') return 'votacao';
  if (p.status === 'parada') return 'parada';
  return 'fora';
}

export interface ProposalFilter {
  situation: ProposalSituation | null;
  kind: PolicyKind | null;
}

export const NO_PROPOSAL_FILTER: ProposalFilter = { situation: null, kind: null };

export function filterProposals<P extends Pick<Proposal, 'status' | 'veto' | 'policyId'>>(
  proposals: readonly P[],
  filter: ProposalFilter,
  kindOf: (policyId: string) => PolicyKind,
): P[] {
  return proposals.filter(
    (p) =>
      (filter.situation === null || situationOf(p) === filter.situation) &&
      (filter.kind === null || kindOf(p.policyId) === filter.kind),
  );
}

/** Quantas propostas há em cada situação (com o filtro de tipo já aplicado), para os chips. */
export function situationCounts<P extends Pick<Proposal, 'status' | 'veto' | 'policyId'>>(
  proposals: readonly P[],
  kind: PolicyKind | null,
  kindOf: (policyId: string) => PolicyKind,
): Record<ProposalSituation, number> {
  const counts: Record<ProposalSituation, number> = { votacao: 0, parada: 0, veto: 0, fora: 0 };
  for (const p of proposals) if (kind === null || kindOf(p.policyId) === kind) counts[situationOf(p)] += 1;
  return counts;
}
