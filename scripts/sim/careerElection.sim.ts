import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { advanceMonth } from '@/engine/advanceMonth';
import { checkInvariants } from '@/engine/invariants';
import { createInitialState } from '@/engine/state';
import { PLAYER_CANDIDATE_ID } from '@/engine/career/opponents';
import type { Decision, GameContent } from '@/engine/types';

// Protocolo fixado antes da execução em docs/DIAGNOSTICO_CAMPANHA.md.
const content = loadContent(DEFAULT_SCENARIO_ID);
const actions = ['comicio_nacional', 'mobilizar_militancia', 'caravana_regional'] as const;
type Action = (typeof actions)[number];
type Sequence = readonly [Action, Action, Action];
const sequences: Sequence[] = actions.flatMap((a) => actions.flatMap((b) => actions.map((c): Sequence => [a, b, c])));
const train = Array.from({ length: 20 }, (_, i) => i + 1);
const validation = Array.from({ length: 100 }, (_, i) => i + 101);

function run(sequence: Sequence, seed: number, illicit: boolean, paired = false, source: GameContent = content) {
  let state = createInitialState({ content: source, difficulty: 'estrategica', seed, startPoint: 'corrida' });
  let rejected = 0;
  let violations = 0;
  for (let turn = 0; turn < 3; turn++) {
    const decisions: Decision[] = [{ policyId: sequence[turn], agendaCost: 0, params: { bolso: 'party', uf: 'MG' } }];
    if (illicit && turn === 0) decisions.push({ policyId: 'usar_caixa_dois', agendaCost: 0, params: { valor: 600 } });
    if ((illicit || paired) && turn > 0)
      decisions.push({
        policyId: 'arrecadar_doacoes',
        agendaCost: 0,
        params: { bolso: illicit ? 'illicit' : 'party' },
      });
    const result = advanceMonth(state, { decisions }, source);
    violations += checkInvariants(state, result.state, result.report, source).length;
    rejected += result.report.rejected.length;
    state = result.state;
  }
  const election = state.career!.election!;
  const round = election.first;
  const votes = round.votes[round.candidates.indexOf(PLAYER_CANDIDATE_ID)];
  return {
    share: votes / round.votes.reduce((a, b) => a + b, 0),
    won: election.winner === PLAYER_CANDIDATE_ID,
    rejected,
    violations,
    investigations: state.career!.illicit?.investigations ?? 0,
    spent: state.career!.expandedFinance!.spent,
  };
}
function interval(k: number, n: number): [number, number] {
  const z = 1.96,
    p = k / n,
    d = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / d;
  return [center - half, center + half];
}
function average(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

describe('diagnóstico eleitoral C8', () => {
  it('explora estratégias e valida a escolhida em sementes independentes', () => {
    const ranking = sequences.map((sequence) => ({ sequence, rows: train.map((seed) => run(sequence, seed, false)) }));
    for (const entry of ranking) {
      expect(entry.rows.reduce((n, row) => n + row.violations, 0)).toBe(0);
      expect(entry.rows.reduce((n, row) => n + row.rejected, 0)).toBe(0);
    }
    ranking.sort(
      (a, b) =>
        average(b.rows.map((r) => r.share)) - average(a.rows.map((r) => r.share)) ||
        a.sequence.join(',').localeCompare(b.sequence.join(',')),
    );
    const best = ranking[0].sequence;
    for (const illicit of [false, true]) {
      const rows = validation.map((seed) => run(best, seed, illicit));
      expect(rows.reduce((n, row) => n + row.violations, 0)).toBe(0);
      const won = rows.filter((r) => r.won).length;
      const [lo, hi] = interval(won, rows.length);
      console.log(
        `${illicit ? 'caixa2' : 'limpa'} ${best.join('/')} n=${rows.length} votos=${(average(rows.map((r) => r.share)) * 100).toFixed(2)}% eleitos=${won} IC95%=${(lo * 100).toFixed(1)}–${(hi * 100).toFixed(1)}% gasto=${average(rows.map((r) => r.spent)).toFixed(0)} recusas=${rows.reduce((n, r) => n + r.rejected, 0)} investigacoes=${rows.filter((r) => r.investigations > 0).length}`,
      );
    }
    const pairedSeeds = Array.from({ length: 100 }, (_, i) => i + 201);
    const clean = pairedSeeds.map((seed) => run(best, seed, false, true));
    const illegal = pairedSeeds.map((seed) => run(best, seed, true, true));
    for (let i = 0; i < pairedSeeds.length; i++) {
      expect(clean[i].spent).toBe(illegal[i].spent);
      expect(clean[i].rejected + illegal[i].rejected).toBe(0);
      expect(clean[i].violations + illegal[i].violations).toBe(0);
    }
    for (const [label, rows] of [
      ['limpa pareada', clean],
      ['caixa2 pareado', illegal],
    ] as const) {
      const wins = rows.filter((r) => r.won).length;
      const [lo, hi] = interval(wins, rows.length);
      console.log(
        `${label}: n=${rows.length} votos=${(average(rows.map((r) => r.share)) * 100).toFixed(2)}% eleitos=${wins} IC95%=${(lo * 100).toFixed(1)}–${(hi * 100).toFixed(1)}% gasto=${average(rows.map((r) => r.spent)).toFixed(0)} investigacoes=${rows.filter((r) => r.investigations > 0).length}`,
      );
    }
  });
  it('compara caixa 2 com dotação total controlada em sementes independentes', () => {
    const scenario = content.scenario;
    const career = scenario.career!;
    const finance = career.finance!;
    const illicitContent: GameContent = {
      ...content,
      scenario: {
        ...scenario,
        career: { ...career, finance: { ...finance, initialBalance: finance.initialBalance - 600 } },
      },
    };
    const ranked = sequences.map((sequence) => ({
      sequence,
      rows: train.map((seed) => run(sequence, seed, false, true)),
    }));
    for (const entry of ranked) expect(entry.rows.reduce((n, r) => n + r.rejected + r.violations, 0)).toBe(0);
    ranked.sort(
      (a, b) =>
        average(b.rows.map((r) => r.share)) - average(a.rows.map((r) => r.share)) ||
        a.sequence.join(',').localeCompare(b.sequence.join(',')),
    );
    const best = ranked[0].sequence;
    const sample = Array.from({ length: 200 }, (_, i) => i + 1701);
    const clean = sample.map((seed) => run(best, seed, false, true));
    const illicit = sample.map((seed) => run(best, seed, true, true, illicitContent));
    for (let i = 0; i < sample.length; i++) {
      expect(clean[i].spent).toBe(illicit[i].spent);
      expect(clean[i].rejected + illicit[i].rejected + clean[i].violations + illicit[i].violations).toBe(0);
    }
    for (const [label, rows] of [
      ['limpa', clean],
      ['caixa2', illicit],
    ] as const) {
      const wins = rows.filter((r) => r.won).length;
      const [lo, hi] = interval(wins, rows.length);
      console.log(
        `dotação controlada ${label} ${best.join('/')}: ${wins}/${rows.length} IC95%=${(lo * 100).toFixed(1)}–${(hi * 100).toFixed(1)}% 1t=${(100 * average(rows.map((r) => r.share))).toFixed(2)}% gastos=${average(rows.map((r) => r.spent)).toFixed(0)} mil investigações=${rows.filter((r) => r.investigations > 0).length}`,
      );
    }
  });
});
