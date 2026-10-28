import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { parsePolicy, type Policy } from '@/types/policy';
import { scenarioTaxationSchema, type ScenarioTaxation } from '@/types/scenario';

import { advanceMonth } from '../advanceMonth';
import { fiscalStructure, revenueMonth } from '../economy/fiscal';
import { activeImpulses } from '../impulses';
import { checkInvariants } from '../invariants';
import { IMPULSE_TARGET } from '../proposals/proposals';
import { adviseDecision } from '../report/dispatch';
import { societyStep } from '../society';
import { createInitialState, currentNominalGdpMillions } from '../state';
import { REVENUE_GROUPS, type GameState, type ScheduledImpulse } from '../types';

import { reformEstimate } from './incidence';
import { subnationalTransitionAt, taxBases, tributeShares } from './taxBases';

// PLANO_EXPANSAO EX-11/12; ECONOMIC_MODEL.md §5.7.1: bases tributárias conciliadas e reformas com distribuição.

const content = loadContent(DEFAULT_SCENARIO_ID);
const start = (): GameState => createInitialState({ content, difficulty: 'estrategica', seed: 7 });
const EPS = 1e-12;

/** Impulsos permanentes equivalentes aos impactos tributários da política, a partir do mês `month`. */
function taxImpulses(policy: Policy, state: GameState, month: number): ScheduledImpulse[] {
  const gdp = currentNominalGdpMillions(state, content);
  return policy.impacts
    .filter((i) => IMPULSE_TARGET[i.channel].startsWith('receita.'))
    .map((i) => ({
      sourceId: `teste:${policy.id}`,
      label: policy.name,
      target: IMPULSE_TARGET[i.channel],
      delta: i.magnitude / gdp,
      startMonth: month + i.lagMonths,
      endMonth: null,
    }));
}

describe('bases tributárias conciliadas (EX-11)', () => {
  it('em 36 meses com uma reforma em vigor, cada base fecha da carga legal à receita líquida', () => {
    let s = start();
    s = { ...s, impulses: [...s.impulses, ...taxImpulses(content.policies.tributacao_dividendos, s, 2)] };
    for (let i = 0; i < 36; i++) {
      const out = advanceMonth(s, { decisions: [] }, content);
      expect(checkInvariants(s, out.state, out.report, content)).toEqual([]);
      s = out.state;
      const rows = taxBases(s, content);
      expect(Math.abs(rows.reduce((sum, r) => sum + r.net, 0) - s.economy.revenue)).toBeLessThan(EPS);
      for (const r of rows) {
        // A composição em tributos reparte só a carga legal do cenário, uma única vez.
        expect(Math.abs(r.tributes.reduce((sum, t) => sum + t.legal, 0) - r.detail.base)).toBeLessThan(EPS);
      }
    }
    // A medida nova aparece como carga de política na renda, não somada a um tributo do cenário.
    const renda = taxBases(s, content).find((r) => r.group === 'renda')!;
    expect(renda.detail.policy).toBeGreaterThan(0);
  });

  it('a carga de política é a soma dos impulsos de receita ativos do grupo', () => {
    const s0 = start();
    const impulses = taxImpulses(content.policies.imposto_seletivo_ampliacao, s0, 0);
    const s = { ...s0, impulses: [...s0.impulses, ...impulses] };
    const structure = fiscalStructure({
      revenue: s.economy.revenue,
      primarySpending: s.economy.primarySpending,
      ...currentFiscalValues(),
    });
    const r = revenueMonth(s, structure, 0, content.calibration);
    const active = activeImpulses(s.impulses, s.monthIndex, ['receita.consumo', 'receita.desoneracao_consumo']);
    const expected = active.reduce((sum, i) => sum + (i.target === 'receita.consumo' ? i.delta : -i.delta), 0);
    expect(r.detail.consumo.policy).toBeCloseTo(expected, 12);
    for (const g of REVENUE_GROUPS) {
      const d = r.detail[g];
      expect(d.base + d.policy + d.cycle - d.loss - d.transfers).toBeCloseTo(r.byGroup[g], 12);
    }
  });

  it('carga legal maior não vira arrecadação proporcional: o retorno decrescente limita o caixa', () => {
    const s0 = start();
    const policy = content.policies.imposto_seletivo_ampliacao;
    const structure = fiscalStructure({
      revenue: s0.economy.revenue,
      primarySpending: s0.economy.primarySpending,
      ...currentFiscalValues(),
    });
    const net = (times: number) => {
      const extra = Array.from({ length: times }, () => taxImpulses(policy, s0, 0)).flat();
      return revenueMonth({ ...s0, impulses: [...s0.impulses, ...extra] }, structure, 0, content.calibration).total;
    };
    const base = net(0);
    // Dentro da margem sem perda o ganho por dose é constante; acima dela, cada dose rende menos.
    const gains = [1, 16, 64].map((k) => (net(k) - base) / k);
    expect(gains[1]).toBeLessThan(gains[0]);
    expect(gains[2]).toBeLessThan(gains[1]);
  });

  it('transição de tributos: cada fase reparte 100% do grupo; o esquema recusa dupla cobrança', () => {
    const transition = (cbs2029: number): unknown => ({
      status: 'FICTICIO',
      note: 'teste',
      legalBasis: 'teste',
      subnationalTransition: [{ fromYear: 2027, ibsShare: 0 }],
      tributes: [
        ...['renda', 'folha', 'outras', 'royalties'].map((group) => ({
          id: `t_${group}`,
          name: group,
          group,
          phases: [{ fromYear: 2026, share: 1 }],
          legalBasis: 'teste',
        })),
        {
          id: 'pis_cofins',
          name: 'PIS/Cofins',
          group: 'consumo',
          phases: [
            { fromYear: 2026, share: 1 },
            { fromYear: 2027, share: 0 },
          ],
          legalBasis: 'teste',
        },
        {
          id: 'cbs',
          name: 'CBS',
          group: 'consumo',
          phases: [
            { fromYear: 2026, share: 0 },
            { fromYear: 2027, share: cbs2029 },
          ],
          legalBasis: 'teste',
        },
      ],
    });
    const ok = scenarioTaxationSchema.safeParse(transition(1));
    expect(ok.success).toBe(true);
    const rules = ok.data as ScenarioTaxation;
    expect(tributeShares(rules, 'consumo', 2026).map((t) => t.id)).toEqual(['pis_cofins']);
    expect(tributeShares(rules, 'consumo', 2027).map((t) => t.id)).toEqual(['cbs']);
    // Antes da primeira fase, vale a primeira; depois da última, a última.
    expect(tributeShares(rules, 'consumo', 2020).map((t) => t.id)).toEqual(['pis_cofins']);
    expect(tributeShares(rules, 'consumo', 2040).map((t) => t.id)).toEqual(['cbs']);
    const doubled = scenarioTaxationSchema.safeParse({
      ...(transition(1) as object),
      tributes: (transition(1) as { tributes: { id: string; phases: unknown[] }[] }).tributes.map((t) =>
        t.id === 'pis_cofins' ? { ...t, phases: [{ fromYear: 2026, share: 1 }] } : t,
      ),
    });
    expect(doubled.success).toBe(false);
    expect(scenarioTaxationSchema.safeParse(transition(0.5)).success).toBe(false);
  });

  it('o cenário atual declara a transição ICMS/ISS → IBS da LC 214/2025, sempre somando a carga inteira', () => {
    const rules = content.scenario.taxation;
    expect(rules).toBeDefined();
    expect(subnationalTransitionAt(rules, 2028)).toEqual({ ibs: 0, legacy: 1 });
    expect(subnationalTransitionAt(rules, 2029)!.ibs).toBeCloseTo(0.1, 12);
    expect(subnationalTransitionAt(rules, 2032)!.ibs).toBeCloseTo(0.4, 12);
    expect(subnationalTransitionAt(rules, 2033)).toEqual({ ibs: 1, legacy: 0 });
    for (let year = 2027; year <= 2040; year++) {
      const t = subnationalTransitionAt(rules, year)!;
      expect(t.ibs + t.legacy).toBeCloseTo(1, 12);
    }
  });
});

describe('reformas com distribuição (EX-12)', () => {
  it('tributar dividendos pesa mais nos ricos, em duas fases; o Seletivo pesa mais nos pobres', () => {
    const s = start();
    const dividends = reformEstimate(content.policies.tributacao_dividendos, s, content)!;
    expect(dividends.lean).toBe('favorece_pobres');
    expect(dividends.phases.map((p) => p.lagMonths)).toEqual([0, 12]);
    expect(dividends.annualRevenue).toBeGreaterThan(0);
    const selective = reformEstimate(content.policies.imposto_seletivo_ampliacao, s, content)!;
    expect(selective.lean).toBe('favorece_ricos');
    expect(selective.quintiles.every((q) => q.incomeChange < 0)).toBe(true);
    expect(reformEstimate(content.policies.transferencia_renda_ampliacao, s, content)).toBeNull();
  });

  it('a estimativa é o efeito para o qual o motor social converge (mesma incidência, sem segunda fonte)', () => {
    const s0 = start();
    const policy = content.policies.tributacao_dividendos;
    const estimate = reformEstimate(policy, s0, content)!;
    const run = (impulses: ScheduledImpulse[]) => {
      let s: GameState = { ...s0, impulses: [...s0.impulses, ...impulses] };
      for (let i = 0; i < 120; i++) s = advanceMonth(s, { decisions: [] }, content, [societyStep]).state;
      return s;
    };
    const without = run([]);
    const withReform = run(taxImpulses(policy, s0, 0));
    for (const q of estimate.quintiles) {
      const a = without.society.quintiles.find((x) => x.id === q.quintile)!.policyAdjustment;
      const b = withReform.society.quintiles.find((x) => x.id === q.quintile)!.policyAdjustment;
      const income = s0.society.quintiles.find((x) => x.id === q.quintile)!.realIncome;
      expect((b - a) / income).toBeCloseTo(q.incomeChange, 6);
    }
  });

  it('a Fazenda mostra as fases e a estimativa por quintil, marcada como estimativa', () => {
    const s = start();
    const advice = adviseDecision(s, 'tributacao_dividendos', content);
    expect(advice.fazenda.text).toContain('Em 2 fases');
    expect(advice.fazenda.text).toContain('Estimativa, não resultado');
    expect(advice.forecast.taxEstimate?.lean).toBe('favorece_pobres');
    expect(adviseDecision(s, 'transferencia_renda_ampliacao', content).forecast.taxEstimate).toBeNull();
  });

  it('política tributária ilegal é recusada pelo esquema: competência, instrumento e anterioridade', () => {
    const base = content.policies.imposto_seletivo_ampliacao;
    expect(parsePolicy(base).ok).toBe(true);
    const errors = (p: object) => {
      const r = parsePolicy(p);
      return r.ok ? [] : r.errors.join(' ');
    };
    expect(errors({ ...base, competence: 'estadual' })).toContain('tributo federal');
    expect(
      errors({
        ...base,
        instruments: ['decreto_regulamentar'],
        timeline: { ...base.timeline, expectedLegislativeMonths: 0 },
      }),
    ).toContain('exige lei');
    expect(errors({ ...base, conditions: [] })).toContain('anterioridade');
    // Desoneração pura não exige anterioridade; decreto de alíquota vale para imposto regulatório (IOF).
    expect(parsePolicy(content.policies.iof_credito_reducao).ok).toBe(true);
  });
});

/** Valores fiscais iniciais do cenário atual, no formato de `fiscalStructure`. */
function currentFiscalValues() {
  const f = content.scenario.fiscal!;
  const pick = <K extends string>(o: Record<K, { value: number }>) =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, (v as { value: number }).value])) as Record<K, number>;
  return {
    revenueShares: pick(f.revenueShares),
    transferShares: pick(f.transferShares),
    spending: pick(f.spending),
  };
}
