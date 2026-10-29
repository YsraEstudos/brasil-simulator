import { describe, expect, it } from 'vitest';
import { advanceDemography, initialDemography } from './demography';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { createInitialState } from '../state';
import { advanceMonth } from '../advanceMonth';
import { checkInvariants } from '../invariants';
import { advanceEducation, educationLevers } from '../education/education';

// Plano de expansão F12: pessoas em milhares; migração interna conserva o total nacional.
describe('demografia por UF', () => {
  it('reconcilia nascimento, morte e migrações em cada UF e no país', () => {
    const initial = initialDemography([
      { id: 'AA', population: 1000 },
      { id: 'BB', population: 3000 },
    ]);
    const next = advanceDemography(initial);
    let internal = 0;
    for (const [index, uf] of next.ufs.entries()) {
      const before = Object.values(initial.ufs[index].ages).reduce((a, b) => a + b, 0);
      const after = Object.values(uf.ages).reduce((a, b) => a + b, 0);
      expect(after).toBeCloseTo(before + uf.flows.births - uf.flows.deaths + uf.flows.external + uf.flows.internal, 8);
      expect(Object.values(uf.ages).every((n) => n >= 0)).toBe(true);
      internal += uf.flows.internal;
    }
    expect(internal).toBeCloseTo(0, 10);
  });

  it('envelhece sem criar população e é determinística por 240 meses', () => {
    const initial = initialDemography([
      { id: 'AA', population: 1000 },
      { id: 'BB', population: 3000 },
    ]);
    const run = () => Array.from({ length: 240 }).reduce<typeof initial>((state) => advanceDemography(state), initial);
    expect(run()).toEqual(run());
    const final = run();
    expect(final.ufs.every((uf) => Object.values(uf.ages).every((n) => Number.isFinite(n) && n >= 0))).toBe(true);
    expect(final.ufs[0].ages.older / Object.values(final.ufs[0].ages).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });
});

it('inclui as UFs do cenário no estado e evolui a demografia no turno', () => {
  const content = loadContent(DEFAULT_SCENARIO_ID);
  const state = createInitialState({ content, difficulty: 'estrategica', seed: 7 });
  expect(state.demography.ufs.length).toBe(content.scenario.regions!.ufs.length);
  const next = advanceMonth(state, { decisions: [] }, content).state;
  expect(next.demography.ufs[0].flows.births).toBeGreaterThan(0);
});

it('a demanda escolar acompanha a população jovem ao longo do tempo', () => {
  const content = loadContent(DEFAULT_SCENARIO_ID);
  const state = createInitialState({ content, difficulty: 'estrategica', seed: 7 });
  const youngReduced = {
    ...state,
    demography: {
      ...state.demography,
      ufs: state.demography.ufs.map((uf) => ({ ...uf, ages: { ...uf.ages, young: uf.ages.young / 2 } })),
    },
  };
  const baseline = advanceMonth(state, { decisions: [] }, content).state;
  const changed = advanceMonth(youngReduced, { decisions: [] }, content).state;
  expect(changed.education.flows.entrants).toBeLessThan(baseline.education.flows.entrants);
});

it('maior crescimento da população idosa pressiona a despesa previdenciária existente', () => {
  const content = loadContent(DEFAULT_SCENARIO_ID);
  const state = createInitialState({ content, difficulty: 'estrategica', seed: 7 });
  const younger = {
    ...state,
    demography: {
      ...state.demography,
      ufs: state.demography.ufs.map((uf) => ({ ...uf, ages: { ...uf.ages, older: uf.ages.older / 2 } })),
    },
  };
  const baseline = advanceMonth(state, { decisions: [] }, content).state;
  const changed = advanceMonth(younger, { decisions: [] }, content).state;
  expect(changed.economy.fiscal.mandatory.previdencia).toBeGreaterThan(baseline.economy.fiscal.mandatory.previdencia);
});

it('relatório atribui a pressão previdenciária à demografia', () => {
  const content = loadContent(DEFAULT_SCENARIO_ID);
  const base = createInitialState({ content, difficulty: 'estrategica', seed: 7 });
  const state = {
    ...base,
    demography: {
      ...base.demography,
      ufs: base.demography.ufs.map((uf) => ({ ...uf, ages: { ...uf.ages, older: uf.ages.older / 2 } })),
    },
  };
  const result = advanceMonth(state, { decisions: [] }, content);
  expect(result.report.contributions.some((item) => item.cause === 'demografia_previdencia' && item.delta < 0)).toBe(
    true,
  );
});

it('reproduz 240 meses após serialização em pontos intermediários', () => {
  const content = loadContent(DEFAULT_SCENARIO_ID);
  const run = (reload: boolean) => {
    let state = createInitialState({ content, difficulty: 'estrategica', seed: 19 });
    const reports = [];
    for (let month = 0; month < 240; month++) {
      if (reload && [17, 96, 180].includes(month)) state = JSON.parse(JSON.stringify(state));
      const result = advanceMonth(state, { decisions: [] }, content);
      expect(checkInvariants(state, result.state, result.report, content)).toEqual([]);
      const before = state.demography.ufs.reduce(
        (sum, uf) => sum + Object.values(uf.ages).reduce((a, b) => a + b, 0),
        0,
      );
      const after = result.state.demography.ufs.reduce(
        (sum, uf) => sum + Object.values(uf.ages).reduce((a, b) => a + b, 0),
        0,
      );
      const flows = result.state.demography.ufs.reduce(
        (sum, uf) => sum + uf.flows.births - uf.flows.deaths + uf.flows.external,
        0,
      );
      expect(after - before).toBeCloseTo(flows, 6);
      expect(result.state.energy.delivered + result.state.energy.shortage).toBeCloseTo(result.state.energy.demand, 9);
      reports.push(result.report);
      state = result.state;
    }
    return { state, reports };
  };
  expect(run(true)).toEqual(run(false));
}, 30000);

it('o verificador global denuncia migração interna que não se reconcilia', () => {
  const content = loadContent(DEFAULT_SCENARIO_ID);
  const state = createInitialState({ content, difficulty: 'estrategica', seed: 7 });
  const result = advanceMonth(state, { decisions: [] }, content);
  const [first, ...rest] = result.state.demography.ufs;
  const broken = {
    ...result.state,
    demography: {
      ...result.state.demography,
      ufs: [{ ...first, flows: { ...first.flows, internal: first.flows.internal + 1 } }, ...rest],
    },
  };
  expect(checkInvariants(state, broken, result.report, content)).toContain('migração interna não soma zero');
});

it('cenário principal preserva totais das UFs e usa distribuição etária censitária distinta por estado', () => {
  const content = loadContent(DEFAULT_SCENARIO_ID);
  const state = createInitialState({ content, difficulty: 'estrategica', seed: 7 });
  const proportion = (id: string) => {
    const uf = state.demography.ufs.find((item) => item.id === id)!;
    return uf.ages.older / (uf.ages.young + uf.ages.working + uf.ages.older);
  };
  expect(proportion('RS') - proportion('AP')).toBeGreaterThan(0.02);
  for (const uf of content.scenario.regions!.ufs) {
    const ages = state.demography.ufs.find((item) => item.id === uf.id)!.ages;
    expect(ages.young + ages.working + ages.older).toBeCloseTo(uf.population, 8);
  }
  const next = advanceDemography(state.demography);
  expect(next.olderGrowthDeviation).toBeCloseTo(0, 10);
});

it('primeiro turno usa a referência etária inicial na escola e na previdência', () => {
  const content = loadContent(DEFAULT_SCENARIO_ID);
  const state = createInitialState({ content, difficulty: 'estrategica', seed: 7 });
  const demographic = advanceDemography(state.demography);
  const young = demographic.ufs.reduce((sum, uf) => sum + uf.ages.young, 0);
  const expectedEducation = advanceEducation(
    state.education,
    educationLevers(state.impulses, state.monthIndex),
    young / state.demography.initialYoung,
  );
  const result = advanceMonth(state, { decisions: [] }, content);
  expect(result.state.education.flows.entrants).toBeCloseTo(expectedEducation.flows.entrants, 10);
  const pension = result.report.contributions.find((item) => item.cause === 'demografia_previdencia');
  expect(pension?.delta ?? 0).toBeCloseTo(0, 10);
});
