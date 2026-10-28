import { phaseShareAt, type ScenarioTaxation } from '../../types/scenario';
import { toCalendar } from '../calendar';
import { REVENUE_GROUPS, type GameContent, type GameState, type RevenueBaseDetail, type RevenueGroup } from '../types';

/**
 * Bases tributárias e conciliação (PLANO_EXPANSAO EX-11; ECONOMIC_MODEL.md §5.7.1). Leitura pura do estado fiscal:
 * não altera o motor nem consome sorteio. A receita de cada base sai de `FiscalState.revenueDetail`, gravado pelo
 * motor fiscal no mês; a composição em tributos vem das regras do cenário e só reparte a carga legal do cenário.
 * Medidas novas (impulsos) aparecem à parte, sem serem atribuídas a um tributo que não criaram.
 */

/** Parte de um tributo na carga legal do cenário (fração do PIB anualizada). */
export interface TributeLoad {
  id: string;
  name: string;
  /** Fração da carga legal do grupo neste ano. */
  share: number;
  /** Carga legal do tributo: `share × base` do grupo. */
  legal: number;
  legalBasis: string;
}

/** Uma base tributária do mês: do tributo legal à receita líquida da União. */
export interface TaxBaseRow {
  group: RevenueGroup;
  detail: RevenueBaseDetail;
  /** Receita líquida da União: `base + policy + cycle − loss − transfers` (= `revenueByGroup`). */
  net: number;
  /** Composição da carga legal do cenário; vazia quando o cenário não tem regras tributárias. */
  tributes: TributeLoad[];
}

/** Ano-calendário do mês do jogo (posse em jan/2027 = mês 0). */
export function fiscalYear(monthIndex: number): number {
  return toCalendar(monthIndex).year;
}

/** Composição do grupo em tributos no ano; as frações somam 1 (validado no cenário). */
export function tributeShares(
  taxation: ScenarioTaxation | undefined,
  group: RevenueGroup,
  year: number,
): Omit<TributeLoad, 'legal'>[] {
  if (!taxation) return [];
  const tributes = taxation.tributes.filter((t) => t.group === group);
  const first = Math.min(...tributes.flatMap((t) => t.phases.map((p) => p.fromYear)));
  return tributes
    .map((t) => ({ id: t.id, name: t.name, share: phaseShareAt(t.phases, year, first), legalBasis: t.legalBasis }))
    .filter((t) => t.share > 0);
}

/** Bases tributárias do mês corrente, na ordem dos grupos de receita. */
export function taxBases(state: Readonly<GameState>, content: Pick<GameContent, 'scenario'>): TaxBaseRow[] {
  const f = state.economy.fiscal;
  const year = fiscalYear(state.monthIndex);
  return REVENUE_GROUPS.map((group) => {
    const detail = f.revenueDetail[group];
    return {
      group,
      detail,
      net: f.revenueByGroup[group],
      tributes: tributeShares(content.scenario.taxation, group, year).map((t) => ({
        ...t,
        legal: t.share * detail.base,
      })),
    };
  });
}

/**
 * Fração do IBS na carga do consumo de estados e municípios no ano (ICMS/ISS → IBS). O complemento é o legado:
 * os dois somam sempre a carga inteira, sem dupla cobrança. `null` sem regras no cenário.
 */
export function subnationalTransitionAt(
  taxation: ScenarioTaxation | undefined,
  year: number,
): { ibs: number; legacy: number } | null {
  if (!taxation) return null;
  const phases = taxation.subnationalTransition.map((p) => ({ fromYear: p.fromYear, share: p.ibsShare }));
  const ibs = phaseShareAt(phases, year, Math.min(...phases.map((p) => p.fromYear)));
  return { ibs, legacy: 1 - ibs };
}
