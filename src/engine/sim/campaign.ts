import { advanceMonth } from '../advanceMonth';
import { checkInvariants } from '../invariants';
import { createInitialState } from '../state';
import type { Difficulty, GameContent, Indicators } from '../types';

import type { Strategy } from './strategies';

/**
 * Campanha automática: uma estratégia joga `months` meses com uma semente (ECONOMIC_MODEL.md §9).
 * Função pura e determinística: mesma entrada → mesmo resumo.
 */
export interface CampaignSummary {
  strategyId: string;
  seed: number;
  /** Violações de invariantes (ECONOMIC_MODEL.md §7), com o mês em que ocorreram. Vazio = tudo certo. */
  violations: string[];
  /** Indicadores ao fim da campanha. */
  final: Indicators;
  /** Médias mensais, calculadas ao fim de cada mês jogado. */
  averages: { inflation: number; approval: number; unemployment: number };
  gdpGrowthEnd: number;
  /** Dívida bruta / PIB ao fim da campanha (fração). */
  grossDebtEnd: number;
  /** Resultado primário acumulado em 12 meses ao fim da campanha (fração do PIB). */
  primaryEnd: number;
  /** Selic meta ao fim da campanha. */
  selicEnd: number;
  /** Propostas que chegaram ao status `aprovada` em algum momento da campanha. */
  approvedProposals: number;
  /** Crescimento real acumulado do PIB na campanha (Y final ÷ Y inicial − 1). */
  cumulativeGrowth: number;
  /** Máximos ao longo da campanha (detecção de explosões, ECONOMIC_MODEL.md §9). */
  max: { inflation: number; grossDebt: number; selic: number; riskPremium: number };
  /** Meses com despesa acima do limite (estouro registrado) e com discricionárias abaixo do piso. */
  monthsOverLimit: number;
  monthsBelowFloor: number;
  /** Câmbio R$/US$ e prêmio de risco ao fim. */
  exchangeRateEnd: number;
  riskPremiumEnd: number;
  /** Tamanho da fila de impulsos ao fim (deve ficar limitado, ECONOMIC_MODEL.md §5.11). */
  impulsesEnd: number;
}

export function runCampaign(
  strategy: Strategy,
  seed: number,
  months: number,
  content: GameContent,
  difficulty: Difficulty = 'estrategica',
): CampaignSummary {
  if (!Number.isInteger(months) || months < 1) throw new RangeError(`meses inválidos: ${months}`);

  let state = createInitialState({ content, difficulty, seed });
  const start = state.economy;
  const violations: string[] = [];
  let inflationSum = 0;
  let approvalSum = 0;
  let unemploymentSum = 0;
  const max = { inflation: -Infinity, grossDebt: -Infinity, selic: -Infinity, riskPremium: -Infinity };
  let monthsOverLimit = 0;
  let monthsBelowFloor = 0;

  for (let m = 0; m < months; m++) {
    const input = strategy.decide(state, content);
    const result = advanceMonth(state, input, content);
    for (const error of checkInvariants(state, result.state, result.report)) {
      violations.push(`mês ${state.monthIndex}: ${error}`);
    }
    state = result.state;
    inflationSum += state.indicators.inflation12m;
    approvalSum += state.indicators.approval;
    unemploymentSum += state.indicators.unemployment;
    const e = state.economy;
    max.inflation = Math.max(max.inflation, state.indicators.inflation12m);
    max.grossDebt = Math.max(max.grossDebt, e.grossDebt);
    max.selic = Math.max(max.selic, e.selic);
    max.riskPremium = Math.max(max.riskPremium, e.riskPremium);
    if (e.fiscal.limitExcess > 0) monthsOverLimit += 1;
    if (e.fiscal.discretionary < content.calibration.piso_custeio) monthsBelowFloor += 1;
  }
  const end = state.economy;

  return {
    strategyId: strategy.id,
    seed,
    violations,
    final: { ...state.indicators },
    averages: {
      inflation: inflationSum / months,
      approval: approvalSum / months,
      unemployment: unemploymentSum / months,
    },
    gdpGrowthEnd: state.indicators.gdpGrowth12m,
    grossDebtEnd: state.economy.grossDebt,
    primaryEnd: state.indicators.primaryBalance12m,
    selicEnd: state.economy.selic,
    approvedProposals: state.proposals.filter((p) => p.history.some((t) => t.status === 'aprovada')).length,
    cumulativeGrowth:
      (end.potentialIndex * Math.exp(end.outputGap)) / (start.potentialIndex * Math.exp(start.outputGap)) - 1,
    max,
    monthsOverLimit,
    monthsBelowFloor,
    exchangeRateEnd: end.exchangeRate,
    riskPremiumEnd: end.riskPremium,
    impulsesEnd: state.impulses.length,
  };
}

/** Médias por estratégia, sobre todas as campanhas dela. */
export interface StrategySummary {
  strategyId: string;
  runs: number;
  /** Total de violações de invariantes em todas as campanhas. */
  violations: number;
  meanInflation: number;
  meanApproval: number;
  meanUnemployment: number;
  meanGdpGrowthEnd: number;
  meanGrossDebtEnd: number;
  meanPrimaryEnd: number;
  meanSelicEnd: number;
  meanApprovedProposals: number;
  meanCumulativeGrowth: number;
  /** Maiores valores entre todas as campanhas da estratégia. */
  worstInflation: number;
  worstGrossDebt: number;
  meanMonthsOverLimit: number;
  meanMonthsBelowFloor: number;
  meanRiskPremiumEnd: number;
}

/** Agrupa as campanhas por estratégia (na ordem da primeira aparição) e tira as médias. */
export function summarizeRuns(runs: readonly CampaignSummary[]): StrategySummary[] {
  const groups = new Map<string, CampaignSummary[]>();
  for (const run of runs) {
    const group = groups.get(run.strategyId);
    if (group) group.push(run);
    else groups.set(run.strategyId, [run]);
  }

  const mean = (values: readonly number[]) => values.reduce((s, v) => s + v, 0) / values.length;

  return [...groups].map(([strategyId, group]) => ({
    strategyId,
    runs: group.length,
    violations: group.reduce((s, r) => s + r.violations.length, 0),
    meanInflation: mean(group.map((r) => r.averages.inflation)),
    meanApproval: mean(group.map((r) => r.averages.approval)),
    meanUnemployment: mean(group.map((r) => r.averages.unemployment)),
    meanGdpGrowthEnd: mean(group.map((r) => r.gdpGrowthEnd)),
    meanGrossDebtEnd: mean(group.map((r) => r.grossDebtEnd)),
    meanPrimaryEnd: mean(group.map((r) => r.primaryEnd)),
    meanSelicEnd: mean(group.map((r) => r.selicEnd)),
    meanApprovedProposals: mean(group.map((r) => r.approvedProposals)),
    meanCumulativeGrowth: mean(group.map((r) => r.cumulativeGrowth)),
    worstInflation: Math.max(...group.map((r) => r.max.inflation)),
    worstGrossDebt: Math.max(...group.map((r) => r.max.grossDebt)),
    meanMonthsOverLimit: mean(group.map((r) => r.monthsOverLimit)),
    meanMonthsBelowFloor: mean(group.map((r) => r.monthsBelowFloor)),
    meanRiskPremiumEnd: mean(group.map((r) => r.riskPremiumEnd)),
  }));
}
