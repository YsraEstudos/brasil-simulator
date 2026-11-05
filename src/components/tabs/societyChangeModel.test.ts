import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { advanceMonth, createInitialState } from '@/engine';
import { turnReading } from '@/store/recentTurns';

import { societyChanges } from './societyChangeModel';

const content = loadContent(DEFAULT_SCENARIO_ID);

describe('B41: variação mensal de setores e quintis', () => {
  const s0 = createInitialState({ content, difficulty: 'estrategica', seed: 4 });
  const s1 = advanceMonth(s0, { decisions: [] }, content).state;
  const s2 = advanceMonth(s1, { decisions: [] }, content).state;

  it('bate com a diferença entre dois snapshots', () => {
    const changes = societyChanges(s2.society, turnReading(s1));
    expect(changes).not.toBeNull();
    for (const sector of s2.society.sectors) {
      const before = s1.society.sectors.find((x) => x.id === sector.id);
      const c = changes?.sectors[sector.id];
      expect(c?.relative).toBeCloseTo(sector.output / (before?.output ?? NaN) - 1, 12);
      expect(c?.shareDelta).toBeCloseTo(sector.share - (before?.share ?? NaN), 12);
    }
    for (const q of s2.society.quintiles) {
      const before = s1.society.quintiles.find((x) => x.id === q.id);
      const c = changes?.quintiles[q.id];
      expect(c?.relative).toBeCloseTo(q.realIncome / (before?.realIncome ?? NaN) - 1, 12);
      expect(c?.shareDelta).toBeCloseTo(q.incomeShare - (before?.incomeShare ?? NaN), 12);
    }
  });

  it('seta, sinal e rótulo por extenso: a cor nunca é o único sinal', () => {
    const prev = turnReading(s1);
    const id = s2.society.sectors[0].id;
    const up = societyChanges(
      { ...s2.society, sectors: [{ ...s2.society.sectors[0], output: prev.sectors[id].output * 1.01 }] },
      prev,
    );
    expect(up?.sectors[id]?.direction).toBe('up');
    expect(up?.sectors[id]?.text.startsWith('▲ +1,0% no mês')).toBe(true);
    expect(up?.sectors[id]?.accessibilityLabel).toContain('subiu +1,0% no mês');
    const down = societyChanges(
      { ...s2.society, sectors: [{ ...s2.society.sectors[0], output: prev.sectors[id].output * 0.99 }] },
      prev,
    );
    expect(down?.sectors[id]?.text.startsWith('▼ −1,0% no mês')).toBe(true);
  });

  it('sem turno anterior guardado, não há variação', () => {
    expect(societyChanges(s0.society, undefined)).toBeNull();
  });
});
