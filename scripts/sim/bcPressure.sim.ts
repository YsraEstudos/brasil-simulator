import { expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { advanceMonth, createInitialState, PRESSURE_ACTION_ID, type GameState } from '@/engine';

/**
 * Análise da ação "Pressionar o Banco Central" (PLANO_CAMPANHA.md Fase C6f). Para cada ano dos dois mandatos, a
 * mesma partida (sem decisões) segue com e sem uma pressão no 2º mês do ano; mede o corte que o Copom deu na
 * reunião seguinte por causa da pressão, a credibilidade e o prêmio de risco no mês, e a inflação e a Selic 12 meses
 * depois. Saída em JSON no console; o resumo vai para docs/ECONOMIC_MODEL.md §5.4.2.
 */

const content = loadContent(DEFAULT_SCENARIO_ID);
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const PRESS = [{ policyId: PRESSURE_ACTION_ID, agendaCost: 1 }];

function run(state: GameState, months: number, firstDecisions: typeof PRESS | []) {
  let s = state;
  let cut = 0;
  for (let i = 0; i < months; i++) {
    const out = advanceMonth(s, { decisions: i === 0 ? firstDecisions : [] }, content);
    expect(out.report.rejected).toEqual([]);
    cut += out.report.copom?.pressureCut ?? 0;
    s = out.state;
  }
  return { state: s, cut };
}

it('efeito provável da pressão sobre o BC por ano de mandato', () => {
  const rows: Record<string, number | string>[] = [];
  for (const startMonth of [1, 13, 25, 37, 49, 61, 73, 85]) {
    const byYear = SEEDS.map((seed) => {
      let s = createInitialState({ content, difficulty: 'estrategica', seed });
      for (let m = 0; m < startMonth; m++) s = advanceMonth(s, { decisions: [] }, content).state;
      const pressed = run(s, 12, PRESS);
      const quiet = run(s, 12, []);
      const firstPressed = advanceMonth(s, { decisions: PRESS }, content).state;
      const firstQuiet = advanceMonth(s, { decisions: [] }, content).state;
      return {
        cutBp: pressed.cut * 10000,
        credibility: firstPressed.economy.credibility - firstQuiet.economy.credibility,
        riskBp: (firstPressed.economy.riskPremium - firstQuiet.economy.riskPremium) * 10000,
        inflation12mPp: (pressed.state.indicators.inflation12m - quiet.state.indicators.inflation12m) * 100,
        selic12mBp: (pressed.state.economy.selic - quiet.state.economy.selic) * 10000,
      };
    });
    const mean = (k: keyof (typeof byYear)[number]) => byYear.reduce((n, r) => n + r[k], 0) / byYear.length;
    rows.push({
      ano: Math.floor(startMonth / 12) + 1,
      corte_bp_medio: mean('cutBp'),
      corte_bp_min: Math.min(...byYear.map((r) => r.cutBp)),
      corte_bp_max: Math.max(...byYear.map((r) => r.cutBp)),
      credibilidade: mean('credibility'),
      premio_bp: mean('riskBp'),
      inflacao_12m_pp: mean('inflation12mPp'),
      selic_12m_bp: mean('selic12mBp'),
    });
  }
  console.log(JSON.stringify(rows, null, 1));
});
