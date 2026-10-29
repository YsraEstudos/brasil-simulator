import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { createInitialState, type GameState } from '@/engine';

import { technologyFootnote, technologyTree } from './technologyView';

// PLANO_EXPANSAO F07/EX-32: cada nó informa pré-requisitos, custo, prazo, incerteza, dependência, efeitos, quem ganha
// e efeitos adversos; abrir a árvore não muda o estado.

const content = loadContent(DEFAULT_SCENARIO_ID);
const state = createInitialState({ content, difficulty: 'estrategica', seed: 1 });

describe('árvore de tecnologias na tela', () => {
  it('mostra ramos, nós bloqueados por pré-requisito e rotas com custo, prazo, incerteza e dependência', () => {
    const tree = technologyTree(state, content);
    expect(tree.map((b) => b.id)).toEqual(['transporte', 'energia', 'agricultura']);
    const rail = tree[0].nodes.find((n) => n.id === 'material_rodante')!;
    expect(rail.locked).toBe(true);
    expect(rail.prerequisites).toContain('falta adotar');
    expect(rail.routes.map((r) => r.route)).toEqual(['importar', 'transferir', 'desenvolver']);
    for (const route of rail.routes) {
      expect(route.estimate).toMatch(/meses ou mais .* R\$/);
      expect(route.available).toBe(false);
    }
    const imported = rail.routes[0];
    expect(imported.uncertainty).toContain('Sem risco de pesquisa');
    expect(imported.dependency).toContain('sem domínio local');
    expect(rail.routes[2].uncertainty).toContain('Risco de falha parcial');
    expect(rail.adverse).toContain('Riscos e custos');
    expect(rail.requirements).toContain('obras em operação');
  });

  it('nó sem pré-requisito está disponível; transferência lista só parceiros que aceitam', () => {
    const tree = technologyTree(state, content);
    const grid = tree[1].nodes.find((n) => n.id === 'redes_inteligentes')!;
    expect(grid.locked).toBe(false);
    expect(grid.routes.every((r) => r.available)).toBe(true);
    expect(grid.effect).toContain('TWh/mês de capacidade de transmissão');
  });

  it('é leitura pura: o estado não muda', () => {
    const before: GameState = structuredClone(state);
    technologyTree(state, content);
    expect(state).toEqual(before);
    expect(technologyFootnote()).toContain('PROVISÓRIO');
  });
});
