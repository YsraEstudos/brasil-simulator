import { describe, expect, it } from 'vitest';

import type { SectorInvestmentReport, SectorInvestmentRow } from '@/engine';

import { sectorPanelView } from './sectorInvestmentsView';

function row(sector: string, over: Partial<SectorInvestmentRow> = {}): SectorInvestmentRow {
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
    ...over,
  };
}

function report(sectors: SectorInvestmentRow[]): SectorInvestmentReport {
  const sum = (k: keyof SectorInvestmentReport['totals']) => sectors.reduce((s, r) => s + r[k], 0);
  return {
    monthIndex: 5,
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

// PLANO_EXPANSAO EX-31: aprovado/comprometido/desembolsado distinguíveis; "sem dados" ≠ "nenhuma obra".
describe('cartão de investimentos por setor', () => {
  it('barras em estágios aninhados, na escala do maior setor', () => {
    const view = sectorPanelView(
      report([
        row('infraestrutura', {
          approvedMillions: 9000,
          contractedMillions: 6000,
          spentMillions: 3000,
          remainingMillions: 6000,
          announcedMillions: 1000,
        }),
        row('saude', { approvedMillions: 5000, contractedMillions: 0, spentMillions: 0, remainingMillions: 5000 }),
      ]),
    );
    const [infra, health] = view.sectors;
    expect(infra!.bar).toEqual({ spent: 0.3, contracted: 0.6, approved: 0.9, announced: 0.1 });
    expect(infra!.bar.spent).toBeLessThanOrEqual(infra!.bar.contracted);
    expect(infra!.bar.contracted).toBeLessThanOrEqual(infra!.bar.approved);
    expect(health!.bar.approved).toBeCloseTo(0.5, 9);
    expect(infra!.headline).toBe('R$ 3,0 bi pagos de R$ 9,0 bi aprovados');
    expect(infra!.detail).toContain('R$ 1,0 bi anunciados');
  });

  it('setor sem obra fica apagado com texto próprio, sem barra', () => {
    const view = sectorPanelView(report([row('energia')]));
    expect(view.sectors[0]).toMatchObject({ empty: true, headline: 'Nenhuma obra aprovada ou anunciada' });
    expect(view.sectors[0]!.bar).toEqual({ spent: 0, contracted: 0, approved: 0, announced: 0 });
  });

  it('anúncio sem autorização não aparece como aprovado', () => {
    const view = sectorPanelView(report([row('educacao', { announcedMillions: 600 })]));
    expect(view.sectors[0]!.headline).toBe('R$ 600 mi anunciados, ainda sem autorização');
    expect(view.totals.find((t) => t.key === 'approved')!.value).toBe('R$ 0 mi');
  });

  it('mostra gargalo, atraso, manutenção e a conferência com a carteira', () => {
    const view = sectorPanelView(
      report([
        row('infraestrutura', {
          approvedMillions: 2000,
          spentMillions: 2000,
          monthSpentMillions: 150,
          maintenanceMillions: 80,
          delayedProjects: 1,
          dominantBottleneck: 'orcamento',
          projects: [
            {
              proposalId: 'p',
              policyId: 'x',
              name: 'Ferrovia',
              phase: 'obra',
              progress: 0.42,
              approvedMillions: 2000,
              spentMillions: 900,
              monthSpentMillions: 150,
              remainingMillions: 1100,
              maintenanceMillions: 0,
              delayMonths: 2,
              bottleneck: 'orcamento',
            },
          ],
        }),
      ]),
    );
    const s = view.sectors[0]!;
    expect(s.detail).toBe(
      'R$ 150 mi no último mês · manutenção R$ 80 mi/ano · 1 obra atrasada · gargalo: orçamento disponível',
    );
    expect(s.projects[0]).toMatchObject({
      phase: 'Obra',
      money: 'R$ 900 mi de R$ 2,0 bi · R$ 150 mi no mês',
      status: '2 meses de atraso · gargalo: orçamento disponível',
    });
    expect(view.totals.find((t) => t.key === 'spent')!.hint).toBe('R$ 150 mi no último mês');
    expect(view.reconciliation).toMatch(/^Soma dos setores = carteira de obras: R\$ 2,0 bi desembolsados/);
  });
});
