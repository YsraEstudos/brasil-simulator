import { calibrationFromScenario, type GameContent } from '@/engine';

import { CLIMATOLOGY } from './climate';
import { EVENTS } from './events';
import { POLICIES } from './policies';
import { SCENARIOS } from './scenarios';

export { CLIMATOLOGY } from './climate';
export { RAILWAYS } from './railways';
export { EVENTS } from './events';
export { POLICIES } from './policies';
export {
  DEFAULT_SCENARIO_ID,
  PROTOTYPE_MONTHS,
  CAMPAIGN_MONTHS,
  TWO_TERM_MONTHS,
  campaignMonths,
  SCENARIOS,
} from './scenarios';

const cache = new Map<string, GameContent>();

/** Conteúdo completo de um cenário, pronto para o motor (cenário, políticas, eventos e calibração). */
export function loadContent(scenarioId: string): GameContent {
  const cached = cache.get(scenarioId);
  if (cached) return cached;
  const scenario = SCENARIOS[scenarioId];
  if (!scenario) throw new Error(`cenário desconhecido: ${scenarioId}`);
  const missing = [...scenario.policies, ...(scenario.institutions?.fiscalBombs ?? [])].filter((id) => !POLICIES[id]);
  if (missing.length > 0 && Object.keys(POLICIES).length > 0) {
    throw new Error(`cenário ${scenarioId} cita políticas inexistentes: ${missing.join(', ')}`);
  }
  const content: GameContent = {
    scenario,
    policies: POLICIES,
    events: EVENTS,
    calibration: calibrationFromScenario(scenario.parameters),
    climatology: CLIMATOLOGY,
  };
  cache.set(scenarioId, content);
  return content;
}
