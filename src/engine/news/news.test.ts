import { describe, expect, it } from 'vitest';

import { loadContent } from '@/content';
import type { GameEvent } from '@/types/event';

import { advanceMonth } from '../advanceMonth';
import { STRATEGIES, type Strategy } from '../sim/strategies';
import { createInitialState } from '../state';
import type { GameContent, GameState, MonthReport, NewsItem } from '../types';

import { NEWS_LIMIT, NEWS_PER_MONTH_MAX } from './calibration';
import { appendNews, generateNews } from './news';

// FASE_07.md, tarefa T2: notícias geradas pelo motor, com causa rastreável, limitadas e determinísticas.

const SCENARIO_ID = 'brasil_2027_01_v050';
const content: GameContent = loadContent(SCENARIO_ID);
const CAMPAIGN_TEST_MONTHS = 12;
const SEED = 7;

const inerte = (): Strategy => {
  const found = STRATEGIES.find((s) => s.id === 'inerte');
  if (!found) throw new Error('estratégia inerte não encontrada');
  return found;
};

/** Joga a campanha com a estratégia inerte e devolve o estado final e as notícias de cada mês. */
function playInert(seed: number, months: number): { state: GameState; newsByMonth: NewsItem[][] } {
  const strategy = inerte();
  let state = createInitialState({ content, difficulty: 'estrategica', seed });
  const newsByMonth: NewsItem[][] = [];
  for (let m = 0; m < months; m++) {
    const result = advanceMonth(state, strategy.decide(state, content), content);
    newsByMonth.push(result.state.events.news.filter((item) => item.monthIndex === result.report.monthIndex));
    state = result.state;
  }
  return { state, newsByMonth };
}

function baseReport(overrides: Partial<MonthReport> = {}): MonthReport {
  return {
    monthIndex: 0,
    accepted: [],
    rejected: [],
    contributions: [],
    proposalChanges: [],
    eventsResolved: [],
    eventsFired: [],
    copom: null,
    notes: [],
    regional: null,
    ...overrides,
  };
}

function initialState(): GameState {
  return createInitialState({ content, difficulty: 'estrategica', seed: SEED });
}

describe('notícias: causa, limite e determinismo (FASE_07.md, critérios 3)', () => {
  it('toda notícia de uma campanha de 12 meses tem causa preenchida e rastreável', () => {
    const { newsByMonth } = playInert(SEED, CAMPAIGN_TEST_MONTHS);
    const all = newsByMonth.flat();
    for (const item of all) {
      expect(item.cause.startsWith('Causa: ')).toBe(true);
      expect(item.cause.length).toBeGreaterThan('Causa: '.length);
      expect(item.headline.length).toBeGreaterThan(0);
    }
  });

  it('a campanha de 12 meses com a estratégia inerte nunca ultrapassa NEWS_LIMIT nem NEWS_PER_MONTH_MAX por mês', () => {
    const { state, newsByMonth } = playInert(SEED, CAMPAIGN_TEST_MONTHS);
    expect(state.events.news.length).toBeLessThanOrEqual(NEWS_LIMIT);
    for (const month of newsByMonth) {
      expect(month.length).toBeLessThanOrEqual(NEWS_PER_MONTH_MAX);
    }
  });

  it('é determinística: mesma semente gera as mesmas notícias', () => {
    const first = playInert(SEED, CAMPAIGN_TEST_MONTHS).state.events.news;
    const second = playInert(SEED, CAMPAIGN_TEST_MONTHS).state.events.news;
    expect(second).toEqual(first);
  });

  it('generateNews é pura: mesma entrada, mesma saída', () => {
    const state = initialState();
    const args = {
      previous: state,
      next: state,
      report: baseReport({ copom: { previous: 0.13, next: 0.1375 } }),
      content,
    };
    expect(generateNews(args)).toEqual(generateNews(args));
  });

  it('limita a NEWS_PER_MONTH_MAX manchetes por mês', () => {
    const state = initialState();
    const base = content.events[0];
    const items = generateNews({
      previous: state,
      next: state,
      report: baseReport({ eventsFired: Array.from({ length: NEWS_PER_MONTH_MAX + 2 }, () => base.id) }),
      content,
    });
    expect(items).toHaveLength(NEWS_PER_MONTH_MAX);
    expect(items.map((i) => i.id)).toEqual(items.map((_, ordem) => `0_${ordem}`));
  });
});

describe('appendNews: feed limitado (FASE_07.md, critério 4)', () => {
  it(`mantém só os últimos NEWS_LIMIT itens, na ordem de chegada`, () => {
    const items: NewsItem[] = Array.from({ length: NEWS_LIMIT + 12 }, (_, i) => ({
      id: `m_${i}`,
      monthIndex: i,
      kind: 'economia',
      tone: 'neutra',
      headline: `Manchete ${i}`,
      cause: 'Causa: teste',
    }));
    const state = appendNews(initialState(), items);
    expect(state.events.news).toHaveLength(NEWS_LIMIT);
    expect(state.events.news[0].id).toBe(items[12].id);
    expect(state.events.news[NEWS_LIMIT - 1].id).toBe(items[items.length - 1].id);
  });

  it('aceita estado sem o campo de notícias (save antigo) e começa o feed vazio', () => {
    const state = initialState();
    const legacy: GameState = {
      ...state,
      events: { ...state.events, news: undefined as unknown as NewsItem[] },
    };
    const items: NewsItem[] = [
      { id: '0_0', monthIndex: 0, kind: 'economia', tone: 'neutra', headline: 'Teste', cause: 'Causa: teste' },
    ];
    expect(appendNews(legacy, items).events.news).toEqual(items);
  });
});

describe('manchetes por causa (FASE_07.md, critério 3)', () => {
  it('Copom gera manchete de economia com a causa e os valores da decisão', () => {
    const state = initialState();
    const items = generateNews({
      previous: state,
      next: state,
      report: baseReport({ copom: { previous: 0.13, next: 0.1375 } }),
      content,
    });
    const copom = items.find((i) => i.headline.startsWith('Copom'));
    expect(copom).toEqual({
      id: '0_0',
      monthIndex: 0,
      kind: 'economia',
      tone: 'negativa',
      headline: 'Copom eleva a Selic para 13,75%',
      cause: 'Causa: o Copom elevou a Selic (de 13,00% para 13,75%)',
    });
  });

  it('evento disparado gera item de evento com sourceId e characterId', () => {
    const state = initialState();
    const base = content.events[0];
    const fake: GameEvent = {
      ...base,
      id: 'teste_evento_personagem',
      title: 'Teste de personagem',
      characterId: 'personagem_teste',
    };
    const withFake: GameContent = { ...content, events: [...content.events, fake] };
    const items = generateNews({
      previous: state,
      next: state,
      report: baseReport({ eventsFired: [fake.id] }),
      content: withFake,
    });
    expect(items.find((i) => i.kind === 'evento')).toMatchObject({
      headline: 'Teste de personagem',
      sourceId: 'teste_evento_personagem',
      characterId: 'personagem_teste',
    });
    expect(items.filter((i) => i.kind === 'personagem')).toHaveLength(1);
  });

  it('evento que chega encadeado cita o evento de origem na causa', () => {
    const state = initialState();
    const origin = content.events[0];
    const choice = origin.choices[0];
    const fake: GameEvent = { ...origin, id: 'teste_evento_encadeado', title: 'Consequência de teste' };
    const withFake: GameContent = { ...content, events: [...content.events, fake] };
    const previous: GameState = {
      ...state,
      events: {
        ...state.events,
        scheduled: [{ eventId: fake.id, monthIndex: 1, causeEventId: origin.id, causeChoiceId: choice.id }],
      },
    };
    const items = generateNews({
      previous,
      next: state,
      report: baseReport({ monthIndex: 0, eventsFired: [fake.id] }),
      content: withFake,
    });
    const evento = items.find((i) => i.kind === 'evento');
    expect(evento?.cause).toContain(origin.title);
    expect(evento?.cause).toContain(choice.label);
  });

  it('condição só de calendário não vira causa de condição: o evento cai na causa de calendário', () => {
    const state = initialState();
    const base = content.events[0];
    const calendarOnly: GameEvent = {
      ...base,
      id: 'teste_evento_calendario',
      title: 'Evento de calendário',
      trigger: {
        ...base.trigger,
        conditions: [{ variable: 'monthIndex', op: 'gt', value: 0 }],
      },
    };
    const withEvent: GameContent = { ...content, events: [...content.events, calendarOnly] };
    const items = generateNews({
      previous: state,
      next: state,
      report: baseReport({ eventsFired: [calendarOnly.id] }),
      content: withEvent,
    });
    expect(items.find((i) => i.kind === 'evento')?.cause).toBe('Causa: calendário do mandato');
  });

  it('evento resolvido sem resposta gera manchete negativa de evento', () => {
    const state = initialState();
    const base = content.events[0];
    const items = generateNews({
      previous: state,
      next: state,
      report: baseReport({
        eventsResolved: [{ eventId: base.id, choiceId: base.defaultChoice, automatic: true }],
      }),
      content,
    });
    expect(items.find((i) => i.kind === 'evento')).toMatchObject({
      headline: `Sem resposta do governo: ${base.title}`,
      tone: 'negativa',
      sourceId: base.id,
    });
  });

  it('marca institucional nova gera item institucional; marca já existente não gera', () => {
    const state = initialState();
    const withFlag: GameState = { ...state, events: { ...state.events, flags: { cpi_instalada: 0 } } };
    const fresh = generateNews({ previous: state, next: withFlag, report: baseReport(), content });
    expect(fresh.find((i) => i.kind === 'institucional')).toMatchObject({
      headline: 'CPI instalada no Congresso',
      tone: 'negativa',
    });

    const already = generateNews({ previous: withFlag, next: withFlag, report: baseReport(), content });
    expect(already.filter((i) => i.kind === 'institucional')).toHaveLength(0);
  });

  it('cruzar o limiar de inflação de 12 meses para cima gera manchete negativa', () => {
    const state = initialState();
    const previous: GameState = { ...state, indicators: { ...state.indicators, inflation12m: 0.059 } };
    const next: GameState = { ...state, indicators: { ...state.indicators, inflation12m: 0.061 } };
    const items = generateNews({ previous, next, report: baseReport(), content });
    expect(items.find((i) => i.kind === 'economia')).toMatchObject({
      headline: 'Inflação de 12 meses sobe acima de 6,0%',
      tone: 'negativa',
    });
    expect(items.find((i) => i.headline.startsWith('Inflação'))?.cause).toMatch(/^Causa: /);
  });

  it('cruzar o limiar de inflação para baixo gera manchete positiva', () => {
    const state = initialState();
    const previous: GameState = { ...state, indicators: { ...state.indicators, inflation12m: 0.046 } };
    const next: GameState = { ...state, indicators: { ...state.indicators, inflation12m: 0.044 } };
    const items = generateNews({ previous, next, report: baseReport(), content });
    expect(items.find((i) => i.kind === 'economia')).toMatchObject({
      headline: 'Inflação de 12 meses cai abaixo de 4,5%',
      tone: 'positiva',
    });
  });
});
