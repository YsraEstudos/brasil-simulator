import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { advanceMonth } from '@/engine/advanceMonth';
import { partisanMinistries } from '@/engine/congress/cabinet';
import { checkInvariants } from '@/engine/invariants';
import { createInitialState } from '@/engine/state';
import type { GameState, Proposal } from '@/engine/types';

import { STRATEGIES } from './strategies';

// Critério da Fase 04 (ROADMAP.md §2): propor, negociar e acompanhar uma reforma com resultado plausível.
// Reformas por PEC num Congresso que não é do governo (POLITICAL_RULES.md §6): sem negociação passam às vezes,
// com atraso e texto alterado; com cargos e emendas passam quase sempre, mas a coalizão custa.

const content = loadContent(DEFAULT_SCENARIO_ID);
const SEEDS = Array.from({ length: 10 }, (_, i) => i + 1);
const MONTHS = 24;

function play(strategyId: string, seed: number): { state: GameState; violations: string[]; scandals: number } {
  const strategy = STRATEGIES.find((s) => s.id === strategyId);
  if (!strategy) throw new Error(strategyId);
  let state = createInitialState({ content, difficulty: 'estrategica', seed });
  const violations: string[] = [];
  let scandals = 0;
  for (let m = 0; m < MONTHS; m++) {
    const result = advanceMonth(state, strategy.decide(state, content), content);
    violations.push(...checkInvariants(state, result.state, result.report, content));
    expect(result.report.rejected).toEqual([]);
    scandals += result.report.eventsFired.filter((e) => e === 'escandalo_ministerio').length;
    state = result.state;
  }
  return { state, violations, scandals };
}

function reform(state: GameState, policyId: string): Proposal | undefined {
  return state.proposals.find((p) => p.policyId === policyId);
}

const approvedAt = (p: Proposal | undefined) => p?.history.find((h) => h.status === 'aprovada')?.monthIndex;
const postponements = (p: Proposal | undefined) =>
  p?.history.filter((h) => ['pedagio_emendas', 'presidente_nao_pautou'].includes(h.cause)).length ?? 0;

describe('reforma: resultado plausível (critério da Fase 04)', () => {
  const reformista = SEEDS.map((seed) => play('reformista', seed));
  const fisiologica = SEEDS.map((seed) => play('fisiologica', seed));

  it('nenhuma campanha viola invariantes', () => {
    for (const run of [...reformista, ...fisiologica]) expect(run.violations).toEqual([]);
  });

  it('com cargos, emendas e negociação a reforma da previdência passa quase sempre, em 6 a 18 meses', () => {
    const approved = fisiologica
      .map((r) => reform(r.state, 'reforma_previdencia'))
      .filter((p) => approvedAt(p) !== undefined);
    expect(approved.length).toBeGreaterThanOrEqual(0.8 * SEEDS.length);
    for (const p of approved) {
      const months = (approvedAt(p) ?? 0) - (p?.createdMonth ?? 0);
      expect(months).toBeGreaterThanOrEqual(6);
      expect(months).toBeLessThanOrEqual(18);
    }
  });

  it('sem negociação a reforma administrativa passa menos vezes e sofre mais adiamentos', () => {
    const rate = (runs: typeof reformista) =>
      runs.filter((r) => approvedAt(reform(r.state, 'reforma_administrativa')) !== undefined).length;
    expect(rate(reformista)).toBeLessThan(rate(fisiologica));
    expect(rate(reformista)).toBeGreaterThan(0);
    const delays = (runs: typeof reformista) =>
      runs.reduce((s, r) => s + postponements(reform(r.state, 'reforma_administrativa')), 0);
    expect(delays(reformista)).toBeGreaterThan(delays(fisiologica));
  });

  it('a coalizão custa: pastas de bloco, emendas pagas e escândalos', () => {
    const partisan = fisiologica.reduce((s, r) => s + partisanMinistries(r.state, content).length, 0);
    expect(partisan).toBeGreaterThan(0);
    const amendments = fisiologica.filter((r) => r.state.proposals.some((p) => p.negotiation.amendments)).length;
    expect(amendments).toBe(SEEDS.length);
    expect(fisiologica.reduce((s, r) => s + r.scandals, 0)).toBeGreaterThan(0);
    expect(reformista.reduce((s, r) => s + r.scandals, 0)).toBe(0);
  });
});
