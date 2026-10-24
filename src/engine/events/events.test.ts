import { describe, expect, it } from 'vitest';

import { loadContent } from '@/content';
import { advanceMonth } from '@/engine/advanceMonth';
import { DEFAULT_CALIBRATION } from '@/engine/economy/calibration';
import { createInitialState } from '@/engine/state';
import { createRng } from '@/engine/rng';
import { TEST_EVENT, TEST_SCENARIO, testContent, testState } from '@/tests/fixtures';
import type { GameContent, GameState, MonthInput, MonthResult, MonthStep, ReportDraft } from '@/engine/types';
import type { EventChoiceDefinition, GameEvent } from '@/types/event';
import type { Character } from '@/types/scenario';

import { IMPEACHMENT_PARAMS } from './calibration';
import { conditionValue, eventProbability, eventsForScenario, resolveEventsStep, triggerEventsStep } from './events';
import { campaignOutcome, IMPEACHMENT_CONVICTION_FLAG } from './outcome';
import { impeachmentPressure, scandalFlagCount } from './pressure';

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
    expect(result.state.events.pending).toEqual([
      { eventId: 'teste_choque', monthIndex: 2, instanceId: 'teste_choque#2' },
    ]);
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

    expect(result.report.eventsResolved).toEqual([
      { eventId: 'teste_choque', choiceId: 'absorver', automatic: true, instanceId: 'teste_choque#2' },
    ]);
    expect(result.state.events.pending).toEqual([]);
  });

  it('resposta do jogador agenda os efeitos da escolha com os rótulos corretos', () => {
    // Chamada direta da etapa: o advanceMonth já descartaria o impulso de 1 mês antes do fim do turno.
    const { content, state } = stateWithPendingEvent();
    const draft: ReportDraft = {
      proposalChanges: [],
      eventsResolved: [],
      eventsFired: [],
      notes: [],
      copom: null,
      regional: null,
    };
    const out = resolveEventsStep(state, {
      rng: createRng(state.rng),
      content,
      decisions: [],
      eventChoices: [{ eventId: 'teste_choque', choiceId: 'subsidiar' }],
      draft,
    });

    expect(draft.eventsResolved).toEqual([
      { eventId: 'teste_choque', choiceId: 'subsidiar', automatic: false, instanceId: 'teste_choque#2' },
    ]);
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
    const state = { ...testState(), congress: { blocs: [], cabinet: [] } };
    // Cenário: esquerda 40, centro 10, direita −30 → média 20/3.
    expect(conditionValue(state, 'congressRelation', content)).toBeCloseTo(20 / 3, 10);
  });
});

describe('eventos: escândalo em ministério (POLITICAL_RULES.md §6.3.1)', () => {
  /** Evento que só dispara com pasta de bloco, com probabilidade escalada pelo risco do gabinete. */
  const SCANDAL: GameEvent = {
    ...TEST_EVENT,
    id: 'teste_escandalo',
    trigger: {
      monthsOfYear: [],
      conditions: [{ variable: 'partisanMinistries', op: 'gt', value: 0 }],
      probability: 1,
      probabilityFactor: 'cabinetScandalRisk',
      cooldownMonths: 0,
      maxOccurrences: 1,
    },
    choices: [
      { id: 'defender', label: 'Defender', description: 'Defende.', agendaCost: 0, effects: [] },
      { id: 'demitir', label: 'Demitir', description: 'Demite.', agendaCost: 1, effects: [], dismissMinister: true },
    ],
    defaultChoice: 'defender',
  };

  function withMinister(state: GameState, occupant: string, since = 0): GameState {
    return { ...state, congress: { ...state.congress, cabinet: [{ id: 'fazenda', occupant, since }] } };
  }

  it('gabinete técnico: o evento nunca dispara (condição partisanMinistries)', () => {
    const content = testContent({ events: [SCANDAL] });
    const { firedByMonth } = runMonths(testState(42, 'estrategica', content), content, 48);
    expect(firedByMonth).toEqual([]);
  });

  it('a probabilidade é a base vezes o risco do gabinete, limitado a [0, 1]', () => {
    const content = testContent({ events: [SCANDAL] });
    const state = withMinister(testState(), 'centro');
    expect(eventProbability(state, SCANDAL, content)).toBeCloseTo(
      conditionValue(state, 'cabinetScandalRisk', content),
      12,
    );
    expect(conditionValue(state, 'partisanMinistries', content)).toBe(1);
    expect(eventProbability(state, TEST_EVENT, content)).toBe(TEST_EVENT.trigger.probability);
  });

  it('com pasta de bloco por muitos anos, o evento acaba disparando', () => {
    const content = testContent({ events: [SCANDAL] });
    const { firedByMonth } = runMonths(withMinister(testState(), 'centro'), content, 240);
    expect(firedByMonth.length).toBe(1);
  });

  it('escolha que demite troca o ministro de bloco por técnico, com custo de capital e relação', () => {
    const content = testContent({ events: [SCANDAL] });
    const base = withMinister(testState(), 'centro');
    const state: GameState = {
      ...base,
      events: { ...base.events, pending: [{ eventId: SCANDAL.id, monthIndex: 0, instanceId: `${SCANDAL.id}#0` }] },
    };
    const out = step(state, content, { decisions: [], eventChoices: [{ eventId: SCANDAL.id, choiceId: 'demitir' }] });
    expect(out.state.congress.cabinet.find((m) => m.id === 'fazenda')?.occupant).toBe('tecnico');
    expect(out.state.resources.politicalCapital).toBe(
      state.resources.politicalCapital + content.calibration.capital_demissao,
    );
    const centro = (s: GameState) => s.congress.blocs.find((b) => b.id === 'centro')?.governmentRelation ?? 0;
    expect(centro(out.state)).toBeCloseTo(centro(state) + content.calibration.relacao_demissao, 10);
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

/** Eventos sorteados num mês pela etapa de sorteio isolada (sem notícias nem outras etapas). */
function drawnIn(state: GameState, content: GameContent): string[] {
  const draft: ReportDraft = {
    proposalChanges: [],
    eventsResolved: [],
    eventsFired: [],
    notes: [],
    copom: null,
    regional: null,
  };
  triggerEventsStep(state, { rng: createRng(state.rng), content, decisions: [], eventChoices: [], draft });
  return draft.eventsFired;
}

/** Evento que só chega encadeado (FASE_07.md): o sorteio mensal o ignora. */
const CHAINED: GameEvent = {
  ...TEST_EVENT,
  id: 'teste_seguinte',
  chainedOnly: true,
  trigger: { ...TEST_EVENT.trigger, monthsOfYear: [], cooldownMonths: 0, probability: 1 },
  onFire: [],
  onFireFlags: ['marca_seguinte'],
};

/**
 * Evento de origem: a escolha `seguir` aplica `extra` (marcas, cadeias, personagens); `parar` não faz nada. Dezembro
 * (`monthsOfYear: [12]`) fica fora da janela dos testes, então só a origem pendente faz o evento aparecer.
 */
function originEvent(extra: Partial<EventChoiceDefinition> = {}): GameEvent {
  return {
    ...TEST_EVENT,
    id: 'teste_origem',
    trigger: { ...TEST_EVENT.trigger, monthsOfYear: [12], cooldownMonths: 0 },
    choices: [
      { id: 'seguir', label: 'Seguir', description: 'Segue adiante.', agendaCost: 0, effects: [], ...extra },
      { id: 'parar', label: 'Parar', description: 'Para.', agendaCost: 0, effects: [] },
    ],
    defaultChoice: 'parar',
  };
}

/** Estado no mês 1 com a origem pendente, como se tivesse chegado no mês anterior. */
function originState(content: GameContent, flags: Record<string, number> = {}): GameState {
  const base = testState(42, 'estrategica', content);
  return {
    ...base,
    monthIndex: 1,
    events: {
      ...base.events,
      pending: [{ eventId: 'teste_origem', monthIndex: 1, instanceId: 'teste_origem#1' }],
      flags,
    },
  };
}

/** Responde à origem com a escolha dada, no mês do estado. */
function answer(state: GameState, content: GameContent, choiceId: string) {
  return step(state, content, { decisions: [], eventChoices: [{ eventId: 'teste_origem', choiceId }] });
}

/** Evento sorteado com gatilho explícito (sem meses, sem condição; probabilidade e cooldown dados). */
function drawn(id: string, trigger: Partial<GameEvent['trigger']> = {}): GameEvent {
  return {
    ...TEST_EVENT,
    id,
    trigger: {
      monthsOfYear: [],
      conditions: [],
      probability: 1,
      cooldownMonths: 0,
      maxOccurrences: 1,
      ...trigger,
    },
    onFire: [],
  };
}

describe('eventos: marcas (FASE_07.md; GAME_DESIGN.md §11.3)', () => {
  it('requiresFlags: só dispara com a marca gravada', () => {
    const gated = drawn('teste_marcado', { requiresFlags: ['marca_teste'] });
    const content = testContent({ events: [gated] });
    expect(runMonths(testState(), content, 6).firedByMonth).toEqual([]);
    const withFlag = { ...testState(), events: { ...testState().events, flags: { marca_teste: 0 } } };
    expect(runMonths(withFlag, content, 6).firedByMonth).toEqual([0]);
  });

  it('forbidsFlags: não dispara quando a marca proibida existe', () => {
    const blocked = drawn('teste_proibido', { forbidsFlags: ['marca_teste'] });
    const content = testContent({ events: [blocked] });
    expect(runMonths(testState(), content, 6).firedByMonth).toEqual([0]);
    const withFlag = { ...testState(), events: { ...testState().events, flags: { marca_teste: 0 } } };
    expect(runMonths(withFlag, content, 6).firedByMonth).toEqual([]);
  });

  it('onFireFlags grava a marca com o mês de chegada à caixa de entrada', () => {
    const marking = { ...drawn('teste_marca'), onFireFlags: ['marca_disparo'] };
    const content = testContent({ events: [marking] });
    const out = step(testState(), content);
    expect(out.report.eventsFired).toEqual(['teste_marca']);
    expect(out.state.events.flags).toEqual({ marca_disparo: 1 });
  });

  it('setFlags grava a marca com o mês da escolha e clearFlags a retira', () => {
    const content = testContent({
      events: [originEvent({ setFlags: ['marca_nova'], clearFlags: ['marca_velha'] })],
    });
    const out = answer(originState(content, { marca_velha: 0 }), content, 'seguir');
    expect(out.state.events.flags).toEqual({ marca_nova: 1 });
  });
});

describe('eventos: encadeamento (FASE_07.md)', () => {
  it('chainedOnly nunca entra no sorteio mensal', () => {
    const content = testContent({ events: [CHAINED] });
    expect(runMonths(testState(), content, 24).firedByMonth).toEqual([]);
  });

  it('followUp agendado na escolha chega à caixa de entrada no mês certo, com a marca gravada', () => {
    const content = testContent({
      events: [originEvent({ followUps: [{ eventId: 'teste_seguinte', delayMonths: 3, probability: 1 }] }), CHAINED],
    });
    const answered = answer(originState(content), content, 'seguir');
    expect(answered.state.monthIndex).toBe(2);
    expect(answered.state.events.scheduled).toEqual([
      { eventId: 'teste_seguinte', monthIndex: 4, causeEventId: 'teste_origem', causeChoiceId: 'seguir' },
    ]);

    // Meses 2 e 3 processados: a chegada acontece no fim do mês 3 (caixa de entrada do mês 4).
    const rest = runMonths(answered.state, content, 2);
    expect(rest.firedByMonth).toEqual([3]);
    expect(rest.reports[1].eventsFired).toEqual(['teste_seguinte']);
    expect(rest.state.events.pending).toEqual([
      { eventId: 'teste_seguinte', monthIndex: 4, instanceId: 'teste_seguinte#4' },
    ]);
    expect(rest.state.events.scheduled).toEqual([]);
    expect(rest.state.events.flags).toEqual({ marca_seguinte: 4 });
  });

  it('followUp com probabilidade 0 nunca é agendado', () => {
    const content = testContent({
      events: [originEvent({ followUps: [{ eventId: 'teste_seguinte', delayMonths: 2, probability: 0 }] }), CHAINED],
    });
    const answered = answer(originState(content), content, 'seguir');
    expect(answered.state.events.scheduled).toEqual([]);
    // Seis meses, antes de dezembro (quando a própria origem, que é sorteável, poderia voltar).
    expect(runMonths(answered.state, content, 6).firedByMonth).toEqual([]);
  });

  it('sorteio do followUp é determinístico: mesma semente, mesmo estado', () => {
    const content = testContent({
      events: [originEvent({ followUps: [{ eventId: 'teste_seguinte', delayMonths: 2, probability: 0.5 }] }), CHAINED],
    });
    const a = answer(originState(content), content, 'seguir').state;
    const b = answer(originState(content), content, 'seguir').state;
    expect(a).toEqual(b);
  });

  it('escolha sem cadeia não consome a semente', () => {
    const content = testContent({ events: [originEvent({ setFlags: ['marca_nova'] })] });
    const start = originState(content);
    const out = answer(start, content, 'seguir');
    expect(out.state.rng).toEqual(start.rng);
  });

  it('chegada encadeada não conta em max_eventos_mes', () => {
    const random = drawn('teste_aleatorio', { maxOccurrences: 100 });
    const content = testContent({
      events: [
        originEvent({ followUps: [{ eventId: 'teste_seguinte', delayMonths: 3, probability: 1 }] }),
        CHAINED,
        random,
      ],
      calibration: { ...DEFAULT_CALIBRATION, max_eventos_mes: 1 },
    });
    const answered = answer(originState(content), content, 'seguir');
    const rest = runMonths(answered.state, content, 2);
    // No mês 3, o encadeado chega além do limite de 1 evento sorteado.
    expect(rest.reports[1].eventsFired).toEqual(['teste_seguinte', 'teste_aleatorio']);
  });

  it('agendado vencido, de evento inexistente ou no limite de ocorrências é descartado', () => {
    const content = testContent({ events: [CHAINED] });
    const start = testState();
    const withQueue: GameState = {
      ...start,
      events: {
        ...start.events,
        count: { teste_seguinte: 1 },
        scheduled: [
          { eventId: 'teste_seguinte', monthIndex: 0, causeEventId: 'x', causeChoiceId: 'y' },
          { eventId: 'inexistente', monthIndex: 1, causeEventId: 'x', causeChoiceId: 'y' },
          { eventId: 'teste_seguinte', monthIndex: 1, causeEventId: 'x', causeChoiceId: 'y' },
        ],
      },
    };
    const out = step(withQueue, content);
    expect(out.state.events.pending).toEqual([]);
    expect(out.state.events.scheduled).toEqual([]);
  });

  it('agendado respeita marcas e condições do gatilho na chegada', () => {
    const start = testState();
    const queued = (flags: Record<string, number>): GameState => ({
      ...start,
      events: {
        ...start.events,
        flags,
        scheduled: [{ eventId: 'teste_seguinte', monthIndex: 1, causeEventId: 'x', causeChoiceId: 'y' }],
      },
    });
    const forbidding = testContent({
      events: [{ ...CHAINED, trigger: { ...CHAINED.trigger, forbidsFlags: ['bloqueio'] } }],
    });
    expect(step(queued({}), forbidding).state.events.pending).toEqual([
      { eventId: 'teste_seguinte', monthIndex: 1, instanceId: 'teste_seguinte#1' },
    ]);
    const blocked = step(queued({ bloqueio: 0 }), forbidding).state.events;
    expect(blocked.pending).toEqual([]);
    expect(blocked.scheduled).toEqual([]);

    const impossible = testContent({
      events: [
        {
          ...CHAINED,
          trigger: { ...CHAINED.trigger, conditions: [{ variable: 'inflation12m', op: 'gt', value: 0.5 }] },
        },
      ],
    });
    expect(step(queued({}), impossible).state.events.pending).toEqual([]);
  });
});

describe('eventos: escopo de cenário (onlyScenarios; AI_INSTRUCTIONS.md §8)', () => {
  it('eventsForScenario mantém os eventos sem restrição e os do cenário indicado', () => {
    const all = drawn('teste_todos');
    const only = { ...drawn('teste_so_outro'), onlyScenarios: ['outro_cenario'] };
    const here = { ...drawn('teste_so_aqui'), onlyScenarios: ['teste_2027'] };
    expect(eventsForScenario([all, only, here], 'teste_2027').map((e) => e.id)).toEqual([
      'teste_todos',
      'teste_so_aqui',
    ]);
  });

  it('evento restrito a outro cenário nunca dispara', () => {
    const other = { ...drawn('teste_outro'), onlyScenarios: ['outro_cenario'] };
    const content = testContent({ events: [other] });
    expect(runMonths(testState(), content, 12).firedByMonth).toEqual([]);
  });

  it('evento restrito a este cenário dispara', () => {
    const here = { ...drawn('teste_aqui'), onlyScenarios: [TEST_SCENARIO.id] };
    const content = testContent({ events: [here] });
    expect(runMonths(testState(), content, 3).firedByMonth).toEqual([0]);
  });

  it('pendência de evento que não existe no cenário é descartada sem escolha padrão', () => {
    const other = { ...drawn('teste_fora'), onlyScenarios: ['outro_cenario'] };
    const content = testContent({ events: [other] });
    const start: GameState = {
      ...testState(),
      events: {
        ...testState().events,
        pending: [{ eventId: 'teste_fora', monthIndex: 0, instanceId: 'teste_fora#0' }],
      },
    };
    const out = step(start, content);
    expect(out.report.eventsResolved).toEqual([]);
    expect(out.state.events.pending).toEqual([]);
  });
});

describe('eventos: personagens (FASE_07.md)', () => {
  const CHARACTER: Character = {
    id: 'min_fazenda',
    name: 'Teodoro Vilar',
    role: 'Ministro da Fazenda',
    description: 'Personagem fictício de teste.',
    initialStanding: 40,
    dataStatus: 'FICTICIO',
  };
  const scenario = { ...TEST_SCENARIO, characters: [CHARACTER] };

  it('characterEffects somam ao prestígio a partir do inicial do cenário', () => {
    const content = testContent({
      scenario,
      events: [originEvent({ characterEffects: [{ characterId: 'min_fazenda', delta: 30 }] })],
    });
    const out = answer(originState(content), content, 'seguir');
    expect(out.state.events.characters).toEqual({ min_fazenda: 70 });
  });

  it('o prestígio para em 100 e em −100 (limite de −100…100)', () => {
    const up = testContent({
      scenario,
      events: [originEvent({ characterEffects: [{ characterId: 'min_fazenda', delta: 30 }] })],
    });
    const high = originState(up, {});
    const highWithStanding = { ...high, events: { ...high.events, characters: { min_fazenda: 90 } } };
    expect(answer(highWithStanding, up, 'seguir').state.events.characters).toEqual({ min_fazenda: 100 });

    const down = testContent({
      scenario,
      events: [originEvent({ characterEffects: [{ characterId: 'min_fazenda', delta: -30 }] })],
    });
    const low = originState(down, {});
    const lowWithStanding = { ...low, events: { ...low.events, characters: { min_fazenda: -90 } } };
    expect(answer(lowWithStanding, down, 'seguir').state.events.characters).toEqual({ min_fazenda: -100 });
  });

  it('conditionValue de characterStanding lê o estado ou o inicial, e exige characterId', () => {
    const content = testContent({ scenario });
    const state = testState(42, 'estrategica', content);
    expect(conditionValue(state, 'characterStanding', content, 'min_fazenda')).toBe(40);
    const moved = { ...state, events: { ...state.events, characters: { min_fazenda: 75 } } };
    expect(conditionValue(moved, 'characterStanding', content, 'min_fazenda')).toBe(75);
    expect(() => conditionValue(state, 'characterStanding', content)).toThrow(RangeError);
  });

  it('condição de characterStanding usa o prestígio atual do personagem', () => {
    // Só a etapa de sorteio: o teste é da condição, não das manchetes do advanceMonth.
    const gated = drawn('teste_prestigio', {
      conditions: [{ variable: 'characterStanding', op: 'gt', value: 30, characterId: 'min_fazenda' }],
    });
    const content = testContent({ scenario, events: [gated] });
    expect(drawnIn(testState(), content)).toEqual(['teste_prestigio']);
    const low = { ...testState(), events: { ...testState().events, characters: { min_fazenda: -10 } } };
    expect(drawnIn(low, content)).toEqual([]);
  });
});

describe('pressão de impeachment (POLITICAL_RULES.md §10; FASE_07.md)', () => {
  const realContent = loadContent('brasil_2027_01_v050');
  const realState = () => createInitialState({ content: realContent, difficulty: 'estrategica', seed: 1 });

  /** Estado com alguns fatores trocados; o resto segue o inicial do cenário. */
  function withFactors(
    base: GameState,
    patch: {
      approval?: number;
      relation?: number;
      flags?: Record<string, number>;
      limitExcess?: number;
      unemployment?: number;
    },
  ): GameState {
    return {
      ...base,
      indicators: {
        ...base.indicators,
        approval: patch.approval ?? base.indicators.approval,
        unemployment: patch.unemployment ?? base.indicators.unemployment,
      },
      economy: {
        ...base.economy,
        fiscal: { ...base.economy.fiscal, limitExcess: patch.limitExcess ?? base.economy.fiscal.limitExcess },
      },
      congress: {
        ...base.congress,
        blocs:
          patch.relation === undefined
            ? base.congress.blocs
            : base.congress.blocs.map((b) => ({ ...b, governmentRelation: patch.relation as number })),
      },
      events: { ...base.events, flags: patch.flags ?? base.events.flags },
    };
  }

  const pressure = (state: GameState) => impeachmentPressure(state, realContent);

  it('estado inicial do cenário v0.5.0 tem pressão baixa (< 0,10)', () => {
    const p = pressure(realState());
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(0.1);
  });

  it('baixa aprovação, relação ruim e três escândalos passam de 0,6', () => {
    const bad = withFactors(realState(), {
      approval: 0.15,
      relation: -60,
      flags: { escandalo_a: 0, escandalo_b: 0, cpi_c: 0 },
    });
    expect(pressure(bad)).toBeGreaterThan(0.6);
  });

  it('a pressão é saturada: fica em [0, 1] mesmo com todos os fatores no pior e no melhor extremo', () => {
    // Extremos realistas: excesso de 3 p.p. do PIB e desemprego de 20%. A logística chega perto de 1 sem passar.
    const worst = withFactors(realState(), {
      approval: 0,
      relation: -100,
      limitExcess: 0.03,
      unemployment: 0.2,
      flags: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`escandalo_${i}`, 0])),
    });
    const best = withFactors(realState(), { approval: 1, relation: 100, limitExcess: 0, unemployment: 0 });
    expect(pressure(worst)).toBeLessThanOrEqual(1);
    expect(pressure(worst)).toBeGreaterThan(0.99);
    expect(pressure(best)).toBeGreaterThanOrEqual(0);
    expect(pressure(best)).toBeLessThan(0.01);
  });

  it('cai com a aprovação (maior aprovação, menor pressão)', () => {
    const base = realState();
    const values = [0.1, 0.3, 0.5, 0.7, 0.9].map((approval) => pressure(withFactors(base, { approval })));
    values.slice(1).forEach((v, i) => expect(v).toBeLessThan(values[i]));
  });

  it('cai com a relação com o Congresso (relação maior, menor pressão)', () => {
    const base = realState();
    const values = [-100, -50, 0, 50, 100].map((relation) => pressure(withFactors(base, { relation })));
    values.slice(1).forEach((v, i) => expect(v).toBeLessThan(values[i]));
  });

  it('cresce com marcas de escândalo e CPI até o limite de escandalos_max', () => {
    const base = realState();
    const flagsOf = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`escandalo_${i}`, 0]));
    const values = [0, 1, 2, 3, 4, 5, 6].map((n) => pressure(withFactors(base, { flags: flagsOf(n) })));
    values.slice(1).forEach((v, i) => expect(v).toBeGreaterThanOrEqual(values[i]));
    expect(values[4]).toBeGreaterThan(values[0]);
    expect(values[6]).toBe(values[4]);
  });

  it('cresce com o excesso do limite e com o desemprego acima do neutro', () => {
    const base = realState();
    const excess = [0, 0.005, 0.01, 0.02].map((limitExcess) => pressure(withFactors(base, { limitExcess })));
    excess.slice(1).forEach((v, i) => expect(v).toBeGreaterThan(excess[i]));
    const jobless = [0.05, 0.08, 0.1, 0.14].map((unemployment) => pressure(withFactors(base, { unemployment })));
    jobless.slice(1).forEach((v, i) => expect(v).toBeGreaterThanOrEqual(jobless[i]));
    expect(jobless[2]).toBeGreaterThan(jobless[1]);
  });

  it('scandalFlagCount conta só marcas escandalo_ e cpi_', () => {
    const state = withFactors(realState(), {
      flags: { escandalo_a: 0, cpi_b: 1, impeachment_condenado: 2, outra: 3 },
    });
    expect(scandalFlagCount(state)).toBe(2);
  });

  it('cada parâmetro de pressão está dentro da faixa declarada', () => {
    for (const [name, spec] of Object.entries(IMPEACHMENT_PARAMS)) {
      expect(spec.value, name).toBeGreaterThanOrEqual(spec.min);
      expect(spec.value, name).toBeLessThanOrEqual(spec.max);
    }
  });

  it('campaignOutcome encerra por impeachment só com a marca de condenação', () => {
    expect(campaignOutcome(realState())).toBeNull();
    const condemned = withFactors(realState(), { flags: { [IMPEACHMENT_CONVICTION_FLAG]: 3 } });
    expect(campaignOutcome(condemned)).toBe('impeachment');
  });
});
