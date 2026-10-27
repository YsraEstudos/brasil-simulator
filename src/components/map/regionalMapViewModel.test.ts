import { describe, expect, it } from 'vitest';

import { MAP_INDICATORS, mapFills, mapRows } from '@/components/painel/regionalMetrics';
import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { createInitialState } from '@/engine';

import { buildRegionalMapViewModel, indicatorLegend } from './regionalMapViewModel';

// Mapa regional (PLANO_GLOBO.md §3.4): um só modelo para o globo 3D e para o mapa 2D.

const content = loadContent(DEFAULT_SCENARIO_ID);
const state = createInitialState({ content, difficulty: 'estrategica', seed: 1 });

describe('RegionalMapViewModel', () => {
  it('indicador: cores do regionalMetrics, seleção e legenda com as 5 faixas', () => {
    for (const m of MAP_INDICATORS) {
      const fills = mapFills(mapRows(m.id, state, content));
      const vm = buildRegionalMapViewModel({ indicator: m.id, fills, selectedId: 'BA' });
      expect(vm.mode).toBe('indicator');
      expect(vm.fills).toBe(fills);
      expect(vm.selectedId).toBe('BA');
      expect(vm.legend?.title).toBe(m.legend);
      // O Reconhecimento (Fase C4) mostra só faixas em texto: nenhum número do motor na tela.
      if (m.id !== 'reconhecimento') expect(vm.legend?.entries.every((e) => /\d/.test(e.label))).toBe(true);
      expect(vm.legend?.entries).toHaveLength(5);
      expect(vm.labels).toEqual([]);
      expect(vm.markers).toEqual([]);
    }
  });

  it('Satélite (sem indicador): sem cores nem legenda', () => {
    const vm = buildRegionalMapViewModel({ selectedId: null });
    expect(vm.fills).toEqual({});
    expect(vm.legend).toBeNull();
    expect(vm.selectedId).toBeNull();
    expect(buildRegionalMapViewModel().mode).toBe('indicator');
  });

  it('prévia: legenda própria, sem derivar do indicador', () => {
    const legend = { title: 'Efeito da política', entries: [{ color: '#fff', label: 'alto' }] };
    const vm = buildRegionalMapViewModel({ mode: 'preview', fills: { SP: '#fff' }, legend });
    expect(vm.mode).toBe('preview');
    expect(vm.legend).toBe(legend);
    expect(buildRegionalMapViewModel({ mode: 'preview', fills: { SP: '#fff' } }).legend).toBeNull();
  });

  it('é determinístico e a legenda do indicador usa as cores da paleta', () => {
    expect(indicatorLegend('renda')).toEqual(indicatorLegend('renda'));
    expect(new Set(indicatorLegend('renda').entries.map((e) => e.color)).size).toBe(5);
  });
});
