import { describe, expect, it } from 'vitest';

import { DEFAULT_MAP_CLOUDS, MAP_CLOUDS_KEY, resolveMapClouds } from './mapClouds';

describe('nuvens do mapa: escolha guardada', () => {
  it('nuvens ligadas por padrão', () => {
    expect(DEFAULT_MAP_CLOUDS).toBe(true);
    expect(resolveMapClouds(null)).toBe(true);
    expect(resolveMapClouds(undefined)).toBe(true);
  });

  it('aceita sim e não', () => {
    expect(resolveMapClouds(true)).toBe(true);
    expect(resolveMapClouds(false)).toBe(false);
  });

  it('qualquer valor que não seja booleano volta ao padrão (nunca impede abrir o jogo)', () => {
    for (const bad of ['false', 0, 1, {}, [], 'nao']) expect(resolveMapClouds(bad)).toBe(true);
  });

  it('chave própria em settings, sem colidir com as outras do mapa', () => {
    expect(MAP_CLOUDS_KEY).toBe('mapa_nuvens');
  });
});
