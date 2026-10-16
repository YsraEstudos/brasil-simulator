import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { createInitialState, type UfExplanation } from '@/engine';

import {
  bin,
  DIVERGING,
  explanationFor,
  indicatorSpec,
  legendLabels,
  MAP_INDICATORS,
  mapFills,
  mapRows,
  MAX_PIECES,
  SEQUENTIAL,
} from './regionalMetrics';

// Aba Brasil (GAME_DESIGN.md §4.5): valores, faixas de cor e explicação por UF.

const content = loadContent(DEFAULT_SCENARIO_ID);
const state = createInitialState({ content, difficulty: 'estrategica', seed: 1 });

describe('mapa da federação', () => {
  it('cada indicador dá uma linha e uma cor por UF', () => {
    for (const m of MAP_INDICATORS) {
      const rows = mapRows(m.id, state, content);
      expect(rows).toHaveLength(27);
      const palette: readonly string[] = m.scale === 'sequential' ? SEQUENTIAL : DIVERGING;
      for (const r of rows) expect(palette).toContain(r.color);
      expect(Object.keys(mapFills(rows))).toHaveLength(27);
    }
  });

  it('divergente: na média = cinza do meio; pior que a média = vermelho, nos dois sentidos', () => {
    const unemployment = indicatorSpec('desemprego');
    expect(bin(unemployment, 0)).toBe(2);
    expect(bin(unemployment, 0.05)).toBe(0);
    expect(bin(unemployment, -0.05)).toBe(4);
    const approval = indicatorSpec('aprovacao');
    expect(bin(approval, 0.05)).toBe(4);
    expect(legendLabels(unemployment)[0]).toBe('bem acima');
    expect(legendLabels(approval)[0]).toBe('bem abaixo');
  });

  it('renda per capita: o DF e SP na faixa mais alta, o MA na mais baixa', () => {
    const rows = mapRows('renda', state, content);
    const color = (id: string) => rows.find((r) => r.uf.id === id)?.color;
    expect(color('DF')).toBe(SEQUENTIAL[4]);
    expect(color('MA')).toBe(SEQUENTIAL[0]);
    // A renda relativa média, ponderada pela população, é 1.
    expect(rows.reduce((s, r) => s + r.populationShare * r.value, 0)).toBeCloseTo(1, 12);
  });

  it('explicação: no máximo 5 linhas, a soma mantida quando o resto é relevante', () => {
    const pieces = Array.from({ length: 8 }, (_, i) => ({ cause: `c${i}`, label: `C${i}`, delta: 0.01 / (i + 1) }));
    const x: UfExplanation = { id: 'BA', activity: pieces, unemployment: [], approval: [] };
    const shown = explanationFor('crescimento', x);
    expect(shown.length).toBeLessThanOrEqual(MAX_PIECES);
    expect(shown.reduce((s, p) => s + p.delta, 0)).toBeCloseTo(
      pieces.reduce((s, p) => s + p.delta, 0),
      12,
    );
    expect(shown.at(-1)?.label).toBe('Outras causas');
    expect(explanationFor('aprovacao', { ...x, approval: [{ cause: 'a', label: 'A', delta: 1e-6 }] })).toEqual([]);
  });
});
