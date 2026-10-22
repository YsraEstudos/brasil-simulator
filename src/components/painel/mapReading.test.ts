import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { createInitialState } from '@/engine';
import { mapRows, LEAN_PALETTE, VOTE_PALETTE, numericLegendLabels, indicatorSpec } from './regionalMetrics';
import { filterUfs, rankUfs, regionalSummary, rankingTitles, ufDescription, comparisonRows } from './mapReading';

const content = loadContent(DEFAULT_SCENARIO_ID);
const state = createInitialState({ content, difficulty: 'estrategica', seed: 1 });
const rows = mapRows('aprovacao', state, content);

describe('leitura compartilhada do mapa', () => {
  it('busca nome sem acento, sigla e região juntos', () => {
    expect(filterUfs(rows, 'nordeste', ' ceara ').map((r) => r.uf.id)).toEqual(['CE']);
    expect(filterUfs(rows, null, 'df').map((r) => r.uf.id)).toEqual(['DF']);
    expect(filterUfs(rows, 'sul', 'ceara')).toEqual([]);
  });
  it('pondera pela população da região e preserva referência nacional', () => {
    const sample = [
      { ...rows[0], value: 0.1, populationShare: 0.1 },
      { ...rows[1], value: -0.1, populationShare: 0.3 },
    ];
    const view = regionalSummary('aprovacao', sample, state);
    expect(view?.difference).toBeCloseTo(-0.05);
    expect(view?.value).toBeCloseTo(state.indicators.approval - 0.05);
    expect(regionalSummary('aprovacao', [], state)).toBeNull();
  });
  it('ranking usa desemprego menor e desempata por sigla, preservando empates de posição', () => {
    const sample = [
      { ...rows[0], uf: { ...rows[0].uf, id: 'BB' }, value: 0.03 },
      { ...rows[0], uf: { ...rows[0].uf, id: 'AA' }, value: -0.02 },
      { ...rows[0], uf: { ...rows[0].uf, id: 'CC' }, value: -0.02 },
    ];
    expect(rankUfs('desemprego', sample).map((r) => [r.uf.id, r.rank])).toEqual([
      ['AA', 1],
      ['CC', 1],
      ['BB', 3],
    ]);
    expect(rankingTitles('inclinacao')).toEqual(['5 mais à direita', '5 mais à esquerda']);
    expect(rankingTitles('chuva')).toEqual(['5 mais chuvosas', '5 mais secas']);
  });
  it('descrição lê valor absoluto, posição, referência e selo', () => {
    const row = { ...rows[0], name: 'Ceará', value: 0.04 };
    const text = ufDescription('aprovacao', row, 3, 27, state, 'estimativa');
    expect(text).toContain('Ceará');
    expect(text).toContain('3º de 27');
    expect(text).toContain('acima');
    expect(text).toContain('estimativa');
  });
  it('comparação não inventa setas sem histórico e mede diferenças das UFs', () => {
    const a = rows[0];
    const b = rows[1];
    const changed = {
      ...state,
      regions: {
        ...state.regions,
        ufs: state.regions.ufs.map((u) => (u.id === b.uf.id ? { ...u, approval: a.uf.approval - 0.1 } : u)),
      },
    };
    const view = comparisonRows(a.uf.id, b.uf.id, changed, content, [], null);
    expect(view.find((r) => r.id === 'aprovacao')?.difference).toBeCloseTo(0.1);
    expect(view.find((r) => r.id === 'chuva')?.left.change).toBe('Sem dados anteriores');
    expect(view.find((r) => r.id === 'resultado')?.left.text).toBe('Sem resultado');
  });
  it('variação usa o mês exato do indicador e não atravessa uma lacuna', () => {
    const next = { ...state, monthIndex: 2 };
    const history = [
      { monthIndex: 1, ufs: {}, observations: { CE: { chuva: -0.25, aprovacao: 0.2 }, SP: { chuva: 0.25 } } },
    ];
    const view = comparisonRows('CE', 'SP', next, content, history, null);
    expect(view.find((r) => r.id === 'chuva')?.left.change).toContain('↑');
    expect(view.find((r) => r.id === 'chuva')?.right.change).toContain('↓');
    expect(view.find((r) => r.id === 'renda')?.left.change).toBe('Sem dados anteriores');
    expect(
      comparisonRows('CE', 'SP', { ...next, monthIndex: 3 }, content, history, null).find((r) => r.id === 'chuva')?.left
        .change,
    ).toBe('Sem dados anteriores');
  });
  it('as legendas expõem limites numéricos inclusive no desemprego invertido', () => {
    expect(numericLegendLabels(indicatorSpec('desemprego'))[0]).toBe('≥ +3,0 p.p.');
    expect(numericLegendLabels(indicatorSpec('seca'))[0]).toBe('< 10%');
    expect(numericLegendLabels(indicatorSpec('intencao'))[4]).toBe('≥ 60,0%');
  });
  it('violeta, âmbar e verde-azulada mantêm contraste gráfico mínimo de 3:1 no fundo escuro', () => {
    const luminance = (hex: string) => {
      const channels = [1, 3, 5]
        .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    for (const bg of ['#05070f', '#0c1510'])
      for (const color of [...LEAN_PALETTE, ...VOTE_PALETTE]) {
        expect((luminance(color) + 0.05) / (luminance(bg) + 0.05), `${color} sobre ${bg}`).toBeGreaterThanOrEqual(3);
      }
  });
});
