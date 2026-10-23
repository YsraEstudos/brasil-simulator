import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TileStore } from './tileStore';

vi.mock('expo-asset', () => ({ Asset: { fromModule: (moduleId: number) => ({ uri: String(moduleId) }) } }));
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('./data/tileIndex', () => ({
  BLOCK_ASSETS: { '0/0/0': { color: 1, height: 2 } },
  TILE_MAX_HEIGHT: { '0/0/0': 100 },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => vi.useRealTimers());

beforeEach(() => vi.stubGlobal('__DEV__', false));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockTextureLoads(responses: Promise<THREE.Texture>[]) {
  return vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation((_url, onLoad, _progress, onError) => {
    const response = responses.shift();
    if (!response) throw new Error('unexpected texture load');
    void response.then(
      (texture) => onLoad?.(texture as unknown as THREE.Texture<HTMLImageElement>),
      (error) => onError?.(error),
    );
    return new THREE.Texture();
  });
}

describe('TileStore', () => {
  it('backs off failed block loads instead of retrying on every frame', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const loadAsset = mockTextureLoads([
      Promise.reject(new Error('asset unavailable')),
      Promise.reject(new Error('asset unavailable')),
    ]);
    const store = new TileStore(onChange, 1);

    store.request(['0/0/0']);
    await flushPromises();
    expect(loadAsset).toHaveBeenCalledTimes(2);

    for (let frame = 0; frame < 120; frame++) store.request(['0/0/0']);
    expect(loadAsset).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(999);
    expect(onChange).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onChange).toHaveBeenCalledTimes(1);

    store.request(['0/0/0']);
    expect(loadAsset).toHaveBeenCalledTimes(4);
    store.dispose();
  });

  it('disposes an asset that succeeds after its paired asset fails', async () => {
    const color = deferred<THREE.Texture>();
    const height = deferred<THREE.Texture>();
    const heightTexture = new THREE.Texture();
    const dispose = vi.spyOn(heightTexture, 'dispose');
    const loadAsset = mockTextureLoads([color.promise, height.promise]);
    const store = new TileStore(vi.fn(), 1);

    store.request(['0/0/0']);
    color.reject(new Error('color asset unavailable'));
    height.resolve(heightTexture);
    await flushPromises();

    expect(loadAsset).toHaveBeenCalledTimes(2);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(store.size).toBe(0);
    store.dispose();
  });

  it('disposes late texture results and suppresses callbacks after disposal', async () => {
    const color = deferred<THREE.Texture>();
    const height = deferred<THREE.Texture>();
    const colorTexture = new THREE.Texture();
    const heightTexture = new THREE.Texture();
    const disposeColor = vi.spyOn(colorTexture, 'dispose');
    const disposeHeight = vi.spyOn(heightTexture, 'dispose');
    const onChange = vi.fn();
    const loadAsset = mockTextureLoads([color.promise, height.promise]);
    const store = new TileStore(onChange, 1);

    store.request(['0/0/0']);
    store.dispose();
    color.resolve(colorTexture);
    height.resolve(heightTexture);
    await flushPromises();

    expect(store.size).toBe(0);
    expect(disposeColor).toHaveBeenCalledTimes(1);
    expect(disposeHeight).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    store.request(['0/0/0']);
    expect(loadAsset).toHaveBeenCalledTimes(2);
  });
});
