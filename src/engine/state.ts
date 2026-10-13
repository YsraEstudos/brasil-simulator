import type { Scenario } from '../types/scenario';

import type { Calibration } from './economy/calibration';
import { seedRng } from './rng';
import {
  ENGINE_VERSION,
  STATE_SCHEMA_VERSION,
  type Difficulty,
  type EconomyState,
  type GameContent,
  type GameState,
  type Indicators,
} from './types';

/** Pontos de agenda por dificuldade (GAME_DESIGN.md §6). */
export const AGENDA_POINTS: Record<Difficulty, number> = {
  casual: 4,
  estrategica: 3,
  realismo: 3,
};

/** Capital político no início do mandato (alto; GAME_DESIGN.md §5). */
export const INITIAL_POLITICAL_CAPITAL = 70;

/**
 * Estado econômico usado quando o cenário não traz o bloco `economy` (cenários e saves anteriores à Fase 02).
 * Valores PROVISORIO, só para o jogo funcionar; ordens de grandeza do Brasil em 2026.
 */
export const FALLBACK_ECONOMY = {
  nominalGdpMillions: 13_000_000,
  outputGap: 0,
  selic: 0.1,
  inflationExpectation: 0.035,
  credibility: 0.75,
  grossDebt: 0.78,
  implicitRate: 0.11,
  revenue: 0.185,
  primarySpending: 0.19,
} as const;

export interface NewCampaign {
  content: GameContent;
  difficulty: Difficulty;
  seed: number;
  /** Capital político inicial (padrão: `INITIAL_POLITICAL_CAPITAL`). */
  politicalCapital?: number;
}

export function createInitialState(c: NewCampaign): GameState {
  if (!Number.isInteger(c.seed)) throw new RangeError(`semente deve ser inteira: ${c.seed}`);
  const { scenario, calibration } = c.content;
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    scenarioId: scenario.id,
    difficulty: c.difficulty,
    seed: c.seed,
    rng: seedRng(c.seed),
    monthIndex: 0,
    indicators: indicatorsFromScenario(scenario),
    resources: {
      politicalCapital: c.politicalCapital ?? INITIAL_POLITICAL_CAPITAL,
      agendaPointsPerMonth: AGENDA_POINTS[c.difficulty],
    },
    economy: initialEconomy(scenario, calibration),
    congress: { blocs: scenario.blocs.map((b) => ({ id: b.id, governmentRelation: b.governmentRelation })) },
    proposals: [],
    impulses: [],
    events: { pending: [], lastFired: {}, count: {} },
    decisionLog: [],
  };
}

/** Indicadores iniciais do cenário (só os valores; status e fonte ficam no cenário). */
export function indicatorsFromScenario(scenario: Scenario): Indicators {
  const i = scenario.indicators;
  return {
    approval: i.approval.value,
    gdpGrowth12m: i.gdpGrowth12m.value,
    inflation12m: i.inflation12m.value,
    unemployment: i.unemployment.value,
    primaryBalance12m: i.primaryBalance12m.value,
  };
}

/** Valores econômicos iniciais do cenário, ou os provisórios quando o cenário não os tem. */
export function scenarioEconomyValues(scenario: Pick<Scenario, 'economy'> | null) {
  const e = scenario?.economy;
  if (!e) return { ...FALLBACK_ECONOMY };
  return {
    nominalGdpMillions: e.nominalGdpMillions.value,
    outputGap: e.outputGap.value,
    selic: e.selic.value,
    inflationExpectation: e.inflationExpectation.value,
    credibility: e.credibility.value,
    grossDebt: e.grossDebt.value,
    implicitRate: e.implicitRate.value,
    revenue: e.revenue.value,
    primarySpending: e.primarySpending.value,
  };
}

export function initialEconomy(
  scenario: Pick<Scenario, 'economy'> | null,
  calibration: Pick<Calibration, 'g_pot_base'>,
): EconomyState {
  const v = scenarioEconomyValues(scenario);
  return {
    outputGap: v.outputGap,
    potentialGrowth: calibration.g_pot_base,
    selic: v.selic,
    effectiveRealRate: v.selic - v.inflationExpectation,
    inflationExpectation: v.inflationExpectation,
    credibility: v.credibility,
    grossDebt: v.grossDebt,
    implicitRate: v.implicitRate,
    revenue: v.revenue,
    primarySpending: v.primarySpending,
    monthlyPrimary: v.revenue - v.primarySpending,
    interest: v.implicitRate * v.grossDebt,
    debtAdjustment: 0,
  };
}

/** PIB nominal anual do cenário em R$ milhões (converte custos de políticas em fração do PIB). */
export function nominalGdpMillions(content: Pick<GameContent, 'scenario'>): number {
  return scenarioEconomyValues(content.scenario).nominalGdpMillions;
}
