import { describe, expect, it } from 'vitest';

import { UFS } from '@/globe/ufs';
import { parseRailwayNetwork, RAILWAY_STATUSES } from '@/types/railways';

import { POLICIES, RAILWAY_POLICY_IDS } from './policies';
import { RAILWAYS } from './railways';
import { DEFAULT_SCENARIO_ID, SCENARIOS } from './scenarios';

const segments = RAILWAYS.corridors.flatMap((c) => c.segments.map((s) => ({ corridor: c, segment: s })));

// PLANO_EXPANSAO EX-30: fonte/versionamento, estados operacionais e nenhum trecho planejado confundido com ativo.
describe('rede ferroviária nacional', () => {
  it('declara versão, data, fonte e o aviso de traçado esquemático', () => {
    expect(RAILWAYS.version).toMatch(/^\d{4}\.\d{2}\.\d+$/);
    expect(RAILWAYS.referenceDate).toMatch(/^\d{4}-\d{2}$/);
    expect(RAILWAYS.source.length).toBeGreaterThan(20);
    expect(RAILWAYS.geometry).toMatch(/esquemático/);
    // DATA_SOURCES.md §2.1: compilação manual não é dado REAL.
    expect(RAILWAYS.status).toBe('PROVISORIO');
  });

  it('cobre todas as situações operacionais, com rede existente e proposta', () => {
    const seen = new Set(segments.map(({ segment }) => segment.status));
    for (const status of RAILWAY_STATUSES) expect(seen, status).toContain(status);
  });

  it('cita só UFs que existem no mapa', () => {
    const known = new Set(UFS.map((u) => u.sigla));
    for (const corridor of RAILWAYS.corridors) {
      for (const uf of corridor.ufs) expect(known, `${corridor.id}: ${uf}`).toContain(uf);
    }
  });

  it('não tem trecho degenerado (pontos repetidos em sequência)', () => {
    for (const { segment } of segments) {
      segment.path.forEach((p, i) => {
        if (i === 0) return;
        const q = segment.path[i - 1]!;
        expect(p[0] !== q[0] || p[1] !== q[1], `${segment.id} ponto ${i}`).toBe(true);
      });
    }
  });

  it('recusa id repetido e operador em corredor só planejado', () => {
    const corridor = RAILWAYS.corridors.find((c) => c.id === 'ferrograo')!;
    const duplicated = { ...RAILWAYS, corridors: [...RAILWAYS.corridors, corridor] };
    expect(parseRailwayNetwork(duplicated).ok).toBe(false);
    const operated = {
      ...RAILWAYS,
      corridors: RAILWAYS.corridors.map((c) => (c.id === 'ferrograo' ? { ...c, operator: 'Alguém' } : c)),
    };
    const r = parseRailwayNetwork(operated);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/operador/);
  });

  it('recusa ponto fora da caixa do Brasil', () => {
    const broken = {
      ...RAILWAYS,
      corridors: [
        {
          ...RAILWAYS.corridors[0]!,
          segments: [
            {
              ...RAILWAYS.corridors[0]!.segments[0]!,
              path: [
                [10, 50],
                [-44, -2],
              ],
            },
          ],
        },
      ],
    };
    expect(parseRailwayNetwork(broken).ok).toBe(false);
  });
});

describe('obras ferroviárias da carteira', () => {
  it('ligam-se a trechos ainda não ativos, um de carga e outro de passageiros', () => {
    const usages = RAILWAY_POLICY_IDS.map((id) => {
      const policy = POLICIES[id]!;
      expect(policy.delivery).toBe('projeto');
      const found = segments.find(({ segment }) => segment.id === policy.railway?.segmentId);
      expect(found, id).toBeDefined();
      // Proposta do jogador nunca é desenhada sobre a rede existente.
      expect(['planejada', 'desativada']).toContain(found!.segment.status);
      // A obra só beneficia as UFs que o corredor atravessa.
      for (const uf of policy.regional?.scope ?? []) expect(found!.corridor.ufs).toContain(uf);
      return found!.corridor.usage;
    });
    expect(usages.sort()).toEqual(['carga', 'passageiros']);
  });

  it('a de passageiros custa menos e entrega antes, mas pesa mais na manutenção', () => {
    const cargo = POLICIES.projeto_ferrovia_integracao_oeste!;
    const passenger = POLICIES.projeto_trem_regional_passageiros!;
    const total = (p: typeof cargo) => (p.cost.annualMillions * p.timeline.executionMonths) / 12;
    expect(total(passenger)).toBeLessThan(total(cargo));
    expect(passenger.timeline.executionMonths).toBeLessThan(cargo.timeline.executionMonths);
    expect(passenger.project!.annualMaintenanceRate).toBeGreaterThan(cargo.project!.annualMaintenanceRate);
  });

  it('só o cenário v0.8.0 oferece as obras ferroviárias', () => {
    expect(DEFAULT_SCENARIO_ID).toBe('brasil_2027_01_v080');
    for (const id of RAILWAY_POLICY_IDS) {
      expect(SCENARIOS.brasil_2027_01_v080!.policies).toContain(id);
      expect(SCENARIOS.brasil_2027_01_v070!.policies).not.toContain(id);
    }
  });
});
