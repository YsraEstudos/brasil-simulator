import type { Policy } from '../../types/policy';
import { RELIEF_CHANNELS, REVENUE_CHANNELS } from '../policyChannels';
import { IMPULSE_TARGET } from '../proposals/proposals';
import { DEFAULT_SOCIETY_CALIBRATION, SOCIETY_QUINTILE_IDS, quintileIncomeEffect } from '../society';
import type { SocietyQuintileId } from '../society';
import { currentNominalGdpMillions } from '../state';
import type { GameContent, GameState } from '../types';

/**
 * Estimativa distributiva de uma mudança tributária (PLANO_EXPANSAO EX-12; SOCIETY.md). Função pura, lida antes de
 * propor: usa os mesmos vetores de incidência por quintil que o motor social aplica aos impulsos de receita
 * (`quintileIncomeEffect`), então a estimativa e o resultado não divergem por construção. Continua sendo
 * estimativa: não há microdados de domicílios, e o ciclo, a perda de arrecadação e a capacidade de execução mudam o
 * valor efetivo.
 */

/** Parâmetros de leitura da estimativa (não entram no motor). */
export const TAX_ESTIMATE_PARAMS = {
  /** Diferença entre o 1º e o 5º quintil (fração da renda) abaixo da qual a mudança é lida como neutra. */
  neutralBand: 0.0005,
} as const;

export interface QuintileIncidence {
  quintile: SocietyQuintileId;
  /** Variação permanente estimada da renda real do quintil, em fração da renda atual dele. */
  incomeChange: number;
}

export interface TaxPhase {
  /** Meses entre a sanção e o início desta fase (antes da anterioridade ou da noventena). */
  lagMonths: number;
  /** Receita anual que a fase acrescenta, em fração do PIB (negativa = desoneração). */
  annualRevenue: number;
}

export interface ReformEstimate {
  quintiles: QuintileIncidence[];
  phases: TaxPhase[];
  /** Receita anual de todas as fases, em fração do PIB, antes de ciclo e perda. */
  annualRevenue: number;
  /** Quem a mudança favorece em termos relativos (renda do 1º contra o 5º quintil). */
  lean: 'favorece_pobres' | 'favorece_ricos' | 'neutra';
}

const TAX_CHANNELS: ReadonlySet<string> = new Set([...REVENUE_CHANNELS, ...RELIEF_CHANNELS]);

/** Estimativa da mudança tributária da política; `null` se ela não mexe em tributo. */
export function reformEstimate(
  policy: Policy,
  state: Readonly<GameState>,
  content: Pick<GameContent, 'scenario'>,
): ReformEstimate | null {
  const impacts = policy.impacts.filter((i) => TAX_CHANNELS.has(i.channel) && i.magnitude !== 0);
  if (impacts.length === 0) return null;
  const gdp = currentNominalGdpMillions(state, content);

  const byLag = new Map<number, number>();
  for (const i of impacts) {
    const sign = REVENUE_CHANNELS.has(i.channel) ? 1 : -1;
    byLag.set(i.lagMonths, (byLag.get(i.lagMonths) ?? 0) + (sign * i.magnitude) / gdp);
  }
  const phases = [...byLag.entries()]
    .sort(([a], [b]) => a - b)
    .map(([lagMonths, annualRevenue]) => ({ lagMonths, annualRevenue }));

  const quintiles = SOCIETY_QUINTILE_IDS.map((quintile) => {
    const effect = impacts.reduce(
      (sum, i) => sum + quintileIncomeEffect(IMPULSE_TARGET[i.channel], i.magnitude / gdp, quintile),
      0,
    );
    const income =
      state.society.quintiles.find((q) => q.id === quintile)?.realIncome ??
      DEFAULT_SOCIETY_CALIBRATION.quintileIncomes[quintile];
    return { quintile, incomeChange: effect / income };
  });

  const gap = quintiles[0].incomeChange - quintiles[quintiles.length - 1].incomeChange;
  const lean =
    gap > TAX_ESTIMATE_PARAMS.neutralBand
      ? 'favorece_pobres'
      : gap < -TAX_ESTIMATE_PARAMS.neutralBand
        ? 'favorece_ricos'
        : 'neutra';

  return { quintiles, phases, annualRevenue: phases.reduce((s, p) => s + p.annualRevenue, 0), lean };
}
