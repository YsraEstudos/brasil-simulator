import climatologyJson from '@/data/climate/climatologia.json';
import { parseClimatology, type Climatology } from '@/types/climate';

/**
 * Climatologia compartilhada por todos os cenários (PLANO_GLOBO.md §6.1): normais de chuva por UF × mês e
 * teleconexão ENSO. Validada ao carregar (um JSON inválido é erro de desenvolvimento).
 */
function load(raw: unknown): Climatology {
  const r = parseClimatology(raw);
  if (!r.ok) throw new Error(`climatologia inválida:\n${r.errors.join('\n')}`);
  return r.climatology;
}

export const CLIMATOLOGY: Climatology = load(climatologyJson);
