import { useEffect, useState } from 'react';

import type { IndicatorPoint } from '@/database/campaignRepository';
import { gameStore, useGame } from '@/store';

/**
 * Série de longo prazo da partida ativa (`indicator_history`), relida do banco quando a partida ou o mês mudam.
 * `null` enquanto a leitura não chegou: o par (id, pontos) evita mostrar a série de outra partida nesse meio-tempo.
 */
export function useIndicatorHistory(): IndicatorPoint[] | null {
  const activeId = useGame((s) => s.active?.id);
  const monthIndex = useGame((s) => s.active?.state.monthIndex);
  const [series, setSeries] = useState<{ id: string; points: IndicatorPoint[] } | null>(null);

  useEffect(() => {
    if (activeId === undefined) return;
    let live = true;
    void gameStore
      .getState()
      .history()
      .then((points) => {
        if (live) setSeries({ id: activeId, points });
      });
    return () => {
      live = false;
    };
  }, [activeId, monthIndex]);

  return activeId !== undefined && series?.id === activeId ? series.points : null;
}
