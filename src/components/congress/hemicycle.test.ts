import { describe, expect, it } from 'vitest';

import type { Bloc } from '@/types/scenario';

import {
  ALLY_RELATION,
  allySeats,
  arcSegments,
  governmentSupport,
  groupCounts,
  hemicycleSeats,
  ideologyGroup,
} from './hemicycle';

/** Bloco de teste com o mínimo para o hemiciclo. */
function bloc(id: string, chamberSeats: number, economic: number, senateSeats = 0): Bloc {
  return {
    id,
    name: id,
    chamberSeats,
    senateSeats,
    ideology: { economic, social: 0 },
    cohesion: 0.7,
    governmentRelation: 0,
    interests: [],
  };
}

/** Câmara do cenário principal (brasil_2027_01): 513 cadeiras em cinco blocos. */
const MAIN: readonly Bloc[] = [
  bloc('esquerda', 110, -0.7, 14),
  bloc('centro_esquerda', 70, -0.3, 10),
  bloc('centro', 150, 0.1, 24),
  bloc('centro_direita', 98, 0.5, 18),
  bloc('direita', 85, 0.7, 15),
];

/** Relações por id de bloco, o resto neutro (0). */
function relations(map: Record<string, number>): (bloc: Bloc) => number {
  return (bloc) => map[bloc.id] ?? 0;
}

describe('grupos ideológicos', () => {
  it('classifica pelo eixo econômico, com folga de 0,2 no centro', () => {
    expect(ideologyGroup(-0.7)).toBe('esquerda');
    expect(ideologyGroup(-0.2001)).toBe('esquerda');
    expect(ideologyGroup(-0.2)).toBe('centro');
    expect(ideologyGroup(0)).toBe('centro');
    expect(ideologyGroup(0.2)).toBe('centro');
    expect(ideologyGroup(0.2001)).toBe('direita');
    expect(ideologyGroup(0.7)).toBe('direita');
  });

  it('soma as cadeiras por grupo no cenário principal', () => {
    expect(groupCounts(MAIN)).toEqual({ esquerda: 180, centro: 150, direita: 183 });
  });
});

describe('hemiciclo', () => {
  const seats = hemicycleSeats(MAIN);

  it('gera uma cadeira por deputado, dentro dos limites normalizados', () => {
    expect(seats).toHaveLength(513);
    for (const seat of seats) {
      expect(seat.x).toBeGreaterThanOrEqual(-1);
      expect(seat.x).toBeLessThanOrEqual(1);
      expect(seat.y).toBeGreaterThanOrEqual(0);
      expect(seat.y).toBeLessThanOrEqual(1);
    }
  });

  it('atinge as extremidades do semicírculo', () => {
    expect(Math.min(...seats.map((s) => s.x))).toBeCloseTo(-1, 12);
    expect(Math.max(...seats.map((s) => s.x))).toBeCloseTo(1, 12);
    expect(Math.max(...seats.map((s) => s.y))).toBeCloseTo(1, 2);
  });

  it('mantém cada grupo contíguo da esquerda para a direita, com as contagens certas', () => {
    const runs: string[] = [];
    for (const seat of seats) if (runs[runs.length - 1] !== seat.group) runs.push(seat.group);
    expect(runs).toEqual(['esquerda', 'centro', 'direita']);
    const counted = { esquerda: 0, centro: 0, direita: 0 };
    for (const seat of seats) counted[seat.group] += 1;
    expect(counted).toEqual(groupCounts(MAIN));
  });

  it('funciona com totais pequenos, sem fileiras degeneradas', () => {
    const tiny = hemicycleSeats([bloc('a', 3, -0.5), bloc('b', 4, 0.5)]);
    expect(tiny).toHaveLength(7);
    expect(new Set(tiny.map((s) => s.y)).size).toBeGreaterThan(1);
  });

  it('devolve vazio sem cadeiras', () => {
    expect(hemicycleSeats([])).toEqual([]);
    expect(hemicycleSeats([bloc('x', 0, 0)])).toEqual([]);
  });
});

describe('apoio ao governo', () => {
  it('relações neutras dão 50%', () => {
    expect(governmentSupport(MAIN, relations({}))).toBe(0.5);
  });

  it('extremos dão 0 e 1', () => {
    expect(governmentSupport(MAIN, () => -100)).toBe(0);
    expect(governmentSupport(MAIN, () => 100)).toBe(1);
  });

  it('satura relações fora da escala', () => {
    expect(governmentSupport(MAIN, () => -150)).toBe(0);
    expect(governmentSupport(MAIN, () => 150)).toBe(1);
  });

  it('é monotônico e pondera pelas cadeiras', () => {
    const comEsquerda = governmentSupport(MAIN, relations({ esquerda: 100 }));
    const comDireita = governmentSupport(MAIN, relations({ direita: 100 }));
    expect(comEsquerda).toBeCloseTo(0.5 + 110 / (2 * 513), 12);
    expect(comDireita).toBeCloseTo(0.5 + 85 / (2 * 513), 12);
    expect(comEsquerda).toBeGreaterThan(comDireita);
    expect(governmentSupport(MAIN, relations({ centro: 40 }))).toBeGreaterThan(0.5);
    expect(governmentSupport(MAIN, relations({ centro: -40 }))).toBeLessThan(0.5);
  });
});

describe('base aliada', () => {
  it('soma as cadeiras dos blocos acima do limiar, com corte estrito', () => {
    const allies = allySeats(MAIN, relations({ esquerda: 50, centro_esquerda: ALLY_RELATION, centro: 30 }));
    expect(allies).toEqual({ chamber: 260, senate: 38 });
    expect(allySeats(MAIN, relations({})).chamber).toBe(0);
  });
});

describe('arco de apoio', () => {
  it('segmenta o arco em t crescente, da esquerda para a direita', () => {
    const segments = arcSegments(0.5, 40);
    expect(segments).toHaveLength(40);
    for (let i = 1; i < segments.length; i++) expect(segments[i].t).toBeGreaterThan(segments[i - 1].t);
    expect(segments[0].t).toBeGreaterThan(0);
    expect(segments[segments.length - 1].t).toBeLessThan(1);
    expect(segments.filter((s) => s.filled)).toHaveLength(20);
  });

  it('frações extremas ou fora da escala acendem nada ou tudo', () => {
    expect(arcSegments(0, 64).some((s) => s.filled)).toBe(false);
    expect(arcSegments(1, 64).every((s) => s.filled)).toBe(true);
    expect(arcSegments(-1, 8).some((s) => s.filled)).toBe(false);
    expect(arcSegments(2, 8).every((s) => s.filled)).toBe(true);
  });
});
