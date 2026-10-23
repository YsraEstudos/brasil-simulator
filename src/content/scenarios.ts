import brasil from '@/data/scenarios/brasil_2027_01.json';
import brasilV050 from '@/data/scenarios/brasil_2027_01_v050.json';
import brasilV060 from '@/data/scenarios/brasil_2027_01_v060.json';
import brasilV070 from '@/data/scenarios/brasil_2027_01_v070.json';
import brasilV080 from '@/data/scenarios/brasil_2027_01_v080.json';
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
  brasil_2027_01_v050: load(brasilV050),
  brasil_2027_01_v060: load(brasilV060),
  brasil_2027_01_v070: load(brasilV070),
  brasil_2027_01_v080: load(brasilV080),
};

export const LEGACY_SCENARIO_ID = 'brasil_2027_01';
export const DEFAULT_SCENARIO_ID = 'brasil_2027_01_v080';

/** Protótipo 0.1: a campanha termina em dez/2027 (GAME_DESIGN.md §7.1). */
export const PROTOTYPE_MONTHS = 12;
/** Campanha completa da Fase 06: janeiro/2027 a dezembro/2030. */
export const CAMPAIGN_MONTHS = 48;
/** Campanha de dois mandatos da Fase 08 (eleições): janeiro/2027 a dezembro/2034. */
export const TWO_TERM_MONTHS = 96;

/** Cenários de campanha completa (48 meses): v0.5.0 (Fase 06) e v0.6.0 (Fase 07, com elenco). */
const FULL_CAMPAIGN_SCENARIO_IDS: readonly string[] = ['brasil_2027_01_v050', 'brasil_2027_01_v060'];
/** Cenários de dois mandatos (96 meses): v0.7.0 (Fase 08, com calendário eleitoral) e v0.8.0 (inclinação das UFs). */
const TWO_TERM_SCENARIO_IDS: readonly string[] = ['brasil_2027_01_v070', 'brasil_2027_01_v080'];

export function campaignMonths(scenarioId: string): number {
  if (TWO_TERM_SCENARIO_IDS.includes(scenarioId)) return TWO_TERM_MONTHS;
  return FULL_CAMPAIGN_SCENARIO_IDS.includes(scenarioId) ? CAMPAIGN_MONTHS : PROTOTYPE_MONTHS;
}
