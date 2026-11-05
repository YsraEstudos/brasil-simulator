import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { advanceMonth } from '@/engine/advanceMonth';
import { STRATEGIES } from '@/engine/sim/strategies';
import { createInitialState } from '@/engine/state';
import { REVENUE_GROUPS, type GameContent, type GameState, type ScheduledImpulse } from '@/engine/types';

// PLANO_SAVES_HISTORICO.md H8 (C7): `FiscalState.revenueLossByGroup` guarda a perda de arrecadação por base, na
// mesma conta que já somava o total. O campo é só de leitura para a interface: nenhum resultado pode mudar.

const content: GameContent = loadContent(DEFAULT_SCENARIO_ID);
const MONTHS = 48;

function permanent(target: ScheduledImpulse['target'], delta: number): ScheduledImpulse {
  return { sourceId: `teste:${target}`, label: target, target, delta, startMonth: 0, endMonth: null };
}

/** Carga extra grande na renda e no consumo: garante perda de arrecadação desde o primeiro mês. */
const HEAVY_LOAD: ScheduledImpulse[] = [permanent('receita.renda', 0.03), permanent('receita.consumo', 0.02)];

/** FNV-1a de 32 bits sobre o texto: impressão digital estável do estado. */
function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Estado sem o campo novo: o que existia antes da H8 e não pode mudar. */
function withoutNewField(state: GameState): unknown {
  const fiscal: Record<string, unknown> = { ...state.economy.fiscal };
  delete fiscal.revenueLossByGroup;
  return { ...state, economy: { ...state.economy, fiscal } };
}

interface Run {
  /** Impressão digital da série inteira (estado de cada um dos 48 meses, sem o campo novo). */
  series: string;
  states: GameState[];
}

function run(strategyId: string, seed: number, impulses: ScheduledImpulse[]): Run {
  const strategy = STRATEGIES.find((s) => s.id === strategyId);
  if (!strategy) throw new Error(`estratégia desconhecida: ${strategyId}`);
  const start = createInitialState({ content, difficulty: 'estrategica', seed });
  let state: GameState = { ...start, impulses: [...start.impulses, ...impulses] };
  const states: GameState[] = [];
  const parts: string[] = [];
  for (let m = 0; m < MONTHS; m++) {
    state = advanceMonth(state, strategy.decide(state, content), content).state;
    states.push(state);
    parts.push(fingerprint(JSON.stringify(withoutNewField(state))));
  }
  return { series: fingerprint(parts.join('|')), states };
}

// Valores gravados ANTES de o campo existir (commit-base da H8). Se mudarem, a mudança no motor alterou resultado.
const GOLDEN: { strategy: string; seed: number; heavy: boolean; series: string }[] = [
  { strategy: 'inerte', seed: 1, heavy: false, series: '8d456c7c' },
  { strategy: 'populista_fiscal', seed: 2, heavy: true, series: 'a500d39c' },
  { strategy: 'austera', seed: 3, heavy: true, series: '83ae36da' },
];

describe('perda de arrecadação por base (PLANO_SAVES_HISTORICO.md H8, C7)', () => {
  for (const g of GOLDEN) {
    it(`${g.strategy}, semente ${g.seed}${g.heavy ? ', carga pesada' : ''}: série de ${MONTHS} meses igual à gravada`, () => {
      const r = run(g.strategy, g.seed, g.heavy ? HEAVY_LOAD : []);
      expect(r.series).toBe(g.series);
    });
  }

  it('a soma por base é igual ao total em todos os meses', () => {
    const r = run('populista_fiscal', 2, HEAVY_LOAD);
    let positive = 0;
    for (const s of r.states) {
      const f = s.economy.fiscal;
      const byGroup = f.revenueLossByGroup;
      expect(byGroup).toBeDefined();
      if (!byGroup) continue;
      const sum = REVENUE_GROUPS.reduce((acc, k) => acc + byGroup[k], 0);
      expect(sum).toBeCloseTo(f.revenueLoss, 14);
      for (const k of REVENUE_GROUPS) expect(byGroup[k]).toBeGreaterThanOrEqual(0);
      expect(byGroup.royalties).toBe(0);
      if (f.revenueLoss > 0) positive++;
    }
    expect(positive).toBeGreaterThan(0);
  });

  it('sem carga extra, a perda por base é zero e o estado inicial já traz o campo', () => {
    const start = createInitialState({ content, difficulty: 'estrategica', seed: 1 });
    expect(start.economy.fiscal.revenueLossByGroup).toEqual(Object.fromEntries(REVENUE_GROUPS.map((k) => [k, 0])));
  });
});
