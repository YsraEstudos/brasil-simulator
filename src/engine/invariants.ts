import type { GameState, IndicatorKey, MonthReport } from './types';

/** Tolerância numérica para somas de contribuições (indicadores são frações). */
const EPSILON = 1e-9;

/**
 * Invariantes do ECONOMIC_MODEL.md §7 que já se aplicam ao esqueleto (5, 6 e 3). As contábeis (1, 2, 4)
 * entram com o motor econômico na Fase 02. Retorna a lista de violações; vazia = tudo certo.
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
