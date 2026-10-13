import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent, PROTOTYPE_MONTHS } from '@/content';

import { advanceMonth } from '../advanceMonth';
import { createInitialState } from '../state';
import type { GameContent, Indicators, MonthInput } from '../types';

import { runCampaign, summarizeRuns, type CampaignSummary } from './campaign';
import { STRATEGIES, type Strategy } from './strategies';

// ECONOMIC_MODEL.md §9: campanhas automáticas com estratégias-robô × sementes. Testes de faixa e de sentido,
// não de valor exato (ECONOMIC_MODEL.md §9, "Testes de sentido").

const content: GameContent = loadContent(DEFAULT_SCENARIO_ID);
const SEEDS_SHORT = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const SEEDS_LONG = [1, 2, 3, 4, 5];
const LONG_MONTHS = 48;

const strategy = (id: string): Strategy => {
  const found = STRATEGIES.find((s) => s.id === id);
  if (!found) throw new Error(`estratégia desconhecida: ${id}`);
  return found;
};

/** Verdadeiro se todo número dentro do valor for finito (ECONOMIC_MODEL.md §7.6). */
function numbersAreFinite(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(numbersAreFinite);
  if (value !== null && typeof value === 'object') return Object.values(value).every(numbersAreFinite);
  return true;
}

/** Maior diferença absoluta entre dois conjuntos de indicadores. */
function maxIndicatorGap(a: Indicators, b: Indicators): number {
  return Math.max(...(Object.keys(a) as (keyof Indicators)[]).map((k) => Math.abs(a[k] - b[k])));
}

/** Joga a campanha mês a mês e devolve, por mês, a entrada enviada ao motor e quantas decisões ele rejeitou. */
function playInputs(s: Strategy, seed: number, months: number): { input: MonthInput; rejected: number }[] {
  let state = createInitialState({ content, difficulty: 'estrategica', seed });
  const out: { input: MonthInput; rejected: number }[] = [];
  for (let m = 0; m < months; m++) {
    const input = s.decide(state, content);
    const result = advanceMonth(state, input, content);
    out.push({ input, rejected: result.report.rejected.length });
    state = result.state;
  }
  return out;
}

describe('Estratégias-robô: invariantes e faixas plausíveis (ECONOMIC_MODEL.md §7 e §9)', () => {
  for (const s of STRATEGIES) {
    for (const seed of SEEDS_SHORT) {
      it(`${s.id}, semente ${seed}, ${PROTOTYPE_MONTHS} meses: sem violação e valores plausíveis`, () => {
        const run = runCampaign(s, seed, PROTOTYPE_MONTHS, content);

        expect(run.violations).toEqual([]);
        expect(numbersAreFinite(run)).toBe(true);
        expect(run.final.unemployment).toBeGreaterThan(0);
        expect(run.final.unemployment).toBeLessThan(1);
        expect(run.final.inflation12m).toBeGreaterThan(-0.05);
        expect(run.final.inflation12m).toBeLessThan(0.3);
        expect(run.final.approval).toBeGreaterThanOrEqual(0);
        expect(run.final.approval).toBeLessThanOrEqual(1);
        expect(run.averages.approval).toBeGreaterThanOrEqual(0);
        expect(run.averages.approval).toBeLessThanOrEqual(1);
      });
    }
  }
});

describe('Estratégias-robô: determinismo (ECONOMIC_MODEL.md §7.7)', () => {
  for (const s of STRATEGIES) {
    it(`${s.id}: mesma semente gera o mesmo resumo`, () => {
      const first = runCampaign(s, 3, PROTOTYPE_MONTHS, content);
      const second = runCampaign(s, 3, PROTOTYPE_MONTHS, content);
      expect(second).toEqual(first);
    });
  }
});

describe('Estratégias-robô: decisões diferentes têm consequências diferentes (GAME_DESIGN.md §11.4)', () => {
  it('inerte e populista fiscal, semente 1: estados finais diferem em ao menos um indicador (> 1e-6)', () => {
    const inerte = runCampaign(strategy('inerte'), 1, PROTOTYPE_MONTHS, content);
    const populista = runCampaign(strategy('populista_fiscal'), 1, PROTOTYPE_MONTHS, content);
    expect(maxIndicatorGap(inerte.final, populista.final)).toBeGreaterThan(1e-6);
  });
});

describe('Estratégias-robô: ações legítimas (GAME_DESIGN.md §4.3 e ECONOMIC_MODEL.md §9)', () => {
  it('a linha de base inerte nunca envia decisões nem responde a eventos', () => {
    for (const seed of SEEDS_SHORT) {
      for (const { input } of playInputs(strategy('inerte'), seed, PROTOTYPE_MONTHS)) {
        expect(input.decisions).toEqual([]);
        expect(input.eventChoices ?? []).toEqual([]);
      }
    }
  });

  for (const s of STRATEGIES) {
    it(`${s.id}: o motor não rejeita nenhuma decisão (orçamento de pontos e andamento, §4.3)`, () => {
      for (const seed of SEEDS_SHORT) {
        const rejected = playInputs(s, seed, PROTOTYPE_MONTHS).reduce((n, step) => n + step.rejected, 0);
        expect(rejected).toBe(0);
      }
    });
  }

  it('nenhuma estratégia envia política fora do cenário', () => {
    const allowed = new Set(content.scenario.policies);
    for (const s of STRATEGIES) {
      for (const { input } of playInputs(s, 2, PROTOTYPE_MONTHS)) {
        for (const d of input.decisions) expect(allowed.has(d.policyId)).toBe(true);
      }
    }
  });
});

describe('Estratégias-robô: campanhas de 48 meses sem explosão (ECONOMIC_MODEL.md §9)', () => {
  for (const s of STRATEGIES) {
    for (const seed of SEEDS_LONG) {
      it(`${s.id}, semente ${seed}, ${LONG_MONTHS} meses: sem violação e sem explosão`, () => {
        const run = runCampaign(s, seed, LONG_MONTHS, content);
        expect(run.violations).toEqual([]);
        expect(numbersAreFinite(run)).toBe(true);
        expect(run.final.inflation12m).toBeLessThan(0.5);
        expect(run.averages.inflation).toBeLessThan(0.5);
        expect(Math.abs(run.grossDebtEnd)).toBeLessThan(3);
      });
    }
  }
});

describe('Estratégias-robô: direção dos efeitos (ECONOMIC_MODEL.md §9, testes de sentido)', () => {
  const mean = (runs: readonly CampaignSummary[], pick: (r: CampaignSummary) => number) =>
    runs.reduce((s, r) => s + pick(r), 0) / runs.length;

  const runsOf = (id: string) => SEEDS_SHORT.map((seed) => runCampaign(strategy(id), seed, PROTOTYPE_MONTHS, content));

  it('austera termina com resultado primário melhor que populista fiscal (médias de 10 sementes)', () => {
    const austera = runsOf('austera');
    const populista = runsOf('populista_fiscal');
    expect(mean(austera, (r) => r.primaryEnd)).toBeGreaterThan(mean(populista, (r) => r.primaryEnd));
  });

  it('populista fiscal tem aprovação média maior que austera (médias de 10 sementes)', () => {
    const austera = runsOf('austera');
    const populista = runsOf('populista_fiscal');
    expect(mean(populista, (r) => r.averages.approval)).toBeGreaterThan(mean(austera, (r) => r.averages.approval));
  });

  it('a linha de base inerte não aprova nenhuma proposta', () => {
    for (const run of runsOf('inerte')) expect(run.approvedProposals).toBe(0);
  });
});

describe('summarizeRuns', () => {
  it('agrupa por estratégia e tira médias', () => {
    const run = (strategyId: string, inflation: number, violations: string[] = []): CampaignSummary => ({
      strategyId,
      seed: 1,
      violations,
      final: { approval: 0.5, gdpGrowth12m: 0.02, inflation12m: inflation, unemployment: 0.08, primaryBalance12m: 0 },
      averages: { inflation, approval: 0.5, unemployment: 0.08 },
      gdpGrowthEnd: 0.02,
      grossDebtEnd: 0.8,
      primaryEnd: 0,
      selicEnd: 0.1,
      approvedProposals: 1,
    });
    const [a, b] = summarizeRuns([run('x', 0.04), run('y', 0.1, ['erro']), run('x', 0.06)]);
    expect(a?.strategyId).toBe('x');
    expect(a?.runs).toBe(2);
    expect(a?.meanInflation).toBeCloseTo(0.05, 12);
    expect(b?.violations).toBe(1);
  });
});
