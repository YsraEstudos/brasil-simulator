import { useLocalSearchParams } from 'expo-router';

import { GlobeView } from '@/globe/GlobeView';

export default function BrasilScreen() {
  // Parâmetros opcionais de câmera inicial (ex.: /brasil?lon=-45.3&lat=-22.6&alt=0.03)
  const { lon, lat, alt } = useLocalSearchParams<{ lon?: string; lat?: string; alt?: string }>();
  const initial = lon && lat ? { lon: Number(lon), lat: Number(lat), altitude: alt ? Number(alt) : 0.1 } : undefined;
  return <GlobeView initial={initial} />;
}
