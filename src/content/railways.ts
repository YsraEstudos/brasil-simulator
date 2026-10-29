import railwaysJson from '@/data/railways/rede_ferroviaria.json';
import { parseRailwayNetwork, type RailwayNetwork } from '@/types/railways';

/**
 * Rede ferroviária nacional (PLANO_EXPANSAO EX-30): dado de consulta do mapa, comum a todos os cenários e fora do
 * motor. Validada ao carregar (um JSON inválido é erro de desenvolvimento).
 */
function load(raw: unknown): RailwayNetwork {
  const r = parseRailwayNetwork(raw);
  if (!r.ok) throw new Error(`rede ferroviária inválida:\n${r.errors.join('\n')}`);
  return r.network;
}

export const RAILWAYS: RailwayNetwork = load(railwaysJson);
