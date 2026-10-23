import { describe, expect, it } from 'vitest';

import { QUALITY_PROFILES } from '@/globe/qualityProfiles';

import {
  DEFAULT_MAP_QUALITY,
  MAP_QUALITY_AUTO,
  MAP_QUALITY_CHOICES,
  MAP_QUALITY_OPTIONS,
  migrateLegacyRenderer,
  planMapQuality,
  profileLabel,
  resolveAutoProfile,
  resolveMapQuality,
} from './mapQuality';

// PLANO_GLOBO.md §3.1 e D-G1
describe('qualidade do mapa: escolha e migração', () => {
  it('o padrão é o Automático, que começa no Equilibrado', () => {
    expect(DEFAULT_MAP_QUALITY).toBe(MAP_QUALITY_AUTO);
    expect(resolveAutoProfile(null)).toBe('equilibrado');
    expect(resolveMapQuality(null, null)).toBe('automatico');
  });

  it('aceita o Automático e os cinco perfis; qualquer outra coisa volta ao padrão', () => {
    for (const c of MAP_QUALITY_CHOICES) expect(resolveMapQuality(c, null)).toBe(c);
    expect(MAP_QUALITY_CHOICES).toEqual(['automatico', ...QUALITY_PROFILES]);
    for (const bad of [null, undefined, 3, 'ALTO', 'alto ', 'globe', {}, []]) {
      expect(resolveMapQuality(bad, null)).toBe('automatico');
    }
  });

  it('migra a preferência antiga: globo→Automático, 2D→Essencial 2D, 2D leve→Essencial 2D leve', () => {
    expect(migrateLegacyRenderer('globe')).toBe('automatico');
    expect(migrateLegacyRenderer('flat')).toBe('essencial-2d');
    expect(migrateLegacyRenderer('flat-light')).toBe('essencial-2d-leve');
    expect(migrateLegacyRenderer('holograma')).toBeNull();
    expect(migrateLegacyRenderer(null)).toBeNull();
    expect(resolveMapQuality(null, 'flat')).toBe('essencial-2d');
    expect(resolveMapQuality('valor-estranho', 'flat-light')).toBe('essencial-2d-leve');
  });

  it('a chave nova vence a antiga', () => {
    expect(resolveMapQuality('alto', 'flat')).toBe('alto');
    expect(resolveMapQuality('automatico', 'flat-light')).toBe('automatico');
  });

  it('o perfil do ajuste automático só pode ser 3D (nunca o 2D)', () => {
    expect(resolveAutoProfile('economico-3d')).toBe('economico-3d');
    expect(resolveAutoProfile('alto')).toBe('alto');
    for (const bad of ['essencial-2d', 'essencial-2d-leve', 'automatico', 7, undefined]) {
      expect(resolveAutoProfile(bad)).toBe('equilibrado');
    }
  });
});

describe('qualidade do mapa: o que é desenhado', () => {
  it('automático: globo com o último perfil medido e o ajuste ligado', () => {
    expect(planMapQuality('automatico', 'economico-3d')).toEqual({
      renderer: 'globe',
      profile3d: 'economico-3d',
      auto: true,
    });
  });

  it('perfil 3D fixo: globo naquele perfil, sem ajuste automático (a escolha manual o desliga)', () => {
    expect(planMapQuality('alto', 'economico-3d')).toEqual({ renderer: 'globe', profile3d: 'alto', auto: false });
    expect(planMapQuality('economico-3d', 'alto')).toEqual({
      renderer: 'globe',
      profile3d: 'economico-3d',
      auto: false,
    });
  });

  it('perfis 2D: mapa plano completo ou leve, sem ajuste automático', () => {
    expect(planMapQuality('essencial-2d', 'equilibrado')).toMatchObject({ renderer: 'flat', auto: false });
    expect(planMapQuality('essencial-2d-leve', 'equilibrado')).toMatchObject({ renderer: 'flat-light', auto: false });
  });
});

describe('qualidade do mapa: texto da tela de Configurações', () => {
  it('cada escolha tem nome e explicação em português, na ordem de exibição', () => {
    expect(MAP_QUALITY_OPTIONS.map((o) => o.id)).toEqual([...MAP_QUALITY_CHOICES].sort(byDisplayOrder));
    expect(MAP_QUALITY_OPTIONS.map((o) => o.label)).toEqual([
      'Automático',
      'Econômico 3D',
      'Equilibrado',
      'Alto',
      'Essencial 2D',
      'Essencial 2D leve',
    ]);
    for (const o of MAP_QUALITY_OPTIONS) expect(o.description.length).toBeGreaterThan(10);
  });

  it('mostra o nome do perfil em uso', () => {
    expect(profileLabel('economico-3d')).toBe('Econômico 3D');
    expect(profileLabel('equilibrado')).toBe('Equilibrado');
  });
});

/** Ordem de exibição: Automático, os perfis 3D e por fim os 2D. */
function byDisplayOrder(a: string, b: string): number {
  const order = ['automatico', 'economico-3d', 'equilibrado', 'alto', 'essencial-2d', 'essencial-2d-leve'];
  return order.indexOf(a) - order.indexOf(b);
}
