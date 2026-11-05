import { useEffect, useState } from 'react';

import type { FiredEvent, IndicatorPoint } from '@/database/campaignRepository';
import { gameStore, useGame } from '@/store';

/** Leituras do banco da partida ativa usadas pelos gráficos, pelo nome do método da store. */
interface CampaignReads {
  history: IndicatorPoint[];
  firedEvents: FiredEvent[];
}

/**
 * Lê do banco a partida ativa e relê quando a partida ou o mês mudam. `null` enquanto a leitura não chegou: o par
 * (id, valor) evita mostrar dados de outra partida nesse meio-tempo.
 */
function useCampaignRead<K extends keyof CampaignReads>(method: K): CampaignReads[K] | null {
  const activeId = useGame((s) => s.active?.id);
  const monthIndex = useGame((s) => s.active?.state.monthIndex);
  const [read, setRead] = useState<{ id: string; value: CampaignReads[K] } | null>(null);

  useEffect(() => {
    if (activeId === undefined) return;
    let live = true;
    void (gameStore.getState()[method]() as Promise<CampaignReads[K]>).then((value) => {
      if (live) setRead({ id: activeId, value });
    });
    return () => {
      live = false;
    };
  }, [activeId, monthIndex, method]);

  return activeId !== undefined && read?.id === activeId ? read.value : null;
}

/** Série de longo prazo da partida ativa (`indicator_history`). */
export function useIndicatorHistory(): IndicatorPoint[] | null {
  return useCampaignRead('history');
}

/** Eventos disparados na partida ativa (marcas de crise do gráfico). */
export function useFiredEvents(): FiredEvent[] | null {
  return useCampaignRead('firedEvents');
}
