import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { CLIMATOLOGY } from '@/content/climate';
import { SCENARIOS } from '@/content/scenarios';
import { advanceMonth } from '@/engine/advanceMonth';
import { toCalendar } from '@/engine/calendar';
import { checkInvariants } from '@/engine/invariants';
import { createRng, deriveSeed, seedRng } from '@/engine/rng';
import { createInitialState } from '@/engine/state';
import { ENGINE_VERSION, STATE_SCHEMA_VERSION } from '@/engine/types';
import { upgradeGameState } from '@/engine/upgrade';
import { climatologySchema, parseClimatology, SEASON_IDS } from '@/types/climate';
import { REGION_IDS, UF_IDS } from '@/types/regions';

import v2Save from '@/tests/saves/state_v2_fase02.json';
import v3Save from '@/tests/saves/state_v3_fase03.json';
import v4Save from '@/tests/saves/state_v4_fase04.json';
import v5Save from '@/tests/saves/state_v5_fase05.json';
import v6Save from '@/tests/saves/state_v6_fase06.json';
import v7Save from '@/tests/saves/state_v7_fase07.json';

import { CLIMATE_INTENSITY_PARAM, CLIMATE_PARAMS, climateParam } from './calibration';
import {
  checkClimate,
  CLIMATE_SEED_SALT,
  climateOf,
  climateRngState,
  climateSeed,
  ensoTeleconnection,
  ensoTeleconnectionOf,
  initialClimate,
  rainfallNormal,
  regionOfUf,
  seasonOf,
} from './climate';
import { evolveClimate } from './evolution';

// PLANO_GLOBO.md §6.1 (contrato climático), D-G6 e §8, testes 1 e 2: mesma semente → mesmo resultado; save da
// versão anterior abre com clima neutro; sorteios dos sistemas antigos na mesma ordem. A evolução e os efeitos do
// clima (PR 8) são testados em `evolution.test.ts`.

const content = loadContent(DEFAULT_SCENARIO_ID);
const EMPTY = { decisions: [] };

describe('semente do clima (PLANO_GLOBO.md §6.1)', () => {
  it('é uma função pura com valores fixos: a estabilidade do sal e da mistura é parte do contrato', () => {
    // Valores conferidos por uma reimplementação independente (Python) do finalizador do MurmurHash3.
    expect(CLIMATE_SEED_SALT).toBe(0x434c494d);
    expect(deriveSeed(1, CLIMATE_SEED_SALT)).toBe(2149878617);
    expect(deriveSeed(7, CLIMATE_SEED_SALT)).toBe(2926023787);
    expect(deriveSeed(42, CLIMATE_SEED_SALT)).toBe(3283291898);
    expect(climateSeed(42)).toBe(3283291898);
    // O estado inicial do PRNG do clima (sfc32 semeado pela semente derivada).
    expect(climateRngState(42)).toEqual([-6506590, 235477689, 2877282045, 841142096]);
  });

  it('é determinística e separa campanhas, sais e o PRNG principal', () => {
    expect(climateSeed(42)).toBe(climateSeed(42));
    expect(climateSeed(42)).not.toBe(climateSeed(43));
    expect(deriveSeed(42, CLIMATE_SEED_SALT)).not.toBe(deriveSeed(42, CLIMATE_SEED_SALT + 1));
    // Nem a semente derivada nem o estado do PRNG do clima coincidem com os do PRNG principal da mesma campanha.
    expect(climateSeed(42)).not.toBe(42);
    expect(climateRngState(42)).not.toEqual(seedRng(42));
    // Sementes negativas e grandes entram pelos 32 bits baixos, como em `seedRng`.
    expect(climateSeed(-1)).toBe(climateSeed(0xffff_ffff));
    expect(Number.isInteger(climateSeed(-12345))).toBe(true);
  });

  it('sequências distintas: o PRNG do clima não repete o do jogo', () => {
    const main = createRng(seedRng(42));
    const climate = createRng(climateRngState(42));
    const a = Array.from({ length: 8 }, () => main.nextUint32());
    const b = Array.from({ length: 8 }, () => climate.nextUint32());
    expect(b).not.toEqual(a);
  });
});

describe('estado climático inicial (PLANO_GLOBO.md §6.1, D-G6)', () => {
  const state = createInitialState({ content, difficulty: 'estrategica', seed: 42 });

  it('nasce neutro: ENSO 0, chuva normal e sem seca nas 27 UFs, na ordem do cenário', () => {
    expect(state.climate.enso).toBe(0);
    expect(state.climate.ufs).toHaveLength(27);
    expect(state.climate.ufs.map((u) => u.id)).toEqual([...UF_IDS]);
    expect(state.climate.ufs.every((u) => u.rain === 0 && u.dryness === 0)).toBe(true);
    expect(state.climate.rng).toEqual(climateRngState(42));
    expect(checkClimate(state.climate)).toEqual([]);
    expect(state.schemaVersion).toBe(STATE_SCHEMA_VERSION);
    expect(STATE_SCHEMA_VERSION).toBe(14);
  });

  it('a lista de UFs coincide com as do cenário com dados regionais e com a climatologia', () => {
    const scenarioIds = SCENARIOS[DEFAULT_SCENARIO_ID].regions?.ufs.map((u) => u.id);
    expect(scenarioIds).toEqual([...UF_IDS]);
    expect(CLIMATOLOGY.rain.ufs.map((u) => u.id)).toEqual([...UF_IDS]);
  });

  it('o PRNG principal continua semeado só pela semente da campanha (a ordem dos sorteios antigos não muda)', () => {
    expect(state.rng).toEqual(seedRng(42));
    expect(state.seed).toBe(42);
  });

  it('o clima depende só da semente: campanhas com a mesma semente têm o mesmo clima, outras não', () => {
    const again = createInitialState({ content, difficulty: 'casual', seed: 42 });
    const other = createInitialState({ content, difficulty: 'estrategica', seed: 43 });
    expect(again.climate).toEqual(state.climate);
    expect(other.climate.rng).not.toEqual(state.climate.rng);
    expect(other.climate.ufs).toEqual(state.climate.ufs);
  });

  it('initialClimate devolve estados independentes (sem objetos compartilhados)', () => {
    const a = initialClimate(1);
    const b = initialClimate(1);
    a.ufs[0].rain = 0.5;
    expect(b.ufs[0].rain).toBe(0);
  });
});

describe('determinismo da partida com clima (PLANO_GLOBO.md §8, teste 1)', () => {
  it('mesma semente e decisões → mesmo estado final, clima incluído', () => {
    const run = () => {
      let state = createInitialState({ content, difficulty: 'estrategica', seed: 5 });
      for (let m = 0; m < 18; m++) state = advanceMonth(state, EMPTY, content).state;
      return JSON.stringify(state);
    };
    expect(run()).toBe(run());
  });

  it('o estado recebido não é alterado pelo mês', () => {
    const state = createInitialState({ content, difficulty: 'estrategica', seed: 5 });
    const before = structuredClone(state);
    advanceMonth(state, EMPTY, content);
    expect(state).toEqual(before);
  });
});

describe('atualização v10 → v11: clima neutro em todo save (PLANO_GLOBO.md §8, teste 2)', () => {
  const FIXTURES = [
    [2, v2Save],
    [3, v3Save],
    [4, v4Save],
    [5, v5Save],
    [6, v6Save],
    [7, v7Save],
  ] as const;

  /** Estado v10 de verdade: o atual jogado por 4 meses, sem o clima, marcado como v10. */
  function v10Save(seed = 5): Record<string, unknown> {
    let state = createInitialState({ content, difficulty: 'estrategica', seed });
    for (let m = 0; m < 4; m++) state = advanceMonth(state, EMPTY, content).state;
    const { climate: _climate, ...rest } = state;
    return { ...rest, schemaVersion: 10, engineVersion: '0.9.0' };
  }

  it('save v10 ganha clima neutro com o PRNG derivado da semente gravada, sem tocar nos demais campos', () => {
    const raw = v10Save(5);
    const original = structuredClone(raw);
    const migrated = upgradeGameState(10, raw);
    expect(raw).toEqual(original);
    expect(migrated.schemaVersion).toBe(STATE_SCHEMA_VERSION);
    expect(migrated.engineVersion).toBe(ENGINE_VERSION);
    expect(migrated.climate).toEqual(initialClimate(5));
    expect(migrated.climate.rng).toEqual(climateRngState(5));
    // Os sorteios dos sistemas antigos seguem do ponto em que estavam: o PRNG principal é o do save.
    expect(migrated.rng).toEqual(original.rng);
    for (const key of Object.keys(original).filter((k) => k !== 'schemaVersion' && k !== 'engineVersion')) {
      expect((migrated as unknown as Record<string, unknown>)[key], key).toEqual(original[key]);
    }
  });

  it('o save v10 atualizado continua jogável (24 meses): invariantes, determinismo e clima nascendo do estado neutro', () => {
    const play = () => {
      let state = upgradeGameState(10, structuredClone(v10Save(5)) as unknown);
      const first = advanceMonth(state, EMPTY, content);
      // O primeiro mês de clima do save é a evolução do estado neutro derivado da semente gravada.
      expect(first.state.climate).toEqual(
        evolveClimate(initialClimate(5), toCalendar(state.monthIndex).month, state.difficulty, content.climatology),
      );
      const errors: string[] = [];
      for (let m = 0; m < 24; m++) {
        const out = advanceMonth(state, EMPTY, content);
        errors.push(...checkInvariants(state, out.state, out.report, content));
        state = out.state;
      }
      expect(errors).toEqual([]);
      return JSON.stringify(state);
    };
    expect(play()).toBe(play());
  });

  it('o clima de um save atualizado é o de uma campanha nova da mesma semente', () => {
    const migrated = upgradeGameState(10, v10Save(11));
    expect(migrated.climate).toEqual(createInitialState({ content, difficulty: 'casual', seed: 11 }).climate);
  });

  it('os saves reais mais antigos (v2 a v7) atualizam e ganham clima neutro derivado da própria semente', () => {
    for (const [version, save] of FIXTURES) {
      const state = upgradeGameState(version, structuredClone(save) as unknown);
      expect(state.schemaVersion, `v${version}`).toBe(STATE_SCHEMA_VERSION);
      expect(state.climate, `v${version}`).toEqual(initialClimate(save.seed));
      expect(checkClimate(state.climate), `v${version}`).toEqual([]);
      expect(state.rng, `v${version}`).toEqual(save.rng);
    }
  });

  // Os saves reais atualizados jogam 12 meses (sem decisões) no cenário do próprio save, com o clima novo agindo:
  // sem violar invariantes (inclui o clima e o D7), de forma determinística e com o clima dentro dos limites.
  it.each(FIXTURES.map(([version]) => [version] as const))(
    'save real v%i atualizado joga 12 meses sem violar invariantes',
    (version) => {
      const save = FIXTURES.find(([v]) => v === version)?.[1];
      if (!save) throw new Error(`fixture v${version} ausente`);
      const play = () => {
        let state = upgradeGameState(version, structuredClone(save) as unknown);
        const c = loadContent(state.scenarioId);
        const errors: string[] = [];
        for (let m = 0; m < 12; m++) {
          const out = advanceMonth(state, EMPTY, c);
          errors.push(...checkInvariants(state, out.state, out.report, c));
          state = out.state;
        }
        expect(errors).toEqual([]);
        expect(checkClimate(state.climate)).toEqual([]);
        expect(state.climate.rng).not.toEqual(initialClimate(save.seed).rng);
        return JSON.stringify(state);
      };
      expect(play()).toBe(play());
    },
  );

  it('save sem semente inteira usa a semente 0 em vez de falhar', () => {
    const raw = { ...v10Save(5), seed: 'x' };
    expect(upgradeGameState(10, raw).climate).toEqual(initialClimate(0));
  });
});

describe('climatologia: normais de chuva e teleconexão ENSO (PROVISORIO)', () => {
  const annual = (id: string) => CLIMATOLOGY.rain.ufs.find((u) => u.id === id)?.mm.reduce((s, v) => s + v, 0) ?? 0;
  const sum = (id: string, months: number[]) => {
    const mm = CLIMATOLOGY.rain.ufs.find((u) => u.id === id)?.mm ?? [];
    return months.reduce((s, m) => s + mm[m - 1], 0);
  };

  it('passa no esquema, está marcada como PROVISORIO e cobre 27 UFs × 12 meses positivos', () => {
    expect(parseClimatology(CLIMATOLOGY).ok).toBe(true);
    expect(CLIMATOLOGY.rain.meta.status).toBe('PROVISORIO');
    expect(CLIMATOLOGY.enso.meta.status).toBe('PROVISORIO');
    expect(CLIMATOLOGY.rain.ufs).toHaveLength(27);
    for (const u of CLIMATOLOGY.rain.ufs) {
      expect(u.mm, u.id).toHaveLength(12);
      expect(
        u.mm.every((v) => v > 0 && Number.isFinite(v)),
        u.id,
      ).toBe(true);
    }
  });

  it('a macrorregião de cada UF coincide com a do cenário', () => {
    for (const u of SCENARIOS[DEFAULT_SCENARIO_ID].regions?.ufs ?? []) {
      expect(regionOfUf(CLIMATOLOGY, u.id), u.id).toBe(u.region);
    }
  });

  it('os totais anuais ficam em faixas plausíveis por região', () => {
    const range: Record<string, readonly [number, number]> = {
      norte: [1500, 3000],
      nordeste: [700, 1700],
      centro_oeste: [1200, 1900],
      sudeste: [1100, 1600],
      sul: [1400, 1900],
    };
    for (const u of CLIMATOLOGY.rain.ufs) {
      const [lo, hi] = range[u.region];
      expect(annual(u.id), u.id).toBeGreaterThanOrEqual(lo);
      expect(annual(u.id), u.id).toBeLessThanOrEqual(hi);
    }
    // Ordem de grandeza entre regiões: o Amapá (Norte) é o mais úmido e o semiárido (RN) o mais seco.
    expect(annual('AP')).toBeGreaterThan(2 * annual('RN'));
    expect(Math.min(...CLIMATOLOGY.rain.ufs.map((u) => annual(u.id)))).toBe(annual('RN'));
  });

  it('os regimes sazonais batem com a climatologia conhecida', () => {
    // Amazônia: chuvosa de dez a mai, menos de jun a nov.
    for (const id of ['AM', 'PA', 'AC', 'RO']) {
      expect(sum(id, [12, 1, 2, 3, 4, 5])).toBeGreaterThan(1.8 * sum(id, [6, 7, 8, 9, 10, 11]));
    }
    // Semiárido do Nordeste: set–nov quase seco.
    for (const id of ['CE', 'PI', 'RN', 'PB']) expect(sum(id, [9, 10, 11])).toBeLessThan(0.15 * annual(id));
    // Brasil Central: verão chuvoso, inverno seco.
    for (const id of ['MT', 'GO', 'DF', 'MG']) expect(sum(id, [12, 1, 2])).toBeGreaterThan(3 * sum(id, [6, 7, 8]));
    // Sul: sem estação seca.
    for (const id of ['PR', 'SC', 'RS']) {
      const mm = CLIMATOLOGY.rain.ufs.find((u) => u.id === id)?.mm ?? [];
      expect(Math.min(...mm), id).toBeGreaterThanOrEqual(80);
    }
  });

  it('a teleconexão cobre 5 macrorregiões × 4 estações com os sinais da literatura geral', () => {
    for (const region of REGION_IDS) {
      for (const season of SEASON_IDS) {
        const c = ensoTeleconnection(CLIMATOLOGY, region, season);
        expect(Number.isFinite(c), `${region}/${season}`).toBe(true);
        expect(Math.abs(c), `${region}/${season}`).toBeLessThanOrEqual(CLIMATE_PARAMS.chuva_anomalia_max.value);
      }
    }
    // El Niño (ENSO > 0) seca o Norte e o Nordeste na estação chuvosa e molha o Sul, sobretudo na primavera.
    expect(ensoTeleconnection(CLIMATOLOGY, 'norte', 'outono')).toBeLessThan(0);
    expect(ensoTeleconnection(CLIMATOLOGY, 'nordeste', 'outono')).toBeLessThan(0);
    expect(ensoTeleconnection(CLIMATOLOGY, 'sul', 'primavera')).toBeGreaterThan(0);
    const sul = SEASON_IDS.map((s) => ensoTeleconnection(CLIMATOLOGY, 'sul', s));
    expect(Math.max(...sul)).toBe(ensoTeleconnection(CLIMATOLOGY, 'sul', 'primavera'));
  });

  it('o esquema recusa tabelas incompletas ou inválidas', () => {
    const copy = () => structuredClone(CLIMATOLOGY);
    const missingUf = copy();
    missingUf.rain.ufs.pop();
    expect(climatologySchema.safeParse(missingUf).success).toBe(false);
    const shortYear = copy();
    shortYear.rain.ufs[0].mm = shortYear.rain.ufs[0].mm.slice(0, 11);
    expect(climatologySchema.safeParse(shortYear).success).toBe(false);
    const dry = copy();
    dry.rain.ufs[3].mm[5] = 0;
    expect(climatologySchema.safeParse(dry).success).toBe(false);
    const swapped = copy();
    [swapped.rain.ufs[0], swapped.rain.ufs[1]] = [swapped.rain.ufs[1], swapped.rain.ufs[0]];
    expect(climatologySchema.safeParse(swapped).success).toBe(false);
    const noSeason: { enso: { teleconnection: { sul: Record<string, number> } } } = JSON.parse(
      JSON.stringify(CLIMATOLOGY),
    );
    delete noSeason.enso.teleconnection.sul.inverno;
    expect(parseClimatology(noSeason).ok).toBe(false);
  });
});

describe('leitores puros', () => {
  it('seasonOf: estações do hemisfério sul (verão dez–fev, outono mar–mai, inverno jun–ago, primavera set–nov)', () => {
    const expected = [
      'verao', // jan
      'verao', // fev
      'outono', // mar
      'outono',
      'outono', // mai
      'inverno', // jun
      'inverno',
      'inverno', // ago
      'primavera', // set
      'primavera',
      'primavera', // nov
      'verao', // dez
    ];
    expect(Array.from({ length: 12 }, (_, i) => seasonOf(i + 1))).toEqual(expected);
    expect(() => seasonOf(0)).toThrow(RangeError);
    expect(() => seasonOf(13)).toThrow(RangeError);
    expect(() => seasonOf(1.5)).toThrow(RangeError);
  });

  it('rainfallNormal devolve o mm do mês do calendário e recusa UF ou mês inválidos', () => {
    expect(rainfallNormal(CLIMATOLOGY, 'RO', 1)).toBe(300);
    expect(rainfallNormal(CLIMATOLOGY, 'RO', 7)).toBe(25);
    expect(rainfallNormal(CLIMATOLOGY, 'CE', 4)).toBeGreaterThan(rainfallNormal(CLIMATOLOGY, 'CE', 10));
    expect(() => rainfallNormal(CLIMATOLOGY, 'XX', 1)).toThrow(RangeError);
    expect(() => rainfallNormal(CLIMATOLOGY, 'RO', 0)).toThrow(RangeError);
  });

  it('ensoTeleconnectionOf combina a macrorregião da UF com a estação do mês', () => {
    expect(ensoTeleconnectionOf(CLIMATOLOGY, 'RS', 10)).toBe(ensoTeleconnection(CLIMATOLOGY, 'sul', 'primavera'));
    expect(ensoTeleconnectionOf(CLIMATOLOGY, 'CE', 3)).toBe(ensoTeleconnection(CLIMATOLOGY, 'nordeste', 'outono'));
    expect(ensoTeleconnectionOf(CLIMATOLOGY, 'AM', 12)).toBe(ensoTeleconnection(CLIMATOLOGY, 'norte', 'verao'));
    expect(() => ensoTeleconnectionOf(CLIMATOLOGY, 'XX', 1)).toThrow(RangeError);
  });

  it('climateOf lê o clima de uma UF do estado, sem alterá-lo', () => {
    const state = createInitialState({ content, difficulty: 'estrategica', seed: 3 });
    expect(climateOf(state, 'BA')).toEqual({ id: 'BA', rain: 0, dryness: 0 });
    expect(climateOf(state, 'XX')).toBeUndefined();
  });

  it('checkClimate acusa valores fora dos limites', () => {
    const base = initialClimate(1);
    expect(checkClimate(base)).toEqual([]);
    expect(checkClimate({ ...base, enso: 1.2 })).toHaveLength(1);
    expect(checkClimate({ ...base, ufs: base.ufs.slice(1) })).toHaveLength(1);
    const wet = { ...base, ufs: base.ufs.map((u, i) => (i === 0 ? { ...u, rain: -1.5, dryness: 1.5 } : u)) };
    expect(checkClimate(wet)).toHaveLength(2);
  });
});

describe('calibração do clima (CLIMATE_PARAMS)', () => {
  it('cada parâmetro tem valor dentro da faixa, significado e justificativa', () => {
    for (const [name, spec] of Object.entries(CLIMATE_PARAMS)) {
      expect(spec.value, name).toBeGreaterThanOrEqual(spec.min);
      expect(spec.value, name).toBeLessThanOrEqual(spec.max);
      expect(spec.min, name).toBeLessThan(spec.max);
      expect(spec.note.length, name).toBeGreaterThan(0);
      expect(spec.basis.length, name).toBeGreaterThan(0);
    }
  });

  it('o AR(1) do ENSO é estável e o desvio estacionário cabe na saturação; a dificuldade só muda a magnitude', () => {
    const phi = climateParam('enso_persistencia');
    const sd = climateParam('enso_choque') / Math.sqrt(1 - phi * phi);
    expect(phi).toBeLessThan(1);
    expect(sd).toBeLessThan(climateParam('enso_saturacao'));
    expect(climateParam(CLIMATE_INTENSITY_PARAM.casual)).toBeLessThan(
      climateParam(CLIMATE_INTENSITY_PARAM.estrategica),
    );
    expect(climateParam(CLIMATE_INTENSITY_PARAM.estrategica)).toBeLessThan(
      climateParam(CLIMATE_INTENSITY_PARAM.realismo),
    );
    expect(climateParam('seca_memoria')).toBeLessThan(1);
    expect(climateParam('chuva_persistencia')).toBeLessThan(1);
    expect(climateParam('cheia_risco_max')).toBeLessThan(1);
  });
});
