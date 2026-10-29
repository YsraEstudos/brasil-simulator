import { describe, expect, it } from 'vitest';
import { advanceEnergy, initialEnergy, energyStep } from './energy';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { createInitialState } from '../state';
import { advanceMonth } from '../advanceMonth';
import { createRng } from '../rng';
import { checkInvariants } from '../invariants';
import { DIRECTIVE_ACTION_ID } from '../actions';
import { ministriesOf } from '../congress/cabinet';
import { publicPoliciesStep } from '../publicPolicies/publicPolicies';
import type { GameState } from '../types';

// Plano F13: os fluxos são TWh/mês e o estoque do reservatório é TWh.
describe('balanço energético', () => {
  it('conserva reservatório e geração, e reconcilia demanda entregue e escassez', () => {
    const before = initialEnergy();
    const after = advanceEnergy(before, { dryness: 0.8, transmissionAssetMillions: 0, efficiency: 0 });
    expect(before.reservoir + after.inflow - after.hydro - after.spill).toBeCloseTo(after.reservoir, 10);
    expect(after.hydro + after.otherGeneration).toBeCloseTo(after.delivered + after.curtailment, 10);
    expect(after.delivered + after.shortage).toBeCloseTo(after.demand, 10);
    expect(after.reservoir).toBeGreaterThanOrEqual(0);
  });
  it('seca persistente esgota a reserva e eficiência reduz escassez sem gerar energia', () => {
    const run = (efficiency: number) => {
      let energy = initialEnergy();
      for (let i = 0; i < 120; i++)
        energy = advanceEnergy(energy, { dryness: 1, transmissionAssetMillions: 0, efficiency });
      return energy;
    };
    const noResponse = run(0);
    const response = run(0.5);
    expect(noResponse.shortage).toBeGreaterThan(0);
    expect(response.shortage).toBeLessThan(noResponse.shortage);
    expect(response.otherGeneration).toBe(noResponse.otherGeneration);
  });
});

it('calcula o balanço no turno após atualizar o clima', () => {
  const content = loadContent(DEFAULT_SCENARIO_ID);
  const state = createInitialState({ content, difficulty: 'estrategica', seed: 7 });
  const next = advanceMonth(state, { decisions: [] }, content).state;
  expect(next.energy.inflow).toBeGreaterThan(0);
  expect(next.energy.delivered + next.energy.shortage).toBeCloseTo(next.energy.demand, 9);
});

it('escassez física produz uma contribuição rastreável de atividade', () => {
  const content = loadContent(DEFAULT_SCENARIO_ID);
  const state = createInitialState({ content, difficulty: 'estrategica', seed: 7 });
  const stressed = {
    ...state,
    energy: { ...state.energy, reservoir: 0 },
    climate: { ...state.climate, ufs: state.climate.ufs.map((uf) => ({ ...uf, dryness: 1 })) },
  };
  const result = energyStep(stressed, {
    content,
    rng: createRng(state.rng),
    decisions: [],
    eventChoices: [],
    draft: { proposalChanges: [], eventsResolved: [], eventsFired: [], notes: [], copom: null, regional: null },
  });
  expect(result.state.energy.shortage).toBeGreaterThan(0);
  expect(
    result.state.impulses.some(
      (impulse) => impulse.sourceId === 'energia:escassez' && impulse.target === 'choque.hiato' && impulse.delta < 0,
    ),
  ).toBe(true);
});

it('a rotina de eficiência depende de dotação executada e amadurece antes de reduzir a demanda', () => {
  const content = loadContent(DEFAULT_SCENARIO_ID);
  const policy = content.policies.rotina_eficiencia_energetica!;
  const ministry = ministriesOf(content).find((m) => m.areas.includes('energia'))!;
  const decision = {
    policyId: DIRECTIVE_ACTION_ID,
    agendaCost: 1,
    params: { ministryId: ministry.id, policyId: policy.id, annualMillions: policy.cost.annualMillions },
  };
  let state = createInitialState({ content, difficulty: 'estrategica', seed: 7 });
  state = advanceMonth(state, { decisions: [decision] }, content).state;
  expect(state.energy.demand).toBe(60);
  for (let i = 0; i < policy.timeline.maturationMonths; i++)
    state = advanceMonth(state, { decisions: [] }, content).state;
  expect(state.energy.demand).toBeLessThan(60);
});

it('transmissão em operação supera um gargalo físico sem criar geração', () => {
  const before = initialEnergy();
  const bottleneck = advanceEnergy(before, { dryness: 0, transmissionAssetMillions: 0, efficiency: 0, demand: 65 });
  const expanded = advanceEnergy(before, { dryness: 0, transmissionAssetMillions: 50000, efficiency: 0, demand: 65 });
  expect(expanded.delivered).toBeGreaterThan(bottleneck.delivered);
  expect(expanded.shortage).toBeLessThan(bottleneck.shortage);
});

it('o ativo de transmissão não recebe ganho genérico de produtividade além do canal elétrico', () => {
  const content = loadContent(DEFAULT_SCENARIO_ID);
  const base = createInitialState({ content, difficulty: 'estrategica', seed: 7 });
  const project = {
    proposalId: 'teste-transmissao',
    policyId: 'projeto_transmissao_energia',
    phase: 'operacao' as const,
    phaseMonth: 0,
    progress: 1,
    budgetMillions: 10000,
    spentMillions: 10000,
    assetMillions: 10000,
    maintenanceMillions: 0,
    delayMonths: 0,
    startMonth: 0,
  };
  const state = { ...base, publicPolicies: { ...base.publicPolicies, projects: [project] } };
  const result = publicPoliciesStep(state, {
    content,
    rng: createRng(state.rng),
    decisions: [],
    eventChoices: [],
    draft: { proposalChanges: [], eventsResolved: [], eventsFired: [], notes: [], copom: null, regional: null },
  });
  expect(
    result.state.impulses.some(
      (impulse) => impulse.target === 'oferta.potencial' && impulse.sourceId.includes(project.proposalId),
    ),
  ).toBe(false);
});

it('geração adicional só está disponível quando o projeto entra em operação', () => {
  const content = loadContent(DEFAULT_SCENARIO_ID);
  const base = createInitialState({ content, difficulty: 'estrategica', seed: 7 });
  const project = {
    proposalId: 'geracao_teste',
    policyId: 'projeto_geracao_energia',
    phase: 'obra' as const,
    phaseMonth: 0,
    progress: 0.9,
    budgetMillions: 10000,
    spentMillions: 9000,
    assetMillions: 10000,
    maintenanceMillions: 0,
    delayMonths: 0,
    startMonth: 0,
  };
  const run = (phase: 'obra' | 'operacao') => {
    const state = { ...base, publicPolicies: { ...base.publicPolicies, projects: [{ ...project, phase }] } };
    return energyStep(state, {
      content,
      rng: createRng(state.rng),
      decisions: [],
      eventChoices: [],
      draft: { proposalChanges: [], eventsResolved: [], eventsFired: [], notes: [], copom: null, regional: null },
    }).state.energy;
  };
  expect(run('operacao').otherGeneration).toBeGreaterThan(run('obra').otherGeneration);
});

it('a capacidade de armazenamento só aumenta quando a obra hídrica está em operação', () => {
  const content = loadContent(DEFAULT_SCENARIO_ID);
  const base = createInitialState({ content, difficulty: 'estrategica', seed: 7 });
  const project = {
    proposalId: 'reservatorio_teste',
    policyId: 'projeto_reservatorio_energia',
    phase: 'obra' as const,
    phaseMonth: 0,
    progress: 0.9,
    budgetMillions: 10000,
    spentMillions: 9000,
    assetMillions: 10000,
    maintenanceMillions: 0,
    delayMonths: 0,
    startMonth: 0,
  };
  const run = (phase: 'obra' | 'operacao') => {
    const state = { ...base, publicPolicies: { ...base.publicPolicies, projects: [{ ...project, phase }] } };
    return energyStep(state, {
      content,
      rng: createRng(state.rng),
      decisions: [],
      eventChoices: [],
      draft: { proposalChanges: [], eventsResolved: [], eventsFired: [], notes: [], copom: null, regional: null },
    }).state.energy;
  };
  expect(run('operacao').reservoirCapacity).toBeGreaterThan(run('obra').reservoirCapacity);
});

it('estado inicial não apresenta demanda sem entrega ou escassez registrada', () => {
  const energy = initialEnergy();
  expect(energy.delivered + energy.shortage).toBeCloseTo(energy.demand, 10);
  expect(energy.hydro + energy.otherGeneration).toBeCloseTo(energy.delivered + energy.curtailment, 10);
});

it('o verificador global detecta inconsistência no balanço elétrico', () => {
  const content = loadContent(DEFAULT_SCENARIO_ID);
  const state = createInitialState({ content, difficulty: 'estrategica', seed: 7 });
  const result = advanceMonth(state, { decisions: [] }, content);
  const broken = { ...result.state, energy: { ...result.state.energy, shortage: result.state.energy.shortage + 1 } };
  expect(checkInvariants(state, broken, result.report, content).some((message) => message.includes('energia'))).toBe(
    true,
  );
});

it('um reservatório adicional acumula água antes da seca e reduz a escassez posterior', () => {
  const simulate = (storageAssetMillions: number) => {
    let energy = initialEnergy();
    for (let month = 0; month < 20; month++) {
      energy = advanceEnergy(energy, {
        dryness: 0,
        transmissionAssetMillions: 0,
        storageAssetMillions,
        efficiency: 0,
        demand: 50,
      });
    }
    let shortage = 0;
    for (let month = 0; month < 12; month++) {
      energy = advanceEnergy(energy, {
        dryness: 1,
        transmissionAssetMillions: 0,
        storageAssetMillions,
        efficiency: 0,
        demand: 60,
      });
      shortage += energy.shortage;
    }
    return shortage;
  };
  expect(simulate(40000)).toBeLessThan(simulate(0));
});

it.each(['projeto_geracao_energia', 'projeto_reservatorio_energia', 'projeto_transmissao_energia'])(
  'obra %s só amplia capacidade depois de custeio e conclusão',
  (policyId) => {
    const content = loadContent(DEFAULT_SCENARIO_ID);
    const state = createInitialState({ content, difficulty: 'estrategica', seed: 7 });
    const proposal = {
      id: `${policyId}_teste`,
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
    let current: GameState = { ...state, proposals: [proposal] };
    const initial = state.energy;
    let completed = false;
    for (let month = 0; month < 180; month++) {
      const result = advanceMonth(current, { decisions: [] }, content);
      expect(checkInvariants(current, result.state, result.report, content)).toEqual([]);
      const project = result.state.publicPolicies.projects.find((p) => p.proposalId === proposal.id);
      const capacity =
        policyId === 'projeto_geracao_energia'
          ? result.state.energy.generationCapacity
          : policyId === 'projeto_reservatorio_energia'
            ? result.state.energy.reservoirCapacity
            : result.state.energy.transmissionCapacity;
      const baseCapacity =
        policyId === 'projeto_geracao_energia'
          ? initial.generationCapacity
          : policyId === 'projeto_reservatorio_energia'
            ? initial.reservoirCapacity
            : initial.transmissionCapacity;
      if (project?.phase === 'operacao') {
        expect(project.spentMillions).toBeGreaterThan(0);
        expect(capacity).toBeGreaterThan(baseCapacity);
        completed = true;
        break;
      }
      expect(capacity).toBe(baseCapacity);
      current = result.state;
    }
    expect(completed).toBe(true);
  },
  30000,
);

it.each(['projeto_geracao_energia', 'projeto_reservatorio_energia', 'projeto_transmissao_energia'])(
  'a decisão %s não entrega capacidade antes da tramitação e obra',
  (policyId) => {
    const content = loadContent(DEFAULT_SCENARIO_ID);
    const state = createInitialState({ content, difficulty: 'estrategica', seed: 7 });
    const withDecision = advanceMonth(state, { decisions: [{ policyId, agendaCost: 2 }] }, content);
    const withoutDecision = advanceMonth(state, { decisions: [] }, content);
    expect(withDecision.report.accepted.some((decision) => decision.policyId === policyId)).toBe(true);
    expect(withDecision.state.proposals.some((proposal) => proposal.policyId === policyId)).toBe(true);
    expect(withDecision.state.energy).toEqual(withoutDecision.state.energy);
  },
);
