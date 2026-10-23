import { describe, expect, it } from 'vitest';

import { LOD_TEXEL_THRESHOLD, MAX_CONCURRENT_LOADS, MAX_LEVEL, TILE_CACHE_BLOCKS } from './config';
import {
  budgetOf,
  DEFAULT_PROFILE_3D,
  GLOBE_BUDGETS,
  is3dProfile,
  neighborProfile,
  PROFILES_2D,
  PROFILES_3D,
  QUALITY_PROFILES,
  rendererOfProfile,
} from './qualityProfiles';

// PLANO_GLOBO.md §3.1
describe('perfis de qualidade', () => {
  it('são cinco, do mais leve ao mais pesado, e o padrão 3D é o Equilibrado', () => {
    expect(QUALITY_PROFILES).toEqual(['essencial-2d', 'essencial-2d-leve', 'economico-3d', 'equilibrado', 'alto']);
    expect(DEFAULT_PROFILE_3D).toBe('equilibrado');
  });

  it('os perfis 2D pedem o mapa plano (completo ou leve) e os 3D pedem o globo', () => {
    expect(rendererOfProfile('essencial-2d')).toBe('flat');
    expect(rendererOfProfile('essencial-2d-leve')).toBe('flat-light');
    for (const p of PROFILES_3D) expect(rendererOfProfile(p)).toBe('globe');
    expect(PROFILES_2D.some(is3dProfile)).toBe(false);
    expect(PROFILES_3D.every(is3dProfile)).toBe(true);
  });

  it('o Equilibrado é exatamente a configuração atual do globo (nenhuma mudança por padrão)', () => {
    const b = budgetOf('equilibrado');
    expect(b.tileCacheBlocks).toBe(TILE_CACHE_BLOCKS);
    expect(b.maxConcurrentLoads).toBe(MAX_CONCURRENT_LOADS);
    expect(b.lodTexelThreshold).toBe(LOD_TEXEL_THRESHOLD);
    expect(b.maxLevel).toBe(MAX_LEVEL);
    expect(b.dprCap).toBe(2); // o padrão do R3F: dpr = [1, 2]
  });

  it('o orçamento cresce do Econômico ao Alto (cache, LOD e DPR nunca andam ao contrário)', () => {
    const [eco, bal, alto] = PROFILES_3D.map(budgetOf);
    expect(eco.tileCacheBlocks).toBeLessThan(bal.tileCacheBlocks);
    expect(bal.tileCacheBlocks).toBeLessThan(alto.tileCacheBlocks);
    expect(eco.maxConcurrentLoads).toBeLessThanOrEqual(bal.maxConcurrentLoads);
    expect(bal.maxConcurrentLoads).toBeLessThanOrEqual(alto.maxConcurrentLoads);
    // limiar maior = menos detalhe
    expect(eco.lodTexelThreshold).toBeGreaterThan(bal.lodTexelThreshold);
    expect(bal.lodTexelThreshold).toBeGreaterThan(alto.lodTexelThreshold);
    expect(eco.maxLevel).toBeLessThan(bal.maxLevel);
    expect(bal.maxLevel).toBeLessThanOrEqual(alto.maxLevel);
    expect(eco.dprCap).toBeLessThan(bal.dprCap);
    expect(bal.dprCap).toBeLessThanOrEqual(alto.dprCap);
  });

  it('todos os tetos são válidos: o raiz cabe no cache, o nível não passa dos assets, o DPR não cai abaixo de 1', () => {
    for (const p of PROFILES_3D) {
      const b = GLOBE_BUDGETS[p];
      expect(Number.isInteger(b.tileCacheBlocks)).toBe(true);
      expect(b.tileCacheBlocks).toBeGreaterThanOrEqual(2);
      expect(b.maxConcurrentLoads).toBeGreaterThanOrEqual(1);
      expect(b.lodTexelThreshold).toBeGreaterThan(0);
      expect(Number.isInteger(b.maxLevel)).toBe(true);
      expect(b.maxLevel).toBeGreaterThanOrEqual(1);
      expect(b.maxLevel).toBeLessThanOrEqual(MAX_LEVEL);
      expect(b.dprCap).toBeGreaterThanOrEqual(1);
    }
  });

  it('as flags de efeitos (reservadas) só ligam de baixo para cima', () => {
    const [eco, bal, alto] = PROFILES_3D.map((p) => budgetOf(p).effects);
    expect(eco).toEqual({ clouds: false, animatedClouds: false, cityLightsTexture: false });
    expect(bal.clouds).toBe(true);
    expect(bal.animatedClouds).toBe(false);
    expect(alto).toEqual({ clouds: true, animatedClouds: true, cityLightsTexture: true });
  });

  it('o vizinho anda um nível por vez e para nas pontas', () => {
    expect(neighborProfile('equilibrado', 'down')).toBe('economico-3d');
    expect(neighborProfile('equilibrado', 'up')).toBe('alto');
    expect(neighborProfile('economico-3d', 'down')).toBe('economico-3d');
    expect(neighborProfile('alto', 'up')).toBe('alto');
  });
});
