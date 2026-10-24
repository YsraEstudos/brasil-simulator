import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { TEST_DECREE } from '@/tests/fixtures';
import type { Policy } from '@/types/policy';
import { advanceMonth } from './advanceMonth';
import { BRAND_ACTION_ID, DIRECTIVE_ACTION_ID } from './actions';
import { checkInvariants } from './invariants';
import { ENGINE_VERSION, STATE_SCHEMA_VERSION, type Decision, type GameContent } from './types';
import { PARAMS } from './economy/calibration';
import { createInitialState, currentNominalGdpMillions } from './state';
import { upgradeGameState } from './upgrade';

const content = loadContent('brasil_2027_01');

describe('contratos da Fase 06 (AI_INSTRUCTIONS §2.10)', () => {
  it('campanha nova tem estado v9, sociedade e execução pública serializáveis', () => {
    const state = createInitialState({ content, difficulty: 'estrategica', seed: 42 });
    expect(state.schemaVersion).toBe(STATE_SCHEMA_VERSION);
    expect(state.engineVersion).toBe(ENGINE_VERSION);
    expect(state).toHaveProperty('society');
    expect(state).toHaveProperty('publicPolicies', {
      directives: [],
      projects: [],
      brands: [],
      capitalStockMillions: 0,
    });
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('migração v5 conserva campos existentes e cria blocos novos sem mutar o save', () => {
    const current = createInitialState({ content, difficulty: 'estrategica', seed: 9 });
    const raw: Record<string, unknown> = { ...current, schemaVersion: 5, engineVersion: '0.5.0' };
    delete raw.society;
    delete raw.publicPolicies;
    const original = structuredClone(raw);
    const next = upgradeGameState(5, raw);
    expect(next.schemaVersion).toBe(STATE_SCHEMA_VERSION);
    expect(next).toHaveProperty('society');
    expect(next).toHaveProperty('publicPolicies');
    for (const key of Object.keys(raw).filter((k) => k !== 'schemaVersion' && k !== 'engineVersion')) {
      expect((next as unknown as Record<string, unknown>)[key]).toEqual(raw[key]);
    }
    expect(raw).toEqual(original);
  });
});

const shortProject: Policy = {
  ...TEST_DECREE,
  id: 'projeto_curto',
  name: 'Escola de teste',
  area: 'infraestrutura',
  delivery: 'projeto',
  project: { licensingMonths: 1, procurementMonths: 1, efficiency: 0.8, annualMaintenanceRate: 0.02 },
  instruments: ['ato_execucao'],
  cost: { annualMillions: 12000, disbursementProfile: [1] },
  timeline: { planningMonths: 1, expectedLegislativeMonths: 0, executionMonths: 3, maturationMonths: 0 },
  impacts: [{ channel: 'investimento_publico', magnitude: 12000, lagMonths: 0 }],
  risks: [],
};

function projectContent(): GameContent {
  const base = loadContent(DEFAULT_SCENARIO_ID);
  return {
    ...base,
    policies: { ...base.policies, [shortProject.id]: shortProject },
    scenario: { ...base.scenario, policies: [...base.scenario.policies, shortProject.id] },
    events: [],
  };
}

describe('integração da execução pública (GAME_DESIGN §9.2)', () => {
  for (const name of ['dep_kg', 'elast_kg', 'curva_s_projetos', 'capacidade_minima_projetos'] as const) {
    for (const bound of ['min', 'max'] as const) {
      it(`calibração ${name} no ${bound}: projeto com pasta partidária por 240 meses preserva invariantes`, () => {
        const base = projectContent();
        const c: GameContent = { ...base, calibration: { ...base.calibration, [name]: PARAMS[name][bound] } };
        let state = createInitialState({ content: c, difficulty: 'casual', seed: 17 });
        const ministry = c.scenario.institutions!.ministries.find((m) => m.areas.includes(shortProject.area));
        if (!ministry) throw new Error('pasta ausente');
        state = {
          ...state,
          congress: { ...state.congress, cabinet: [{ id: ministry.id, occupant: c.scenario.blocs[0].id, since: 0 }] },
        };
        for (let month = 0; month < 240; month++) {
          const result = advanceMonth(
            state,
            { decisions: month === 0 ? [{ policyId: shortProject.id, agendaCost: 1 }] : [] },
            c,
          );
          expect(checkInvariants(state, result.state, result.report, c)).toEqual([]);
          state = result.state;
        }
        expect(state.publicPolicies.projects[0].phase).toBe('operacao');
        expect(state.publicPolicies.capitalStockMillions).toBeGreaterThan(0);
      });
    }
  }
  it('diretriz aceita cria execução persistida e não executa uma política legislativa por atalho', () => {
    const c = projectContent();
    const state = createInitialState({ content: c, difficulty: 'casual', seed: 1 });
    const routine = Object.values(c.policies).find((p) => p.delivery === 'rotina');
    const ministry = c.scenario.institutions?.ministries.find((m) => routine && m.areas.includes(routine.area));
    if (!routine || !ministry) throw new Error('catálogo sem rotina/pasta');
    const result = advanceMonth(
      state,
      {
        decisions: [
          {
            policyId: DIRECTIVE_ACTION_ID,
            agendaCost: 0,
            params: { ministryId: ministry.id, policyId: routine.id, annualMillions: 5000 },
          },
        ],
      },
      c,
    );
    expect(result.report.rejected).toEqual([]);
    expect(result.report.accepted[0].agendaCost).toBe(1);
    expect(result.state.publicPolicies.directives).toHaveLength(1);
    expect(checkInvariants(state, result.state, result.report, c)).toEqual([]);
    const invalid = advanceMonth(
      state,
      {
        decisions: [
          {
            policyId: DIRECTIVE_ACTION_ID,
            agendaCost: 1,
            params: { ministryId: ministry.id, policyId: 'transferencia_renda_ampliacao', annualMillions: 5000 },
          },
        ],
      },
      c,
    );
    expect(invalid.report.accepted).toEqual([]);
    expect(invalid.state.publicPolicies.directives).toEqual([]);
  });

  it('obra conclui pelo avanço real e só então cria ativo e manutenção, sem duplicar impulsos', () => {
    const c = projectContent();
    let state = createInitialState({ content: c, difficulty: 'casual', seed: 1 });
    let enteredOperation = false;
    for (let month = 0; month < 14; month++) {
      const decisions = month === 0 ? [{ policyId: shortProject.id, agendaCost: 1 }] : [];
      const result = advanceMonth(state, { decisions }, c);
      expect(checkInvariants(state, result.state, result.report, c)).toEqual([]);
      const p = result.state.publicPolicies.projects[0];
      const priorSpent = state.publicPolicies.projects[0]?.spentMillions ?? 0;
      // Os impulsos deste mês já foram retirados da fila na virada; o relatório conserva a causa fiscal.
      const investment = -result.report.contributions
        .filter(
          (i) =>
            i.cause.startsWith('projeto:') &&
            (i.cause.includes(':obra:') || i.cause.endsWith(':obra')) &&
            i.indicator === 'primaryBalance12m',
        )
        .reduce((sum, i) => sum + i.delta, 0);
      if (p) expect(p.spentMillions - priorSpent).toBeCloseTo(investment * currentNominalGdpMillions(state, c), 5);
      if (p?.phase === 'operacao') {
        enteredOperation = true;
        expect(p.progress).toBe(1);
        expect(p.spentMillions).toBeCloseTo(p.budgetMillions, 5);
        expect(p.assetMillions).toBeGreaterThan(0);
      } else if (p) {
        expect(p.assetMillions).toBe(0);
      }
      expect(
        result.state.impulses.filter(
          (i) => i.sourceId.startsWith('proposta:projeto_curto') && i.target === 'gasto.investimento',
        ),
      ).toEqual([]);
      state = result.state;
    }
    expect(enteredOperation).toBe(true);
    expect(state.publicPolicies.capitalStockMillions).toBeGreaterThan(0);
    expect(state.publicPolicies.projects[0].maintenanceMillions).toBeGreaterThan(0);
  });

  it('reserva o limite de três marcas ao validar várias decisões no mesmo mês', () => {
    const c = projectContent();
    let state = createInitialState({ content: c, difficulty: 'casual', seed: 1 });
    state = advanceMonth(state, { decisions: [{ policyId: shortProject.id, agendaCost: 1 }] }, c).state;
    const original = state.proposals[0];
    state = {
      ...state,
      resources: { ...state.resources, agendaActionsPerMonth: 10 },
      proposals: [0, 1, 2, 3].map((i) => ({ ...original, id: `marca_${i}`, status: 'em_execucao' })),
    };
    const decisions: Decision[] = state.proposals.map((p, i) => ({
      policyId: BRAND_ACTION_ID,
      agendaCost: 1,
      params: { proposalId: p.id, name: `Marca ${i}` },
    }));
    const result = advanceMonth(state, { decisions }, c);
    expect(result.report.accepted).toHaveLength(3);
    expect(result.report.rejected).toHaveLength(1);
    expect(result.state.publicPolicies.brands).toHaveLength(3);
  });

  for (const months of [48, 240]) {
    it(`campanha com diretriz, obra e marca mantém invariantes por ${months} meses e retoma deterministicamente`, () => {
      const c = projectContent();
      const routine = Object.values(c.policies).find((p) => p.delivery === 'rotina');
      const ministry = c.scenario.institutions?.ministries.find((m) => routine && m.areas.includes(routine.area));
      if (!routine || !ministry) throw new Error('rotina não disponível');
      for (const seed of [1, 7, 42]) {
        let state = createInitialState({ content: c, difficulty: 'casual', seed });
        for (let month = 0; month < months; month++) {
          const decisions: Decision[] =
            month === 0
              ? [
                  {
                    policyId: DIRECTIVE_ACTION_ID,
                    agendaCost: 1,
                    params: { ministryId: ministry.id, policyId: routine.id, annualMillions: 5000 },
                  },
                  { policyId: shortProject.id, agendaCost: 1 },
                ]
              : month === 1
                ? [
                    {
                      policyId: BRAND_ACTION_ID,
                      agendaCost: 1,
                      params: { proposalId: `${shortProject.id}_0`, name: 'Escolas do futuro' },
                    },
                  ]
                : [];
          const input = { decisions };
          const result = advanceMonth(state, input, c);
          expect(result.report.rejected).toEqual([]);
          expect(checkInvariants(state, result.state, result.report, c)).toEqual([]);
          if (month === 17 || month === months - 1) {
            expect(advanceMonth(JSON.parse(JSON.stringify(state)), input, c)).toEqual(result);
          }
          state = result.state;
        }
        expect(state.publicPolicies.projects[0].phase).toBe('operacao');
        expect(state.publicPolicies.brands[0].name).toBe('Escolas do futuro');
      }
      // 240 meses × 3 sementes: com o coverage do CI e os outros arquivos em paralelo passa do limite padrão de 5 s.
    }, 60_000);
  }
});
