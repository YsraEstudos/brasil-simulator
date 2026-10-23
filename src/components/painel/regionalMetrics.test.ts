import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { alignmentView, createInitialState, type UfExplanation } from '@/engine';

import {
  availableIndicators,
  bin,
  binColor,
  DIVERGING,
  explanationFor,
  formatValue,
  indicatorSpec,
  legendLabels,
  MAP_INDICATORS,
  mapFills,
  mapRows,
  MAX_PIECES,
  SEQUENTIAL,
} from './regionalMetrics';

// Mapa da federação do Painel (GAME_DESIGN.md §4.5): valores, faixas de cor e explicação por UF.

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

describe('camada Alinhamento (PLANO_GLOBO.md §5.2)', () => {
  const liberal = createInitialState({ content, difficulty: 'estrategica', seed: 1, profile: 'liberal' });

  it('o valor da UF é o desvio de aprovação do alinhamento, com média ponderada zero', () => {
    const rows = mapRows('alinhamento', liberal, content);
    const view = alignmentView(liberal, content);
    expect(rows).toHaveLength(27);
    for (const r of rows) {
      expect(r.value).toBe(view?.ufs.find((u) => u.id === r.uf.id)?.approvalDeviation);
      expect(DIVERGING).toContain(r.color);
    }
    expect(rows.reduce((sum, r) => sum + r.populationShare * r.value, 0)).toBeCloseTo(0, 12);
  });

  it('azul = alinhado, vermelho = distante; a lista ordena do mais alinhado ao mais distante', () => {
    const spec = indicatorSpec('alinhamento');
    expect(binColor(spec, bin(spec, 0.03))).toBe(DIVERGING[4]);
    expect(binColor(spec, bin(spec, -0.03))).toBe(DIVERGING[0]);
    expect(binColor(spec, bin(spec, 0))).toBe(DIVERGING[2]);
    expect(legendLabels(spec)).toEqual(['bem distante', 'distante', 'na média', 'alinhado', 'bem alinhado']);
    expect(formatValue('alinhamento', 0.012)).toBe('+1,2 p.p.');
  });

  it('um perfil liberal alinha mais o Sul do que o Nordeste (e o contrário para o estatista)', () => {
    const sul = (st: typeof liberal) => mapRows('alinhamento', st, content).find((r) => r.uf.id === 'SC')?.value ?? 0;
    const nordeste = (st: typeof liberal) =>
      mapRows('alinhamento', st, content).find((r) => r.uf.id === 'MA')?.value ?? 0;
    expect(sul(liberal)).toBeGreaterThan(nordeste(liberal));
    const esquerda = { ...liberal, government: { profile: { economic: -0.6, social: -0.4 } } };
    expect(nordeste(esquerda)).toBeGreaterThan(sul(esquerda));
  });

  it('a explicação da UF na camada usa as causas da aprovação', () => {
    const x: UfExplanation = {
      id: 'BA',
      activity: [{ cause: 'a', label: 'Atividade', delta: 0.01 }],
      unemployment: [],
      approval: [{ cause: 'alinhamento_perfil', label: 'Alinhamento com o perfil do governo', delta: 0.01 }],
    };
    expect(explanationFor('alinhamento', x).map((p) => p.cause)).toEqual(['alinhamento_perfil']);
  });

  it('só é oferecida quando o cenário traz a inclinação das UFs', () => {
    expect(availableIndicators(content).map((m) => m.id)).toContain('alinhamento');
    const antigo = loadContent('brasil_2027_01_v070');
    expect(availableIndicators(antigo).map((m) => m.id)).not.toContain('alinhamento');
    expect(availableIndicators(antigo)).toHaveLength(MAP_INDICATORS.length - 1);
  });
});
