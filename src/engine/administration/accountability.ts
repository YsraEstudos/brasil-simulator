import { toMonthIndex } from '../calendar';
import type { DebtCommitment } from '../career/commitments';
import type { GameContent, GameState, ProposalStatus } from '../types';

/**
 * Prestação de contas (PLANO_EXPANSAO EX-18). Lê o que o governo prometeu — a prioridade do PPA, as marcas de governo
 * e os compromissos de campanha — e devolve, para cada promessa, um estado com **evidência** do que o país mostra no
 * fim. Não cria promessa nova, não altera orçamento e não soma efeito: é uma leitura derivada da carteira, das leis e
 * do Congresso.
 *
 * Estados: `cumprida` (entregue), `parcial` (algo executado, sem entrega), `abandonada` (havia caminho e não andou) e
 * `inviavel` (faltou autorização ou o Congresso recusou). O impacto não é fixo: cada item traz o número que o
 * sustenta.
 */

export type PromiseStatus = 'cumprida' | 'parcial' | 'abandonada' | 'inviavel';

export interface PromiseAccount {
  /** `${origem}:${sourceId}`, único no relatório. */
  id: string;
  /** O que foi prometido, em uma frase. */
  promise: string;
  source: 'ppa' | 'marca' | 'compromisso';
  sourceId: string;
  status: PromiseStatus;
  /** O que o estado final mostra: valores, contagens e situação, sem juízo. */
  evidence: string;
}

const PRIORITY_LABEL: Record<string, string> = {
  saude: 'Saúde',
  educacao: 'Educação',
  infraestrutura: 'Infraestrutura',
};

const PROPOSAL_LABEL: Record<ProposalStatus, string> = {
  bloqueada: 'bloqueada',
  em_tramitacao: 'em tramitação',
  parada: 'parada no Congresso',
  rejeitada: 'rejeitada pelo Congresso',
  aprovada: 'aprovada, sem execução',
  aguardando_sancao: 'aguardando sanção',
  apreciacao_veto: 'com veto em apreciação',
  vetada: 'vetada',
  em_execucao: 'em execução',
  concluida: 'concluída',
  suspensa: 'suspensa',
  abandonada: 'abandonada',
};

const money = (value: number): string => `R$ ${value.toFixed(1)} mi`;

function statusOfProposal(status: ProposalStatus): PromiseStatus {
  if (status === 'concluida') return 'cumprida';
  if (status === 'em_execucao') return 'parcial';
  if (status === 'rejeitada' || status === 'vetada' || status === 'bloqueada') return 'inviavel';
  return 'abandonada';
}

function ppaAccounts(state: Readonly<GameState>, content: GameContent): PromiseAccount[] {
  const laws = state.publicPolicies.budgetLaws ?? [];
  const ppas = laws.filter((law) => law.kind === 'ppa');
  const loas = laws.filter((law) => law.kind === 'loa');
  return ppas.map((ppa) => {
    const label = PRIORITY_LABEL[ppa.priority] ?? ppa.priority;
    const startMonth = toMonthIndex({ year: ppa.year, month: 1 });
    const endMonth = toMonthIndex({ year: ppa.year + 4, month: 1 });
    const authorized = loas.some((loa) => loa.year >= ppa.year && loa.year < ppa.year + 4);
    const projects = state.publicPolicies.projects.filter((project) => {
      const area = content.policies[project.policyId]?.area;
      return area === ppa.priority && project.startMonth >= startMonth && project.startMonth < endMonth;
    });
    const spent = projects.reduce((sum, project) => sum + project.spentMillions, 0);
    const operating = projects.filter((project) => project.phase === 'operacao').length;
    const period = `${ppa.year}–${ppa.year + 3}`;

    let status: PromiseStatus;
    let evidence: string;
    if (!authorized) {
      status = 'inviavel';
      evidence = `Sem LOA sancionada no período ${period}: a prioridade não teve autorização anual.`;
    } else if (operating > 0) {
      status = 'cumprida';
      evidence = `${operating} obra(s) de ${label.toLowerCase()} em operação; ${money(spent)} desembolsados no período.`;
    } else if (spent > 0) {
      status = 'parcial';
      evidence = `${money(spent)} desembolsados em ${projects.length} obra(s), nenhuma em operação no período.`;
    } else {
      status = 'abandonada';
      evidence = `LOA sancionada no período ${period}, mas nenhum desembolso em ${label.toLowerCase()}.`;
    }
    return {
      id: `ppa:${ppa.proposalId}`,
      promise: `Prioridade do PPA ${period}: ${label}`,
      source: 'ppa' as const,
      sourceId: ppa.proposalId,
      status,
      evidence,
    };
  });
}

function brandAccounts(state: Readonly<GameState>): PromiseAccount[] {
  const proposals = new Map(state.proposals.map((proposal) => [proposal.id, proposal]));
  const projects = new Map(state.publicPolicies.projects.map((project) => [project.proposalId, project]));
  return state.publicPolicies.brands.map((brand) => {
    const proposal = proposals.get(brand.proposalId);
    const project = projects.get(brand.proposalId);
    if (!proposal) {
      return {
        id: `marca:${brand.proposalId}`,
        promise: `Marca de governo: ${brand.name}`,
        source: 'marca' as const,
        sourceId: brand.proposalId,
        status: 'abandonada' as const,
        evidence: 'A proposta da marca não está mais no histórico do governo.',
      };
    }
    const phase = project?.phase;
    let status: PromiseStatus;
    let evidence: string;
    if (phase === 'operacao') {
      status = 'cumprida';
      evidence = `Obra em operação; ${money(project!.spentMillions)} desembolsados.`;
    } else if (phase === 'cancelado') {
      status = 'abandonada';
      evidence = `Obra cancelada; ${money(project?.spentMillions ?? 0)} desembolsados até o cancelamento.`;
    } else if ((project?.spentMillions ?? 0) > 0) {
      status = 'parcial';
      evidence = `Obra em ${phase ?? 'execução'}; ${money(project!.spentMillions)} desembolsados, sem operação.`;
    } else {
      status = statusOfProposal(proposal.status);
      evidence = `Proposta ${PROPOSAL_LABEL[proposal.status]}, sem desembolso na carteira.`;
    }
    return {
      id: `marca:${brand.proposalId}`,
      promise: `Marca de governo: ${brand.name}`,
      source: 'marca' as const,
      sourceId: brand.proposalId,
      status,
      evidence,
    };
  });
}

function commitmentAccounts(state: Readonly<GameState>): PromiseAccount[] {
  const commitments: readonly DebtCommitment[] = state.career?.commitments ?? [];
  return commitments.map((commitment, index) => {
    const paid = commitment.initialAmount - commitment.remaining;
    let status: PromiseStatus;
    let evidence: string;
    if (commitment.status === 'cumprido') {
      status = 'cumprida';
      evidence = `${money(commitment.initialAmount)} pagos até o prazo do mês ${commitment.deadline}.`;
    } else if (commitment.status === 'expirado') {
      status = 'abandonada';
      evidence = `Prazo do mês ${commitment.deadline} venceu com ${money(commitment.remaining)} em aberto.`;
    } else if (paid > 0) {
      status = 'parcial';
      evidence = `${money(paid)} pagos de ${money(commitment.initialAmount)}; ${money(commitment.remaining)} em aberto.`;
    } else {
      status = 'abandonada';
      evidence = `Nenhum pagamento até o fim; ${money(commitment.remaining)} em aberto.`;
    }
    return {
      id: `compromisso:${index}`,
      promise: `Compromisso de campanha: ${commitment.origin}`,
      source: 'compromisso' as const,
      sourceId: String(index),
      status,
      evidence,
    };
  });
}

/** Prestação de contas do governo no estado final, na ordem: PPA, marcas e compromissos. */
export function accountability(state: Readonly<GameState>, content: GameContent): PromiseAccount[] {
  return [...ppaAccounts(state, content), ...brandAccounts(state), ...commitmentAccounts(state)];
}
