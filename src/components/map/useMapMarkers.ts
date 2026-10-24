import { useEffect, useMemo, useSyncExternalStore } from 'react';

import type { GameContent, GameState } from '@/engine';

import { claimNewCritical, pulsingInstances, subscribeMarkerSession } from './markerSession';
import { buildMarkerItems, groupMarkers, type MapMarker } from './markersView';

const NO_PULSE: readonly string[] = [];

interface CampaignLike {
  id: string;
  state: Pick<GameState, 'monthIndex'> & { events: Pick<GameState['events'], 'pending' | 'news'> };
  finished: boolean;
}

/**
 * Marcadores do mapa da partida em andamento (`markersView`), com `pulse` ligado nos que têm evento crítico novo. Sem
 * partida, ou com a campanha encerrada, não há marcador. O pulso é registrado ao ser pedido (`markerSession`): cada
 * instância pulsa uma vez por sessão, e os renderizadores derivam o disparo de `markerPulseKey`.
 */
export function useMapMarkers(
  campaign: CampaignLike | null,
  content: Pick<GameContent, 'events' | 'scenario'>,
): readonly MapMarker[] {
  const campaignId = campaign?.id;
  const events = campaign?.state.events;
  const monthIndex = campaign?.state.monthIndex;
  const playing = campaign !== null && !campaign.finished;

  const items = useMemo(
    () =>
      playing && events !== undefined && monthIndex !== undefined
        ? buildMarkerItems({ monthIndex, events }, content)
        : [],
    [playing, events, monthIndex, content],
  );

  useEffect(() => {
    if (campaignId !== undefined) claimNewCritical(campaignId, items);
  }, [campaignId, items]);
  const pulsing = useSyncExternalStore(subscribeMarkerSession, () =>
    campaignId === undefined ? NO_PULSE : pulsingInstances(campaignId),
  );

  return useMemo(() => groupMarkers(items, new Set(pulsing)), [items, pulsing]);
}
