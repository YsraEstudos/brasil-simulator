import { describe, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { advanceMonth } from '@/engine/advanceMonth';
import { checkInvariants } from '@/engine/invariants';
import { campaignOutcome } from '@/engine/events/outcome';
import { impeachmentPressure } from '@/engine/events/pressure';
import { STRATEGIES, type Strategy } from '@/engine/sim/strategies';
import { createInitialState } from '@/engine/state';
import type { GameContent, GameState } from '@/engine/types';

// FASE_07.md, tarefa T8: varredura de eventos, notícias e impeachment (`npm run sim:events`).
// Script de diagnóstico: usa console.log por ser um relatório, não código do motor. Não é um teste de regra; as
// regras ficam em src/engine/sim/phase07.test.ts.

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const MONTHS = 48;
const CHAIN_MONTHS = 240;

/** Limiares de pressão usados nos eventos de impeachment (fase07_inst_*.json). */
const PRESSURE_THRESHOLDS = [0.5, 0.55, 0.6] as const;

interface Track {
  strategyId: string;
  seed: number;
  months: number;
  violations: number;
  eventTypes: Set<string>;
  fase07Types: Set<string>;
  chainedArrivals: Map<string, number>;
  newsById: Map<string, { kind: string; cause: string }>;
  flagFirstMonth: Record<string, number>;
  pressureSum: number;
  pressureMax: number;
  pressureMaxMonth: number;
  monthsAbove: Record<string, number>;
  condemnedAt: number | null;
  finalFlags: string[];
}

function track(strategy: Strategy, seed: number, months: number, content: GameContent): Track {
  const chainedIds = new Set(content.events.filter((e) => e.chainedOnly).map((e) => e.id));
  let state: GameState = createInitialState({ content, difficulty: 'estrategica', seed });
  const t: Track = {
    strategyId: strategy.id,
    seed,
    months,
    violations: 0,
    eventTypes: new Set(),
    fase07Types: new Set(),
    chainedArrivals: new Map(),
    newsById: new Map(),
    flagFirstMonth: {},
    pressureSum: 0,
    pressureMax: 0,
    pressureMaxMonth: -1,
    monthsAbove: Object.fromEntries(PRESSURE_THRESHOLDS.map((p) => [String(p), 0])),
    condemnedAt: null,
    finalFlags: [],
  };
  for (let m = 0; m < months; m++) {
    const result = advanceMonth(state, strategy.decide(state, content), content);
    t.violations += checkInvariants(state, result.state, result.report, content).length;
    for (const id of result.report.eventsFired) {
      t.eventTypes.add(id);
      if (id.startsWith('fase07_')) t.fase07Types.add(id);
      if (chainedIds.has(id)) t.chainedArrivals.set(id, (t.chainedArrivals.get(id) ?? 0) + 1);
    }
    for (const item of result.state.events.news) {
      if (!t.newsById.has(item.id)) t.newsById.set(item.id, { kind: item.kind, cause: item.cause });
    }
    for (const [flag, month] of Object.entries(result.state.events.flags)) {
      if (!(flag in t.flagFirstMonth)) t.flagFirstMonth[flag] = month;
    }
    const p = impeachmentPressure(result.state, content);
    t.pressureSum += p;
    t.pressureMax = Math.max(t.pressureMax, p);
    if (p === t.pressureMax) t.pressureMaxMonth = result.state.monthIndex;
    for (const th of PRESSURE_THRESHOLDS) if (p > th) t.monthsAbove[String(th)] += 1;
    state = result.state;
    if (campaignOutcome(state) === 'impeachment') {
      t.condemnedAt = state.monthIndex;
      break;
    }
  }
  t.finalFlags = Object.keys(state.events.flags).sort();
  return t;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

describe('sim:events (FASE_07, T8)', () => {
  it('varredura de 48 meses, todas as estratégias × 20 sementes', () => {
    const content = loadContent(DEFAULT_SCENARIO_ID);
    const lines: string[] = [];
    const all: Track[] = [];
    for (const s of STRATEGIES) {
      const runs = SEEDS.map((seed) => track(s, seed, MONTHS, content));
      all.push(...runs);
      const meanPressure = runs.reduce((a, r) => a + r.pressureSum / r.months, 0) / runs.length;
      const maxPressure = Math.max(...runs.map((r) => r.pressureMax));
      const condemned = runs.filter((r) => r.condemnedAt !== null).length;
      const denounced = runs.filter((r) => 'impeachment_denuncia_aceita' in r.flagFirstMonth).length;
      const authorized = runs.filter((r) => 'impeachment_autorizado' in r.flagFirstMonth).length;
      const cpi = runs.filter((r) => 'cpi_instalada' in r.flagFirstMonth).length;
      const types = new Set(runs.flatMap((r) => [...r.eventTypes])).size;
      const violations = runs.reduce((a, r) => a + r.violations, 0);
      lines.push(
        `${s.id}: violações ${violations}, tipos de evento ${types}, pressão média ${pct(meanPressure)}, pressão máx. ${pct(maxPressure)}, ` +
          `denúncia aceita ${denounced}/20, autorizado ${authorized}/20, CPI ${cpi}/20, condenado ${condemned}/20`,
      );
    }
    const newsKinds = new Set(all.flatMap((r) => [...r.newsById.values()].map((n) => n.kind)));
    const unionTypes = new Set(all.flatMap((r) => [...r.eventTypes]));
    const unionFase07 = new Set(all.flatMap((r) => [...r.fase07Types]));
    lines.push(
      `união: tipos de evento ${unionTypes.size}, tipos fase07_ ${unionFase07.size}, kinds de notícia ${[...newsKinds].join(', ')}`,
    );
    console.log(lines.join('\n'));
  });

  it('240 meses, todas as estratégias × 20 sementes: encadeados, condenação e violações', () => {
    const content = loadContent(DEFAULT_SCENARIO_ID);
    const lines: string[] = [];
    for (const s of STRATEGIES) {
      const runs = SEEDS.map((seed) => track(s, seed, CHAIN_MONTHS, content));
      const condemned = runs.filter((r) => r.condemnedAt !== null).map((r) => r.condemnedAt as number);
      const distinctChained = runs.map((r) => r.chainedArrivals.size);
      const violations = runs.reduce((a, r) => a + r.violations, 0);
      const meanChained = distinctChained.reduce((a, b) => a + b, 0) / runs.length;
      const firstCondemned = condemned.length > 0 ? Math.min(...condemned) : '-';
      const maxPressure = Math.max(...runs.map((r) => r.pressureMax));
      lines.push(
        `${s.id}: condenado ${condemned.length}/20 (primeiro mês ${firstCondemned}), encadeados distintos por campanha (média) ${meanChained.toFixed(1)}, pressão máx. ${pct(maxPressure)}, violações ${violations}`,
      );
    }
    console.log(lines.join('\n'));
  });
});
