import type { Proposal, ProposalStatus } from '@/engine';

/**
 * Critério de "lei" do relatório de legado (GAME_DESIGN.md §7.1), num só lugar: o relatório, as marcas do gráfico
 * (H5) e a linha do tempo do mandato (PLANO_SAVES_HISTORICO.md H6, A40) contam as mesmas leis. Puro.
 */

/** Situações em que a proposta virou lei: aprovada, em execução ou concluída. */
export const ENACTED_STATUSES: ReadonlySet<ProposalStatus> = new Set<ProposalStatus>([
  'aprovada',
  'em_execucao',
  'concluida',
]);

export interface LegacyProposals<P> {
  approved: P[];
  rejected: P[];
  executed: P[];
}

/** Propostas aprovadas, rejeitadas e executadas pela situação atual, como o relatório de legado as lista. */
export function legacyProposals<P extends Pick<Proposal, 'status'>>(proposals: readonly P[]): LegacyProposals<P> {
  return {
    approved: proposals.filter((p) => ENACTED_STATUSES.has(p.status)),
    rejected: proposals.filter((p) => p.status === 'rejeitada'),
    executed: proposals.filter((p) => p.status === 'em_execucao' || p.status === 'concluida'),
  };
}
