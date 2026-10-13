import { blockSide } from './config';

/** Bloco (atlas) que contém o tile, e a posição do tile dentro dele. */
export function blockOf(tileId: string): { key: string; cellX: number; cellY: number; side: number } {
  const [z, x, y] = tileId.split('/').map(Number);
  const side = blockSide(z);
  return { key: `${z}/${Math.floor(x / side)}/${Math.floor(y / side)}`, cellX: x % side, cellY: y % side, side };
}

/**
 * Política LRU: blocos a descartar para voltar ao limite. Nunca descarta o bloco raiz nem blocos
 * usados no quadro atual (desenhados ou ancestrais de desenhados).
 */
export function pickEvictions(lastUsed: ReadonlyMap<string, number>, frame: number, cap: number): string[] {
  if (lastUsed.size <= cap) return [];
  return [...lastUsed.entries()]
    .filter(([key, used]) => key !== '0/0/0' && used < frame)
    .sort((a, b) => a[1] - b[1])
    .slice(0, lastUsed.size - cap)
    .map(([key]) => key);
}
