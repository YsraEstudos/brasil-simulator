import { describe, expect, it } from 'vitest';

import { HEALTH } from '@/content';
import type { Disease } from '../../types/health';
import { advanceEpidemic, aliveOf, type UfEpidemicInput } from './epidemic';
import type { OutbreakUf } from './types';

const respiratory = HEALTH.diseases.find((d) => d.transmission === 'respiratoria')!;

function uf(id: string, population: number, infected = 0): OutbreakUf {
  return {
    id,
    c: { s: population - infected, e: 0, i: infected, h: 0, r: 0 },
    population,
    monthInfections: 0,
    monthHospital: 0,
    monthDeaths: 0,
    monthVaccinated: 0,
    vaccinated: 0,
    infections: 0,
    deaths: 0,
    overCapacityMonths: 0,
  };
}

function inputs(ufs: OutbreakUf[], patch: Partial<UfEpidemicInput> = {}): Map<string, UfEpidemicInput> {
  return new Map(
    ufs.map((u) => [
      u.id,
      { id: u.id, transmission: 1, hospitalRate: 0.02, freeBeds: 10, doses: 0, efficacy: 0.7, ...patch },
    ]),
  );
}

function run(ufs: OutbreakUf[], months: number, disease: Disease, r0: number, patch: Partial<UfEpidemicInput> = {}) {
  let current = ufs;
  const history: OutbreakUf[][] = [];
  for (let m = 0; m < months; m++) {
    // Como na etapa do mês: a população do mês é a de quem está vivo no início.
    current = current.map((u) => ({ ...u, population: aliveOf(u) }));
    current = advanceEpidemic(current, inputs(current, patch), disease, r0).map((r) => r.uf);
    history.push(current);
  }
  return history;
}

describe('modelo compartimental (EX-27)', () => {
  it('conserva pessoas e não deixa compartimento negativo, inclusive com parâmetros extremos', () => {
    const extreme: Disease = { ...respiratory, fatalityHospital: 1, fatalityOverflow: 1, fatalityCommunity: 0.5 };
    for (const [disease, r0, patch] of [
      [respiratory, 2, {}],
      [extreme, 12, { freeBeds: 0, hospitalRate: 1 }],
      [respiratory, 3, { doses: 1e9, efficacy: 1 }],
      [respiratory, 0, {}],
    ] as const) {
      for (const month of run([uf('SP', 46000, 1), uf('AC', 900)], 24, disease, r0, patch)) {
        for (const u of month) {
          for (const v of Object.values(u.c)) expect(v).toBeGreaterThanOrEqual(0);
          expect(aliveOf(u) + u.monthDeaths).toBeCloseTo(u.population, 6);
          expect(u.deaths).toBeGreaterThanOrEqual(u.monthDeaths);
        }
      }
    }
  });

  it('a mobilidade leva o vírus a outra UF; sem mobilidade ele fica na origem', () => {
    const moving = run([uf('SP', 46000, 5), uf('AM', 4000)], 6, respiratory, 2);
    expect(moving.at(-1)![1].infections).toBeGreaterThan(0);
    const still = run([uf('SP', 46000, 5), uf('AM', 4000)], 6, { ...respiratory, mobility: 0 }, 2);
    expect(still.at(-1)![1].infections).toBe(0);
  });

  it('falta de leitos mata mais com a mesma transmissão; a transmissão não muda', () => {
    const plenty = run([uf('RJ', 17000, 5)], 12, respiratory, 2, { freeBeds: 1e6 }).at(-1)![0];
    const none = run([uf('RJ', 17000, 5)], 12, respiratory, 2, { freeBeds: 0 }).at(-1)![0];
    expect(none.deaths).toBeGreaterThan(plenty.deaths * 1.5);
    // Só muda o desfecho dos internados: a diferença nas infecções vem só de haver menos gente viva para contagiar.
    expect(Math.abs(none.infections - plenty.infections) / plenty.infections).toBeLessThan(0.01);
  });

  it('vacina e menos transmissão reduzem as infecções', () => {
    const base = run([uf('MG', 21000, 5)], 18, respiratory, 1.8).at(-1)![0].infections;
    const vaccinated = run([uf('MG', 21000, 5)], 18, respiratory, 1.8, { doses: 1500 }).at(-1)![0].infections;
    const restricted = run([uf('MG', 21000, 5)], 18, respiratory, 1.8, { transmission: 0.7 }).at(-1)![0].infections;
    expect(vaccinated).toBeLessThan(base);
    expect(restricted).toBeLessThan(base);
  });
});
