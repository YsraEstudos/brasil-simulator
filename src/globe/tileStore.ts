import { Asset } from 'expo-asset';
import { Platform } from 'react-native';
import * as THREE from 'three';

import { blockOf, pickEvictions } from './cache';
import { MAX_CONCURRENT_LOADS, TILE_CACHE_BLOCKS } from './config';
import { BLOCK_ASSETS, TILE_MAX_HEIGHT } from './data/tileIndex';

type Block = { color: THREE.Texture; height: THREE.Texture; lastUsed: number };

/** Texturas de um tile: o atlas do bloco e a célula do tile dentro dele. */
export type TileTextures = { color: THREE.Texture; height: THREE.Texture; cellX: number; cellY: number; side: number };

const loader = new THREE.TextureLoader();

export function loadTexture(mod: number): Promise<THREE.Texture> {
  // No nativo o polyfill do R3F aceita o id do módulo; na web precisamos da URL.
  const src = Platform.OS === 'web' ? Asset.fromModule(mod).uri : (mod as unknown as string);
  return new Promise((resolve, reject) => loader.load(src, resolve, undefined, reject));
}

/**
 * Carrega os blocos (atlas de tiles) sob demanda, com limite de concorrência e descarte LRU.
 * O bloco raiz nunca é descartado.
 */
export class TileStore {
  private blocks = new Map<string, Block>();
  private loading = new Set<string>();
  private queue: string[] = [];
  private frame = 0;

  constructor(
    private onChange: () => void,
    private maxAnisotropy = 1,
  ) {}

  exists = (id: string) => id in TILE_MAX_HEIGHT;
  isLoaded = (id: string) => this.blocks.has(blockOf(id).key);
  maxHeightMeters = (id: string) => TILE_MAX_HEIGHT[id] ?? 0;

  get(id: string): TileTextures | undefined {
    const b = blockOf(id);
    const block = this.blocks.get(b.key);
    if (!block) return undefined;
    block.lastUsed = this.frame;
    return { color: block.color, height: block.height, cellX: b.cellX, cellY: b.cellY, side: b.side };
  }

  /** Marca os blocos destes tiles como usados neste quadro (protege-os do descarte LRU). */
  touch(tileIds: string[]) {
    for (const id of tileIds) {
      const block = this.blocks.get(blockOf(id).key);
      if (block) block.lastUsed = this.frame;
    }
  }

  get size() {
    return this.blocks.size;
  }

  /** Substitui a fila pelos pedidos atuais (os mais grosseiros primeiro). */
  request(tileIds: string[]) {
    this.frame++;
    const keys = new Set<string>();
    for (const id of tileIds) if (this.exists(id)) keys.add(blockOf(id).key);
    this.queue = [...keys]
      .filter((k) => !this.blocks.has(k) && !this.loading.has(k))
      .sort((a, b) => Number(a.split('/')[0]) - Number(b.split('/')[0]));
    this.pump();
  }

  private pump() {
    while (this.loading.size < MAX_CONCURRENT_LOADS && this.queue.length > 0) {
      this.load(this.queue.shift()!);
    }
  }

  private async load(key: string) {
    this.loading.add(key);
    const assets = BLOCK_ASSETS[key];
    try {
      const [color, height] = await Promise.all([loadTexture(assets.color), loadTexture(assets.height)]);
      color.colorSpace = THREE.NoColorSpace;
      color.anisotropy = this.maxAnisotropy;
      color.minFilter = THREE.LinearMipmapLinearFilter;
      color.magFilter = THREE.LinearFilter;
      color.wrapS = color.wrapT = THREE.ClampToEdgeWrapping;
      color.needsUpdate = true;
      height.colorSpace = THREE.NoColorSpace;
      height.minFilter = THREE.NearestFilter;
      height.magFilter = THREE.NearestFilter;
      height.generateMipmaps = false;
      height.needsUpdate = true;
      this.blocks.set(key, { color, height, lastUsed: this.frame });
      this.evict();
    } catch (e) {
      if (__DEV__) console.warn(`bloco ${key} falhou`, e);
    } finally {
      this.loading.delete(key);
      this.onChange();
      this.pump();
    }
  }

  private evict() {
    const lastUsed = new Map([...this.blocks].map(([key, b]) => [key, b.lastUsed]));
    for (const key of pickEvictions(lastUsed, this.frame, TILE_CACHE_BLOCKS)) {
      const b = this.blocks.get(key)!;
      b.color.dispose();
      b.height.dispose();
      this.blocks.delete(key);
    }
  }

  dispose() {
    for (const b of this.blocks.values()) {
      b.color.dispose();
      b.height.dispose();
    }
    this.blocks.clear();
    this.queue = [];
  }
}
