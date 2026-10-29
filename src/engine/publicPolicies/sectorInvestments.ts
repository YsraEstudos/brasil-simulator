import type { GameContent, GameState, ProposalStatus } from '../types';
import type { ProjectBottleneck, ProjectPhase } from './types';

/**
 * Painel de investimentos por setor (PLANO_EXPANSAO F16/EX-31). É uma **leitura derivada** da carteira de projetos e
 * das propostas: não cria orçamento paralelo, não altera a simulação e não soma efeito. O setor é a `area` da política
 * no catálogo.
 *
 * Estágios do dinheiro, do mais cedo ao mais tarde (cada valor é um subconjunto do anterior, exceto o anunciado, que
 * ainda não entrou na carteira):
 * - `announced`: propostas de obra em tramitação, ainda sem autorização (valor estimado pela escala e prazo).
 * - `approved`: obras autorizadas que entraram na carteira (custo total aprovado, com sobrecusto se houve).
 * - `contracted`: obras que passaram da licitação (fase obra ou operação).
 * - `spent`: desembolsado de fato, acumulado; `monthSpent`: só no último mês processado.
 *
 * O empenho não é modelado em separado; a interface diz isso em vez de inventar o número.
 */

export interface SectorProjectRow {
  proposalId: string;
  policyId: string;
  name: string;
  phase: ProjectPhase;
  progress: number;
  approvedMillions: number;
  spentMillions: number;
  monthSpentMillions: number;
  /** Ainda a desembolsar; zero em operação e em obra cancelada. */
  remainingMillions: number;
  /** Manutenção anual da obra em operação (R$ milhões nominais). */
  maintenanceMillions: number;
  delayMonths: number;
  bottleneck: ProjectBottleneck;
}

export interface SectorAnnouncement {
  proposalId: string;
  policyId: string;
  name: string;
  status: ProposalStatus;
  estimatedMillions: number;
}

export interface SectorInvestmentRow {
  sector: string;
  announcedMillions: number;
  approvedMillions: number;
  contractedMillions: number;
  spentMillions: number;
  monthSpentMillions: number;
  remainingMillions: number;
  maintenanceMillions: number;
  /** Obras com atraso acumulado (meses de atraso > 0) entre as que não terminaram. */
  delayedProjects: number;
  /** Gargalo mais frequente entre as obras em andamento; `nenhum` sem obra em andamento. */
  dominantBottleneck: ProjectBottleneck;
  projects: SectorProjectRow[];
  announcements: SectorAnnouncement[];
}

export interface SectorInvestmentReport {
  monthIndex: number;
  sectors: SectorInvestmentRow[];
  totals: Omit<SectorInvestmentRow, 'sector' | 'dominantBottleneck' | 'projects' | 'announcements'>;
}

const MONTHS_PER_YEAR = 12;
/** Propostas de obra que ainda podem virar carteira: anúncio sem autorização. */
const ANNOUNCED: readonly ProposalStatus[] = [
  'em_tramitacao',
  'parada',
  'aprovada',
  'aguardando_sancao',
  'apreciacao_veto',
];
const BOTTLENECK_ORDER: readonly ProjectBottleneck[] = ['orcamento', 'capacidade', 'suspensao', 'cronograma'];

function emptyRow(sector: string): SectorInvestmentRow {
  return {
    sector,
    announcedMillions: 0,
    approvedMillions: 0,
    contractedMillions: 0,
    spentMillions: 0,
    monthSpentMillions: 0,
    remainingMillions: 0,
    maintenanceMillions: 0,
    delayedProjects: 0,
    dominantBottleneck: 'nenhum',
    projects: [],
    announcements: [],
  };
}

/**
 * Investimentos por setor no estado atual. Inclui todo setor que tem obra no catálogo do cenário, mesmo sem obra
 * aprovada (linha zerada: "nenhuma obra", não "sem dados"). Ordem: maior valor aprovado primeiro, depois o id.
 */
export function sectorInvestments(state: Readonly<GameState>, content: GameContent): SectorInvestmentReport {
  const publicState = state.publicPolicies;
  const rows = new Map<string, SectorInvestmentRow>();
  const row = (sector: string) => {
    let r = rows.get(sector);
    if (!r) rows.set(sector, (r = emptyRow(sector)));
    return r;
  };
  for (const id of content.scenario.policies) {
    const policy = content.policies[id];
    if (policy?.delivery === 'projeto') row(policy.area);
  }

  const bottlenecks = new Map<string, Map<ProjectBottleneck, number>>();
  const inPortfolio = new Set<string>();
  for (const project of publicState.projects) {
    inPortfolio.add(project.proposalId);
    const policy = content.policies[project.policyId];
    const r = row(policy?.area ?? 'outros');
    const cancelled = project.phase === 'cancelado';
    const finished = project.phase === 'operacao';
    const remaining = cancelled || finished ? 0 : Math.max(0, project.budgetMillions - project.spentMillions);
    const monthSpent = project.monthSpentMillions ?? 0;
    const bottleneck = project.bottleneck ?? 'nenhum';
    r.projects.push({
      proposalId: project.proposalId,
      policyId: project.policyId,
      name: policy?.name ?? project.policyId,
      phase: project.phase,
      progress: project.progress,
      approvedMillions: project.budgetMillions,
      spentMillions: project.spentMillions,
      monthSpentMillions: monthSpent,
      remainingMillions: remaining,
      maintenanceMillions: finished ? project.maintenanceMillions : 0,
      delayMonths: project.delayMonths,
      bottleneck,
    });
    // Obra cancelada não está mais aprovada nem contratada, mas o que foi pago continua pago.
    r.spentMillions += project.spentMillions;
    r.monthSpentMillions += monthSpent;
    if (cancelled) continue;
    r.approvedMillions += project.budgetMillions;
    if (project.phase === 'obra' || finished) r.contractedMillions += project.budgetMillions;
    r.remainingMillions += remaining;
    if (finished) r.maintenanceMillions += project.maintenanceMillions;
    else {
      if (project.delayMonths > 0) r.delayedProjects += 1;
      if (bottleneck !== 'nenhum') {
        const counts = bottlenecks.get(r.sector) ?? new Map<ProjectBottleneck, number>();
        counts.set(bottleneck, (counts.get(bottleneck) ?? 0) + 1);
        bottlenecks.set(r.sector, counts);
      }
    }
  }

  for (const proposal of state.proposals) {
    const policy = content.policies[proposal.policyId];
    if (policy?.delivery !== 'projeto' || inPortfolio.has(proposal.id) || !ANNOUNCED.includes(proposal.status))
      continue;
    const estimated =
      policy.cost.annualMillions * (Math.max(1, policy.timeline.executionMonths) / MONTHS_PER_YEAR) * proposal.scale;
    const r = row(policy.area);
    r.announcedMillions += estimated;
    r.announcements.push({
      proposalId: proposal.id,
      policyId: policy.id,
      name: policy.name,
      status: proposal.status,
      estimatedMillions: estimated,
    });
  }

  for (const [sector, counts] of bottlenecks) {
    let best: ProjectBottleneck = 'nenhum';
    let bestCount = 0;
    for (const b of BOTTLENECK_ORDER) {
      const n = counts.get(b) ?? 0;
      if (n > bestCount) [best, bestCount] = [b, n];
    }
    rows.get(sector)!.dominantBottleneck = best;
  }

  const sectors = [...rows.values()].sort(
    (a, b) => b.approvedMillions - a.approvedMillions || (a.sector < b.sector ? -1 : a.sector > b.sector ? 1 : 0),
  );
  for (const r of sectors)
    r.projects.sort((a, b) => b.approvedMillions - a.approvedMillions || cmp(a.proposalId, b.proposalId));
  const sum = (key: keyof SectorInvestmentReport['totals']) => sectors.reduce((s, r) => s + r[key], 0);
  return {
    monthIndex: state.monthIndex,
    sectors,
    totals: {
      announcedMillions: sum('announcedMillions'),
      approvedMillions: sum('approvedMillions'),
      contractedMillions: sum('contractedMillions'),
      spentMillions: sum('spentMillions'),
      monthSpentMillions: sum('monthSpentMillions'),
      remainingMillions: sum('remainingMillions'),
      maintenanceMillions: sum('maintenanceMillions'),
      delayedProjects: sum('delayedProjects'),
    },
  };
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
