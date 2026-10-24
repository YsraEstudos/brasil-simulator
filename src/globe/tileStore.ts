import { Asset } from 'expo-asset';
import { Platform } from 'react-native';
import * as THREE from 'three';

import { blockOf, pickEvictions } from './cache';
import { BLOCK_ASSETS, TILE_MAX_HEIGHT } from './data/tileIndex';
import { budgetOf, DEFAULT_PROFILE_3D } from './qualityProfiles';

/** Os tetos do perfil de qualidade que o cache obedece (o restante do orçamento é lido pelo LOD e pelo Canvas). */
export type TileStoreBudget = { tileCacheBlocks: number; maxConcurrentLoads: number };

type Block = { color: THREE.Texture; height: THREE.Texture; lastUsed: number };
type RetryState = { failures: number; retryAt: number; timer: ReturnType<typeof setTimeout> | null };

const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 30_000;

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
 * O bloco raiz nunca é descartado. Os tetos (blocos em cache e downloads simultâneos) vêm do perfil de qualidade e
 * podem mudar com o globo montado (`setBudget`): ao encolher, os blocos fora de uso saem na hora e o resto sai
 * assim que deixar de ser usado.
 */
export class TileStore {
  private blocks = new Map<string, Block>();
  private loading = new Set<string>();
  private queue: string[] = [];
  private requestedKeys = new Set<string>();
  private retries = new Map<string, RetryState>();
  private frame = 0;
  private budget: TileStoreBudget = budgetOf(DEFAULT_PROFILE_3D);
  private disposed = false;
  constructor(
    private onChange: () => void,
    private maxAnisotropy = 1,
  ) {}

  exists = (id: string) => Object.hasOwn(TILE_MAX_HEIGHT, id);
  isLoaded = (id: string) => this.blocks.has(blockOf(id).key);
  maxHeightMeters = (id: string) => (this.exists(id) ? TILE_MAX_HEIGHT[id] : 0);

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
    // Depois de marcar o que o quadro usa, o que passou do teto (cache encolhido) já pode sair.
    if (this.blocks.size > this.budget.tileCacheBlocks) this.evict();
  }

  get size() {
    return this.blocks.size;
  }

  /** Há bloco baixando ou na fila: o globo ainda está carregando detalhe. */
  get busy() {
    return this.loading.size > 0 || this.queue.length > 0;
  }

  /** Troca os tetos; vale já no próximo pedido. Encolher o cache libera as texturas fora de uso imediatamente. */
  setBudget(budget: TileStoreBudget) {
    this.budget = { tileCacheBlocks: budget.tileCacheBlocks, maxConcurrentLoads: budget.maxConcurrentLoads };
    this.evict();
    this.pump();
  }

  /** Substitui a fila pelos pedidos atuais (os mais grosseiros primeiro). */
  request(tileIds: string[]) {
    if (this.disposed) return;
    this.frame++;
    const keys = new Set<string>();
    for (const id of tileIds) if (this.exists(id)) keys.add(blockOf(id).key);
    this.requestedKeys = keys;
    for (const key of this.retries.keys()) if (!keys.has(key)) this.clearRetry(key);
    this.queue = [...keys]
      .filter((k) => !this.blocks.has(k) && !this.loading.has(k) && (this.retries.get(k)?.retryAt ?? 0) <= Date.now())
      .sort((a, b) => Number(a.split('/')[0]) - Number(b.split('/')[0]));
    this.pump();
  }

  private pump() {
    while (!this.disposed && this.loading.size < this.budget.maxConcurrentLoads && this.queue.length > 0) {
      // load() trata os próprios erros e nunca rejeita.
      void this.load(this.queue.shift()!);
    }
  }

  private async load(key: string) {
    this.loading.add(key);
    let color: THREE.Texture | undefined;
    let height: THREE.Texture | undefined;
    let cached = false;
    let failed = false;
    try {
      const assets = BLOCK_ASSETS[key];
      if (!assets) throw new Error(`bloco ${key} sem assets`);
      const [colorResult, heightResult] = await Promise.allSettled([
        loadTexture(assets.color),
        loadTexture(assets.height),
      ]);
      if (colorResult.status === 'fulfilled') color = colorResult.value;
      if (heightResult.status === 'fulfilled') height = heightResult.value;
      if (colorResult.status === 'rejected') throw colorResult.reason;
      if (heightResult.status === 'rejected') throw heightResult.reason;
      const colorTexture = colorResult.value;
      const heightTexture = heightResult.value;
      if (this.disposed) return;

      colorTexture.colorSpace = THREE.NoColorSpace;
      colorTexture.anisotropy = this.maxAnisotropy;
      colorTexture.minFilter = THREE.LinearMipmapLinearFilter;
      colorTexture.magFilter = THREE.LinearFilter;
      colorTexture.wrapS = colorTexture.wrapT = THREE.ClampToEdgeWrapping;
      colorTexture.needsUpdate = true;
      heightTexture.colorSpace = THREE.NoColorSpace;
      heightTexture.minFilter = THREE.NearestFilter;
      heightTexture.magFilter = THREE.NearestFilter;
      heightTexture.generateMipmaps = false;
      heightTexture.needsUpdate = true;
      this.blocks.set(key, { color: colorTexture, height: heightTexture, lastUsed: this.frame });
      cached = true;
      this.clearRetry(key);
      this.evict();
    } catch (e) {
      failed = true;
      if (!this.disposed && this.requestedKeys.has(key)) this.scheduleRetry(key);
      if (__DEV__) console.warn(`bloco ${key} falhou`, e);
    } finally {
      if (!cached) {
        color?.dispose();
        height?.dispose();
      }
      this.loading.delete(key);
      if (!this.disposed) {
        if (!failed) this.onChange();
        this.pump();
      }
    }
  }

  private scheduleRetry(key: string) {
    const previous = this.retries.get(key);
    if (previous?.timer) clearTimeout(previous.timer);
    const failures = (previous?.failures ?? 0) + 1;
    const delay = Math.min(RETRY_BASE_MS * 2 ** Math.min(failures - 1, 5), RETRY_MAX_MS);
    const retry: RetryState = { failures, retryAt: Date.now() + delay, timer: null };
    retry.timer = setTimeout(() => {
      retry.timer = null;
      if (this.disposed) return;
      if (!this.requestedKeys.has(key)) {
        this.retries.delete(key);
        return;
      }
      this.onChange();
    }, delay);
    this.retries.set(key, retry);
  }

  private clearRetry(key: string) {
    const retry = this.retries.get(key);
    if (retry?.timer) clearTimeout(retry.timer);
    this.retries.delete(key);
  }

  private evict() {
    const lastUsed = new Map([...this.blocks].map(([key, b]) => [key, b.lastUsed]));
    for (const key of pickEvictions(lastUsed, this.frame, this.budget.tileCacheBlocks)) {
      const b = this.blocks.get(key)!;
      b.color.dispose();
      b.height.dispose();
      this.blocks.delete(key);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const retry of this.retries.values()) if (retry.timer) clearTimeout(retry.timer);
    this.retries.clear();
    this.requestedKeys.clear();
    this.loading.clear();
    for (const b of this.blocks.values()) {
      b.color.dispose();
      b.height.dispose();
    }
    this.blocks.clear();
    this.queue = [];
  }
}
