import { describe, expect, it } from 'vitest';
import { advanceMonth } from '@/engine/advanceMonth';
import { opinionStep } from '@/engine/politics/opinion';
import type { GameState, ScheduledImpulse } from '@/engine/types';
import { testContent, testState } from '@/tests/fixtures';

// POLITICAL_RULES.md §11.1: opinião pública, lua de mel e saturação. Valores de calibração vêm de testContent().
const content = testContent();
const c = content.calibration;

/** Estado com economia neutra: sem tendência nem componentes econômicos, só os impulsos agem. */
function neutralState(monthIndex: number, approval = c.aprovacao_base): GameState {
  const base = testState();
  return {
    ...base,
    monthIndex,
    indicators: {
      ...base.indicators,
      approval,
      inflation12m: c.meta_inflacao,
      unemployment: c.nairu,
      gdpGrowth12m: c.g_pot_base,
    },
    impulses: [],
  };
}

function impulse(overrides: Partial<ScheduledImpulse>): ScheduledImpulse {
  return {
    sourceId: 'teste:impulso',
    label: 'Impulso de teste',
    target: 'aprovacao',
    delta: -0.05,
    startMonth: 0,
    endMonth: null,
    ...overrides,
  };
}

function runOpinion(state: GameState) {
  return advanceMonth(state, { decisions: [] }, content, [opinionStep]);
}

describe('opinionStep (POLITICAL_RULES.md §11.1)', () => {
  it('soma das contribuições = variação da aprovação e aprovação fica dentro dos limites em 48 meses extremos', () => {
    let state: GameState = {
      ...testState(),
      indicators: { ...testState().indicators, inflation12m: 0.3, unemployment: 0.2 },
    };
    for (let month = 0; month < 48; month++) {
      const before = state.indicators.approval;
      const { state: next, report } = runOpinion({ ...state, monthIndex: month });
      const approvalContribs = report.contributions.filter((x) => x.indicator === 'approval');
      const sum = approvalContribs.reduce((s, x) => s + x.delta, 0);
      expect(next.indicators.approval - before).toBeCloseTo(sum, 10);
      expect(next.indicators.approval).toBeGreaterThanOrEqual(c.aprovacao_min - 1e-9);
      expect(next.indicators.approval).toBeLessThanOrEqual(c.aprovacao_max + 1e-9);
      state = { ...next, monthIndex: month + 1 };
    }
    expect(state.indicators.approval).toBeCloseTo(c.aprovacao_min, 10);
  });

  it('inflação alta reduz a aprovação em relação à inflação na meta (POLITICAL_RULES.md §11.1)', () => {
    const base = neutralState(10);
    const atTarget = runOpinion(base).state.indicators.approval;
    const highInflation = runOpinion({
      ...base,
      indicators: { ...base.indicators, inflation12m: 0.1 },
    });
    expect(highInflation.state.indicators.approval).toBeLessThan(atTarget);
    const inflationContrib = highInflation.report.contributions.find((x) => x.cause === 'inflacao');
    expect(inflationContrib?.delta).toBeLessThan(0);
  });

  it('lua de mel: o mesmo impulso negativo custa fator_lua_de_mel vezes menos no mês 2 do que no mês 10', () => {
    const shock = impulse({ sourceId: 'teste:choque_popular', label: 'Medida impopular', delta: -0.05 });
    const early = runOpinion({ ...neutralState(2), impulses: [shock] });
    const late = runOpinion({ ...neutralState(10), impulses: [shock] });
    const costEarly = early.report.contributions.find((x) => x.cause === shock.sourceId)?.delta ?? 0;
    const costLate = late.report.contributions.find((x) => x.cause === shock.sourceId)?.delta ?? 0;
    expect(costLate).toBeCloseTo(-0.05, 10);
    expect(costEarly / costLate).toBeCloseTo(c.fator_lua_de_mel, 10);
  });

  it('impulso de um único mês (início = fim = t) só age nesse mês e leva o rótulo à contribuição', () => {
    const t = 10;
    const oneMonth = impulse({
      sourceId: 'evento:subsidio_teste',
      label: 'Subsídio ao combustível',
      delta: 0.005,
      startMonth: t,
      endMonth: t,
    });
    const active = runOpinion({ ...neutralState(t), impulses: [oneMonth] });
    const found = active.report.contributions.find((x) => x.cause === oneMonth.sourceId);
    expect(found?.label).toBe('Subsídio ao combustível');
    expect(found?.delta).toBeCloseTo(0.005, 10);

    const later = runOpinion({ ...neutralState(t + 1), impulses: [oneMonth] });
    expect(later.report.contributions.some((x) => x.cause === oneMonth.sourceId)).toBe(false);
  });

  it('capital político anda em direção à meta e um impulso de −200 zera o recurso', () => {
    const start = neutralState(10, 0.42);
    const cap = 50;
    const target = c.capital_base + c.capital_peso_aprovacao * 0.42;
    const { state: moved } = runOpinion({ ...start, resources: { ...start.resources, politicalCapital: cap } });
    const expected = cap + c.ajuste_capital * (target - cap);
    expect(moved.resources.politicalCapital).toBeCloseTo(expected, 10);
    expect(moved.resources.politicalCapital).toBeGreaterThan(cap);
    expect(moved.resources.politicalCapital).toBeLessThan(target);

    const crash = impulse({ sourceId: 'teste:crise_capital', label: 'Crise', target: 'capital_politico', delta: -200 });
    const { state: clamped } = runOpinion({
      ...start,
      resources: { ...start.resources, politicalCapital: cap },
      impulses: [crash],
    });
    expect(clamped.resources.politicalCapital).toBe(0);
  });
});
