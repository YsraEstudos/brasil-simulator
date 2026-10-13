import { describe, expect, it } from 'vitest';

import { advanceMonth } from '@/engine/advanceMonth';
import { createRng } from '@/engine/rng';
import { TEST_EVENT, testContent, testState } from '@/tests/fixtures';
import type { GameContent, GameState, MonthInput, MonthResult, MonthStep, ReportDraft } from '@/engine/types';
import type { GameEvent } from '@/types/event';

import { conditionValue, resolveEventsStep, triggerEventsStep } from './events';

/** GAME_DESIGN.md §11.3: eventos aparecem na caixa de entrada, pedem escolha e têm escolha padrão. */

const STEPS: readonly MonthStep[] = [resolveEventsStep, triggerEventsStep];

function step(state: GameState, content: GameContent, input: MonthInput = { decisions: [] }): MonthResult {
  return advanceMonth(state, input, content, STEPS);
}

/** Avança `months` meses sem escolhas e devolve o último resultado e a lista de meses com evento. */
function runMonths(start: GameState, content: GameContent, months: number) {
  let state = start;
  const firedByMonth: number[] = [];
  const reports: MonthResult['report'][] = [];
  for (let i = 0; i < months; i++) {
    const result = step(state, content);
    reports.push(result.report);
    if (result.report.eventsFired.length > 0) firedByMonth.push(result.report.monthIndex);
    state = result.state;
  }
  return { state, firedByMonth, reports };
}

/** Estado no início de `month` com o evento de teste já pendente (disparado em março, mês 1 → resposta no 2). */
function stateWithPendingEvent() {
  const content = testContent();
  const atMonth1 = step(step(testState(), content).state, content).state;
  return { content, state: atMonth1 };
}

describe('eventos: disparo e prazo (GAME_DESIGN.md §11.3)', () => {
  it('dispara no mês anterior a março e agenda o efeito de disparo', () => {
    const content = testContent();
    const atMonth1 = step(testState(), content).state;
    const result = step(atMonth1, content);

    expect(result.report.eventsFired).toEqual(['teste_choque']);
    expect(result.state.events.pending).toEqual([{ eventId: 'teste_choque', monthIndex: 2 }]);
    const onFire = result.state.impulses.find((i) => i.sourceId === 'evento:teste_choque_2');
    expect(onFire).toMatchObject({
      target: 'choque.inflacao',
      delta: 0.005,
      startMonth: 2,
      endMonth: 4,
      label: 'Choque de teste',
    });
  });

  it('sem resposta até o fim do mês seguinte aplica a escolha padrão automaticamente', () => {
    const { content, state } = stateWithPendingEvent();
    const result = step(state, content);

    expect(result.report.eventsResolved).toEqual([{ eventId: 'teste_choque', choiceId: 'absorver', automatic: true }]);
    expect(result.state.events.pending).toEqual([]);
  });

  it('resposta do jogador agenda os efeitos da escolha com os rótulos corretos', () => {
    // Chamada direta da etapa: o advanceMonth já descartaria o impulso de 1 mês antes do fim do turno.
    const { content, state } = stateWithPendingEvent();
    const draft: ReportDraft = { proposalChanges: [], eventsResolved: [], eventsFired: [], notes: [], copom: null };
    const out = resolveEventsStep(state, {
      rng: createRng(state.rng),
      content,
      decisions: [],
      eventChoices: [{ eventId: 'teste_choque', choiceId: 'subsidiar' }],
      draft,
    });

    expect(draft.eventsResolved).toEqual([{ eventId: 'teste_choque', choiceId: 'subsidiar', automatic: false }]);
    expect(out.state.events.pending).toEqual([]);
    // Exclui o impulso de disparo (choque.inflacao), que tem o mesmo sourceId neste mês.
    const mine = out.state.impulses.filter(
      (i) => i.sourceId === 'evento:teste_choque_2' && i.target !== 'choque.inflacao',
    );
    expect(mine).toHaveLength(2);
    const fuel = mine.find((i) => i.target === 'aprovacao');
    const custeio = mine.find((i) => i.target === 'gasto.custeio');
    expect(fuel).toMatchObject({ label: 'Subsídio ao combustível', delta: 0.005, startMonth: 2, endMonth: 2 });
    expect(custeio).toMatchObject({ label: 'Choque de teste', delta: 0.001, startMonth: 2, endMonth: 7 });
  });
});

describe('eventos: limites de ocorrência e intervalo (GAME_DESIGN.md §11.3)', () => {
  it('maxOccurrences = 1 dispara uma única vez em 36 meses', () => {
    const { state, firedByMonth } = runMonths(testState(), testContent(), 36);

    expect(firedByMonth).toEqual([1]);
    expect(state.events.count['teste_choque']).toBe(1);
  });

  it('com maxOccurrences 5 e cooldown 12, dispara nos meses 1, 13 e 25', () => {
    const repeating: GameEvent = {
      ...TEST_EVENT,
      trigger: { ...TEST_EVENT.trigger, maxOccurrences: 5, cooldownMonths: 12 },
    };
    const content = testContent({ events: [repeating] });
    const { firedByMonth } = runMonths(testState(42, 'estrategica', content), content, 26);

    expect(firedByMonth).toEqual([1, 13, 25]);
  });
});

describe('eventos: condições (GAME_DESIGN.md §11.3)', () => {
  it('evento com condição de inflação acima de 0,5 nunca dispara', () => {
    const blocked: GameEvent = {
      ...TEST_EVENT,
      trigger: {
        ...TEST_EVENT.trigger,
        maxOccurrences: 5,
        cooldownMonths: 0,
        monthsOfYear: [],
        conditions: [{ variable: 'inflation12m', op: 'gt', value: 0.5 }],
      },
    };
    const content = testContent({ events: [blocked] });
    const { state, firedByMonth } = runMonths(testState(42, 'estrategica', content), content, 36);

    expect(firedByMonth).toEqual([]);
    expect(state.events.pending).toEqual([]);
  });

  it('congressRelation usa a relação inicial do cenário quando não há blocos no estado', () => {
    const content = testContent();
    const state = { ...testState(), congress: { blocs: [] } };
    // Cenário: esquerda 40, centro 10, direita −30 → média 20/3.
    expect(conditionValue(state, 'congressRelation', content)).toBeCloseTo(20 / 3, 10);
  });
});

describe('eventos: determinismo (ECONOMIC_MODEL.md §8 / AI_INSTRUCTIONS.md §5)', () => {
  const RANDOM_EVENT: GameEvent = {
    ...TEST_EVENT,
    trigger: { ...TEST_EVENT.trigger, monthsOfYear: [], probability: 0.3, cooldownMonths: 0, maxOccurrences: 100 },
  };
  const content = testContent({ events: [RANDOM_EVENT] });

  it('mesma semente gera a mesma sequência de disparos em 48 meses', () => {
    const a = runMonths(testState(7, 'estrategica', content), content, 48).firedByMonth;
    const b = runMonths(testState(7, 'estrategica', content), content, 48).firedByMonth;
    expect(a).toEqual(b);
  });

  it('sementes diferentes produzem sequências diferentes', () => {
    const a = runMonths(testState(7, 'estrategica', content), content, 48).firedByMonth;
    const b = runMonths(testState(8, 'estrategica', content), content, 48).firedByMonth;
    const c = runMonths(testState(9, 'estrategica', content), content, 48).firedByMonth;
    expect([a, b, c].some((seq) => JSON.stringify(seq) !== JSON.stringify(a))).toBe(true);
  });
});
