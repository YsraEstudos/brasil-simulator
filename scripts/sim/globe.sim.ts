import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { advanceMonth, createInitialState, populationShares, regionsOf, DIRECTIVE_ACTION_ID } from '@/engine';
import { checkInvariants } from '@/engine/invariants';
import { climateParam } from '@/engine/climate/calibration';
import { preventionOf } from '@/engine/climate/effects';
import { STRATEGIES, type Strategy } from '@/engine/sim/strategies';

const SEEDS = [1, 2, 3, 4, 5, 17, 2027];
// Guarda de estabilidade, não teto legal nem clamp do motor. Mesmo limite de 300% usado por economy.test.ts.
const DEBT_CEILING = 3;
const PREVENTION: Strategy = {
  id: 'defesa_civil',
  name: 'Defesa Civil',
  decide(state) {
    return {
      decisions:
        state.monthIndex % 12 === 0
          ? [
              {
                policyId: DIRECTIVE_ACTION_ID,
                agendaCost: 1,
                params: { ministryId: 'cidades', policyId: 'rotina_defesa_civil', annualMillions: 2000 },
              },
            ]
          : [],
    };
  },
};
const STYLES = [...STRATEGIES, PREVENTION];

describe('Globo PR 14: campanhas longas, fora do check', () => {
  for (const months of [48, 96, 240]) {
    it(`${months} meses × ${SEEDS.length} sementes × ${STYLES.length} estilos`, () => {
      const content = loadContent(DEFAULT_SCENARIO_ID);
      const ufs = regionsOf(content);
      const weights = populationShares(ufs);
      let elections = 0;
      let preventionMonths = 0;
      let maxDebt = 0;
      const failures: string[] = [];
      for (const strategy of STYLES)
        for (const seed of SEEDS) {
          let state = createInitialState({ content, seed, difficulty: 'estrategica' });
          for (let m = 0; m < months; m++) {
            const result = advanceMonth(state, strategy.decide(state, content), content);
            const next = result.state;
            const errors = checkInvariants(state, next, result.report, content);
            const meanApproval = next.regions.ufs.reduce((sum, u, i) => sum + weights[i] * u.approval, 0);
            if (Math.abs(meanApproval - next.indicators.approval) > 1e-9) errors.push('aprovação regional ≠ nacional');
            const prevention = preventionOf(state.impulses, state.monthIndex, ufs);
            for (const value of [...prevention.drought, ...prevention.flood]) {
              if (!(value >= 0 && value <= climateParam('prevencao_teto')))
                errors.push(`prevenção fora do limite: ${value}`);
            }
            if ([...prevention.drought, ...prevention.flood].some((v) => v > 0)) preventionMonths++;
            for (const c of next.climate.ufs) {
              if (Math.abs(c.rain) > climateParam('chuva_anomalia_max') + 1e-9)
                errors.push(`${c.id}: chuva fora do limite`);
            }
            maxDebt = Math.max(maxDebt, next.economy.grossDebt);
            if (!(next.economy.grossDebt < DEBT_CEILING))
              errors.push(`dívida ≥ ${DEBT_CEILING}: ${next.economy.grossDebt}`);
            if (result.report.electionResult) {
              elections++;
              for (const round of result.report.electionResult.rounds) {
                const total = Object.entries(round.ufs).reduce(
                  (sum, [id, vote]) => sum + result.report.electionResult!.weights[id] * vote,
                  0,
                );
                if (Math.abs(total - round.national) > 1e-9) errors.push('resultado regional ≠ nacional');
              }
            }
            if (errors.length && failures.length < 30)
              failures.push(`${strategy.id}, seed ${seed}, mês ${m + 1}: ${errors.join('; ')}`);
            state = next;
          }
        }
      console.log(
        JSON.stringify(
          {
            months,
            seeds: SEEDS,
            styles: STYLES.length,
            simulatedMonths: months * SEEDS.length * STYLES.length,
            elections,
            preventionMonths,
            maxDebt,
            failures,
          },
          null,
          2,
        ),
      );
      expect(elections).toBeGreaterThan(0);
      expect(preventionMonths).toBeGreaterThan(0);
      expect(failures).toEqual([]);
    });
  }
});
