import { describe, expect, it } from 'vitest';

import { managementProfile } from '@/engine/congress/management';
import { createRng } from '@/engine/rng';
import type { Decision, GameContent, GameState, StepContext } from '@/engine/types';
import { TEST_DECREE, testContent, testState } from '@/tests/fixtures';

import { projectCommitments } from './commitments';
import { checkPublicPolicies, publicPoliciesStep } from './publicPolicies';
import { initialPublicPolicies } from './types';

/**
 * Aceite da onda R2 (PLANO_EXPANSAO_BRASIL_SIMULATOR.md §4, §6.1 e §6.2; fatia vertical B do §8): obra e programa
 * executam segundo recursos e gestores, sem dupla penalidade e sem novo estoque fiscal.
 *
 * O que estes testes protegem, critério por critério:
 * 1. orçamento e capacidade são canais **separados** — um não vira desculpa do outro (§6.1);
 * 2. melhor gestão nunca atrasa nem encarece a mesma obra (§6.1, monotonicidade condicionada);
 * 3. capacidade muda **quando** se gasta, não **quanto**: o total é cobrado uma única vez (§4, "sem dupla penalidade");
 * 4. recurso adicional só acelera quando o gargalo é o orçamento (§6.2);
 * 5. compromisso plurianual é previsão, nunca desembolso nem autorização (§4 e EX-09);
 * 6. indicação política não é indicação de incompetência (EX-07);
 * 7. o estoque de capital continua reconciliando com a carteira, mês a mês (§4, "sem novo estoque fiscal").
 */

const AREA = 'social';
const MINISTRY = 'social';

/** Política de obra direta (sem tramitação) na área do ministério que vamos trocar. */
function policy(): GameContent['policies'][string] {
  return {
    ...TEST_DECREE,
    id: 'obra_aceite_r2',
    area: AREA,
    delivery: 'projeto',
    instruments: ['ato_execucao'],
    cost: { annualMillions: 1_200, disbursementProfile: [1] },
    timeline: { planningMonths: 0, expectedLegislativeMonths: 0, executionMonths: 3, maturationMonths: 0 },
    impacts: [{ channel: 'investimento_publico', magnitude: 1_200, lagMonths: 0 }],
    project: { licensingMonths: 0, procurementMonths: 0, efficiency: 1, annualMaintenanceRate: 0.03 },
  };
}

function content(): GameContent {
  const policyValue = policy();
  const base = testContent();
  return {
    ...base,
    policies: { ...base.policies, [policyValue.id]: policyValue },
    scenario: { ...base.scenario, policies: [...base.scenario.policies, policyValue.id] },
  };
}

/** Proposta já aprovada e em execução: a carteira a assume no primeiro mês. */
function proposal(policyId: string) {
  return {
    id: 'obra_aceite_r2_0',
    policyId,
    createdMonth: 0,
    status: 'em_execucao' as const,
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
    executionStart: 0,
    executionEnd: null,
    adherents: null,
    votes: [],
    history: [],
  };
}

function state(overrides: Partial<GameState> = {}, c: GameContent = content()): GameState {
  return {
    ...testState(3, 'estrategica', c),
    ...overrides,
    publicPolicies:
      (overrides as { publicPolicies?: GameState['publicPolicies'] }).publicPolicies ?? initialPublicPolicies(),
  } as GameState;
}

function ctx(c: GameContent): StepContext {
  return {
    content: c,
    decisions: [],
    eventChoices: [],
    rng: createRng(state().rng),
    draft: { proposalChanges: [], eventsResolved: [], eventsFired: [], notes: [], copom: null, regional: null },
  } as StepContext;
}

/** Semente cujo gestor de `occupant` tem a capacidade desejada; evita depender de uma semente "da sorte". */
function seedWhere(predicate: (seed: number) => boolean): number {
  const found = Array.from({ length: 20_000 }, (_, n) => n + 1).find(predicate);
  if (found === undefined) throw new Error('nenhuma semente satisfez a condição do teste');
  return found;
}

/** Campanha de teste com o gestor da área trocado e a carteira já com a obra aprovada. */
function campaign(options: {
  occupant: string;
  seed?: number;
  loaAnnualMillions?: number;
  c?: GameContent;
}): GameState {
  const c = options.c ?? content();
  const p = policy();
  const base = state({ proposals: [proposal(p.id)] as never, seed: options.seed ?? 3 }, c);
  const withCabinet = {
    ...base,
    congress: { ...base.congress, cabinet: [{ id: MINISTRY, occupant: options.occupant, since: 0 }] },
  };
  if (options.loaAnnualMillions === undefined) return withCabinet as GameState;
  return {
    ...withCabinet,
    publicPolicies: {
      ...withCabinet.publicPolicies,
      budgetLaws: [
        {
          proposalId: 'loa_aceite',
          kind: 'loa' as const,
          year: 2027,
          priority: 'saude' as const,
          annualMillions: options.loaAnnualMillions,
          enactedAt: 0,
        },
      ],
    },
  } as GameState;
}

interface MonthRun {
  bottleneck: string | undefined;
  progress: number;
  spentMillions: number;
  assetMillions: number;
  priceLevel: number;
  phase: string;
  /** Desembolso novo do mês (delta do acumulado), para somar o total cobrado uma única vez. */
  charged: number;
}

/** Roda `months` meses da carteira e devolve a trilha mensal do primeiro projeto. */
function run(start: GameState, months: number, c: GameContent = content()): MonthRun[] {
  let s = start;
  const trail: MonthRun[] = [];
  for (let month = 0; month < months; month++) {
    const before = s.publicPolicies.projects[0]?.spentMillions ?? 0;
    const out = publicPoliciesStep(s, { ...ctx(c), decisions: [] as Decision[] });
    s = { ...out.state, monthIndex: month + 1 } as GameState;
    const project = s.publicPolicies.projects[0];
    if (!project) continue;
    trail.push({
      bottleneck: project.bottleneck,
      progress: project.progress,
      spentMillions: project.spentMillions,
      assetMillions: project.assetMillions,
      priceLevel: s.economy.priceLevel,
      phase: project.phase,
      charged: project.spentMillions - before,
    });
  }
  return trail;
}

const completedIn = (trail: MonthRun[]): number => trail.findIndex((month) => month.phase === 'operacao') + 1;

describe('R2: orçamento e capacidade são canais separados (§6.1)', () => {
  const seed = seedWhere((n) => managementProfile(n, MINISTRY, 'centro').capacity < 0.72);
  const budget = 300;

  it('com espaço fiscal a obra avança mesmo com gestão fraca: o gargalo é a gestão, não o dinheiro', () => {
    const trail = run(campaign({ occupant: 'centro', seed }), 6);
    const first = trail[0];
    expect(first?.bottleneck).toBe('capacidade');
    expect(first?.progress).toBeGreaterThan(0);
    expect(trail.some((month) => month.bottleneck === 'orcamento')).toBe(false);
  });

  it('sem espaço fiscal a obra para por orçamento, com a mesma gestão e o mesmo projeto', () => {
    const trail = run(campaign({ occupant: 'centro', seed, loaAnnualMillions: 0 }), 6);
    // A LOA zerada é o limite legal: nada é desembolsado e a limitação registrada é o orçamento, não a gestão.
    expect(trail.every((month) => month.bottleneck === 'orcamento')).toBe(true);
    expect(trail.every((month) => month.spentMillions === 0 && month.progress === 0)).toBe(true);
    expect(trail.every((month) => month.phase !== 'operacao')).toBe(true);
  });

  it('o mesmo mês com espaço fiscal amplo não é bloqueado por orçamento, ainda que o gasto seja grande', () => {
    const trail = run(campaign({ occupant: 'centro', seed, loaAnnualMillions: 1_000_000 }), 6);
    expect(trail.some((month) => month.bottleneck === 'orcamento')).toBe(false);
    // O total gasto nunca passa do orçamento da obra: espaço amplo não vira desembolso além do declarado.
    expect(Math.max(...trail.map((month) => month.spentMillions))).toBeLessThanOrEqual(budget + 1e-9);
  });
});

describe('R2: melhor gestão nunca atrasa a mesma obra (§6.1)', () => {
  const c = content();

  it('a gestão mais capaz conclui em menos meses, e as duas concluem', () => {
    const seed = seedWhere((n) => {
      const slow = managementProfile(n, MINISTRY, 'tecnico').capacity;
      const fast = managementProfile(n, MINISTRY, 'centro').capacity;
      return slow < 0.7 && fast > 0.9;
    });
    const slowTrail = run(campaign({ occupant: 'tecnico', seed, c }), 14, c);
    const fastTrail = run(campaign({ occupant: 'centro', seed, c }), 14, c);
    const slowMonths = completedIn(slowTrail);
    const fastMonths = completedIn(fastTrail);
    expect(slowMonths).toBeGreaterThan(0);
    expect(fastMonths).toBeGreaterThan(0);
    // Monotonicidade condicionada: nada de "melhor gestor, obra mais longa" (§6.1, capacidade administrativa).
    expect(fastMonths).toBeLessThan(slowMonths);
  });

  it('o avanço físico nunca regride ao longo dos meses, em nenhuma das duas gestões', () => {
    const seed = seedWhere((n) => managementProfile(n, MINISTRY, 'centro').capacity > 0.9);
    for (const occupant of ['tecnico', 'centro']) {
      const trail = run(campaign({ occupant, seed }), 14);
      for (let i = 1; i < trail.length; i++) {
        expect(trail[i]!.progress).toBeGreaterThanOrEqual(trail[i - 1]!.progress);
        expect(trail[i]!.spentMillions).toBeGreaterThanOrEqual(trail[i - 1]!.spentMillions);
      }
    }
  });
});

describe('R2: capacidade muda quando se gasta, não quanto (§4, sem dupla penalidade)', () => {
  it('gestão lenta e gestão rápida desembolsam exatamente o mesmo total, uma vez cada centavo', () => {
    const seed = seedWhere((n) => {
      const slow = managementProfile(n, MINISTRY, 'tecnico').capacity;
      const fast = managementProfile(n, MINISTRY, 'centro').capacity;
      return slow < 0.7 && fast > 0.9;
    });
    const budget = 300;
    for (const occupant of ['tecnico', 'centro']) {
      const trail = run(campaign({ occupant, seed }), 16);
      const charged = trail.reduce((sum, month) => sum + month.charged, 0);
      // Nenhuma penalidade dupla: a gestão estica o cronograma, mas o valor declarado é cobrado uma única vez.
      expect(charged, `gestão ${occupant}`).toBeCloseTo(budget, 6);
      expect(trail[trail.length - 1]!.spentMillions).toBeCloseTo(budget, 6);
      expect(trail[trail.length - 1]!.phase).toBe('operacao');
    }
  });

  it('o ativo entregue é o desembolso (eficiência 1), sem inventar capital', () => {
    const seed = seedWhere((n) => managementProfile(n, MINISTRY, 'centro').capacity > 0.8);
    const trail = run(campaign({ occupant: 'centro', seed }), 16);
    const completion = trail[completedIn(trail) - 1]!;
    // No mês em que a obra entra em operação, o ativo é o desembolso deflacionado pela eficiência da política — nem
    // um centavo de capital a mais. Depois disso ele só cai, pela depreciação.
    expect(completion.phase).toBe('operacao');
    expect(completion.assetMillions).toBeCloseTo(completion.spentMillions / completion.priceLevel, 6);
    const last = trail[trail.length - 1]!;
    expect(last.assetMillions).toBeLessThanOrEqual(completion.assetMillions + 1e-9);
  });
});

describe('R2: recurso adicional só acelera quando o gargalo é o orçamento (§6.2)', () => {
  it('obra limitada pela gestão não encurta abaixo do piso de capacidade, nem com espaço fiscal ilimitado', () => {
    const seed = seedWhere((n) => managementProfile(n, MINISTRY, 'centro').capacity < 0.72);
    const capacity = managementProfile(seed, MINISTRY, 'centro').capacity;
    // executionMonths / capacidade: o prazo que a gestão impõe à obra, arredondado para cima.
    const floor = Math.max(1, Math.ceil(3 / capacity));
    const ample = run(campaign({ occupant: 'centro', seed, loaAnnualMillions: 1_000_000 }), 14);
    expect(completedIn(ample)).toBe(floor);
    // Dinheiro além da parcela mensal não compra nem um mês a menos: o gargalo é a gestão, não o caixa.
    const richer = run(campaign({ occupant: 'centro', seed, loaAnnualMillions: 50_000_000 }), 14);
    expect(richer.map((month) => month.progress)).toEqual(ample.map((month) => month.progress));
    // E escassez de caixa nunca adianta a obra: com pouco espaço ela não conclui antes do piso.
    const tight = run(campaign({ occupant: 'centro', seed, loaAnnualMillions: 60 }), 14);
    const tightMonths = completedIn(tight);
    expect(tightMonths === 0 || tightMonths >= floor).toBe(true);
  });

  it('obra limitada pelo orçamento acelera quando o espaço fiscal cresce', () => {
    const seed = seedWhere((n) => managementProfile(n, MINISTRY, 'centro').capacity > 0.9);
    const tight = run(campaign({ occupant: 'centro', seed, loaAnnualMillions: 60 }), 8);
    const ample = run(campaign({ occupant: 'centro', seed, loaAnnualMillions: 1_000_000 }), 8);
    const tightProgress = tight[tight.length - 1]!.progress;
    const ampleProgress = ample[ample.length - 1]!.progress;
    expect(ampleProgress).toBeGreaterThan(tightProgress);
    expect(tight.some((month) => month.bottleneck === 'orcamento')).toBe(true);
  });
});

describe('R2: compromisso plurianual é previsão, não desembolso (EX-09)', () => {
  it('ler os compromissos não muda o mês seguinte nem o espaço fiscal', () => {
    const c = content();
    const seed = seedWhere((n) => managementProfile(n, MINISTRY, 'centro').capacity > 0.8);
    const start = campaign({ occupant: 'centro', seed, c });
    const withoutReading = publicPoliciesStep(start, { ...ctx(c), decisions: [] }).state;
    projectCommitments(start, c);
    const afterReading = publicPoliciesStep(start, { ...ctx(c), decisions: [] }).state;
    // Previsão é leitura: mesmo estado, mesmo desembolso, nenhum impulso novo de gasto.
    expect(afterReading.publicPolicies).toEqual(withoutReading.publicPolicies);
    expect(afterReading.impulses).toEqual(withoutReading.impulses);
  });

  it('o total previsto é o saldo ainda não desembolsado, e obra quitada não prevê nada', () => {
    const c = content();
    const seed = seedWhere((n) => managementProfile(n, MINISTRY, 'centro').capacity > 0.8);
    let s = campaign({ occupant: 'centro', seed, c });
    const opening = projectCommitments(s, c);
    const budget = s.publicPolicies.projects[0]?.budgetMillions ?? 0;
    expect(opening.reduce((sum, row) => sum + row.millions, 0)).toBeCloseTo(budget, 6);
    for (let month = 0; month < 16; month++) {
      s = { ...publicPoliciesStep(s, { ...ctx(c), decisions: [] }).state, monthIndex: month + 1 } as GameState;
    }
    const project = s.publicPolicies.projects[0]!;
    expect(project.spentMillions).toBeCloseTo(project.budgetMillions, 6);
    expect(projectCommitments(s, c)).toEqual([]);
  });
});

describe('R2: indicação política não é incompetência (EX-07)', () => {
  it('as capacidades de um indicado político e de um técnico têm a mesma média', () => {
    const sample = Array.from({ length: 400 }, (_, n) => n + 1);
    const mean = (occupant: string) =>
      sample.reduce((sum, seed) => sum + managementProfile(seed, MINISTRY, occupant).capacity, 0) / sample.length;
    // A qualidade é sorteada por pasta e ocupante; nada no motor associa "político" a gestão pior.
    expect(Math.abs(mean('tecnico') - mean('centro'))).toBeLessThan(0.03);
    for (const occupant of ['tecnico', 'centro']) {
      for (const seed of sample.slice(0, 50)) {
        const profile = managementProfile(seed, MINISTRY, occupant);
        expect(profile.capacity).toBeGreaterThanOrEqual(0.65);
        expect(profile.capacity).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('R2: o estoque fiscal continua reconciliando mês a mês (§4)', () => {
  it('nenhum mês viola os invariantes da carteira e o capital em operação é só o dos projetos', () => {
    const c = content();
    const seed = seedWhere((n) => managementProfile(n, MINISTRY, 'centro').capacity > 0.8);
    let s = campaign({ occupant: 'centro', seed, c });
    for (let month = 0; month < 18; month++) {
      s = { ...publicPoliciesStep(s, { ...ctx(c), decisions: [] }).state, monthIndex: month + 1 } as GameState;
      expect(checkPublicPolicies(s), `mês ${month}`).toEqual([]);
      const assets = s.publicPolicies.projects
        .filter((project) => project.phase === 'operacao')
        .reduce((sum, project) => sum + project.assetMillions, 0);
      expect(s.publicPolicies.capitalStockMillions).toBeCloseTo(assets, 6);
    }
    expect(s.publicPolicies.projects[0]?.phase).toBe('operacao');
    // A manutenção da obra em operação sai como custeio — não como um segundo investimento.
    const maintenance = s.impulses.filter((impulse) => impulse.label.startsWith('Manutenção:'));
    expect(maintenance.every((impulse) => impulse.target === 'gasto.custeio')).toBe(true);
    expect(s.impulses.some((impulse) => impulse.target === 'gasto.investimento')).toBe(false);
  });
});
