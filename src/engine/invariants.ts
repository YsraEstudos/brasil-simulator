import { MANDATORY_GROUPS, REVENUE_GROUPS, type GameState, type IndicatorKey, type MonthReport } from './types';

/** Tolerância numérica para somas de contribuições (indicadores são frações). */
const EPSILON = 1e-9;

/**
 * Invariantes do ECONOMIC_MODEL.md §7: 1 e 2 (contas públicas), 3 (contribuições), 4 (limite de despesas com
 * exceções registradas), 5 (valores possíveis) e 6 (finitude). O 7 (determinismo) e o 8 (estado estacionário)
 * são testados nas simulações; o 9 é da Fase 05. Retorna a lista de violações; vazia = tudo certo.
 */
export function checkInvariants(prev: GameState, next: GameState, report: MonthReport): string[] {
  const errors: string[] = [];

  // §7.6: nenhum NaN ou Infinity
  const walk = (value: unknown, path: string) => {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) errors.push(`${path} não é finito: ${value}`);
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
    }
  };
  walk(next, 'state');

  // §7.5: valores fisicamente possíveis
  const { indicators: ind, resources: res } = next;
  if (!(ind.unemployment > 0 && ind.unemployment < 1)) errors.push(`desemprego fora de (0, 1): ${ind.unemployment}`);
  if (!(ind.approval >= 0 && ind.approval <= 1)) errors.push(`aprovação fora de [0, 1]: ${ind.approval}`);
  if (ind.inflation12m <= -1) errors.push(`inflação ≤ −100%: ${ind.inflation12m}`);
  if (!(res.politicalCapital >= 0 && res.politicalCapital <= 100)) {
    errors.push(`capital político fora de [0, 100]: ${res.politicalCapital}`);
  }
  const eco = next.economy;
  if (!(eco.selic >= 0)) errors.push(`Selic negativa: ${eco.selic}`);
  if (!(eco.credibility >= 0 && eco.credibility <= 1)) {
    errors.push(`credibilidade fora de [0, 1]: ${eco.credibility}`);
  }
  if (!(eco.grossDebt > 0)) errors.push(`dívida bruta não positiva: ${eco.grossDebt}`);
  if (!(eco.exchangeRate > 0)) errors.push(`câmbio não positivo: ${eco.exchangeRate}`);
  if (!(eco.priceLevel > 0)) errors.push(`nível de preços não positivo: ${eco.priceLevel}`);
  if (!(eco.potentialIndex > 0)) errors.push(`PIB potencial não positivo: ${eco.potentialIndex}`);
  if (!(eco.riskPremium >= 0)) errors.push(`prêmio de risco negativo: ${eco.riskPremium}`);

  // Contas por grupo fecham com os totais (ECONOMIC_MODEL.md §5.7–5.8)
  const f = eco.fiscal;
  const revenueSum = REVENUE_GROUPS.reduce((s, g) => s + f.revenueByGroup[g], 0);
  if (Math.abs(revenueSum - eco.revenue) > EPSILON) {
    errors.push(`receita por grupo não fecha com a receita total: diferença ${revenueSum - eco.revenue}`);
  }
  const spendingSum =
    MANDATORY_GROUPS.reduce((s, g) => s + f.mandatory[g], 0) +
    f.linked +
    f.policyMandatory +
    f.discretionary +
    f.policyDiscretionary +
    f.exceptions;
  if (Math.abs(spendingSum - eco.primarySpending) > EPSILON) {
    errors.push(`despesa por grupo não fecha com a despesa total: diferença ${spendingSum - eco.primarySpending}`);
  }
  if (f.discretionary < 0) errors.push(`discricionárias negativas: ${f.discretionary}`);

  // §7.4: despesa sujeita ao limite ≤ limite + estouro registrado como exceção
  const overLimit = eco.primarySpending - f.exceptions - f.spendingLimit - f.limitExcess;
  if (overLimit > EPSILON) errors.push(`despesa acima do limite sem registro: ${overLimit}`);

  // §7.1: resultado primário do mês = receita − despesa
  const primaryGap = eco.monthlyPrimary - (eco.revenue - eco.primarySpending);
  if (Math.abs(primaryGap) > EPSILON) {
    errors.push(`resultado primário do mês ≠ receita − despesa: diferença ${primaryGap}`);
  }

  // §7.2: dívida = dívida anterior + (juros − primário)/12 + ajuste do denominador
  // (só quando a economia foi processada no mês; testes com etapas parciais devolvem o mesmo objeto)
  if (prev.economy && next.economy !== prev.economy) {
    const debtGap =
      eco.grossDebt - prev.economy.grossDebt - ((eco.interest - eco.monthlyPrimary) / 12 + eco.debtAdjustment);
    if (Math.abs(debtGap) > EPSILON) {
      errors.push(`dívida bruta não fecha com juros, primário e ajuste: diferença ${debtGap}`);
    }
  }

  // Tempo anda exatamente um mês
  if (next.monthIndex !== prev.monthIndex + 1)
    errors.push(`mês não avançou 1: ${prev.monthIndex} → ${next.monthIndex}`);

  // §7.3: soma das contribuições = variação total de cada indicador
  for (const key of Object.keys(ind) as IndicatorKey[]) {
    const delta = next.indicators[key] - prev.indicators[key];
    const explained = report.contributions.filter((c) => c.indicator === key).reduce((s, c) => s + c.delta, 0);
    if (Math.abs(delta - explained) > EPSILON) {
      errors.push(`${key}: variação ${delta} ≠ soma das contribuições ${explained}`);
    }
  }

  return errors;
}
