import { DEFAULT_CALIBRATION } from '@/engine/economy/calibration';
import { createInitialState } from '@/engine/state';
import type { Difficulty, GameContent, GameState } from '@/engine/types';
import type { DataValue } from '@/types/data';
import type { GameEvent } from '@/types/event';
import type { Policy } from '@/types/policy';
import type { Scenario } from '@/types/scenario';

/**
 * Conteúdo pequeno e fixo para testes do motor, independente dos JSON do jogo (que podem mudar de valor).
 * Todos os números são PROVISORIO.
 */

const prov = (value: number, unit = 'fração'): DataValue => ({ value, unit, status: 'PROVISORIO' });

/** Ato do Executivo: decreto, executa no mês seguinte. */
export const TEST_DECREE: Policy = {
  id: 'teste_decreto_corte',
  name: 'Corte por decreto',
  summary: 'Contingenciamento de custeio por decreto.',
  area: 'fiscal',
  competence: 'federal',
  instruments: ['decreto_programacao'],
  agendaCost: 1,
  cost: { annualMillions: -20000, disbursementProfile: [1] },
  fundingSources: ['sem_custo'],
  timeline: { planningMonths: 0, expectedLegislativeMonths: 0, executionMonths: 12, maturationMonths: 0 },
  conditions: [],
  impacts: [
    { channel: 'custeio', magnitude: -20000, lagMonths: 1 },
    { channel: 'aprovacao', magnitude: -0.01, lagMonths: 0 },
  ],
  risks: [],
  affected: { groups: ['servidores'], sectors: ['servicos'], regions: ['nacional'] },
  position: { economic: 0.4, social: 0 },
  dataStatus: 'PROVISORIO',
};

/** Projeto de lei ordinária: passa pelo Congresso. */
export const TEST_BILL: Policy = {
  id: 'teste_pl_transferencia',
  name: 'Ampliar transferência de renda',
  summary: 'PL que amplia o programa de transferência de renda.',
  area: 'social',
  competence: 'federal',
  instruments: ['projeto_lei', 'decreto_regulamentar'],
  agendaCost: 1,
  cost: { annualMillions: 30000, disbursementProfile: [1] },
  fundingSources: ['credito_adicional'],
  timeline: { planningMonths: 0, expectedLegislativeMonths: 2, executionMonths: 0, maturationMonths: 0 },
  conditions: ['espaco_no_limite_de_despesas'],
  impacts: [
    { channel: 'transferencia_baixa_renda', magnitude: 30000, lagMonths: 1 },
    { channel: 'aprovacao', magnitude: 0.02, lagMonths: 1 },
  ],
  risks: [],
  affected: { groups: ['baixa_renda'], sectors: ['comercio'], regions: ['nacional'] },
  position: { economic: -0.5, social: -0.2 },
  dataStatus: 'PROVISORIO',
};

/** PEC: 3/5 em dois turnos em cada Casa. */
export const TEST_PEC: Policy = {
  id: 'teste_pec',
  name: 'PEC de teste',
  summary: 'Emenda constitucional de teste.',
  area: 'estado',
  competence: 'federal',
  instruments: ['pec'],
  agendaCost: 2,
  cost: { annualMillions: -10000, disbursementProfile: [1] },
  fundingSources: ['sem_custo'],
  timeline: { planningMonths: 0, expectedLegislativeMonths: 4, executionMonths: 0, maturationMonths: 0 },
  conditions: [],
  impacts: [{ channel: 'despesa_obrigatoria', magnitude: -10000, lagMonths: 6 }],
  risks: [],
  affected: { groups: ['servidores'], sectors: [], regions: ['nacional'] },
  position: { economic: 0.6, social: 0.2 },
  dataStatus: 'PROVISORIO',
};

/** Medida provisória: vigência imediata; Câmara em 3 meses e Senado em mais 3 (passa dos 120 dias). */
export const TEST_MP: Policy = {
  id: 'teste_mp',
  name: 'MP de teste',
  summary: 'Medida provisória de teste.',
  area: 'seguranca',
  competence: 'federal',
  instruments: ['medida_provisoria'],
  agendaCost: 1,
  cost: { annualMillions: 6000, disbursementProfile: [1] },
  fundingSources: ['remanejamento'],
  timeline: { planningMonths: 0, expectedLegislativeMonths: 6, executionMonths: 24, maturationMonths: 0 },
  conditions: [],
  impacts: [{ channel: 'custeio', magnitude: 6000, lagMonths: 0 }],
  risks: [],
  affected: { groups: [], sectors: [], regions: ['nacional'] },
  position: { economic: 0, social: 0.3 },
  dataStatus: 'PROVISORIO',
};

/** Evento que sempre dispara em março (para testes determinísticos). */
export const TEST_EVENT: GameEvent = {
  id: 'teste_choque',
  title: 'Choque de teste',
  description: 'Um choque de preços de teste.',
  trigger: { monthsOfYear: [3], conditions: [], probability: 1, cooldownMonths: 12, maxOccurrences: 1 },
  onFire: [{ target: 'choque.inflacao', delta: 0.005, lagMonths: 0, durationMonths: 3 }],
  choices: [
    { id: 'absorver', label: 'Absorver', description: 'Não fazer nada.', agendaCost: 0, effects: [] },
    {
      id: 'subsidiar',
      label: 'Subsidiar',
      description: 'Subsidiar o preço.',
      agendaCost: 1,
      effects: [
        { target: 'gasto.custeio', delta: 0.001, lagMonths: 0, durationMonths: 6 },
        { target: 'aprovacao', delta: 0.005, lagMonths: 0, durationMonths: 1, label: 'Subsídio ao combustível' },
      ],
    },
  ],
  defaultChoice: 'absorver',
  dataStatus: 'FICTICIO',
};

export const TEST_SCENARIO: Scenario = {
  id: 'teste_2027',
  version: '0.1.0',
  name: 'Cenário de teste',
  startPeriod: '2027-01',
  indicators: {
    approval: prov(0.45),
    gdpGrowth12m: prov(0.02),
    inflation12m: prov(0.045),
    unemployment: prov(0.065),
    primaryBalance12m: prov(-0.005),
  },
  economy: {
    nominalGdpMillions: prov(13_000_000, 'R$ milhões'),
    outputGap: prov(0),
    selic: prov(0.1),
    inflationExpectation: prov(0.04),
    credibility: prov(0.75),
    grossDebt: prov(0.78),
    implicitRate: prov(0.11),
    revenue: prov(0.185),
    primarySpending: prov(0.19),
  },
  parameters: {},
  blocs: [
    {
      id: 'esquerda',
      name: 'Esquerda',
      chamberSeats: 120,
      senateSeats: 15,
      ideology: { economic: -0.7, social: -0.6 },
      cohesion: 0.9,
      governmentRelation: 40,
      interests: ['social'],
    },
    {
      id: 'centro',
      name: 'Centro',
      chamberSeats: 250,
      senateSeats: 40,
      ideology: { economic: 0.1, social: 0.2 },
      cohesion: 0.6,
      governmentRelation: 10,
      interests: ['emendas', 'fiscal'],
    },
    {
      id: 'direita',
      name: 'Direita',
      chamberSeats: 143,
      senateSeats: 26,
      ideology: { economic: 0.7, social: 0.7 },
      cohesion: 0.8,
      governmentRelation: -30,
      interests: ['agro'],
    },
  ],
  institutions: {
    housePresidents: { camara: 'centro', senado: 'centro' },
    ministries: [
      { id: 'fazenda', name: 'Fazenda', areas: ['fiscal', 'tributacao'], weight: 1, occupant: 'tecnico' },
      { id: 'social', name: 'Desenvolvimento Social', areas: ['social'], weight: 0.7, occupant: 'tecnico' },
      { id: 'gestao', name: 'Gestão', areas: ['estado'], weight: 0.5, occupant: 'tecnico' },
    ],
  },
  copomMonths: [1, 3, 5, 6, 7, 9, 11, 12],
  policies: [TEST_DECREE.id, TEST_BILL.id, TEST_PEC.id, TEST_MP.id],
};

export function testContent(overrides: Partial<GameContent> = {}): GameContent {
  return {
    scenario: TEST_SCENARIO,
    policies: {
      [TEST_DECREE.id]: TEST_DECREE,
      [TEST_BILL.id]: TEST_BILL,
      [TEST_PEC.id]: TEST_PEC,
      [TEST_MP.id]: TEST_MP,
    },
    events: [TEST_EVENT],
    calibration: DEFAULT_CALIBRATION,
    ...overrides,
  };
}

export function testState(seed = 42, difficulty: Difficulty = 'estrategica', content = testContent()): GameState {
  return createInitialState({ content, difficulty, seed });
}
