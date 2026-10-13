import type { Scenario } from '../types/scenario';

import { seedRng } from './rng';
import { ENGINE_VERSION, STATE_SCHEMA_VERSION, type Difficulty, type GameState, type Indicators } from './types';

/** Pontos de agenda por dificuldade (GAME_DESIGN.md §6). */
export const AGENDA_POINTS: Record<Difficulty, number> = {
  casual: 4,
  estrategica: 3,
  realismo: 3,
};

export interface NewCampaign {
  scenarioId: string;
  difficulty: Difficulty;
  seed: number;
  /** Indicadores iniciais, vindos do cenário (Fase 02). */
  indicators: Indicators;
  /** Capital político inicial (início de mandato é alto; GAME_DESIGN.md §5). */
  politicalCapital?: number;
}

export function createInitialState(c: NewCampaign): GameState {
  if (!Number.isInteger(c.seed)) throw new RangeError(`semente deve ser inteira: ${c.seed}`);
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    scenarioId: c.scenarioId,
    difficulty: c.difficulty,
    seed: c.seed,
    rng: seedRng(c.seed),
    monthIndex: 0,
    indicators: { ...c.indicators },
    resources: {
      politicalCapital: c.politicalCapital ?? 70,
      agendaPointsPerMonth: AGENDA_POINTS[c.difficulty],
    },
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
