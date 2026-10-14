import { useLocalSearchParams } from 'expo-router';

import { BrazilPanel } from '@/components/brasil/BrazilPanel';
import { loadContent } from '@/content';
import { regionsOf } from '@/engine';
import { GlobeView } from '@/globe/GlobeView';
import { useGame } from '@/store';

export default function BrasilScreen() {
  // Parâmetros opcionais de câmera inicial (ex.: /brasil?lon=-45.3&lat=-22.6&alt=0.03)
  const { lon, lat, alt } = useLocalSearchParams<{ lon?: string; lat?: string; alt?: string }>();
  const initial = lon && lat ? { lon: Number(lon), lat: Number(lat), altitude: alt ? Number(alt) : 0.1 } : undefined;
  const active = useGame((s) => s.active);
  // Com partida em andamento e cenário com UFs, o globo vira o mapa da federação (Fase 05).
  if (active && regionsOf(loadContent(active.state.scenarioId)).length > 0) {
    return <BrazilPanel key={active.id} campaign={active} />;
  }
  return <GlobeView initial={initial} />;
}
