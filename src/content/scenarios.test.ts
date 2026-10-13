import { describe, expect, it } from 'vitest';

import brasil from '@/data/scenarios/brasil_2027_01.json';
import prototipo from '@/data/scenarios/prototipo_ficticio.json';
import { parseScenario, type Scenario } from '@/types/scenario';
import type { DataValue } from '@/types/data';

import { DEFAULT_SCENARIO_ID, SCENARIOS } from './scenarios';

function valuesOf(s: Scenario): [string, DataValue][] {
  const ind = Object.entries(s.indicators);
  const eco = s.economy ? Object.entries(s.economy) : [];
  return [...ind, ...eco].map(([k, v]) => [k, v]);
}

describe('cenários embutidos', () => {
  it('ambos os cenários validam e o padrão é brasil_2027_01', () => {
    const a = parseScenario(prototipo);
    const b = parseScenario(brasil);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(DEFAULT_SCENARIO_ID).toBe('brasil_2027_01');
    expect(Object.keys(SCENARIOS)).toEqual(expect.arrayContaining(['prototipo_ficticio', 'brasil_2027_01']));
  });

  it('brasil_2027_01 tem bloco economy e fecha o resultado primário', () => {
    const r = parseScenario(brasil);
    if (!r.ok) throw new Error(r.errors.join('\n'));
    const s = r.scenario;
    expect(s.economy).toBeDefined();
    const e = s.economy!;
    expect(Math.abs(e.revenue.value - e.primarySpending.value - s.indicators.primaryBalance12m.value)).toBeLessThan(
      0.001,
    );
  });

  it('todo valor de indicators e economy é PROVISORIO ou FICTICIO e tem nota', () => {
    const r = parseScenario(brasil);
    if (!r.ok) throw new Error(r.errors.join('\n'));
    const values = valuesOf(r.scenario);
    expect(values.length).toBeGreaterThan(0);
    for (const [key, v] of values) {
      expect(['PROVISORIO', 'FICTICIO'], key).toContain(v.status);
      expect(v.note?.trim().length ?? 0, key).toBeGreaterThan(0);
    }
  });

  it('bancadas somam 513 e 81 (validado pelo esquema)', () => {
    const r = parseScenario(brasil);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.scenario.blocs.reduce((n, b) => n + b.chamberSeats, 0)).toBe(513);
    expect(r.scenario.blocs.reduce((n, b) => n + b.senateSeats, 0)).toBe(81);
  });
});
