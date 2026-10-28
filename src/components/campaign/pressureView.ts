import { formatNumber } from '@/components/ui/format';
import { BC_BOARD_SIZE, pressureForecast, type GameContent, type GameState } from '@/engine';

import { shortMonthLabel } from './labels';

/**
 * Efeito provável da pressão sobre o BC (ECONOMIC_MODEL.md §5.4.2, análise da Fase C6f): diretoria indicada, corte
 * esperado na próxima reunião do Copom (nenhum quando o BC resiste), o custo certo e o aviso de pressão repetida.
 */
export function pressureContext(state: GameState, content: GameContent): string {
  const f = pressureForecast(state, content);
  const board = `Este governo indicou ${formatNumber(f.indicated)} de ${BC_BOARD_SIZE} membros da diretoria.`;
  const meeting =
    f.nextCopomMonth === null ? 'na próxima reunião do Copom' : `no Copom de ${shortMonthLabel(f.nextCopomMonth)}`;
  const effect =
    f.cut > 0
      ? ` Efeito provável: corte extra de até ${formatNumber(f.cut * 10000)} pontos-base ${meeting}.`
      : ` Efeito provável: nenhum corte ${meeting}, porque o BC resiste com poucos diretores indicados.`;
  const points = f.credibilityCost * 100;
  const cost =
    ` Custo certo: credibilidade cai ${formatNumber(points, 0)} ${Math.round(points) === 1 ? 'ponto' : 'pontos'} e o prêmio de risco sobe;` +
    ' meses depois, a inflação e os juros tendem a ficar mais altos.';
  const repeat = f.alreadyPending
    ? ' Já há pressão valendo para essa reunião: pressionar de novo não aumenta o corte, só o custo.'
    : f.previous12m > 0
      ? ` Já houve ${formatNumber(f.previous12m)} pressão${f.previous12m > 1 ? 'ões' : ''} nos últimos 12 meses: esta custa mais.`
      : '';
  return `${board}${effect}${cost}${repeat}`;
}
