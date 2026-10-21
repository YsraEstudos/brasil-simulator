import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { CLIMATOLOGY } from '@/content/climate';
import { advanceMonth, DEFAULT_STEPS } from '@/engine/advanceMonth';
import { toCalendar } from '@/engine/calendar';
import { economyStep } from '@/engine/economy/economy';
import { checkInvariants } from '@/engine/invariants';
import { opinionStep } from '@/engine/politics/opinion';
import { populationShares, regionsOf, regionsStep } from '@/engine/regions/regions';
import { createRng } from '@/engine/rng';
import { STRATEGIES } from '@/engine/sim/strategies';
import { createInitialState } from '@/engine/state';
import type { ClimateState, Difficulty, GameState, MonthStep, UfClimate } from '@/engine/types';
import { REGION_IDS, UF_IDS } from '@/types/regions';

import { CLIMATE_INTENSITY_PARAM, CLIMATE_PARAMS, climateParam } from './calibration';
import { checkClimate, climateOf, initialClimate } from './climate';
import {
  CLIMATE_CAUSES,
  climateDamageOf,
  climateMoodTerms,
  climateRegionalEffects,
  floodRisk,
  floodVulnerabilities,
} from './effects';
import {
  CLIMATE_DRAWS_PER_MONTH,
  climateEvolutionStep,
  evolveClimate,
  nextDryness,
  waterVulnerability,
} from './evolution';

// PLANO_GLOBO.md §6.2 (motor climático nacional + regional) e §8, testes 1, 4 e 5.

const content = loadContent(DEFAULT_SCENARIO_ID);
const EMPTY = { decisions: [] };
const DIFFICULTIES: readonly Difficulty[] = ['casual', 'estrategica', 'realismo'];
const SEEDS = [1, 7, 42, 99];

/** Passos do mês sem o clima: o motor como era antes do PR 8 (com o estado climático parado). */
const WITHOUT_CLIMATE: readonly MonthStep[] = DEFAULT_STEPS.filter((s) => s !== climateEvolutionStep);

/** Substitui o clima de algumas UFs (as demais ficam neutras), mantendo o ENSO e o PRNG do estado. */
function withClimate(state: GameState, ufs: Record<string, Partial<UfClimate>>, enso = state.climate.enso): GameState {
  const climate: ClimateState = {
    enso,
    rng: state.climate.rng,
    ufs: state.climate.ufs.map((u) => ({ ...u, rain: 0, dryness: 0, ...ufs[u.id] })),
  };
  return { ...state, climate };
}

/** Evolui o clima `months` meses a partir do neutro, devolvendo a trajetória (um estado por mês). */
function trajectory(seed: number, difficulty: Difficulty, months: number): ClimateState[] {
  let climate = initialClimate(seed);
  const out: ClimateState[] = [];
  for (let m = 0; m < months; m++) {
    climate = evolveClimate(climate, (m % 12) + 1, difficulty, CLIMATOLOGY);
    out.push(climate);
  }
  return out;
}

const std = (xs: readonly number[]) => {
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
};

describe('ordem das etapas (PLANO_GLOBO.md §6.2)', () => {
  it('o clima roda antes da economia; a distribuição regional, depois dela e da opinião', () => {
    const at = (step: MonthStep) => DEFAULT_STEPS.indexOf(step);
    expect(at(climateEvolutionStep)).toBeGreaterThanOrEqual(0);
    expect(at(climateEvolutionStep)).toBeLessThan(at(economyStep));
    expect(at(opinionStep)).toBeLessThan(at(regionsStep));
    expect(at(economyStep)).toBeLessThan(at(regionsStep));
  });
});

describe('determinismo e PRNG próprio (PLANO_GLOBO.md §8, teste 1)', () => {
  it('mesma semente → mesma trajetória climática e mesmo estado final; outra semente → outra', () => {
    expect(trajectory(5, 'estrategica', 60)).toEqual(trajectory(5, 'estrategica', 60));
    expect(trajectory(5, 'estrategica', 24)).not.toEqual(trajectory(6, 'estrategica', 24));
    const run = (seed: number) => {
      let s = createInitialState({ content, difficulty: 'estrategica', seed });
      for (let m = 0; m < 30; m++) s = advanceMonth(s, EMPTY, content).state;
      return JSON.stringify(s);
    };
    expect(run(5)).toBe(run(5));
    expect(run(5)).not.toBe(run(6));
  });

  it('a etapa consome só o PRNG do clima: exatamente 33 normais por mês, em qualquer dificuldade', () => {
    expect(CLIMATE_DRAWS_PER_MONTH).toBe(1 + REGION_IDS.length + UF_IDS.length);
    expect(CLIMATE_DRAWS_PER_MONTH).toBe(33);
    for (const difficulty of DIFFICULTIES) {
      const state = createInitialState({ content, difficulty, seed: 9 });
      const out = advanceMonth(state, EMPTY, content, [climateEvolutionStep]);
      // PRNG principal intacto.
      expect(out.state.rng).toEqual(state.rng);
      // PRNG do clima: avançou exatamente 33 normais (12 uniformes de 32 bits cada).
      const manual = createRng(state.climate.rng);
      for (let i = 0; i < CLIMATE_DRAWS_PER_MONTH; i++) manual.normal();
      expect(out.state.climate.rng).toEqual(manual.state());
    }
  });

  it('a ordem dos sorteios é fixa: 1º ENSO, depois as 5 regiões, depois as 27 UFs', () => {
    // Reproduz o mês à mão a partir do estado neutro: o ENSO usa o 1º sorteio; a anomalia de uma UF, o choque da sua
    // região (posição em REGION_IDS) e o ruído da sua posição em UF_IDS.
    const start = initialClimate(3);
    const rng = createRng(start.rng);
    const ensoDraw = rng.normal();
    const regionDraws = REGION_IDS.map(() => rng.normal());
    const ufDraws = UF_IDS.map(() => rng.normal());
    const next = evolveClimate(start, 1, 'estrategica', CLIMATOLOGY);
    const enso = Math.tanh((climateParam('enso_choque') * ensoDraw) / climateParam('enso_saturacao'));
    expect(next.enso).toBeCloseTo(enso, 12);
    const max = climateParam('chuva_anomalia_max');
    const region = (id: string) => CLIMATOLOGY.rain.ufs.find((u) => u.id === id)?.region ?? 'norte';
    for (const id of ['AM', 'CE', 'MT', 'SP', 'RS']) {
      const i = UF_IDS.indexOf(id as (typeof UF_IDS)[number]);
      const tele = CLIMATOLOGY.enso.teleconnection[region(id) as (typeof REGION_IDS)[number]].verao;
      const raw =
        tele * enso +
        climateParam('chuva_choque_regional') *
          regionDraws[REGION_IDS.indexOf(region(id) as (typeof REGION_IDS)[number])] +
        climateParam('chuva_choque_uf') * ufDraws[i];
      expect(climateOf({ climate: next }, id)?.rain, id).toBeCloseTo(max * Math.tanh(raw / max), 12);
    }
  });

  it('o PRNG principal não é tocado: sem dano econômico, a partida inteira é a mesma com e sem a etapa climática', () => {
    // Em cenário sem dados regionais o clima evolui mas não há pesos para agregar nem UFs para distribuir: nenhum
    // efeito chega à economia. Então tudo, inclusive o PRNG principal e os sorteios condicionais (eventos), coincide
    // com o motor sem a etapa; só o estado climático difere. (Com dano, a economia muda e, com ela, quais eventos
    // são elegíveis: a ordem dos sorteios de cada sistema é a mesma, mas a quantidade depende do estado.)
    const bare = { ...content, scenario: { ...content.scenario, regions: undefined } };
    for (const seed of SEEDS) {
      let a = createInitialState({ content: bare, difficulty: 'estrategica', seed });
      let b = a;
      for (let m = 0; m < 36; m++) {
        a = advanceMonth(a, EMPTY, bare).state;
        b = advanceMonth(b, EMPTY, bare, WITHOUT_CLIMATE).state;
        const { climate: climateA, ...restA } = a;
        const { climate: climateB, ...restB } = b;
        expect(restA, `semente ${seed}, mês ${m}`).toEqual(restB);
        expect(climateB).toEqual(initialClimate(seed));
        expect(checkClimate(climateA)).toEqual([]);
      }
      expect(a.climate).not.toEqual(initialClimate(seed));
    }
  });

  it('sem a etapa climática o motor é o de antes: estado neutro parado e nenhum dano', () => {
    const state = createInitialState({ content, difficulty: 'estrategica', seed: 4 });
    const out = advanceMonth(state, EMPTY, content, WITHOUT_CLIMATE);
    expect(out.state.climate).toEqual(state.climate);
    expect(out.report.contributions.some((c) => c.cause.startsWith('clima'))).toBe(false);
  });
});

describe('limites e saturações (PLANO_GLOBO.md §8, teste 5)', () => {
  it('ENSO em [−1, 1], seca em [0, 1] e anomalia saturada em 600 meses, nas três dificuldades', () => {
    const max = climateParam('chuva_anomalia_max');
    const problems: string[] = [];
    let ensoAbs = 0;
    let dryMin = 0;
    let dryMax = 0;
    let rainAbs = 0;
    for (const difficulty of DIFFICULTIES) {
      for (const seed of SEEDS) {
        for (const climate of trajectory(seed, difficulty, 600)) {
          problems.push(...checkClimate(climate));
          ensoAbs = Math.max(ensoAbs, Math.abs(climate.enso));
          for (const u of climate.ufs) {
            dryMin = Math.min(dryMin, u.dryness);
            dryMax = Math.max(dryMax, u.dryness);
            rainAbs = Math.max(rainAbs, Math.abs(u.rain));
          }
        }
      }
    }
    expect(problems).toEqual([]);
    expect(ensoAbs).toBeLessThanOrEqual(1);
    expect(dryMin).toBeGreaterThanOrEqual(0);
    expect(dryMax).toBeLessThanOrEqual(1);
    expect(rainAbs).toBeLessThanOrEqual(max);
  });

  it('o ENSO realmente varia (fases quentes e frias) e a chuva tem as duas direções', () => {
    const t = trajectory(1, 'estrategica', 600);
    expect(Math.max(...t.map((c) => c.enso))).toBeGreaterThan(0.4);
    expect(Math.min(...t.map((c) => c.enso))).toBeLessThan(-0.4);
    const rains = t.flatMap((c) => c.ufs.map((u) => u.rain));
    expect(Math.max(...rains)).toBeGreaterThan(0.3);
    expect(Math.min(...rains)).toBeLessThan(-0.3);
    expect(t.some((c) => c.ufs.some((u) => u.dryness > 0.5))).toBe(true);
  });

  it('teleconexão: com ENSO forte (El Niño) o Sul fica mais chuvoso e o Nordeste mais seco que com La Niña', () => {
    // Mesma semente → mesmos choques; só o ENSO inicial difere (a diferença vem da tabela de teleconexão).
    const base = initialClimate(11);
    const nino = evolveClimate({ ...base, enso: 0.9 }, 10, 'estrategica', CLIMATOLOGY);
    const nina = evolveClimate({ ...base, enso: -0.9 }, 10, 'estrategica', CLIMATOLOGY);
    const meanRain = (c: ClimateState, region: string) => {
      const ids = CLIMATOLOGY.rain.ufs.filter((u) => u.region === region).map((u) => u.id);
      return ids.reduce((s, id) => s + (climateOf({ climate: c }, id)?.rain ?? 0), 0) / ids.length;
    };
    expect(meanRain(nino, 'sul')).toBeGreaterThan(meanRain(nina, 'sul'));
    expect(meanRain(nino, 'nordeste')).toBeLessThan(meanRain(nina, 'nordeste'));
  });
});

describe('seca: déficit em mm, memória e recuperação (PLANO_GLOBO.md §6.1)', () => {
  const dryspell = (id: string, rain: number, months: readonly number[], start = 0) =>
    months.reduce((d, month) => nextDryness(CLIMATOLOGY, id, month, rain, d), start);

  it('o semiárido seca mais depressa que uma UF úmida sob a mesma anomalia na estação chuvosa', () => {
    // −40% da chuva em fev–abr (estação chuvosa do semiárido e da Amazônia): CE, PE e BA contra AM, PA e AC.
    const wetSeason = [2, 3, 4];
    for (const dry of ['CE', 'PE', 'RN']) {
      for (const wet of ['AM', 'PA', 'AC']) {
        expect(dryspell(dry, -0.4, wetSeason), `${dry} × ${wet}`).toBeGreaterThan(dryspell(wet, -0.4, wetSeason));
      }
    }
    expect(waterVulnerability(CLIMATOLOGY, 'CE')).toBeGreaterThan(1);
    expect(waterVulnerability(CLIMATOLOGY, 'AM')).toBeLessThan(1);
  });

  it('o semiárido também demora mais a se recuperar da mesma seca com a mesma chuva boa', () => {
    const recovered = (id: string) => dryspell(id, +0.2, [3, 4], 0.8);
    for (const dry of ['CE', 'PE', 'RN']) expect(recovered(dry), dry).toBeGreaterThan(recovered('AM'));
  });

  it('déficit em mm: a mesma anomalia pesa pouco no mês seco (pouca chuva a perder) e muito no chuvoso', () => {
    expect(dryspell('CE', -0.4, [3])).toBeGreaterThan(5 * dryspell('CE', -0.4, [9]));
  });

  it('sem déficit a seca decai (memória) e chuva acima da normal a zera; fica em [0, 1]', () => {
    const memory = climateParam('seca_memoria');
    expect(nextDryness(CLIMATOLOGY, 'MG', 5, 0, 0.6)).toBeCloseTo(0.6 * memory, 12);
    expect(nextDryness(CLIMATOLOGY, 'MG', 1, 0.5, 0.2)).toBe(0);
    expect(nextDryness(CLIMATOLOGY, 'MG', 1, -0.6, 1)).toBeLessThanOrEqual(1);
    // Um déficit abaixo do limiar da seca não acumula nada além da memória.
    expect(nextDryness(CLIMATOLOGY, 'MG', 1, climateParam('seca_limiar_anomalia') + 0.01, 0)).toBe(0);
  });
});

describe('dificuldade: só a magnitude (PLANO_GLOBO.md §6.2)', () => {
  it('mesmos sorteios e mesmos lugares: o PRNG do clima termina igual nas três dificuldades', () => {
    const ends = DIFFICULTIES.map((d) => trajectory(8, d, 48).at(-1)?.rng);
    expect(ends[1]).toEqual(ends[0]);
    expect(ends[2]).toEqual(ends[0]);
  });

  it('a magnitude cresce com a dificuldade e o lugar e o sinal das anomalias quase não mudam', () => {
    const [casual, estrategica, realismo] = DIFFICULTIES.map((d) => trajectory(8, d, 120));
    const flat = (t: ClimateState[]) => t.flatMap((c) => c.ufs.map((u) => u.rain));
    const [a, b, c] = [flat(casual), flat(estrategica), flat(realismo)];
    expect(std(a)).toBeLessThan(std(b));
    expect(std(b)).toBeLessThan(std(c));
    expect(std(c) / std(a)).toBeGreaterThan(1.2);
    // O ENSO também cresce em magnitude.
    expect(std(casual.map((x) => x.enso))).toBeLessThan(std(realismo.map((x) => x.enso)));
    // Sinais: a mesma UF no mesmo mês tem o mesmo sinal na imensa maioria dos casos (só mudam os módulos).
    const agree = (x: number[], y: number[]) => x.filter((v, i) => Math.sign(v) === Math.sign(y[i])).length / x.length;
    expect(agree(a, c)).toBeGreaterThan(0.85);
    expect(agree(a, b)).toBeGreaterThan(0.9);
    // A UF mais afetada (maior seca no fim de 10 anos) tende a ser a mesma: ordem de severidade correlacionada.
    const drynessOrder = (t: ClimateState[]) => t.at(-1)?.ufs.map((u) => u.dryness) ?? [];
    const corr = (x: number[], y: number[]) => {
      const mx = x.reduce((s, v) => s + v, 0) / x.length;
      const my = y.reduce((s, v) => s + v, 0) / y.length;
      const cov = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0);
      return cov / Math.sqrt(x.reduce((s, v) => s + (v - mx) ** 2, 0) * y.reduce((s, v) => s + (v - my) ** 2, 0));
    };
    expect(corr(drynessOrder(casual), drynessOrder(realismo))).toBeGreaterThan(0.3);
  });

  it('os multiplicadores de dificuldade são os de CLIMATE_PARAMS, em ordem crescente', () => {
    expect(climateParam(CLIMATE_INTENSITY_PARAM.casual)).toBeLessThan(climateParam(CLIMATE_INTENSITY_PARAM.realismo));
  });
});

describe('risco de cheia (para os PRs 9 e 10)', () => {
  const ufs = content.scenario.regions?.ufs ?? [];
  const vulnerability = floodVulnerabilities(ufs);
  const uf = (rain: number, dryness = 0): UfClimate => ({ id: 'X', rain, dryness });

  it('só chuva forte conta; satura abaixo do teto e nunca é certeza', () => {
    expect(floodRisk(uf(0), 1)).toBe(0);
    expect(floodRisk(uf(climateParam('cheia_limiar_anomalia')), 1)).toBe(0);
    expect(floodRisk(uf(0.6), 1)).toBeGreaterThan(floodRisk(uf(0.45), 1));
    expect(floodRisk(uf(0.6), 1)).toBeLessThan(climateParam('cheia_risco_max'));
    expect(floodRisk(uf(0.6), 0.5)).toBeCloseTo(floodRisk(uf(0.6), 1) / 2, 12);
  });

  it('solo seco absorve: o mesmo temporal rende menos risco depois de uma seca', () => {
    expect(floodRisk(uf(0.5, 1), 1)).toBeLessThan(floodRisk(uf(0.5, 0), 1));
  });

  it('vulnerabilidade em [piso, 1]: maior onde a pobreza é maior', () => {
    expect(Math.min(...vulnerability)).toBeGreaterThanOrEqual(climateParam('cheia_vulnerabilidade_piso') - 1e-12);
    expect(Math.max(...vulnerability)).toBeCloseTo(1, 12);
    const byId = (id: string) => vulnerability[ufs.findIndex((u) => u.id === id)];
    expect(byId('MA')).toBeGreaterThan(byId('SC'));
  });
});

describe('seca reduz o PIB agregado e muda os desvios das UFs, sem contar duas vezes (PLANO_GLOBO.md §8, teste 4)', () => {
  const DROUGHT = {
    MT: { rain: -0.5, dryness: 0.9 },
    MS: { rain: -0.5, dryness: 0.9 },
    GO: { rain: -0.5, dryness: 0.9 },
    RO: { rain: -0.5, dryness: 0.9 },
    TO: { rain: -0.5, dryness: 0.9 },
  };
  const start = createInitialState({ content, difficulty: 'estrategica', seed: 21 });
  const wet = (state: GameState) => advanceMonth(state, EMPTY, content);

  it('o dano nacional da seca é a soma ponderada pelo PIB do dano das UFs, saturada no teto', () => {
    const neutral = climateDamageOf(initialClimate(1), content);
    expect(Object.values(neutral).every((v) => v === 0)).toBe(true);
    const damage = climateDamageOf(withClimate(start, DROUGHT).climate, content);
    expect(damage.droughtGdp).toBeGreaterThan(0);
    expect(damage.droughtGdp).toBeLessThan(climateParam('dano_pib_seca_max'));
    expect(damage.droughtFood).toBeGreaterThan(0);
    expect(damage.droughtFood).toBeLessThan(climateParam('dano_alimentos_seca_max'));
    // Uma seca em todo o país satura abaixo dos tetos, nunca acima.
    const all = Object.fromEntries(UF_IDS.map((id) => [id, { rain: -0.6, dryness: 1 }]));
    const total = climateDamageOf(withClimate(start, all).climate, content);
    expect(total.droughtGdp).toBeLessThanOrEqual(climateParam('dano_pib_seca_max'));
    expect(total.droughtFood).toBeLessThanOrEqual(climateParam('dano_alimentos_seca_max'));
    expect(total.droughtEnergy).toBeLessThanOrEqual(climateParam('dano_energia_seca_max'));
    expect(total.droughtGdp).toBeGreaterThan(damage.droughtGdp);
  });

  it('a seca derruba o crescimento e sobe a inflação em relação a um mês sem seca, com a causa "Seca"', () => {
    const dry = wet(withClimate(start, DROUGHT));
    const calm = wet(start);
    expect(dry.state.indicators.gdpGrowth12m).toBeLessThan(calm.state.indicators.gdpGrowth12m);
    expect(dry.state.indicators.inflation12m).toBeGreaterThan(calm.state.indicators.inflation12m);
    const growth = dry.report.contributions.filter(
      (c) => c.indicator === 'gdpGrowth12m' && c.cause === CLIMATE_CAUSES.drought,
    );
    expect(growth).toHaveLength(1);
    expect(growth[0].label).toBe('Seca');
    expect(growth[0].delta).toBeLessThan(0);
    const food = dry.report.contributions.filter(
      (c) => c.indicator === 'inflation12m' && c.cause === CLIMATE_CAUSES.droughtFood,
    );
    expect(food).toHaveLength(1);
    expect(food[0].delta).toBeGreaterThan(0);
  });

  it('o PIB entra uma vez só: a contribuição do crescimento é exatamente o impulso do clima, sem outra via', () => {
    const before = withClimate(start, DROUGHT);
    const out = wet(before);
    const month = toCalendar(before.monthIndex).month;
    const after = evolveClimate(before.climate, month, before.difficulty, CLIMATOLOGY);
    const prev = climateDamageOf(before.climate, content);
    const next = climateDamageOf(after, content);
    const expected = -(next.droughtGdp - content.calibration.rho_h * prev.droughtGdp);
    const growth = out.report.contributions.filter(
      (c) => c.indicator === 'gdpGrowth12m' && c.cause === CLIMATE_CAUSES.drought,
    );
    expect(growth.reduce((s, c) => s + c.delta, 0)).toBeCloseTo(expected, 12);
    // A etapa regional não gera nenhuma contribuição nacional (só distribui).
    const regional = regionsStep(out.state, {
      rng: createRng(out.state.rng),
      content,
      decisions: [],
      eventChoices: [],
      draft: { proposalChanges: [], eventsResolved: [], eventsFired: [], notes: [], copom: null, regional: null },
    });
    expect(regional.contributions).toEqual([]);
  });

  it('a seca vira dano regional: as UFs agropecuárias perdem atividade relativa, as sem agro não', () => {
    const out = wet(withClimate(start, DROUGHT));
    const piece = (id: string) =>
      out.report.regional?.find((r) => r.id === id)?.activity.find((p) => p.cause === CLIMATE_CAUSES.drought)?.delta ??
      0;
    expect(piece('MT')).toBeLessThan(0);
    expect(piece('MS')).toBeLessThan(0);
    // O dano é proporcional ao peso da agropecuária (MT 30% × MS 22%) e à seca.
    expect(piece('MT')).toBeLessThan(piece('RO'));
    // O DF não tem agropecuária no cenário: nenhuma parcela de seca na atividade.
    expect(piece('DF')).toBe(0);
    // A participação de MT cai em relação à sua tendência.
    const mt = out.state.regions.ufs.find((u) => u.id === 'MT');
    expect(mt ? mt.share / mt.structuralShare : 1).toBeLessThan(1);
    // Redistribuição: as participações continuam somando 1 (nenhum PIB é criado nem destruído pela etapa regional).
    expect(out.state.regions.ufs.reduce((s, u) => s + u.share, 0)).toBeCloseTo(1, 12);
  });
});

describe('invariantes D7 e somas das explicações com o clima (PLANO_GLOBO.md §8, teste 5)', () => {
  const ufs = regionsOf(content);
  const pop = populationShares(ufs);
  const climaticCauses: string[] = [CLIMATE_CAUSES.drought, CLIMATE_CAUSES.rainMood, CLIMATE_CAUSES.droughtMood];

  it('60 meses, várias sementes e estratégias: aprovação média = nacional, participações = 1, explicações fecham', () => {
    let climaticPieces = 0;
    for (const seed of SEEDS) {
      for (const difficulty of ['estrategica', 'realismo'] as const) {
        let state = createInitialState({ content, difficulty, seed });
        const strategy = STRATEGIES.find((s) => s.id === (seed % 2 === 0 ? 'reformista' : 'populista_fiscal'));
        const errors: string[] = [];
        for (let m = 0; m < 60; m++) {
          const out = advanceMonth(state, strategy ? strategy.decide(state, content) : EMPTY, content);
          errors.push(...checkInvariants(state, out.state, out.report, content));
          const mean = out.state.regions.ufs.reduce((s, u, i) => s + pop[i] * u.approval, 0);
          expect(mean, `semente ${seed}, mês ${m}`).toBeCloseTo(out.state.indicators.approval, 9);
          expect(out.state.regions.ufs.reduce((s, u) => s + u.share, 0)).toBeCloseTo(1, 9);
          for (const x of out.report.regional ?? []) {
            climaticPieces += x.approval.filter((p) => climaticCauses.includes(p.cause)).length;
            climaticPieces += x.activity.filter((p) => climaticCauses.includes(p.cause)).length;
          }
          state = out.state;
        }
        expect(errors, `semente ${seed} ${difficulty}`).toEqual([]);
      }
    }
    // O teste exercita o clima de verdade: houve parcelas climáticas nas explicações.
    expect(climaticPieces).toBeGreaterThan(0);
  });

  it('com seca prolongada e cheias fortes ao mesmo tempo, D7 e as explicações continuam fechando', () => {
    const base = createInitialState({ content, difficulty: 'realismo', seed: 3 });
    const extreme = withClimate(base, {
      MT: { rain: -0.55, dryness: 1 },
      GO: { rain: -0.55, dryness: 0.95 },
      PE: { rain: -0.5, dryness: 0.9 },
      RS: { rain: 0.6, dryness: 0 },
      SP: { rain: 0.55, dryness: 0 },
      MA: { rain: 0.6, dryness: 0.1 },
      RJ: { rain: 0.5, dryness: 0 },
    });
    let state = extreme;
    const errors: string[] = [];
    for (let m = 0; m < 6; m++) {
      const out = advanceMonth(state, EMPTY, content);
      errors.push(...checkInvariants(state, out.state, out.report, content));
      const mean = out.state.regions.ufs.reduce((s, u, i) => s + pop[i] * u.approval, 0);
      expect(mean).toBeCloseTo(out.state.indicators.approval, 9);
      state = out.state;
    }
    expect(errors).toEqual([]);
  });

  it('chuva acima do normal vai para a aprovação da UF com a causa certa e a média nacional não duplica o efeito', () => {
    const base = createInitialState({ content, difficulty: 'estrategica', seed: 5 });
    const flooded = withClimate(base, { RS: { rain: 0.6, dryness: 0 }, SC: { rain: 0.6, dryness: 0 } });
    // Só os passos que importam, para isolar o efeito do clima (sem evolução: o estado climático fica como está).
    const steps: readonly MonthStep[] = [economyStep, opinionStep, regionsStep];
    const out = advanceMonth(flooded, EMPTY, content, steps);
    const calm = advanceMonth(base, EMPTY, content, steps);
    const piece = (id: string, report: typeof out.report) =>
      report.regional?.find((r) => r.id === id)?.approval.find((p) => p.cause === CLIMATE_CAUSES.rainMood);
    const rs = piece('RS', out.report);
    expect(rs?.label).toBe('Chuvas acima do normal');
    expect(rs?.delta ?? 0).toBeLessThan(0);
    // O termo bruto da UF é saturado no teto de humor e o desvio da UF cai em relação à média.
    const raw = climateRegionalEffects(flooded, content);
    const iRs = ufs.findIndex((u) => u.id === 'RS');
    const rawRs = raw.approval[iRs].find((p) => p.cause === CLIMATE_CAUSES.rainMood)?.delta ?? 0;
    expect(Math.abs(rawRs)).toBeLessThanOrEqual(climateParam('aprovacao_clima_max'));
    // Parte nacional: a média ponderada dos termos das UFs (RS e SC têm ~8% da população), entrando uma só vez.
    const terms = climateMoodTerms(flooded, content, pop);
    const nationalRain = terms.find((t) => t.cause === CLIMATE_CAUSES.rainMood)?.delta ?? 0;
    expect(nationalRain).toBeLessThan(0);
    expect(Math.abs(nationalRain)).toBeLessThan(Math.abs(rawRs));
    const national = out.report.contributions.find(
      (c) => c.indicator === 'approval' && c.cause === CLIMATE_CAUSES.rainMood,
    );
    expect(national?.delta).toBeCloseTo(content.calibration.ajuste_aprovacao * nationalRain, 12);
    // A aprovação nacional cai pouco (só a média); a de RS cai mais; as UFs sem chuva forte sobem em relação à média.
    const stateOf = (s: GameState, id: string) => s.regions.ufs.find((u) => u.id === id)?.approval ?? 0;
    const dNat = out.state.indicators.approval - calm.state.indicators.approval;
    const dRs = stateOf(out.state, 'RS') - stateOf(calm.state, 'RS');
    const dAm = stateOf(out.state, 'AM') - stateOf(calm.state, 'AM');
    expect(dNat).toBeLessThan(0);
    expect(dRs).toBeLessThan(dNat);
    expect(dAm).toBeGreaterThan(dNat);
    // D7: média ponderada das UFs = nacional nos dois cenários.
    for (const r of [out, calm]) {
      expect(r.state.regions.ufs.reduce((s, u, i) => s + pop[i] * u.approval, 0)).toBeCloseTo(
        r.state.indicators.approval,
        12,
      );
    }
  });

  it('seca prolongada pesa devagar: só depois do limiar, e abaixo dele não há humor', () => {
    const base = createInitialState({ content, difficulty: 'estrategica', seed: 5 });
    const below = climateRegionalEffects(
      withClimate(base, { MT: { dryness: climateParam('seca_humor_limiar') - 0.01 } }),
      content,
    );
    const above = climateRegionalEffects(withClimate(base, { MT: { dryness: 1 } }), content);
    const iMt = ufs.findIndex((u) => u.id === 'MT');
    const mood = (r: typeof below) => r.approval[iMt].find((p) => p.cause === CLIMATE_CAUSES.droughtMood)?.delta ?? 0;
    expect(mood(below)).toBe(0);
    expect(mood(above)).toBeCloseTo(-climateParam('aprovacao_clima_max'), 12);
    expect(climateRegionalEffects(base, content).approval.every((p) => p.length === 0)).toBe(true);
    expect(climateRegionalEffects(base, content).activity.every((p) => p.length === 0)).toBe(true);
  });
});

describe('calibração do clima: nenhum parâmetro sem uso', () => {
  it('todo parâmetro de CLIMATE_PARAMS é lido por algum arquivo do motor climático', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(process.cwd(), 'src', 'engine', 'climate');
    const sources = ['evolution.ts', 'effects.ts', 'climate.ts']
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n');
    for (const name of Object.keys(CLIMATE_PARAMS)) {
      if (name.startsWith('intensidade_')) continue; // lidas por CLIMATE_INTENSITY_PARAM
      expect(sources, name).toContain(`'${name}'`);
    }
    for (const name of Object.values(CLIMATE_INTENSITY_PARAM)) expect(name in CLIMATE_PARAMS).toBe(true);
  });
});

describe('estratégias sem explosão com o clima (smoke)', () => {
  it('48 meses por estratégia não violam invariantes', () => {
    for (const strategy of STRATEGIES) {
      let state = createInitialState({ content, difficulty: 'realismo', seed: 13 });
      const errors: string[] = [];
      for (let m = 0; m < 48; m++) {
        const out = advanceMonth(state, strategy.decide(state, content), content);
        errors.push(...checkInvariants(state, out.state, out.report, content));
        state = out.state;
      }
      expect(errors, strategy.id).toEqual([]);
    }
  });
});
