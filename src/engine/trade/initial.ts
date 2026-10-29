import type { TradeCatalog } from '../../types/trade';
import type { TradeState } from './types';

/** Comércio no início da campanha: tarifa-base, relações iniciais, sem choques e sem desvio de fluxo. */
export function initialTrade(catalog: TradeCatalog | undefined): TradeState {
  return {
    tariff: catalog?.tariff.base ?? 0,
    partners: (catalog?.partners ?? []).map((p) => ({ id: p.id, relation: p.initialRelation })),
    shocks: [],
    flows: {
      exports: 0,
      techExports: 0,
      imports: 0,
      techImports: 0,
      net: 0,
      tariffRevenue: 0,
      sectors: { agropecuaria: 0, extrativa: 0, industria: 0, servicos: 0 },
    },
  };
}
