import { shortMonthLabel } from '@/components/campaign/labels';
import type { PolicyKind } from '@/components/campaign/policyCatalogModel';
import type { House, Proposal, VoteResult } from '@/engine';

/**
 * Histórico de votações do Congresso (PLANO_SAVES_HISTORICO.md, Fase H6, A39): cada votação registrada nas propostas
 * (`Proposal.votes`), com Casa, turno, placar, quórum e o voto de cada bloco. Filtros por resultado e por tipo, com os
 * mesmos tipos da Q8 (`PROPOSAL_KINDS`). Puro: a tela só desenha.
 */

export const HOUSE_NAME: Readonly<Record<House, string>> = { camara: 'Câmara', senado: 'Senado' };

/** `votacao`: votação do texto; `veto`: sessão conjunta que aprecia o veto (aprovar = derrubar o veto). */
export type VoteSessionKind = 'votacao' | 'veto';

export type VoteOutcome = 'aprovada' | 'rejeitada';

export interface BlocVoteLine {
  blocId: string;
  name: string;
  yes: number;
  no: number;
  /** Como a maioria do bloco votou ("sim", "não" ou empate). */
  side: 'sim' | 'nao' | 'empate';
}

export interface VoteHistoryEntry {
  /** Identidade estável: `<proposta>:<posição da votação>`. */
  id: string;
  proposalId: string;
  policyName: string;
  kind: PolicyKind;
  session: VoteSessionKind;
  monthIndex: number;
  house: House;
  round: number;
  yes: number;
  no: number;
  required: number;
  approved: boolean;
  /** "Aprovada", "Rejeitada", "Veto derrubado" ou "Veto mantido". */
  resultLabel: string;
  /** "3/5 (PEC)" ou "maioria absoluta". */
  quorumLabel: string;
  /** "Câmara, 1º turno · 320 a 150 · precisava de 308" */
  summary: string;
  blocs: BlocVoteLine[];
}

const VETO_CAUSES = new Set(['veto_derrubado', 'veto_mantido']);

/** A votação foi a sessão do veto? A trilha registra, no mesmo mês, a derrubada ou a manutenção. */
function sessionKind(proposal: Pick<Proposal, 'history'>, vote: VoteResult): VoteSessionKind {
  return proposal.history.some((t) => t.monthIndex === vote.monthIndex && VETO_CAUSES.has(t.cause))
    ? 'veto'
    : 'votacao';
}

function resultLabel(session: VoteSessionKind, approved: boolean): string {
  if (session === 'veto') return approved ? 'Veto derrubado' : 'Veto mantido';
  return approved ? 'Aprovada' : 'Rejeitada';
}

function blocSide(yes: number, no: number): BlocVoteLine['side'] {
  return yes > no ? 'sim' : no > yes ? 'nao' : 'empate';
}

export const BLOC_SIDE_LABEL: Readonly<Record<BlocVoteLine['side'], string>> = {
  sim: 'votou sim',
  nao: 'votou não',
  empate: 'dividido',
};

/**
 * Todas as votações da partida, da mais recente para a mais antiga (no mesmo mês, na ordem em que aconteceram,
 * invertida). `kindOf` dá o tipo da política; `blocName`, o nome do bloco.
 */
export function voteHistory(
  proposals: readonly Pick<Proposal, 'id' | 'policyId' | 'votes' | 'history'>[],
  policyName: (policyId: string) => string,
  kindOf: (policyId: string) => PolicyKind,
  blocName: (blocId: string) => string,
): VoteHistoryEntry[] {
  const entries: VoteHistoryEntry[] = [];
  for (const p of proposals) {
    const kind = kindOf(p.policyId);
    p.votes.forEach((v, i) => {
      const session = sessionKind(p, v);
      const turno = kind === 'pec' && session === 'votacao' ? `, ${v.round}º turno` : '';
      const where = session === 'veto' ? `Sessão do veto, ${HOUSE_NAME[v.house]}` : `${HOUSE_NAME[v.house]}${turno}`;
      entries.push({
        id: `${p.id}:${i}`,
        proposalId: p.id,
        policyName: policyName(p.policyId),
        kind,
        session,
        monthIndex: v.monthIndex,
        house: v.house,
        round: v.round,
        yes: v.yes,
        no: v.no,
        required: v.required,
        approved: v.approved,
        resultLabel: resultLabel(session, v.approved),
        quorumLabel: kind === 'pec' && session === 'votacao' ? '3/5 (PEC)' : 'maioria absoluta',
        summary: `${where} · ${v.yes} a ${v.no} · precisava de ${v.required}`,
        blocs: v.blocs.map((b) => ({
          blocId: b.blocId,
          name: blocName(b.blocId),
          yes: b.yes,
          no: b.no,
          side: blocSide(b.yes, b.no),
        })),
      });
    });
  }
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => b.entry.monthIndex - a.entry.monthIndex || b.index - a.index)
    .map((x) => x.entry);
}

export interface VoteFilter {
  outcome: VoteOutcome | null;
  kind: PolicyKind | null;
}

export const NO_VOTE_FILTER: VoteFilter = { outcome: null, kind: null };

export const VOTE_OUTCOMES: readonly { id: VoteOutcome; label: string; symbol: string }[] = [
  { id: 'aprovada', label: 'Aprovadas', symbol: '✓' },
  { id: 'rejeitada', label: 'Rejeitadas', symbol: '✕' },
];

/** O placar atingiu o quórum? (Na sessão do veto, "aprovada" = o Congresso derrubou o veto.) */
export function outcomeOf(entry: Pick<VoteHistoryEntry, 'approved'>): VoteOutcome {
  return entry.approved ? 'aprovada' : 'rejeitada';
}

export function filterVotes(entries: readonly VoteHistoryEntry[], filter: VoteFilter): VoteHistoryEntry[] {
  return entries.filter(
    (e) =>
      (filter.outcome === null || outcomeOf(e) === filter.outcome) && (filter.kind === null || e.kind === filter.kind),
  );
}

/** Quantas votações há em cada resultado (com o filtro de tipo já aplicado), para os chips. */
export function outcomeCounts(
  entries: readonly VoteHistoryEntry[],
  kind: PolicyKind | null,
): Record<VoteOutcome, number> {
  const counts: Record<VoteOutcome, number> = { aprovada: 0, rejeitada: 0 };
  for (const e of entries) if (kind === null || e.kind === kind) counts[outcomeOf(e)] += 1;
  return counts;
}

/** Texto do leitor de tela de uma votação, com o mês. */
export function voteAccessibilityLabel(entry: VoteHistoryEntry): string {
  return `${entry.policyName}, ${shortMonthLabel(entry.monthIndex)}: ${entry.resultLabel}. ${entry.summary}, quórum de ${entry.quorumLabel}.`;
}
