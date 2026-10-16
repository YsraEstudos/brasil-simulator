import { describe, expect, it } from 'vitest';

import brasil from '@/data/scenarios/brasil_2027_01.json';
import brasilV050 from '@/data/scenarios/brasil_2027_01_v050.json';
import brasilV060 from '@/data/scenarios/brasil_2027_01_v060.json';
import prototipo from '@/data/scenarios/prototipo_ficticio.json';
import { parseScenario, type Scenario } from '@/types/scenario';
import type { DataValue } from '@/types/data';

import { POLICIES } from './policies';
import { CAMPAIGN_MONTHS, DEFAULT_SCENARIO_ID, PROTOTYPE_MONTHS, SCENARIOS, campaignMonths } from './scenarios';

function valuesOf(s: Scenario): [string, DataValue][] {
  const ind = Object.entries(s.indicators);
  const eco = s.economy ? Object.entries(s.economy) : [];
  return [...ind, ...eco].map(([k, v]) => [k, v]);
}

function parseOrThrow(raw: unknown): Scenario {
  const r = parseScenario(raw);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.scenario;
}

describe('cenários embutidos', () => {
  it('cenários legados validam e o padrão é a revisão v0.6.0 (Fase 07)', () => {
    const a = parseScenario(prototipo);
    const b = parseScenario(brasil);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(DEFAULT_SCENARIO_ID).toBe('brasil_2027_01_v060');
    expect(Object.keys(SCENARIOS)).toEqual(
      expect.arrayContaining(['prototipo_ficticio', 'brasil_2027_01', 'brasil_2027_01_v050', 'brasil_2027_01_v060']),
    );
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

  it('brasil_2027_01: toda política do cenário tem uma pasta que a executa (POLITICAL_RULES.md §6.3.1)', () => {
    const scenario = SCENARIOS.brasil_2027_01;
    const ministries = scenario?.institutions?.ministries ?? [];
    expect(ministries.length).toBeGreaterThan(0);
    for (const id of scenario?.policies ?? []) {
      const area = POLICIES[id]?.area;
      expect(
        ministries.some((m) => area !== undefined && m.areas.includes(area)),
        `${id} (${area})`,
      ).toBe(true);
    }
    // Ninguém começa com pasta: o jogador decide a coalizão.
    expect(ministries.every((m) => m.occupant === 'tecnico')).toBe(true);
  });

  it('instituições inválidas são recusadas: presidente ou ocupante que não é bloco', () => {
    const base = structuredClone(brasil) as Record<string, unknown> & { institutions: Record<string, unknown> };
    const presidente = {
      ...base,
      institutions: { ...base.institutions, housePresidents: { camara: 'x', senado: 'centro' } },
    };
    expect(parseScenario(presidente).ok).toBe(false);
    const ministries = (base.institutions.ministries as Record<string, unknown>[]).map((m, i) =>
      i === 0 ? { ...m, occupant: 'bloco_fantasma' } : m,
    );
    expect(parseScenario({ ...base, institutions: { ...base.institutions, ministries } }).ok).toBe(false);
  });

  it('bancadas somam 513 e 81 (validado pelo esquema)', () => {
    const r = parseScenario(brasil);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.scenario.blocs.reduce((n, b) => n + b.chamberSeats, 0)).toBe(513);
    expect(r.scenario.blocs.reduce((n, b) => n + b.senateSeats, 0)).toBe(81);
  });
});

/** Elenco da tabela de docs/FASE_07.md: id → bloco e prestígio inicial. */
const ELENCO_FASE_07: Record<string, { blocId?: string; initialStanding: number }> = {
  min_fazenda: { initialStanding: 40 },
  pres_camara: { blocId: 'centro', initialStanding: 10 },
  pres_senado: { blocId: 'centro', initialStanding: 15 },
  lider_oposicao: { blocId: 'direita', initialStanding: -40 },
  presidente_bc: { initialStanding: 20 },
  ministro_stf: { initialStanding: 0 },
  governador_nordeste: { blocId: 'esquerda', initialStanding: 30 },
  governador_sudeste: { blocId: 'centro_direita', initialStanding: -10 },
  jornalista: { initialStanding: 0 },
  empresario_agro: { blocId: 'centro_direita', initialStanding: -5 },
  lider_sindical: { blocId: 'esquerda', initialStanding: 25 },
  vice_presidente: { blocId: 'centro', initialStanding: 35 },
};

describe('brasil_2027_01_v060 (Fase 07: elenco de personagens)', () => {
  const s = parseOrThrow(brasilV060);
  const characters = s.characters ?? [];
  const blocIds = new Set(s.blocs.map((b) => b.id));

  it('é a versão 0.6.0 com 12 personagens', () => {
    expect(s.id).toBe('brasil_2027_01_v060');
    expect(s.version).toBe('0.6.0');
    expect(characters).toHaveLength(12);
  });

  it('ids dos personagens são únicos e são exatamente o elenco de FASE_07.md', () => {
    const ids = characters.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(Object.keys(ELENCO_FASE_07).sort());
  });

  it('blocId e prestígio inicial batem com a tabela do elenco; todos são FICTICIO', () => {
    for (const c of characters) {
      const esperado = ELENCO_FASE_07[c.id];
      expect(esperado, c.id).toBeDefined();
      expect(c.blocId, c.id).toBe(esperado?.blocId);
      expect(c.initialStanding, c.id).toBe(esperado?.initialStanding);
      expect(c.initialStanding, c.id).toBeGreaterThanOrEqual(-100);
      expect(c.initialStanding, c.id).toBeLessThanOrEqual(100);
      expect(c.dataStatus, c.id).toBe('FICTICIO');
      expect(c.description.trim().length, c.id).toBeGreaterThan(0);
    }
  });

  it('blocId, quando existe, aponta para um bloco do cenário', () => {
    for (const c of characters) {
      if (c.blocId !== undefined) expect(blocIds.has(c.blocId), c.id).toBe(true);
    }
  });

  it('mantém as mesmas políticas, blocos e regiões do v0.5.0', () => {
    const v050 = parseOrThrow(brasilV050);
    expect(s.policies).toEqual(v050.policies);
    expect(s.blocs).toEqual(v050.blocs);
    expect(s.regions).toEqual(v050.regions);
    expect(s.indicators).toEqual(v050.indicators);
  });

  it('a campanha completa tem 48 meses', () => {
    expect(CAMPAIGN_MONTHS).toBe(48);
    expect(campaignMonths(s.id)).toBe(48);
  });
});

describe('cenário padrão e duração da campanha', () => {
  it('o padrão é brasil_2027_01_v060, registrado em SCENARIOS, e dura 48 meses', () => {
    expect(SCENARIOS[DEFAULT_SCENARIO_ID]).toBeDefined();
    expect(SCENARIOS[DEFAULT_SCENARIO_ID]?.version).toBe('0.6.0');
    expect(campaignMonths(DEFAULT_SCENARIO_ID)).toBe(CAMPAIGN_MONTHS);
  });

  it('v0.5.0 continua registrado e com 48 meses; o protótipo tem 12 meses', () => {
    expect(SCENARIOS.brasil_2027_01_v050).toBeDefined();
    expect(campaignMonths('brasil_2027_01_v050')).toBe(48);
    expect(campaignMonths('prototipo_ficticio')).toBe(PROTOTYPE_MONTHS);
    expect(campaignMonths('brasil_2027_01')).toBe(PROTOTYPE_MONTHS);
  });
});
