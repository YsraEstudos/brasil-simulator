import technologyJson from '@/data/technology/arvore_tecnologica.json';
import tradeJson from '@/data/trade/comercio_exterior.json';
import { parseTechnologyCatalog, type TechnologyCatalog } from '@/types/technology';
import { parseTradeCatalog, type TradeCatalog } from '@/types/trade';

/**
 * Árvore de tecnologias e comércio exterior (PLANO_EXPANSAO R7: EX-24, EX-25, EX-32), comuns a todos os cenários.
 * Validados ao carregar (um JSON inválido é erro de desenvolvimento).
 */
function loadTechnology(raw: unknown): TechnologyCatalog {
  const r = parseTechnologyCatalog(raw);
  if (!r.ok) throw new Error(`árvore de tecnologias inválida:\n${r.errors.join('\n')}`);
  return r.catalog;
}

function loadTrade(raw: unknown): TradeCatalog {
  const r = parseTradeCatalog(raw);
  if (!r.ok) throw new Error(`comércio exterior inválido:\n${r.errors.join('\n')}`);
  return r.catalog;
}

export const TECHNOLOGY: TechnologyCatalog = loadTechnology(technologyJson);
export const TRADE: TradeCatalog = loadTrade(tradeJson);
