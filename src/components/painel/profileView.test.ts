import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { createInitialState, medianVoter, type ProfileMove } from '@/engine';

import {
  buildProfileView,
  directionText,
  extremesLine,
  MAX_MOVES_SHOWN,
  NO_LEAN_NOTE,
  NO_MOVES_NOTE,
  NO_TRAIL_NOTE,
  PLANE_PAD,
  PLANE_SIZE,
  planePoint,
  topMoveRows,
  trailCaption,
} from './profileView';
import { DIVERGING } from './regionalMetrics';

// Folha "Perfil do governo" (PLANO_GLOBO.md §5.2): geometria do plano, rastro, termo nacional e lista de decisões.

const content = loadContent(DEFAULT_SCENARIO_ID);
const noLean = loadContent('brasil_2027_01_v070');
const start = (profile?: Parameters<typeof createInitialState>[0]['profile']) =>
  createInitialState({ content, difficulty: 'estrategica', seed: 3, profile });
const EMPTY = { trail: [], moves: [] };

const move = (
  sourceId: string,
  economic: number,
  social: number,
  kind: ProfileMove['kind'] = 'sancao',
): ProfileMove => ({
  sourceId,
  kind,
  label: sourceId,
  delta: { economic, social },
});

describe('plano de dois eixos', () => {
  it('Estado à esquerda, Mercado à direita; Conservador em cima, Progressista embaixo', () => {
    const left = planePoint({ economic: -1, social: 0 });
    const right = planePoint({ economic: 1, social: 0 });
    const top = planePoint({ economic: 0, social: 1 });
    const bottom = planePoint({ economic: 0, social: -1 });
    expect(left.x).toBe(PLANE_PAD);
    expect(right.x).toBe(PLANE_SIZE - PLANE_PAD);
    expect(top.y).toBe(PLANE_PAD);
    expect(bottom.y).toBe(PLANE_SIZE - PLANE_PAD);
  });

  it('o centro (0/0) cai no meio do plano', () => {
    expect(planePoint({ economic: 0, social: 0 })).toEqual({ x: PLANE_SIZE / 2, y: PLANE_SIZE / 2 });
  });
});

describe('buildProfileView', () => {
  it('com inclinação: governo, eleitor mediano e as 27 UFs no plano, com cores da camada Alinhamento', () => {
    const state = start('liberal');
    const view = buildProfileView(state, content, EMPTY);
    expect(view.noLeanNote).toBeNull();
    expect(view.plane).not.toBeNull();
    expect(view.plane?.ufs).toHaveLength(27);
    for (const uf of view.plane?.ufs ?? []) expect(DIVERGING).toContain(uf.color);
    expect(view.plane?.government).toEqual(planePoint(state.government.profile));
    const median = medianVoter(content);
    expect(median).not.toBeNull();
    expect(view.plane?.median).toEqual(planePoint(median ?? { economic: 0, social: 0 }));
    expect(view.label).toContain('Mercado');
  });

  it('o termo nacional vem em p.p., com sinal, e a nota diz que é estimativa', () => {
    const view = buildProfileView(start(), content, EMPTY);
    expect(view.nationalLine).toMatch(/^Distância do eleitor médio: [+±−]?\d+,\d p\.p\.$/);
    expect(view.nationalNote).toContain('Estimativa');
  });

  it('perfil igual ao eleitor mediano ajuda; perfil no canto oposto pesa (sinal do termo)', () => {
    const median = medianVoter(content);
    const near = buildProfileView({ government: { profile: median ?? { economic: 0, social: 0 } } }, content, EMPTY);
    const far = buildProfileView({ government: { profile: { economic: -1, social: -1 } } }, content, EMPTY);
    expect(near.nationalLine).toContain('+');
    expect(far.nationalLine).toContain('−');
    expect(far.nationalLine).not.toContain('+');
  });

  it('cenário sem inclinação das UFs: sem plano, aviso honesto e o rótulo do perfil', () => {
    const view = buildProfileView(
      createInitialState({ content: noLean, difficulty: 'estrategica', seed: 3 }),
      noLean,
      EMPTY,
    );
    expect(view.plane).toBeNull();
    expect(view.noLeanNote).toBe(NO_LEAN_NOTE);
    expect(view.label).toBe('Centro');
    expect(view.nationalLine).toBe('');
  });

  it('rastro: um ponto por mês lido, no máximo 12, e o texto fala do mesmo trecho', () => {
    const trail = Array.from({ length: 15 }, (_, i) => ({
      monthIndex: i,
      profile: { economic: i * 0.02, social: 0 },
    }));
    const view = buildProfileView(start(), content, { trail, moves: [] });
    expect(view.plane?.trail).toHaveLength(12);
    expect(view.plane?.trail[0].monthIndex).toBe(3);
    expect(view.trailCaption).toContain('rumo ao Mercado');
  });

  it('sem histórico: o rastro diz que vem depois do primeiro mês, sem inventar pontos', () => {
    const view = buildProfileView(start(), content, EMPTY);
    expect(view.plane?.trail).toEqual([]);
    expect(view.trailCaption).toBe(NO_TRAIL_NOTE);
    expect(view.movesNote).toBe(NO_MOVES_NOTE);
  });
});

describe('rastro em palavras', () => {
  const at = (monthIndex: number, economic: number, social: number) => ({ monthIndex, profile: { economic, social } });

  it('um ponto só não dá rastro', () => {
    expect(trailCaption([at(0, 0, 0)])).toBe(NO_TRAIL_NOTE);
  });

  it('diz o rumo em cada eixo e o período', () => {
    const text = trailCaption([at(0, 0, 0), at(5, -0.3, 0.2)]);
    expect(text).toContain('rumo ao Estado');
    expect(text).toContain('rumo ao Conservador');
    expect(text).toContain('jan/2027 a jun/2027');
  });

  it('quase parado não vira direção', () => {
    expect(trailCaption([at(0, 0.1, 0.1), at(4, 0.105, 0.1)])).toContain('quase não mudou');
  });
});

describe('decisões que mais moveram o perfil', () => {
  it('direção em palavras, só nos eixos que andaram', () => {
    expect(directionText({ economic: 0.05, social: -0.02 })).toBe('Mercado · Progressista');
    expect(directionText({ economic: -0.05, social: 0.001 })).toBe('Estado');
    expect(directionText({ economic: 0.001, social: 0.001 })).toBe('quase nada');
  });

  it('ordena pelo deslocamento, junta os meses e limita a lista', () => {
    const months = [
      { monthIndex: 2, moves: [move('a', 0.01, 0), move('b', 0.05, 0.05, 'veto')] },
      { monthIndex: 5, moves: [move('c', 0.03, 0, 'proposta')] },
      { monthIndex: 6, moves: Array.from({ length: 10 }, (_, i) => move(`x${i}`, 0.0005 * (i + 1), 0)) },
    ];
    const rows = topMoveRows(months);
    expect(rows).toHaveLength(MAX_MOVES_SHOWN);
    expect(rows.map((r) => r.label).slice(0, 3)).toEqual(['b', 'c', 'a']);
    expect(rows[0].detail).toBe('vetada · mar/2027');
    expect(rows[1].detail).toBe('enviada ao Congresso · jun/2027');
    expect(rows[0].weight).toBe(1);
    expect(rows[1].weight).toBeCloseTo(0.03 / Math.hypot(0.05, 0.05), 6);
  });

  it('sem decisões: lista vazia', () => {
    expect(topMoveRows([])).toEqual([]);
  });
});

describe('extremos', () => {
  it('lista os mais alinhados e os mais distantes pelo desvio de aprovação', () => {
    const ufs = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((id, i) => ({ id, approvalDeviation: 0.03 - i * 0.01 }));
    expect(extremesLine(ufs)).toBe('Mais alinhados: A, B, C · mais distantes: G, F, E');
  });
});
