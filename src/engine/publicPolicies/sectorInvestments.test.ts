import { describe, expect, it } from 'vitest';

import { TEST_DECREE, testContent, testState } from '@/tests/fixtures';
import type { GameContent, GameState, Proposal, StepContext } from '@/engine/types';
import { createRng } from '@/engine/rng';
import type { Policy } from '@/types/policy';

import { checkPublicPolicies, publicPoliciesStep } from './publicPolicies';
import { sectorInvestments } from './sectorInvestments';
import { initialPublicPolicies } from './types';

const base: Policy = {
  ...TEST_DECREE,
  id: 'projeto_setor_transporte',
  area: 'infraestrutura',
  delivery: 'projeto',
  instruments: ['ato_execucao'],
  cost: { annualMillions: 1_200, disbursementProfile: [1] },
  timeline: { planningMonths: 0, expectedLegislativeMonths: 0, executionMonths: 6, maturationMonths: 0 },
  impacts: [{ channel: 'investimento_publico', magnitude: 1_200, lagMonths: 0 }],
  project: { licensingMonths: 0, procurementMonths: 0, efficiency: 1, annualMaintenanceRate: 0.04 },
};
const health: Policy = { ...base, id: 'projeto_setor_saude', area: 'saude' };
const school: Policy = { ...base, id: 'projeto_setor_escola', area: 'educacao' };

function content(): GameContent {
  const c = testContent();
  return testContent({
    policies: { ...c.policies, [base.id]: base, [health.id]: health, [school.id]: school },
    scenario: { ...c.scenario, policies: [...c.scenario.policies, base.id, health.id, school.id] },
  });
}

function proposal(id: string, policyId: string, status: Proposal['status'], executionStart: number | null): Proposal {
  return {
    id,
    policyId,
    createdMonth: 0,
    status,
    scale: 1,
    voteMonth: null,
    stage: 0,
    rapporteur: null,
    textAltered: false,
    postponements: 0,
    negotiation: { blocs: {}, amendments: false, textConceded: false, urgency: false },
    rider: 0,
    veto: null,
    judicial: null,
    executionStart,
    executionEnd: null,
    adherents: null,
    votes: [],
    history: [],
  } as Proposal;
}

function ctx(c: GameContent, s: GameState): StepContext {
  return {
    content: c,
    decisions: [],
    eventChoices: [],
    rng: createRng(s.rng),
    draft: { proposalChanges: [], eventsResolved: [], eventsFired: [], notes: [], copom: null, regional: null },
  } as StepContext;
}

/** Duas obras em execução (transporte e saúde) e uma de educação ainda em tramitação. */
function start(c: GameContent): GameState {
  const s = testState(3, 'estrategica', c);
  return {
    ...s,
    proposals: [
      proposal('p_transporte', base.id, 'em_execucao', 0),
      proposal('p_saude', health.id, 'em_execucao', 0),
      proposal('p_escola', school.id, 'em_tramitacao', null),
    ],
    publicPolicies: initialPublicPolicies(),
  } as GameState;
}

function run(months: number) {
  const c = content();
  let s = start(c);
  for (let m = 0; m < months; m++) {
    const out = publicPoliciesStep(s, ctx(c, s));
    s = { ...out.state, monthIndex: s.monthIndex + 1 } as GameState;
  }
  return { c, s };
}

// PLANO_EXPANSAO EX-31: "totais conciliam com fonte fiscal/carteira; aprovado/comprometido/desembolsado distinguíveis".
describe('investimentos por setor', () => {
  it('concilia setor a setor com a carteira e não conta obra duas vezes', () => {
    const { c, s } = run(4);
    expect(checkPublicPolicies(s)).toEqual([]);
    const report = sectorInvestments(s, c);
    const projects = s.publicPolicies.projects;
    expect(projects).toHaveLength(2);
    const spent = projects.reduce((sum, p) => sum + p.spentMillions, 0);
    expect(spent).toBeGreaterThan(0);
    expect(report.totals.spentMillions).toBeCloseTo(spent, 6);
    expect(report.totals.approvedMillions).toBeCloseTo(
      projects.reduce((sum, p) => sum + p.budgetMillions, 0),
      6,
    );
    // Cada obra aparece em um único setor.
    const listed = report.sectors.flatMap((r) => r.projects.map((p) => p.proposalId));
    expect(listed.sort()).toEqual(['p_saude', 'p_transporte']);
    for (const r of report.sectors) {
      expect(r.spentMillions).toBeLessThanOrEqual(r.approvedMillions + 1e-6);
      expect(r.remainingMillions).toBeCloseTo(r.approvedMillions - r.spentMillions, 6);
    }
  });

  it('o desembolso do mês é o que entrou na carteira e o que o fiscal recebeu, obra a obra', () => {
    const c = content();
    let s = start(c);
    for (let m = 0; m < 3; m++) {
      const before = s.publicPolicies.projects.reduce((sum, p) => sum + p.spentMillions, 0);
      const out = publicPoliciesStep(s, ctx(c, s));
      const report = sectorInvestments(out.state, c);
      const after = out.state.publicPolicies.projects.reduce((sum, p) => sum + p.spentMillions, 0);
      expect(report.totals.monthSpentMillions).toBeCloseTo(after - before, 6);
      // Um impulso de investimento por obra paga no mês, proporcional ao valor pago (mesmo PIB para as duas).
      const rows = report.sectors.flatMap((r) => r.projects).filter((p) => p.monthSpentMillions > 0);
      const impulses = out.state.impulses.filter(
        (i) => i.target === 'gasto.investimento' && i.startMonth === s.monthIndex && i.sourceId.includes(':obra:'),
      );
      expect(impulses.map((i) => i.sourceId.split(':')[1]).sort()).toEqual(rows.map((p) => p.proposalId).sort());
      const ratio = (id: string) =>
        impulses.find((i) => i.sourceId.includes(id))!.delta /
        rows.find((p) => p.proposalId === id)!.monthSpentMillions;
      if (rows.length === 2) expect(ratio('p_saude')).toBeCloseTo(ratio('p_transporte'), 12);
      s = { ...out.state, monthIndex: s.monthIndex + 1 } as GameState;
    }
  });

  it('anúncio em tramitação não é aprovado nem desembolsado', () => {
    const { c, s } = run(2);
    const report = sectorInvestments(s, c);
    const education = report.sectors.find((r) => r.sector === 'educacao')!;
    expect(education.announcements.map((a) => a.proposalId)).toEqual(['p_escola']);
    expect(education.announcedMillions).toBeCloseTo((1_200 * 6) / 12, 6);
    expect(education.approvedMillions).toBe(0);
    expect(education.spentMillions).toBe(0);
    expect(report.totals.announcedMillions).toBeCloseTo(education.announcedMillions, 6);
  });

  it('obra concluída sai do saldo a pagar e passa a ter manutenção', () => {
    const { c, s } = run(14);
    const report = sectorInvestments(s, c);
    const transport = report.sectors.find((r) => r.sector === 'infraestrutura')!;
    const row = transport.projects[0]!;
    expect(row.phase).toBe('operacao');
    expect(row.remainingMillions).toBe(0);
    expect(transport.contractedMillions).toBeCloseTo(transport.approvedMillions, 6);
    expect(transport.maintenanceMillions).toBeGreaterThan(0);
    expect(transport.maintenanceMillions).toBeCloseTo(row.maintenanceMillions, 6);
  });

  it('obra cancelada sai do aprovado, mas o que foi pago continua pago', () => {
    const { c, s } = run(3);
    const cancelled = {
      ...s,
      publicPolicies: {
        ...s.publicPolicies,
        projects: s.publicPolicies.projects.map((p) =>
          p.proposalId === 'p_saude' ? { ...p, phase: 'cancelado' as const } : p,
        ),
      },
    } as GameState;
    const before = sectorInvestments(s, c).sectors.find((r) => r.sector === 'saude')!;
    const after = sectorInvestments(cancelled, c).sectors.find((r) => r.sector === 'saude')!;
    expect(after.approvedMillions).toBe(0);
    expect(after.remainingMillions).toBe(0);
    expect(after.spentMillions).toBeCloseTo(before.spentMillions, 6);
  });

  it('ler o painel não altera o estado (leitura derivada)', () => {
    const { c, s } = run(3);
    const frozen = JSON.stringify(s);
    sectorInvestments(s, c);
    expect(JSON.stringify(s)).toBe(frozen);
  });

  it('lista setores do catálogo sem obra como linha zerada, não como "sem dados"', () => {
    const c = content();
    const report = sectorInvestments(testState(3, 'estrategica', c), c);
    const sectors = report.sectors.map((r) => r.sector);
    expect(sectors).toEqual(expect.arrayContaining(['infraestrutura', 'saude', 'educacao']));
    expect(report.totals.approvedMillions).toBe(0);
  });
});
