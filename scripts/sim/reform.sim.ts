import { describe, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { advanceMonth } from '@/engine/advanceMonth';
import { partisanMinistries } from '@/engine/congress/cabinet';
import { createInitialState } from '@/engine/state';
import { STRATEGIES } from '@/engine/sim/strategies';
import type { GameState } from '@/engine/types';

// ROADMAP.md §7, Fase 04: "propor, negociar e acompanhar uma reforma com resultado plausível".
// Script de diagnóstico (`npm run sim:reform`): usa console.log por ser um relatório, não código do motor.

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const MONTHS = 36;
const REFORMS = ['reforma_previdencia', 'reforma_administrativa'];

interface Outcome {
  approved: boolean;
  months: number | null;
  scale: number;
  postponements: number;
}

function outcome(state: GameState, policyId: string): Outcome | null {
  const p = state.proposals.find((x) => x.policyId === policyId);
  if (!p) return null;
  const approvedAt = p.history.find((h) => h.status === 'aprovada')?.monthIndex;
  return {
    approved: approvedAt !== undefined,
    months: approvedAt === undefined ? null : approvedAt - p.createdMonth,
    scale: p.scale,
    postponements: p.history.filter((h) => ['pedagio_emendas', 'presidente_nao_pautou'].includes(h.cause)).length,
  };
}

describe('reformas: plausibilidade (Fase 04)', () => {
  it('relatório', () => {
    const content = loadContent(DEFAULT_SCENARIO_ID);
    const lines: string[] = [];
    for (const id of ['reformista', 'fisiologica']) {
      const strategy = STRATEGIES.find((s) => s.id === id);
      if (!strategy) continue;
      const outcomes: Record<string, Outcome[]> = Object.fromEntries(REFORMS.map((r) => [r, []]));
      let partisan = 0;
      let scandals = 0;
      let approval = 0;
      for (const seed of SEEDS) {
        let state = createInitialState({ content, difficulty: 'estrategica', seed });
        for (let m = 0; m < MONTHS; m++) {
          const result = advanceMonth(state, strategy.decide(state, content), content);
          scandals += result.report.eventsFired.filter((e) => e === 'escandalo_ministerio').length;
          state = result.state;
        }
        for (const r of REFORMS) {
          const o = outcome(state, r);
          if (o) outcomes[r]?.push(o);
        }
        partisan += partisanMinistries(state, content).length;
        approval += state.indicators.approval;
      }
      lines.push(
        `${id}: pastas de bloco ${(partisan / SEEDS.length).toFixed(1)}, escândalos ${scandals}, aprovação final ${((approval / SEEDS.length) * 100).toFixed(1)}%`,
      );
      for (const r of REFORMS) {
        const list = outcomes[r] ?? [];
        const ok = list.filter((o) => o.approved);
        const meanMonths = ok.reduce((s, o) => s + (o.months ?? 0), 0) / Math.max(1, ok.length);
        const meanScale = ok.reduce((s, o) => s + o.scale, 0) / Math.max(1, ok.length);
        const post = list.reduce((s, o) => s + o.postponements, 0) / Math.max(1, list.length);
        lines.push(
          `  ${r}: enviada ${list.length}/${SEEDS.length}, aprovada ${ok.length}, meses até aprovar ${meanMonths.toFixed(1)}, texto ${(meanScale * 100).toFixed(0)}%, adiamentos ${post.toFixed(1)}`,
        );
      }
    }
    console.log(lines.join('\n'));
  });
});
