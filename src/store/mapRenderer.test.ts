import { describe, expect, it } from 'vitest';

import { DEFAULT_MAP_RENDERER, MAP_RENDERER_OPTIONS, MAP_RENDERERS, resolveMapRenderer } from './mapRenderer';

describe('preferência do renderizador do mapa', () => {
  it('o padrão é o globo 3D', () => {
    expect(DEFAULT_MAP_RENDERER).toBe('globe');
  });

  it('aceita só os três valores; qualquer outra coisa volta ao padrão', () => {
    for (const r of MAP_RENDERERS) expect(resolveMapRenderer(r)).toBe(r);
    for (const bad of [null, undefined, 3, 'GLOBE', 'flat ', {}, []]) expect(resolveMapRenderer(bad)).toBe('globe');
  });

  it('cada valor tem nome e explicação em português na tela de Configurações', () => {
    expect(MAP_RENDERER_OPTIONS.map((o) => o.id)).toEqual([...MAP_RENDERERS]);
    expect(MAP_RENDERER_OPTIONS.map((o) => o.label)).toEqual(['Globo 3D', 'Mapa 2D', 'Mapa 2D leve']);
    for (const o of MAP_RENDERER_OPTIONS) expect(o.description.length).toBeGreaterThan(10);
  });
});
