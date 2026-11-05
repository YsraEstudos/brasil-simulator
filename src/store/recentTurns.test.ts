import { describe, expect, it } from 'vitest';

import { pushReading, readingAgo, RECENT_TURNS, type TurnReading } from './recentTurns';

const r = (turnIndex: number): TurnReading => ({
  turnIndex,
  monthIndex: turnIndex,
  revenue: 0.18,
  realGdpIndex: 1,
  priceLevel: 1,
  discretionary: 0.01,
  sectors: {},
  quintiles: {},
});

describe('trilha de leituras dos últimos turnos (H8)', () => {
  it('guarda o turno atual e os 12 anteriores, mais antigo primeiro', () => {
    let trail: TurnReading[] = [];
    for (let t = 0; t < 20; t++) trail = pushReading(trail, r(t));
    expect(trail).toHaveLength(RECENT_TURNS);
    expect(trail[0].turnIndex).toBe(7);
    expect(readingAgo(trail, 12)?.turnIndex).toBe(7);
    expect(readingAgo(trail, 1)?.turnIndex).toBe(18);
    expect(readingAgo(trail, 13)).toBeUndefined();
  });

  it('turno repetido ou anterior (voltar um mês) descarta as leituras do futuro', () => {
    let trail: TurnReading[] = [];
    for (let t = 0; t < 5; t++) trail = pushReading(trail, r(t));
    trail = pushReading(trail, r(3));
    expect(trail.map((x) => x.turnIndex)).toEqual([0, 1, 2, 3]);
  });
});
