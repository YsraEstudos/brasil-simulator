import healthJson from '@/data/health/saude_regional.json';
import pressJson from '@/data/press/imprensa.json';
import { parseHealthCatalog, type HealthCatalog } from '@/types/health';
import { parsePressCatalog, type PressCatalog } from '@/types/press';

/**
 * Saúde regional e imprensa (PLANO_EXPANSAO R8: EX-26, EX-27, EX-28), comuns a todos os cenários. Validados ao carregar
 * (um JSON inválido é erro de desenvolvimento).
 */
function loadHealth(raw: unknown): HealthCatalog {
  const r = parseHealthCatalog(raw);
  if (!r.ok) throw new Error(`saúde regional inválida:\n${r.errors.join('\n')}`);
  return r.catalog;
}

function loadPress(raw: unknown): PressCatalog {
  const r = parsePressCatalog(raw);
  if (!r.ok) throw new Error(`catálogo de imprensa inválido:\n${r.errors.join('\n')}`);
  return r.catalog;
}

export const HEALTH: HealthCatalog = loadHealth(healthJson);
export const PRESS: PressCatalog = loadPress(pressJson);
