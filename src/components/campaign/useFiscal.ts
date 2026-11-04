import { formatFiscal, formatFiscalShare, type FiscalFormatOptions } from '@/components/ui';
import { currentNominalGdpMillions, type GameContent, type GameState } from '@/engine';
import { useGame } from '@/store';

/**
 * Valores fiscais na unidade da preferência `prefs.fiscalUnit` (R$ ou % do PIB), convertidos com o PIB nominal
 * anual do momento. A conversão em si é pura (`formatFiscal` e `formatFiscalShare`, em `components/ui/format.ts`).
 */
export function useFiscal(state: GameState, content: GameContent) {
  const unit = useGame((s) => s.prefs.fiscalUnit);
  const gdp = currentNominalGdpMillions(state, content);
  return {
    unit,
    /** Valor do motor em R$ milhões (custos de políticas, orçamentos). */
    money: (millions: number, opts?: FiscalFormatOptions) => formatFiscal(millions, gdp, unit, opts),
    /** Fração do PIB que o motor já guarda (fluxo anualizado ou estoque). */
    share: (fraction: number, opts?: FiscalFormatOptions) => formatFiscalShare(fraction, gdp, unit, opts),
  };
}
