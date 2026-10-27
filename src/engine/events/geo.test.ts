import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, EVENTS, loadContent } from '@/content';
import { advanceMonth } from '@/engine/advanceMonth';
import { CLIMATE_CAUSES, floodRisk, floodVulnerabilities } from '@/engine/climate/effects';
import { climateParam } from '@/engine/climate/calibration';
import { checkInvariants } from '@/engine/invariants';
import { generateNews } from '@/engine/news';
import { regionsOf } from '@/engine/regions/regions';
import { createInitialState } from '@/engine/state';
import type {
  ClimateState,
  EventLocation,
  GameContent,
  GameState,
  MonthInput,
  MonthStep,
  UfClimate,
} from '@/engine/types';
import { upgradeGameState } from '@/engine/upgrade';
import { parseGameEvent, type EventEffect, type GameEvent } from '@/types/event';
import { UF_IDS } from '@/types/regions';

import { GEO_EVENT_PARAMS } from './calibration';
import {
  drawableEvents,
  effectsToImpulses,
  eventProbability,
  eventsForScenario,
  resolveEventsStep,
  triggerEventsStep,
} from './events';
import {
  climateLocation,
  climateSeverities,
  eventInstanceId,
  formatEventText,
  localizeEvent,
  locationAcronyms,
  worstSeverity,
} from './location';

// PLANO_GLOBO.md §6.3 (eventos geográficos) e §8, teste 6: o local é congelado no disparo, o gatilho climático devolve
// as UFs e o evento não repete o choque do clima.

const content = loadContent(DEFAULT_SCENARIO_ID);
const ufs = regionsOf(content);
const EMPTY: MonthInput = { decisions: [] };
const STEPS: readonly MonthStep[] = [resolveEventsStep, triggerEventsStep];

const SECA = findEvent('seca_safra_energia_v2');
const CHEIA = findEvent('enchentes_metropole_v2');
const DROUGHT = { kind: 'drought', threshold: 0.7 } as const;

function findEvent(id: string): GameEvent {
  const event = EVENTS.find((e) => e.id === id);
  if (!event) throw new Error(`evento ausente: ${id}`);
  return event;
}

/** Substitui o clima (as UFs não citadas ficam neutras), mantendo ENSO e PRNG do estado. */
function withClimate(state: GameState, byUf: Record<string, Partial<UfClimate>>): GameState {
  const climate: ClimateState = {
    enso: state.climate.enso,
    protection: state.climate.protection,
    rng: state.climate.rng,
    ufs: state.climate.ufs.map((u) => ({ ...u, rain: 0, dryness: 0, ...byUf[u.id] })),
  };
  return { ...state, climate };
}

/**
 * Evento que dispara com certeza assim que o clima chega ao limiar: `probability = 1 ÷ limiar` faz a probabilidade
 * (`probability × severidade`) valer pelo menos 1 em qualquer UF atingida.
 */
function certain(event: GameEvent): GameEvent {
  const threshold = event.trigger.climate?.threshold ?? 1;
  return { ...event, trigger: { ...event.trigger, probability: 1 / threshold, cooldownMonths: 0, maxOccurrences: 99 } };
}

function contentWith(...events: GameEvent[]): GameContent {
  return { ...content, events };
}

function start(seed = 3): GameState {
  return createInitialState({ content, difficulty: 'estrategica', seed });
}

/** Aprovação da UF menos a nacional. */
const approvalGap = (state: GameState, id: string) => {
  const found = state.regions.ufs.find((u) => u.id === id);
  if (!found) throw new Error(`UF ausente: ${id}`);
  return found.approval - state.indicators.approval;
};

describe('gatilho climático: as UFs atingidas (PLANO_GLOBO.md §6.3)', () => {
  it('seca: devolve as UFs com seca acima do limiar, da pior para a menos pior, com a pior como principal', () => {
    const state = withClimate(start(), {
      CE: { dryness: 0.9 },
      PI: { dryness: 0.75 },
      RN: { dryness: 0.7 },
      BA: { dryness: 0.69 },
      SP: { dryness: 0.95 },
    });
    const location = climateLocation(state, content, DROUGHT);
    expect(location?.affectedUfs).toEqual(['SP', 'CE', 'PI', 'RN']);
    expect(location?.primaryUf).toBe('SP');
    expect(location?.severityByUf).toEqual({ SP: 0.95, CE: 0.9, PI: 0.75, RN: 0.7 });
    expect(worstSeverity(location as EventLocation)).toBe(0.95);
  });

  it('empate de severidade desempata pela ordem de UF_IDS (determinístico)', () => {
    const state = withClimate(start(), { SP: { dryness: 0.8 }, CE: { dryness: 0.8 }, RO: { dryness: 0.8 } });
    expect(climateLocation(state, content, DROUGHT)?.affectedUfs).toEqual(['RO', 'CE', 'SP']);
  });

  it('clima neutro ou abaixo do limiar: nenhuma UF, nenhum local', () => {
    expect(climateLocation(start(), content, DROUGHT)).toBeUndefined();
    expect(climateLocation(withClimate(start(), { CE: { dryness: 0.6999 } }), content, DROUGHT)).toBeUndefined();
  });

  it('limita o local às UFs mais severas (ufs_max)', () => {
    const max = GEO_EVENT_PARAMS.ufs_max.value;
    const dry: Record<string, Partial<UfClimate>> = {};
    UF_IDS.forEach((id, i) => {
      dry[id] = { dryness: 1 - i * 0.005 };
    });
    const location = climateLocation(withClimate(start(), dry), content, DROUGHT);
    expect(location?.affectedUfs).toEqual(UF_IDS.slice(0, max));
    expect(Object.keys(location?.severityByUf ?? {})).toHaveLength(max);
  });

  it('cheia: severidade = risco de cheia ÷ risco máximo, com solo seco absorvendo mais chuva', () => {
    const flood = { kind: 'flood', threshold: 0.25 } as const;
    const wet = withClimate(start(), { RS: { rain: 0.6 } });
    const location = climateLocation(wet, content, flood);
    const vulnerability = floodVulnerabilities(ufs)[ufs.findIndex((u) => u.id === 'RS')];
    const rs = wet.climate.ufs.find((u) => u.id === 'RS') as UfClimate;
    expect(location?.affectedUfs).toEqual(['RS']);
    expect(location?.severityByUf?.RS).toBeCloseTo(floodRisk(rs, vulnerability) / climateParam('cheia_risco_max'), 12);
    // O mesmo excesso de chuva sobre solo em seca extrema não alaga.
    const absorbed = withClimate(start(), { RS: { rain: 0.5, dryness: 1 } });
    expect(climateLocation(absorbed, content, flood)).toBeUndefined();
    // Chuva dentro do normal nunca atinge UF nenhuma.
    expect(climateLocation(withClimate(start(), { RS: { rain: 0.2 } }), content, flood)).toBeUndefined();
  });

  it('as severidades cobrem as 27 UFs do cenário, entre 0 e 1', () => {
    const state = withClimate(start(), { CE: { dryness: 1, rain: 0.6 } });
    for (const kind of ['drought', 'flood'] as const) {
      const all = climateSeverities(kind, state.climate, content);
      expect(all.map((u) => u.id)).toEqual(ufs.map((u) => u.id));
      for (const u of all) {
        expect(u.severity).toBeGreaterThanOrEqual(0);
        expect(u.severity).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('probabilidade vem do clima (PLANO_GLOBO.md §6.3)', () => {
  it('p = probabilidade do evento × maior severidade do local', () => {
    const state = withClimate(start(), { CE: { dryness: 0.8 }, PI: { dryness: 0.9 } });
    const location = climateLocation(state, content, DROUGHT) as EventLocation;
    expect(eventProbability(state, SECA, content, location)).toBeCloseTo(SECA.trigger.probability * 0.9, 12);
    // Sem local (evento sem gatilho climático) a probabilidade é a de sempre.
    const plain = findEvent('alta_petroleo');
    expect(eventProbability(state, plain, content)).toBe(plain.trigger.probability);
  });

  it('sem UF atingida o evento não é elegível e não consome sorteio', () => {
    const state = withClimate(start(), { CE: { dryness: 0.5 } });
    const c = contentWith(certain(SECA));
    const out = advanceMonth(state, EMPTY, c, [triggerEventsStep]);
    expect(out.report.eventsFired).toEqual([]);
    expect(out.state.rng).toEqual(state.rng);
  });

  it('com UF atingida e severidade 1 o evento dispara, com o local e a identidade gravados', () => {
    const state = withClimate({ ...start(), monthIndex: 2 }, { RS: { dryness: 1 }, SC: { dryness: 0.8 } });
    const out = advanceMonth(state, EMPTY, contentWith(certain(SECA)), [triggerEventsStep]);
    const arrival = state.monthIndex + 1;
    expect(out.report.eventsFired).toEqual([SECA.id]);
    expect(out.state.events.pending).toEqual([
      {
        eventId: SECA.id,
        monthIndex: arrival,
        instanceId: `${SECA.id}#${arrival}`,
        location: {
          affectedUfs: ['RS', 'SC'],
          primaryUf: 'RS',
          severityByUf: { RS: 1, SC: 0.8 },
        },
      },
    ]);
    expect(eventInstanceId(SECA.id, arrival)).toBe(`${SECA.id}#${arrival}`);
    expect(out.report.eventInstances).toEqual([
      { eventId: SECA.id, instanceId: `${SECA.id}#${arrival}`, location: out.state.events.pending[0].location },
    ]);
  });
});

describe('local congelado no disparo (PLANO_GLOBO.md §8, teste 6)', () => {
  // Disparado em março no RS (o clima de março); respondido em maio, quando a seca já é de outras UFs.
  const c = contentWith(certain(SECA));
  const fireInMarch = () => {
    const february = withClimate({ ...start(), monthIndex: 1 }, { RS: { dryness: 1 } });
    return advanceMonth(february, EMPTY, c, STEPS);
  };

  it('evento disparado em março no RS e respondido em maio atinge o RS', () => {
    const fired = fireInMarch();
    const march = fired.state.events.pending[0];
    expect(march.monthIndex).toBe(2);
    expect(march.location?.affectedUfs).toEqual(['RS']);

    // Maio: o clima mudou (agora CE e PI estão em seca e o RS não), e a resposta chega só agora.
    const may: GameState = withClimate({ ...fired.state, monthIndex: 4 }, { CE: { dryness: 1 }, PI: { dryness: 1 } });
    expect(climateLocation(may, content, DROUGHT)?.affectedUfs).toEqual(['PI', 'CE']);
    const answered = advanceMonth(
      may,
      { decisions: [], eventChoices: [{ eventId: SECA.id, choiceId: 'credito_emergencial' }] },
      c,
      [resolveEventsStep],
    );
    expect(answered.report.eventsResolved).toEqual([
      { eventId: SECA.id, choiceId: 'credito_emergencial', automatic: false, instanceId: march.instanceId },
    ]);
    const mine = answered.state.impulses.filter((i) => i.sourceId === `evento:${SECA.id}_2`);
    const regional = mine.filter((i) => i.regional !== undefined);
    expect(regional.length).toBeGreaterThan(0);
    for (const impulse of regional) expect(impulse.regional?.scope, impulse.target).toEqual(['RS']);
    // Nenhum efeito foi para CE ou PI, que estão em seca na hora da resposta.
    expect(mine.some((i) => i.regional?.scope.some((s) => s === 'CE' || s === 'PI'))).toBe(false);
  });

  it('a mesma resposta no motor completo melhora a aprovação do RS, não a do CE', () => {
    const fired = fireInMarch();
    const may: GameState = withClimate({ ...fired.state, monthIndex: 4 }, { CE: { dryness: 1 } });
    const choose = { decisions: [], eventChoices: [{ eventId: SECA.id, choiceId: 'credito_emergencial' }] };
    const withEvent = advanceMonth(may, choose, c);
    // Mesmo estado sem a pendência: a única diferença é o evento respondido.
    const without = advanceMonth({ ...may, events: { ...may.events, pending: [] } }, EMPTY, c);
    const gain = (id: string) => approvalGap(withEvent.state, id) - approvalGap(without.state, id);
    expect(gain('RS')).toBeGreaterThan(0.005);
    expect(gain('CE')).toBeLessThan(0.0005);
    // Os demais continuam somando a média nacional (D7): a resposta só redistribui entre as UFs.
    expect(checkInvariants(may, withEvent.state, withEvent.report, c)).toEqual([]);
  });

  it('a resposta padrão, aplicada ao vencer o prazo, também usa o local congelado', () => {
    const fired = fireInMarch();
    const later = withClimate({ ...fired.state, monthIndex: 2 }, { CE: { dryness: 1 } });
    const out = advanceMonth(later, EMPTY, c, [resolveEventsStep]);
    expect(out.report.eventsResolved).toEqual([
      { eventId: SECA.id, choiceId: 'nada', automatic: true, instanceId: `${SECA.id}#2` },
    ]);
    const regional = out.state.impulses.filter((i) => i.regional !== undefined);
    expect(regional.length).toBeGreaterThan(0);
    for (const impulse of regional) expect(impulse.regional?.scope).toEqual(['RS']);
  });

  it('o local do evento original passa ao encadeado que ele agenda', () => {
    const origin: GameEvent = {
      ...certain(SECA),
      choices: SECA.choices.map((ch) =>
        ch.id === 'nada' ? { ...ch, followUps: [{ eventId: 'teste_seguinte', delayMonths: 1, probability: 1 }] } : ch,
      ),
    };
    const next: GameEvent = {
      ...SECA,
      id: 'teste_seguinte',
      chainedOnly: true,
      trigger: { ...SECA.trigger, climate: undefined },
      onFire: [{ target: 'regiao.aprovacao', delta: -0.01, lagMonths: 0, durationMonths: 2, atLocation: true }],
    };
    const c2 = contentWith(origin, next);
    const fired = advanceMonth(withClimate({ ...start(), monthIndex: 1 }, { RS: { dryness: 1 } }), EMPTY, c2, STEPS);
    const out = advanceMonth(
      fired.state,
      { decisions: [], eventChoices: [{ eventId: SECA.id, choiceId: 'nada' }] },
      c2,
      STEPS,
    );
    const followUp = out.state.events.pending.find((p) => p.eventId === 'teste_seguinte');
    expect(followUp?.location?.affectedUfs).toEqual(['RS']);
    expect(followUp?.instanceId).toBe('teste_seguinte#3');
    const shock = out.state.impulses.find((i) => i.sourceId === 'evento:teste_seguinte_3');
    expect(shock?.regional?.scope).toEqual(['RS']);
  });
});

describe('efeitos no local (atLocation, scaleBySeverity)', () => {
  const location: EventLocation = {
    affectedUfs: ['CE', 'PI'],
    primaryUf: 'CE',
    severityByUf: { CE: 1, PI: 0.5 },
  };
  const base = { lagMonths: 0, durationMonths: 3 } as const;

  it('atLocation concentra o efeito nas UFs atingidas; sem local volta para regions ou fica nacional', () => {
    const effect: EventEffect = {
      ...base,
      target: 'regiao.aprovacao',
      delta: 0.01,
      atLocation: true,
      regions: ['sul'],
    };
    const at = effectsToImpulses([effect], 4, 'evento:x_4', 'X', location);
    expect(at).toHaveLength(1);
    expect(at[0].regional).toEqual({ key: 'populacao', scope: ['CE', 'PI'] });
    expect(effectsToImpulses([effect], 4, 'evento:x_4', 'X')[0].regional?.scope).toEqual(['sul']);
    const bare: EventEffect = { ...base, target: 'regiao.aprovacao', delta: 0.01, atLocation: true };
    expect(effectsToImpulses([bare], 4, 'evento:x_4', 'X')[0].regional).toBeUndefined();
  });

  it('scaleBySeverity gera um impulso por UF com delta × severidade', () => {
    const effect: EventEffect = {
      ...base,
      target: 'regiao.aprovacao',
      delta: 0.02,
      atLocation: true,
      scaleBySeverity: true,
    };
    const out = effectsToImpulses([effect], 4, 'evento:x_4', 'X', location);
    expect(out.map((i) => [i.regional?.scope, i.delta])).toEqual([
      [['CE'], 0.02],
      [['PI'], 0.01],
    ]);
  });

  it('o esquema recusa atLocation fora de evento geográfico e scaleBySeverity em alvo nacional', () => {
    const plain = { ...findEvent('alta_petroleo') };
    const withLocation = {
      ...plain,
      onFire: [{ target: 'regiao.aprovacao', delta: -0.01, lagMonths: 0, durationMonths: 1, atLocation: true }],
    };
    expect(parseOk(withLocation)).toBe(false);
    const national = {
      ...SECA,
      onFire: [
        { target: 'aprovacao', delta: -0.01, lagMonths: 0, durationMonths: 1, atLocation: true, scaleBySeverity: true },
      ],
    };
    expect(parseOk(national)).toBe(false);
    expect(parseOk(SECA)).toBe(true);
    expect(parseOk({ ...SECA, replaces: ['x'], onlyScenarios: undefined })).toBe(false);
  });
});

function parseOk(event: unknown): boolean {
  return parseGameEvent(event).ok;
}

describe('sem contagem dupla com o clima (PLANO_GLOBO.md §6.3 e §8, teste 4)', () => {
  it('as versões v2 não repetem o choque: sem efeito de disparo e sem choque de PIB, potencial ou atividade negativa', () => {
    for (const event of [SECA, CHEIA]) {
      expect(event.onFire, event.id).toEqual([]);
      for (const choice of event.choices) {
        for (const fx of choice.effects) {
          const where = `${event.id}.${choice.id}.${fx.target}`;
          expect(['choque.hiato', 'oferta.potencial', 'choque.cambio', 'choque.risco'], where).not.toContain(fx.target);
          if (fx.target === 'regiao.atividade') expect(fx.delta, where).toBeGreaterThan(0);
          // O único repasse de preço é a decisão explícita da bandeira tarifária, não o choque da seca.
          if (fx.target === 'choque.inflacao') expect(choice.id, where).toBe('bandeira_tarifaria');
        }
      }
    }
  });

  it('o mês do disparo não muda nenhum indicador nacional: a seca já está no clima, e só nele', () => {
    // Julho (estação seca): a seca de partida segue acima do limiar depois da evolução do clima do mês.
    const dry = withClimate(
      { ...start(), monthIndex: 6 },
      { CE: { dryness: 1 }, PI: { dryness: 1 }, BA: { dryness: 1 } },
    );
    const withEvent = advanceMonth(dry, EMPTY, contentWith(certain(SECA)));
    const withoutEvent = advanceMonth(dry, EMPTY, contentWith());
    expect(withEvent.report.eventsFired).toEqual([SECA.id]);
    expect(withEvent.state.indicators).toEqual(withoutEvent.state.indicators);
    expect(withEvent.state.economy).toEqual(withoutEvent.state.economy);
    expect(withEvent.state.regions).toEqual(withoutEvent.state.regions);
    // O dano da seca entra uma vez, pelo clima, com a causa do clima.
    const causes = withEvent.report.contributions.map((x) => x.cause);
    expect(causes).toContain(CLIMATE_CAUSES.drought);
    expect(withEvent.state.impulses.filter((i) => i.sourceId.startsWith('evento:'))).toEqual([]);
  });

  it('responder atinge só o que a escolha diz: nenhuma resposta mexe no PIB agregado pela seca', () => {
    const location: EventLocation = { affectedUfs: ['CE'], primaryUf: 'CE', severityByUf: { CE: 1 } };
    for (const choice of [...SECA.choices, ...CHEIA.choices]) {
      const impulses = effectsToImpulses(choice.effects, 0, 'evento:x_0', 'X', location);
      expect(
        impulses.filter((i) => i.target === 'choque.hiato' || i.target === 'oferta.potencial'),
        choice.id,
      ).toEqual([]);
    }
  });
});

describe('textos com o local (marcadores {uf}, {regiao}, {siglas}, {uf_principal})', () => {
  const location: EventLocation = {
    affectedUfs: ['CE', 'PI', 'RS'],
    primaryUf: 'CE',
    severityByUf: { CE: 0.9, PI: 0.8, RS: 0.75 },
  };

  it('preenche nomes, siglas, principal e grandes regiões', () => {
    expect(formatEventText('Atinge {uf}.', location, content)).toBe('Atinge Ceará, Piauí e Rio Grande do Sul.');
    expect(formatEventText('{siglas}', location, content)).toBe('CE, PI e RS');
    expect(formatEventText('{uf_principal}', location, content)).toBe('Ceará');
    expect(formatEventText('{regiao}', location, content)).toBe('Nordeste e Sul');
    expect(locationAcronyms(location)).toBe('CE, PI, RS');
    expect(locationAcronyms(undefined)).toBe('');
  });

  it('sem local vira "o país"; marcador desconhecido e texto sem marcador ficam como estão', () => {
    expect(formatEventText('Atinge {uf} ({regiao}).', undefined, content)).toBe('Atinge o país (o país).');
    expect(formatEventText('Olá {desconhecido}', location, content)).toBe('Olá {desconhecido}');
    expect(formatEventText('sem marcador', location, content)).toBe('sem marcador');
  });

  it('localizeEvent preenche título, briefing e escolhas sem mudar ids nem efeitos', () => {
    const local = localizeEvent(SECA, location, content);
    expect(local.description).toContain('Ceará, Piauí e Rio Grande do Sul');
    expect(local.description).not.toContain('{');
    expect(local.choices.every((c) => !c.description.includes('{') && !c.label.includes('{'))).toBe(true);
    expect(local.choices.map((c) => c.effects)).toEqual(SECA.choices.map((c) => c.effects));
    expect(local.id).toBe(SECA.id);
  });

  it('as notícias do evento levam a ocorrência e o local congelado', () => {
    const state = withClimate({ ...start(), monthIndex: 5 }, { PI: { dryness: 1 } });
    const c = contentWith(certain(SECA));
    const out = advanceMonth(state, EMPTY, c, STEPS);
    const news = generateNews({ previous: state, next: out.state, report: out.report, content: c });
    const item = news.find((n) => n.sourceId === SECA.id);
    expect(item?.instanceId).toBe(`${SECA.id}#6`);
    expect(item?.location?.affectedUfs).toEqual(['PI']);
    // O estado guarda o mesmo item (notícias persistem com o local).
    expect(out.state.events.news.find((n) => n.sourceId === SECA.id)?.location).toEqual(item?.location);
  });
});

describe('versões novas dos eventos e cenários antigos (PLANO_GLOBO.md §6.3)', () => {
  const OLD = ['seca_safra_energia', 'enchentes_metropole'];
  const NEW = [SECA.id, CHEIA.id];

  it('só o cenário atual (v0.8.0) tem as versões novas, e nele as antigas saem do sorteio', () => {
    for (const id of [SECA.id, CHEIA.id]) expect(findEvent(id).onlyScenarios).toEqual([DEFAULT_SCENARIO_ID]);
    const ids = (list: readonly GameEvent[]) => list.map((e) => e.id);
    const draw = ids(drawableEvents(EVENTS, DEFAULT_SCENARIO_ID));
    for (const id of NEW) expect(draw).toContain(id);
    for (const id of OLD) expect(draw).not.toContain(id);
    // As antigas continuam existindo no cenário: uma pendência de save em andamento ainda é resolvida.
    const known = ids(eventsForScenario(EVENTS, DEFAULT_SCENARIO_ID));
    for (const id of OLD) expect(known).toContain(id);
    for (const scenario of ['brasil_2027_01', 'brasil_2027_01_v050', 'brasil_2027_01_v060', 'brasil_2027_01_v070']) {
      const old = ids(drawableEvents(EVENTS, scenario));
      for (const id of OLD) expect(old, scenario).toContain(id);
      for (const id of NEW) expect(old, scenario).not.toContain(id);
    }
  });

  it('cenário v0.7.0: as versões novas não mudam nada (mesmo estado, mês a mês, sem elas)', () => {
    const v070 = loadContent('brasil_2027_01_v070');
    const without: GameContent = { ...v070, events: v070.events.filter((e) => !NEW.includes(e.id)) };
    let a = createInitialState({ content: v070, difficulty: 'realismo', seed: 7 });
    let b = createInitialState({ content: without, difficulty: 'realismo', seed: 7 });
    for (let m = 0; m < 36; m++) {
      const x = advanceMonth(a, EMPTY, v070);
      const y = advanceMonth(b, EMPTY, without);
      expect(JSON.stringify(x), `mês ${m}`).toBe(JSON.stringify(y));
      a = x.state;
      b = y.state;
      for (const instance of x.report.eventInstances ?? []) expect(instance.location, instance.eventId).toBeUndefined();
    }
  });

  it('cenário v0.8.0: a campanha é determinística, respeita os invariantes e dispara só as versões novas', () => {
    const play = (seed: number) => {
      let state = createInitialState({ content, difficulty: 'realismo', seed });
      const fired: { eventId: string; instanceId: string; location?: EventLocation }[] = [];
      const errors: string[] = [];
      for (let m = 0; m < 60; m++) {
        // Responde a tudo na hora, com a primeira opção que cabe nas ações do mês.
        const eventChoices = state.events.pending.map((p) => ({
          eventId: p.eventId,
          choiceId: (content.events.find((e) => e.id === p.eventId)?.choices[0] ?? { id: '' }).id,
        }));
        const out = advanceMonth(state, { decisions: [], eventChoices }, content);
        errors.push(...checkInvariants(state, out.state, out.report, content));
        fired.push(...(out.report.eventInstances ?? []));
        state = out.state;
      }
      expect(errors).toEqual([]);
      return fired;
    };
    const seeds = [1, 2, 3, 4];
    const runs = seeds.map(play);
    expect(seeds.map(play)).toEqual(runs);
    const all = runs.flat();
    for (const e of all) expect(OLD).not.toContain(e.eventId);
    // Em quatro campanhas de 60 meses no Realismo, ao menos um evento geográfico acontece, sempre com local.
    const geo = all.filter((e) => NEW.includes(e.eventId));
    expect(geo.length).toBeGreaterThan(0);
    for (const e of geo) {
      expect(e.location?.affectedUfs.length, e.instanceId).toBeGreaterThan(0);
      expect(e.location?.affectedUfs.length).toBeLessThanOrEqual(GEO_EVENT_PARAMS.ufs_max.value);
      expect(e.instanceId).toMatch(/^[a-z0-9_]+#\d+$/);
    }
  }, 60_000);
});

describe('atualização v11 → v12: pendências ganham identidade (AI_INSTRUCTIONS.md §3)', () => {
  /** Estado v11 de verdade: o atual com uma pendência, sem `instanceId`, marcado como v11. */
  function v11Save(): Record<string, unknown> {
    const base = start(5);
    const pending = [
      { eventId: 'alta_petroleo', monthIndex: 3 },
      { eventId: 'seca_safra_energia', monthIndex: 3 },
    ];
    const state = { ...base, monthIndex: 3, events: { ...base.events, pending } };
    return { ...state, schemaVersion: 11, engineVersion: '0.9.0' };
  }

  it('pendência antiga ganha instanceId e continua sem local (= nacional, como sempre foi)', () => {
    const raw = v11Save();
    const original = structuredClone(raw);
    const migrated = upgradeGameState(11, raw);
    expect(raw).toEqual(original);
    expect(migrated.schemaVersion).toBe(14);
    expect(migrated.events.pending).toEqual([
      { eventId: 'alta_petroleo', monthIndex: 3, instanceId: 'alta_petroleo#3' },
      { eventId: 'seca_safra_energia', monthIndex: 3, instanceId: 'seca_safra_energia#3' },
    ]);
    for (const key of Object.keys(original).filter((k) => !['schemaVersion', 'engineVersion', 'events'].includes(k))) {
      expect((migrated as unknown as Record<string, unknown>)[key], key).toEqual(original[key]);
    }
    expect({ ...migrated.events, pending: [] }).toEqual({ ...(original.events as object), pending: [] });
  });

  it('a pendência da versão antiga do evento ainda é resolvida no cenário atual, como era (efeito nacional da região)', () => {
    const migrated = upgradeGameState(11, v11Save());
    const out = advanceMonth(
      migrated,
      { decisions: [], eventChoices: [{ eventId: 'seca_safra_energia', choiceId: 'credito_emergencial' }] },
      content,
    );
    expect(out.report.eventsResolved).toContainEqual({
      eventId: 'seca_safra_energia',
      choiceId: 'credito_emergencial',
      automatic: false,
      instanceId: 'seca_safra_energia#3',
    });
    const mine = out.state.impulses.filter((i) => i.sourceId === 'evento:seca_safra_energia_3');
    // As regiões do evento publicado (nordeste e centro-oeste) valem como sempre.
    expect(mine.some((i) => i.regional?.scope.includes('nordeste'))).toBe(true);
  });

  it('o save v11 atualizado continua jogável por 24 meses sem violar invariantes', () => {
    let state = upgradeGameState(11, v11Save());
    const errors: string[] = [];
    for (let m = 0; m < 24; m++) {
      const out = advanceMonth(state, EMPTY, content);
      errors.push(...checkInvariants(state, out.state, out.report, content));
      state = out.state;
    }
    expect(errors).toEqual([]);
  }, 60_000);
});
