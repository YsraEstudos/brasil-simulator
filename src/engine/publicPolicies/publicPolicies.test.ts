import { describe, expect, it } from 'vitest';

import { TEST_DECREE, testContent, testState } from '@/tests/fixtures';
import type { Decision, GameContent, GameState, StepContext } from '@/engine/types';
import type { Policy } from '@/types/policy';
import { proposalsStep } from '@/engine/proposals/proposals';
import { createRng } from '@/engine/rng';

import {
  BRAND_ACTION_ID,
  DIRECTIVE_ACTION_ID,
  checkPublicPolicies,
  publicPoliciesStep,
  reservePublicAction,
  validatePublicAction,
} from './publicPolicies';
import { initialPublicPolicies } from './types';

const routine: Policy = {
  ...TEST_DECREE,
  id: 'rotina_teste_publica',
  delivery: 'rotina',
  cost: { annualMillions: 100, disbursementProfile: [1] },
  impacts: [{ channel: 'custeio', magnitude: 100, lagMonths: 0 }],
  regional: { key: 'pib', scope: ['sudeste'], boost: { SP: 1.2 } },
};

const alternateRoutine: Policy = {
  ...routine,
  id: 'rotina_alternativa_publica',
  impacts: [{ channel: 'custeio', magnitude: 80, lagMonths: 1 }],
};

const project: Policy = {
  ...TEST_DECREE,
  id: 'projeto_teste_publico',
  delivery: 'projeto',
  instruments: ['projeto_lei'],
  cost: { annualMillions: 1_200, disbursementProfile: [1] },
  timeline: { planningMonths: 0, expectedLegislativeMonths: 1, executionMonths: 3, maturationMonths: 0 },
  impacts: [{ channel: 'investimento_publico', magnitude: 1_200, lagMonths: 0 }],
  project: { licensingMonths: 0, procurementMonths: 0, efficiency: 1, annualMaintenanceRate: 0.03 },
};

const directProject: Policy = {
  ...project,
  id: 'projeto_direto_teste',
  instruments: ['ato_execucao'],
  timeline: { planningMonths: 0, expectedLegislativeMonths: 0, executionMonths: 3, maturationMonths: 0 },
  impacts: [
    { channel: 'investimento_publico', magnitude: 1_200, lagMonths: 0 },
    { channel: 'custeio', magnitude: 240, lagMonths: 2 },
    { channel: 'credibilidade_fiscal', magnitude: -0.1, lagMonths: 1 },
  ],
};

const highMaintenanceProject: Policy = {
  ...project,
  id: 'projeto_manutencao_alta',
  project: { licensingMonths: 0, procurementMonths: 0, efficiency: 1, annualMaintenanceRate: 100_000 },
};

function content(): GameContent {
  return testContent({
    policies: {
      ...testContent().policies,
      [routine.id]: routine,
      [alternateRoutine.id]: alternateRoutine,
      [project.id]: project,
      [directProject.id]: directProject,
      [highMaintenanceProject.id]: highMaintenanceProject,
    },
    scenario: {
      ...testContent().scenario,
      policies: [
        ...testContent().scenario.policies,
        routine.id,
        alternateRoutine.id,
        project.id,
        directProject.id,
        highMaintenanceProject.id,
      ],
    },
  });
}

function state(overrides: Partial<GameState> = {}): GameState {
  const base = testState(3, 'estrategica', content());
  return {
    ...base,
    ...overrides,
    publicPolicies: (overrides as GameState & { publicPolicies?: unknown }).publicPolicies ?? initialPublicPolicies(),
  } as GameState;
}

function ctx(contentValue: GameContent): StepContext {
  return {
    content: contentValue,
    decisions: [],
    eventChoices: [],
    rng: createRng(state().rng),
    draft: { proposalChanges: [], eventsResolved: [], eventsFired: [], notes: [], copom: null, regional: null },
  } as StepContext;
}

describe('public policies action validation', () => {
  it('accepts a positive routine directive for a matching ministry', () => {
    const s = state();
    const c = content();
    const decision: Decision = {
      policyId: DIRECTIVE_ACTION_ID,
      agendaCost: 1,
      params: { ministryId: 'fazenda', policyId: routine.id, annualMillions: 100 },
    };
    expect(validatePublicAction(decision, s, c)).toBeNull();
  });

  it('rejects a directive batch whose reserved annual requests exceed the free room', () => {
    const c = content();
    let s = state();
    const annualMillions = 100_000;
    const first: Decision = {
      policyId: DIRECTIVE_ACTION_ID,
      agendaCost: 1,
      params: { ministryId: 'fazenda', policyId: routine.id, annualMillions },
    };
    expect(validatePublicAction(first, s, c)).toBeNull();
    s = reservePublicAction(s, first, c);
    const second = { ...first, params: { ministryId: 'social', policyId: routine.id, annualMillions } };
    expect(validatePublicAction(second, s, c)).not.toBeNull();
  });

  it('replaces a ministry directive on a new year without renewing the old policy', () => {
    const c = content();
    const previous = state();
    const oldDecision: Decision = {
      policyId: DIRECTIVE_ACTION_ID,
      agendaCost: 1,
      params: { ministryId: 'fazenda', policyId: routine.id, annualMillions: 100 },
    };
    const january = reservePublicAction(previous, oldDecision, c);
    const nextYear = { ...january, monthIndex: 12 } as GameState;
    const newDecision: Decision = {
      policyId: DIRECTIVE_ACTION_ID,
      agendaCost: 1,
      params: { ministryId: 'fazenda', policyId: alternateRoutine.id, annualMillions: 80 },
    };
    expect(validatePublicAction(newDecision, nextYear, c)).toBeNull();
    const reserved = reservePublicAction(nextYear, newDecision, c);
    const out = publicPoliciesStep(reserved, { ...ctx(c), decisions: [newDecision] });
    expect(out.state.publicPolicies?.directives).toEqual([
      { ministryId: 'fazenda', policyId: alternateRoutine.id, annualMillions: 80, year: 1 },
    ]);
  });

  it('allows only three government brands for the current mandate and never duplicates a proposal', () => {
    const c = content();
    const proposal = (id: string) => ({
      id,
      policyId: project.id,
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
    });
    const proposals = [
      proposal('projeto_teste_publico_0'),
      proposal('projeto_teste_publico_1'),
      proposal('projeto_teste_publico_2'),
    ];
    let s = state({
      proposals,
      publicPolicies: { directives: [], projects: [], brands: [], capitalStockMillions: 0 },
    } as never);
    for (let i = 0; i < 3; i++) {
      const d: Decision = {
        policyId: BRAND_ACTION_ID,
        agendaCost: 1,
        params: { proposalId: proposals[i]?.id, name: `Marca ${i}` },
      };
      expect(validatePublicAction(d, s, c)).toBeNull();
      s = reservePublicAction(s, d, c);
    }
    const fourthProposal = proposal('projeto_teste_publico_3');
    s = { ...s, proposals: [...s.proposals, fourthProposal] };
    const fourth: Decision = {
      policyId: BRAND_ACTION_ID,
      agendaCost: 1,
      params: { proposalId: fourthProposal.id, name: 'Marca 4' },
    };
    expect(validatePublicAction(fourth, s, c)).toBe('alvo_invalido');
  });
});

describe('publicPoliciesStep', () => {
  it('applies a previously accepted brand even if the proposal was rejected before execution', () => {
    const c = content();
    const proposal = {
      id: 'projeto_rejeitado_marca',
      policyId: project.id,
      createdMonth: 0,
      status: 'rejeitada' as const,
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
      executionStart: null,
      executionEnd: null,
      adherents: null,
      votes: [],
      history: [],
    };
    const decision: Decision = {
      policyId: BRAND_ACTION_ID,
      agendaCost: 1,
      params: { proposalId: proposal.id, name: 'Marca aceita antes da rejeição' },
    };
    const out = publicPoliciesStep(state({ proposals: [proposal] } as never), {
      ...ctx(c),
      decisions: [decision],
    });
    expect(out.state.publicPolicies.brands).toEqual([
      { proposalId: proposal.id, name: 'Marca aceita antes da rejeição', term: 0 },
    ]);
  });

  it('executes an accepted directive with a lower current fiscal room and records the cut', () => {
    const c = content();
    const decision: Decision = {
      policyId: DIRECTIVE_ACTION_ID,
      agendaCost: 1,
      params: { ministryId: 'fazenda', policyId: routine.id, annualMillions: 1_000_000 },
    };
    const draft = ctx(c);
    const out = publicPoliciesStep(state(), { ...draft, decisions: [decision] });
    expect(out.state.publicPolicies.directives).toEqual([
      { ministryId: 'fazenda', policyId: routine.id, annualMillions: 1_000_000, year: 0 },
    ]);
    expect(draft.draft.notes.some((note) => note.includes('orçamento reduzido'))).toBe(true);
  });

  it('accelerates depreciation when maintenance is materially underfunded', () => {
    const c = content();
    const proposal = {
      id: 'projeto_manutencao_alta_0',
      policyId: highMaintenanceProject.id,
      createdMonth: 0,
      status: 'concluida' as const,
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
    const out = publicPoliciesStep(
      state({
        proposals: [proposal],
        publicPolicies: {
          directives: [],
          projects: [
            {
              proposalId: proposal.id,
              policyId: highMaintenanceProject.id,
              phase: 'operacao',
              phaseMonth: 0,
              progress: 1,
              budgetMillions: 100,
              spentMillions: 100,
              assetMillions: 100,
              maintenanceMillions: 0,
              delayMonths: 0,
              startMonth: 0,
            },
          ],
          brands: [],
          capitalStockMillions: 100,
        },
      } as never),
      { ...ctx(c), decisions: [] },
    );
    expect(out.state.publicPolicies.projects[0]?.assetMillions).toBeLessThan(100 * (1 - 0.04 / 12));
  });

  it('keeps non-investment proposal effects while the project ledger owns investment and capital', () => {
    const c = content();
    const s = state();
    const d: Decision = { policyId: directProject.id, agendaCost: 1 };
    const out = proposalsStep(s, { ...ctx(c), decisions: [d] });
    expect(
      out.state.impulses.some((i) => i.sourceId.startsWith('proposta:') && i.target === 'gasto.investimento'),
    ).toBe(false);
    expect(out.state.impulses.some((i) => i.sourceId.startsWith('proposta:') && i.target === 'gasto.custeio')).toBe(
      true,
    );
    expect(out.state.impulses.some((i) => i.sourceId.startsWith('proposta:') && i.target === 'credibilidade')).toBe(
      true,
    );
  });

  it('executes a directive with a custeio impulse scaled by the requested budget', () => {
    const c = content();
    const s = state();
    const d: Decision = {
      policyId: DIRECTIVE_ACTION_ID,
      agendaCost: 1,
      params: { ministryId: 'fazenda', policyId: routine.id, annualMillions: 100 },
    };
    const out = publicPoliciesStep(reservePublicAction(s, d, c), { ...ctx(c), decisions: [d] });
    expect(out.state.impulses.some((i) => i.sourceId.startsWith('diretriz:') && i.target === 'gasto.custeio')).toBe(
      true,
    );
    expect(
      out.state.impulses.find((i) => i.sourceId.startsWith('diretriz:') && i.target === 'gasto.custeio')?.regional,
    ).toEqual({ key: 'pib', scope: ['sudeste'], boost: { SP: 1.2 } });
    expect(checkPublicPolicies(out.state)).toEqual([]);
  });

  it('advances a project through the explicit ledger and concludes at physical 100%', () => {
    const c = content();
    const proposal = {
      id: 'projeto_direto_teste_0',
      policyId: directProject.id,
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
    let s = state({ proposals: [proposal] } as never);
    let investmentSeen = false;
    for (let month = 0; month < 4; month++) {
      const out = publicPoliciesStep(s, { ...ctx(c), decisions: [] });
      investmentSeen =
        investmentSeen ||
        out.state.impulses.some(
          (impulse) => impulse.sourceId.startsWith('projeto:') && impulse.target === 'gasto.investimento',
        );
      s = { ...out.state, monthIndex: month + 1 } as GameState;
    }
    const publicState = (s as GameState & { publicPolicies: ReturnType<typeof initialPublicPolicies> }).publicPolicies;
    expect(publicState.projects[0]?.progress).toBe(1);
    expect(publicState.projects[0]?.phase).toBe('operacao');
    expect(publicState.projects[0]?.budgetMillions).toBe(300);
    expect(publicState.projects[0]?.spentMillions).toBe(300);
    expect((s.proposals[0] as typeof proposal).status).toBe('concluida');
    expect(investmentSeen).toBe(true);
  });

  it('pauses project progress and spending while its proposal is suspended', () => {
    const c = content();
    const proposal = {
      id: 'projeto_direto_teste_1',
      policyId: directProject.id,
      createdMonth: 0,
      status: 'suspensa' as const,
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
    const s = state({
      proposals: [proposal],
      publicPolicies: {
        directives: [],
        projects: [
          {
            proposalId: proposal.id,
            policyId: directProject.id,
            phase: 'obra',
            phaseMonth: 1,
            progress: 0.2,
            budgetMillions: 1200,
            spentMillions: 240,
            assetMillions: 0,
            maintenanceMillions: 0,
            delayMonths: 0,
            startMonth: 0,
          },
        ],
        brands: [],
        capitalStockMillions: 0,
      },
    } as never);
    const out = publicPoliciesStep(s, { ...ctx(c), decisions: [] });
    const p = (out.state as GameState & { publicPolicies: ReturnType<typeof initialPublicPolicies> }).publicPolicies
      .projects[0];
    expect(p?.progress).toBe(0.2);
    expect(p?.spentMillions).toBe(240);
    expect(p?.delayMonths).toBe(1);
    expect(out.state.impulses.filter((impulse) => impulse.sourceId.startsWith('projeto:')).length).toBe(0);
  });

  it('renews the previous-year directive in January and records the renewal', () => {
    const c = content();
    const s = state({
      monthIndex: 12,
      publicPolicies: {
        directives: [{ ministryId: 'fazenda', policyId: routine.id, annualMillions: 100, year: 0 }],
        projects: [],
        brands: [],
        capitalStockMillions: 0,
      },
    } as never);
    const draft = { ...ctx(c).draft };
    const out = publicPoliciesStep(s, { ...ctx(c), draft, decisions: [] });
    const publicState = (out.state as GameState & { publicPolicies: ReturnType<typeof initialPublicPolicies> })
      .publicPolicies;
    expect(publicState.directives.some((directive) => directive.year === 1)).toBe(true);
    expect(draft.notes.some((note) => note.includes('renovada'))).toBe(true);
  });
});
