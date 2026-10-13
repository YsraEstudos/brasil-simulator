import { describe, expect, it } from 'vitest';

import { createInitialState, DEFAULT_CALIBRATION, indicatorsFromScenario } from '../engine';
import { dataValueSchema, type DataValue } from './data';
import { parsePolicy, type Policy } from './policy';
import { parseScenario, type Scenario } from './scenario';

const prov = (value: number, unit = 'fração'): DataValue => ({ value, unit, status: 'PROVISORIO' });

// Política 1 do protótipo (GAME_DESIGN.md §11.2). Números PROVISORIO, só para teste.
const infra: Policy = {
  id: 'infraestrutura_credito_adicional',
  name: 'R$ 15 bi adicionais para infraestrutura',
  summary: 'Crédito adicional por PLN para obras federais de transporte.',
  area: 'infraestrutura',
  competence: 'federal',
  instruments: ['pln', 'ato_execucao'],
  agendaCost: 1,
  cost: { annualMillions: 15000, disbursementProfile: [0.2, 0.45, 0.35] },
  fundingSources: ['credito_adicional', 'remanejamento'],
  timeline: { planningMonths: 3, expectedLegislativeMonths: 3, executionMonths: 30, maturationMonths: 12 },
  conditions: ['espaco_no_limite_de_despesas'],
  impacts: [
    { channel: 'investimento_publico', magnitude: 15000, lagMonths: 4 },
    { channel: 'capital_publico', magnitude: 0.9, lagMonths: 30 },
  ],
  risks: [
    { kind: 'atraso', probability: 0.3 },
    { kind: 'sobrecusto', probability: 0.2 },
  ],
  affected: { groups: ['trabalhadores_construcao'], sectors: ['construcao'], regions: ['nacional'] },
  position: { economic: -0.2, social: 0 },
  dataStatus: 'PROVISORIO',
};

const scenario: Scenario = {
  id: 'teste_2027',
  version: '0.1.0',
  name: 'Cenário de teste',
  startPeriod: '2027-01',
  indicators: {
    approval: prov(0.45),
    gdpGrowth12m: prov(0.02),
    inflation12m: prov(0.045),
    unemployment: prov(0.06),
    primaryBalance12m: prov(-0.005),
  },
  parameters: { kappa: prov(0.25, 'coeficiente'), 'mult_base.investimento': prov(0.8, 'coeficiente') },
  blocs: [
    {
      id: 'esquerda',
      name: 'Esquerda',
      chamberSeats: 120,
      senateSeats: 15,
      ideology: { economic: -0.7, social: -0.6 },
      cohesion: 0.9,
      governmentRelation: 0,
      interests: ['social'],
    },
    {
      id: 'centro',
      name: 'Centro',
      chamberSeats: 250,
      senateSeats: 40,
      ideology: { economic: 0.1, social: 0.2 },
      cohesion: 0.6,
      governmentRelation: 0,
      interests: ['emendas'],
    },
    {
      id: 'direita',
      name: 'Direita',
      chamberSeats: 143,
      senateSeats: 26,
      ideology: { economic: 0.7, social: 0.7 },
      cohesion: 0.8,
      governmentRelation: 0,
      interests: ['agro'],
    },
  ],
  copomMonths: [1, 3, 5, 6, 7, 9, 11, 12],
  policies: ['infraestrutura_credito_adicional'],
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe('DataValue (DATA_SOURCES.md §2)', () => {
  it('aceita valor provisório sem fonte', () => {
    expect(dataValueSchema.safeParse(prov(0.1)).success).toBe(true);
  });

  it('exige fonte e data de referência para valor REAL', () => {
    const r = dataValueSchema.safeParse({ value: 0.045, unit: 'fração', status: 'REAL' });
    expect(r.success).toBe(false);
    const ok = dataValueSchema.safeParse({
      value: 0.045,
      unit: 'fração',
      status: 'REAL',
      source: 'ibge',
      series: 'SIDRA 1737',
      referenceDate: '2026-09',
      retrievedAt: '2026-10-13',
    });
    expect(ok.success).toBe(true);
  });

  it('exige método para valor ESTIMADO e rejeita não finitos e campos desconhecidos', () => {
    const base = { value: 1, unit: 'x', status: 'ESTIMADO', source: 'ibge', referenceDate: '2026-12' };
    expect(dataValueSchema.safeParse(base).success).toBe(false);
    expect(dataValueSchema.safeParse({ ...base, method: 'extrapolação linear' }).success).toBe(true);
    expect(dataValueSchema.safeParse({ ...prov(0), value: Infinity }).success).toBe(false);
    expect(dataValueSchema.safeParse({ ...prov(0), extra: 1 }).success).toBe(false);
  });
});

describe('Policy (GAME_DESIGN.md §9.1)', () => {
  it('aceita a política de infraestrutura do protótipo', () => {
    expect(parsePolicy(infra)).toEqual({ ok: true, policy: infra });
  });

  it('rejeita perfil de desembolso que não soma 1, id com acento e custo de agenda fora da faixa', () => {
    const p = clone(infra);
    p.cost.disbursementProfile = [0.5, 0.3];
    p.id = 'infraestrutura_ferrovias_ção';
    p.agendaCost = 5;
    const r = parsePolicy(p);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.startsWith('cost.disbursementProfile'))).toBe(true);
      expect(r.errors.some((e) => e.startsWith('id'))).toBe(true);
      expect(r.errors.some((e) => e.startsWith('agendaCost'))).toBe(true);
    }
  });

  it('decreto não tem tramitação no Congresso', () => {
    const p = clone(infra);
    p.instruments = ['decreto_aliquota'];
    expect(parsePolicy(p).ok).toBe(false);
    p.timeline.expectedLegislativeMonths = 0;
    expect(parsePolicy(p).ok).toBe(true);
  });

  it('MP não abre crédito adicional comum (POLITICAL_RULES.md §3.1)', () => {
    const p = clone(infra);
    p.instruments = ['medida_provisoria'];
    expect(parsePolicy(p).ok).toBe(false);
    p.fundingSources = ['credito_extraordinario'];
    expect(parsePolicy(p).ok).toBe(true);
  });
});

describe('Scenario', () => {
  it('aceita um cenário válido e alimenta o motor', () => {
    const r = parseScenario(scenario);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const content = { scenario: r.scenario, policies: {}, events: [], calibration: DEFAULT_CALIBRATION };
    const state = createInitialState({ content, difficulty: 'casual', seed: 1 });
    expect(state.indicators.inflation12m).toBe(0.045);
    expect(state.resources.agendaPointsPerMonth).toBe(4);
  });

  it('cadeiras somam 513 na Câmara e 81 no Senado (POLITICAL_RULES.md §3)', () => {
    const s = clone(scenario);
    s.blocs[0].chamberSeats += 1;
    s.blocs[1].senateSeats -= 1;
    const r = parseScenario(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.filter((e) => e.startsWith('blocs'))).toHaveLength(2);
  });

  it('rejeita indicador em porcentagem inteira, Copom com mês repetido e ids repetidos', () => {
    const s = clone(scenario);
    s.indicators.unemployment = prov(6); // 6 em vez de 0,06 (ECONOMIC_MODEL.md §2)
    s.copomMonths = [1, 1, 5, 6, 7, 9, 11, 12];
    s.policies = ['a', 'a'];
    const r = parseScenario(s);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.startsWith('indicators.unemployment'))).toBe(true);
      expect(r.errors.some((e) => e.startsWith('copomMonths'))).toBe(true);
      expect(r.errors.some((e) => e.startsWith('policies'))).toBe(true);
    }
  });

  it('as chaves de indicadores do cenário são as mesmas do motor', () => {
    const fromScenario = Object.keys(scenario.indicators).sort();
    const fromEngine = Object.keys(indicatorsFromScenario(scenario)).sort();
    expect(fromScenario).toEqual(fromEngine);
  });
});
