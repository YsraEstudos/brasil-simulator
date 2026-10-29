import {
  areaLabel,
  PROJECT_BOTTLENECK_LABEL,
  PROJECT_PHASE_LABEL,
  PROPOSAL_STATUS_LABEL,
} from '@/components/campaign/labels';
import { formatMoneyMillions } from '@/components/ui/format';
import type { SectorInvestmentReport, SectorInvestmentRow, SectorProjectRow } from '@/engine';

/**
 * Modelo do cartão "Investimentos por setor" (PLANO_EXPANSAO EX-31): textos e proporções das barras, sem React. A
 * barra de cada setor tem quatro camadas que nunca se somam duas vezes — pago ⊂ contratado ⊂ aprovado — e o anúncio
 * vem depois, separado, porque ainda não é dinheiro autorizado.
 */

export interface StageBar {
  /** Frações da largura total (0–1), já relativas ao maior setor. */
  spent: number;
  contracted: number;
  approved: number;
  announced: number;
}

export interface SectorView {
  sector: string;
  label: string;
  bar: StageBar;
  /** "R$ 3,2 bi pagos de R$ 9,0 bi aprovados". */
  headline: string;
  /** Linha de contexto: no mês, a pagar, manutenção, atrasos. */
  detail: string;
  /** Sem obra aprovada nem anunciada: a linha aparece apagada ("nenhuma obra"), não como falta de dado. */
  empty: boolean;
  accessibilityLabel: string;
  projects: ProjectView[];
  announcements: { key: string; text: string }[];
}

export interface ProjectView {
  key: string;
  name: string;
  phase: string;
  progress: number;
  money: string;
  status: string;
}

export interface SectorPanelView {
  totals: { key: string; label: string; value: string; hint: string }[];
  sectors: SectorView[];
  /** Conferência visível: a soma dos setores é a da carteira. */
  reconciliation: string;
}

const money = formatMoneyMillions;

function projectView(p: SectorProjectRow): ProjectView {
  const parts = [`${money(p.spentMillions)} de ${money(p.approvedMillions)}`];
  if (p.monthSpentMillions > 0) parts.push(`${money(p.monthSpentMillions)} no mês`);
  if (p.phase === 'operacao' && p.maintenanceMillions > 0) parts.push(`manutenção ${money(p.maintenanceMillions)}/ano`);
  const status: string[] = [];
  if (p.delayMonths > 0) status.push(`${p.delayMonths} ${p.delayMonths === 1 ? 'mês' : 'meses'} de atraso`);
  if (p.phase !== 'operacao' && p.phase !== 'cancelado' && p.bottleneck !== 'nenhum')
    status.push(`gargalo: ${PROJECT_BOTTLENECK_LABEL[p.bottleneck]}`);
  return {
    key: p.proposalId,
    name: p.name,
    phase: PROJECT_PHASE_LABEL[p.phase] ?? p.phase,
    progress: p.progress,
    money: parts.join(' · '),
    status: status.join(' · ') || (p.phase === 'operacao' ? 'Em operação' : 'Sem atraso'),
  };
}

function sectorView(r: SectorInvestmentRow, scale: number): SectorView {
  const label = areaLabel(r.sector);
  const empty = r.approvedMillions <= 0 && r.announcedMillions <= 0 && r.spentMillions <= 0;
  const f = (v: number) => (scale > 0 ? Math.max(0, Math.min(1, v / scale)) : 0);
  const headline = empty
    ? 'Nenhuma obra aprovada ou anunciada'
    : r.approvedMillions > 0
      ? `${money(r.spentMillions)} pagos de ${money(r.approvedMillions)} aprovados`
      : r.spentMillions > 0
        ? `${money(r.spentMillions)} pagos em obra cancelada`
        : `${money(r.announcedMillions)} anunciados, ainda sem autorização`;
  const detail: string[] = [];
  if (r.monthSpentMillions > 0) detail.push(`${money(r.monthSpentMillions)} no último mês`);
  if (r.remainingMillions > 0) detail.push(`${money(r.remainingMillions)} a pagar`);
  if (r.maintenanceMillions > 0) detail.push(`manutenção ${money(r.maintenanceMillions)}/ano`);
  if (r.delayedProjects > 0)
    detail.push(`${r.delayedProjects} ${r.delayedProjects === 1 ? 'obra atrasada' : 'obras atrasadas'}`);
  if (r.dominantBottleneck !== 'nenhum') detail.push(`gargalo: ${PROJECT_BOTTLENECK_LABEL[r.dominantBottleneck]}`);
  if (r.announcedMillions > 0 && r.approvedMillions > 0) detail.push(`${money(r.announcedMillions)} anunciados`);
  return {
    sector: r.sector,
    label,
    bar: {
      spent: f(r.spentMillions),
      contracted: f(r.contractedMillions),
      approved: f(r.approvedMillions),
      announced: f(r.announcedMillions),
    },
    headline,
    detail: detail.join(' · '),
    empty,
    accessibilityLabel: [label, headline, ...detail].join('. '),
    projects: r.projects.map(projectView),
    announcements: r.announcements.map((a) => ({
      key: a.proposalId,
      text: `${a.name}: ${money(a.estimatedMillions)} estimados · ${PROPOSAL_STATUS_LABEL[a.status] ?? a.status}`,
    })),
  };
}

export function sectorPanelView(report: SectorInvestmentReport): SectorPanelView {
  // A escala é o maior "aprovado + anunciado" (ou o pago, se uma obra cancelada pagou mais): as barras comparam setores.
  const scale = Math.max(
    0,
    ...report.sectors.map((r) => Math.max(r.approvedMillions + r.announcedMillions, r.spentMillions)),
  );
  const t = report.totals;
  return {
    totals: [
      {
        key: 'announced',
        label: 'Anunciado',
        value: money(t.announcedMillions),
        hint: 'em tramitação, sem autorização',
      },
      { key: 'approved', label: 'Aprovado', value: money(t.approvedMillions), hint: 'obras na carteira' },
      { key: 'contracted', label: 'Contratado', value: money(t.contractedMillions), hint: 'licitação concluída' },
      {
        key: 'spent',
        label: 'Desembolsado',
        value: money(t.spentMillions),
        hint: t.monthSpentMillions > 0 ? `${money(t.monthSpentMillions)} no último mês` : 'nada pago no último mês',
      },
    ],
    sectors: report.sectors.map((r) => sectorView(r, scale)),
    reconciliation: `Soma dos setores = carteira de obras: ${money(t.spentMillions)} desembolsados, ${money(t.remainingMillions)} a pagar e ${money(t.maintenanceMillions)}/ano de manutenção.`,
  };
}
