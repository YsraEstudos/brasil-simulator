import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from './r3f';
import { caravanPosition } from './caravan';

/** Um marcador simples percorre uma rota ilustrativa por até dois segundos. */
export function CaravanMarker({
  destination,
  reduceMotion,
  drawing,
}: {
  destination: string;
  reduceMotion: boolean;
  drawing: boolean;
}) {
  const marker = useRef<THREE.Mesh>(null);
  const elapsed = useRef(0);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    elapsed.current = 0;
    invalidate();
  }, [destination, reduceMotion, invalidate]);
  useFrame((_state, delta) => {
    if (!drawing || !marker.current) return;
    elapsed.current += Math.min(delta, 0.05);
    const progress = reduceMotion ? 1 : Math.min(1, elapsed.current / 2);
    marker.current.position.set(...caravanPosition(destination, progress, reduceMotion));
    if (progress < 1) invalidate();
  });
  return (
    <mesh ref={marker} position={caravanPosition(destination, 0, reduceMotion)}>
      <sphereGeometry args={[0.008, 12, 8]} />
      <meshBasicMaterial color="#ffd166" />
    </mesh>
  );
}
