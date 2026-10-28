import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { advanceMonth } from '@/engine/advanceMonth';
import { careerDefeated, careerSchedule } from '@/engine/career';
import { checkInvariants } from '@/engine/invariants';
import { createInitialState } from '@/engine/state';
import type { Decision } from '@/engine/types';

// PLANO_CAMPANHA.md Fase C3: protocolo e métricas registrados antes de rodar.
const content = loadContent(DEFAULT_SCENARIO_ID);
const turns = careerSchedule(content, 'corrida').length;
const seeds = Array.from({ length: 20 }, (_, index) => index + 1);
type Strategy = 'inerte' | 'limpa' | 'limpa_divida' | 'caixa2';

function simulate(strategy: Strategy, seed: number) {
  let state = createInitialState({ content, difficulty: 'estrategica', seed, startPoint: 'corrida' });
  let rejected = 0;
  let violations = 0;
  for (let turn = 0; turn < turns; turn++) {
    const decisions: Decision[] = [];
    if (strategy !== 'inerte' && state.career?.stage !== 'transicao') {
      const pocket = strategy === 'caixa2' && turn > 0 ? 'illicit' : 'party';
      decisions.push({
        policyId: 'arrecadar_doacoes',
        agendaCost: 0,
        params: { bolso: pocket, ...(strategy === 'limpa_divida' ? { divida: 'integral' } : {}) },
      });
      if (strategy === 'caixa2') decisions.push({ policyId: 'usar_caixa_dois', agendaCost: 0, params: { valor: 500 } });
    }
    const result = advanceMonth(state, { decisions }, content);
    violations += checkInvariants(state, result.state, result.report, content).length;
    rejected += result.report.rejected.length;
    state = result.state;
    if (careerDefeated(state)) break;
  }
  const finance = state.career!.expandedFinance!;
  const official = Object.values(finance.closure?.remaining ?? finance.pockets).reduce((a, b) => a + b, 0);
  const illicitState = state.career!.illicit;
  const illicit = illicitState?.closedBalance ?? illicitState?.balance ?? 0;
  const debt = finance.closure?.debt ?? finance.debt;
  return {
    defeated: careerDefeated(state),
    official,
    illicit,
    debt,
    pending:
      finance.scheduled.reduce((total, receipt) => total + receipt.amount, 0) +
      (illicitState?.pending.reduce((total, receipt) => total + receipt.amount, 0) ?? 0),
    net: official + illicit + finance.personalAvailable - debt,
    investigations: state.career!.illicit?.investigations ?? 0,
    rejected,
    violations,
  };
}

function wilson(successes: number, n: number): [number, number] {
  const z = 1.96;
  const proportion = successes / n;
  const denominator = 1 + (z * z) / n;
  const midpoint = (proportion + (z * z) / (2 * n)) / denominator;
  const half = (z * Math.sqrt((proportion * (1 - proportion) + (z * z) / (4 * n)) / n)) / denominator;
  return [midpoint - half, midpoint + half];
}

describe('diagnóstico financeiro de carreira', () => {
  it('preserva invariantes e determinismo em 20 sementes por estratégia', () => {
    for (const strategy of ['inerte', 'limpa', 'limpa_divida', 'caixa2'] as const) {
      const rows = seeds.map((seed) => simulate(strategy, seed));
      expect(rows).toEqual(seeds.map((seed) => simulate(strategy, seed)));
      expect(rows.reduce((total, row) => total + row.violations, 0)).toBe(0);
      const investigated = rows.filter((row) => row.investigations > 0).length;
      const interval = wilson(investigated, rows.length);
      const mean = (key: 'official' | 'illicit' | 'debt' | 'rejected' | 'net') =>
        rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
      console.log(
        `${strategy}: n=${rows.length}, derrotas=${rows.filter((row) => row.defeated).length}, líquido médio=${mean('net')} mil, saldo oficial médio=${mean('official')} mil, caixa 2 médio=${mean('illicit')} mil, dívida média=${mean('debt')} mil, recusas médias=${mean('rejected')}, investigação=${investigated}/${rows.length} IC95%=[${(interval[0] * 100).toFixed(1)}%, ${(interval[1] * 100).toFixed(1)}%]`,
      );
      for (const defeated of [true, false]) {
        const group = rows.filter((row) => row.defeated === defeated);
        if (group.length)
          console.log(
            `${strategy} ${defeated ? 'derrota: saldo aberto' : 'posse: contas encerradas'} n=${group.length} líquido médio=${(group.reduce((n, r) => n + r.net, 0) / group.length).toFixed(0)} mil parcelas pendentes=${group.reduce((n, r) => n + r.pending, 0)} mil`,
          );
      }
    }
  });
});
