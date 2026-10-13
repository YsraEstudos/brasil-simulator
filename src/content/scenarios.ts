import brasil from '@/data/scenarios/brasil_2027_01.json';
import prototipo from '@/data/scenarios/prototipo_ficticio.json';
import { parseScenario, type Scenario } from '@/types/scenario';

/** Cenários embutidos no app, validados ao carregar (um JSON inválido é erro de desenvolvimento). */
function load(raw: unknown): Scenario {
  const r = parseScenario(raw);
  if (!r.ok) throw new Error(`cenário inválido:\n${r.errors.join('\n')}`);
  return r.scenario;
}

export const SCENARIOS: Record<string, Scenario> = {
  prototipo_ficticio: load(prototipo),
  brasil_2027_01: load(brasil),
};

export const DEFAULT_SCENARIO_ID = 'brasil_2027_01';

/** Protótipo 0.1: a campanha termina em dez/2027 (GAME_DESIGN.md §7.1). */
export const PROTOTYPE_MONTHS = 12;
