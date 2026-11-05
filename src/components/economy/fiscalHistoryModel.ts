import { shortMonthLabel } from '@/components/campaign/labels';
import { formatNumber, formatPercent, formatSignedPercent } from '@/components/ui/format';
import { REVENUE_GROUPS, type FiscalState, type RevenueGroup } from '@/engine';
import { readingAgo, type TurnReading } from '@/store/recentTurns';

import { rigidityShare } from './economyInsights';

/**
 * Economia por dentro (PLANO_SAVES_HISTORICO.md H8): arrecadação contra o mesmo mês do ano anterior (A67), raio-X
 * do esmagamento das discricionárias (C3) e fadiga tributária por base (C7). Puro: recebe a trilha de leituras da
 * store e o estado fiscal e devolve números e texto. Valores fiscais chegam em fração do PIB; quem formata em R$ ou
 * em % do PIB é a tela (`flow`), conforme `prefs.fiscalUnit`.
 */

const months = (n: number) => `${n} ${n === 1 ? 'mês' : 'meses'}`;

// ---------------------------------------------------------------------------------------------------------------
// A67: arrecadação contra o mesmo mês do ano anterior
// ---------------------------------------------------------------------------------------------------------------

export type RevenueYearOverYear =
  { kind: 'sem_base'; text: string } | { kind: 'ok'; real: number; nominal: number; text: string; context: string };

/**
 * "Real" = descontada a inflação: a receita do motor é fração do PIB, então receita × PIB real (potencial × e^hiato)
 * é a arrecadação a preços constantes, e a razão entre os dois meses é o crescimento real (deflacionado pelo IPCA do
 * estado, `priceLevel`). O nominal multiplica também pela razão dos níveis de preços. Os dois são fluxos do mês,
 * anualizados, como o resto da aba. Sem o snapshot de 12 turnos atrás (primeiro ano), não há comparação.
 */
export function revenueYearOverYear(trail: readonly TurnReading[]): RevenueYearOverYear | null {
  const now = trail[trail.length - 1];
  if (!now) return null;
  const label = shortMonthLabel(now.monthIndex);
  const ago = readingAgo(trail, 12);
  if (!ago || !(ago.revenue > 0) || !(ago.realGdpIndex > 0) || !(ago.priceLevel > 0)) {
    return { kind: 'sem_base', text: `Arrecadação de ${label}: sem o mesmo mês do ano anterior` };
  }
  const realRatio = (now.revenue * now.realGdpIndex) / (ago.revenue * ago.realGdpIndex);
  const real = realRatio - 1;
  const nominal = realRatio * (now.priceLevel / ago.priceLevel) - 1;
  return {
    kind: 'ok',
    real,
    nominal,
    text: `Arrecadação de ${label} contra ${shortMonthLabel(ago.monthIndex)}: ${formatSignedPercent(real, 1)} real`,
    context: `${formatSignedPercent(nominal, 1)} nominal; real = descontada a inflação (IPCA) do período`,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// C3: raio-X do esmagamento
// ---------------------------------------------------------------------------------------------------------------

export type SqueezeSegmentId = 'obrigatorias' | 'vinculadas' | 'piso' | 'acima_piso';

export interface SqueezeSegment {
  id: SqueezeSegmentId;
  label: string;
  /** Fração do PIB anualizada. */
  value: number;
  /** Parte da despesa (0–1). As partes somam 1. */
  share: number;
}

export interface Squeeze {
  segments: SqueezeSegment[];
  total: number;
  /** Engessamento (`rigidityShare`, Fase Q10). */
  rigidity: number;
  /** Discricionárias abaixo do piso: quanto falta (fração do PIB), senão 0. */
  belowFloor: number;
}

/**
 * Barra empilhada da despesa que o governo controla ou não: obrigatórias (por lei e de políticas), vinculadas à
 * receita e discricionárias livres, separadas em "até o piso" (o mínimo para a máquina funcionar) e "acima do piso"
 * (a folga real). Mesma base do `rigidityShare`, para os dois números baterem.
 */
export function squeeze(
  f: Pick<FiscalState, 'mandatory' | 'linked' | 'policyMandatory' | 'discretionary'>,
  floor: number,
): Squeeze {
  const mandatory = Object.values(f.mandatory).reduce((s, v) => s + v, 0) + Math.max(0, f.policyMandatory);
  const disc = Math.max(0, f.discretionary);
  const atFloor = Math.min(disc, floor);
  const values: [SqueezeSegmentId, string, number][] = [
    ['obrigatorias', 'Obrigatórias', mandatory],
    ['vinculadas', 'Vinculadas', f.linked],
    ['piso', 'Discricionárias até o piso', atFloor],
    ['acima_piso', 'Discricionárias acima do piso', disc - atFloor],
  ];
  const total = mandatory + f.linked + disc;
  return {
    segments: values.map(([id, label, value]) => ({ id, label, value, share: total > 0 ? value / total : 0 })),
    total,
    rigidity: rigidityShare(f),
    belowFloor: Math.max(0, floor - f.discretionary),
  };
}

export type FloorProjection =
  | { kind: 'sem_serie'; text: string }
  | { kind: 'abaixo'; text: string }
  | { kind: 'subindo' | 'estavel'; slope: number; span: number; text: string }
  | { kind: 'caindo'; slope: number; span: number; months: number; text: string };

/** Variação mensal abaixo da qual as discricionárias contam como estáveis (0,001% do PIB por mês). */
export const STABLE_SLOPE = 0.00001;
/** Pontos mínimos para traçar a tendência. */
export const MIN_TREND_POINTS = 3;
/** Além disto, a projeção diz só "mais de 10 anos". */
export const MAX_PROJECTION_MONTHS = 120;

/** Inclinação da reta de mínimos quadrados (valor por mês). */
export function linearSlope(points: readonly { x: number; y: number }[]): number {
  const n = points.length;
  if (n < 2) return 0;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den > 0 ? num / den : 0;
}

/**
 * Projeção da interface (não do motor), marcada como estimativa: reta pelos valores das discricionárias nos turnos
 * guardados (até 12 meses) e quantos meses faltam, nesse ritmo, para chegar ao piso.
 */
export function floorProjection(trail: readonly TurnReading[], floor: number): FloorProjection {
  const now = trail[trail.length - 1];
  if (!now || trail.length < MIN_TREND_POINTS) {
    return { kind: 'sem_serie', text: 'Estimativa: faltam meses jogados para medir o ritmo das discricionárias.' };
  }
  if (now.discretionary < floor) {
    return { kind: 'abaixo', text: 'As discricionárias já estão abaixo do piso de funcionamento.' };
  }
  const slope = linearSlope(trail.map((r) => ({ x: r.turnIndex, y: r.discretionary })));
  const span = now.turnIndex - trail[0].turnIndex;
  const rhythm = `No ritmo dos últimos ${months(span)}`;
  if (slope > STABLE_SLOPE) {
    return {
      kind: 'subindo',
      slope,
      span,
      text: `Estimativa: ${rhythm.toLowerCase()}, as discricionárias crescem e se afastam do piso.`,
    };
  }
  if (slope >= -STABLE_SLOPE) {
    return {
      kind: 'estavel',
      slope,
      span,
      text: `Estimativa: ${rhythm.toLowerCase()}, as discricionárias estão estáveis e não chegam ao piso.`,
    };
  }
  const n = Math.max(1, Math.ceil((now.discretionary - floor) / -slope));
  const when = n > MAX_PROJECTION_MONTHS ? 'em mais de 10 anos' : `em ${months(n)}`;
  return {
    kind: 'caindo',
    slope,
    span,
    months: n,
    text: `Estimativa: ${rhythm.toLowerCase()}, as discricionárias chegam ao piso ${when}.`,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// C7: fadiga tributária por base
// ---------------------------------------------------------------------------------------------------------------

/** Bases com retorno decrescente (royalties não são alíquota: não têm perda). */
export const FATIGUE_GROUPS = REVENUE_GROUPS.filter((g) => g !== 'royalties') as Exclude<RevenueGroup, 'royalties'>[];

export interface TaxFatigue {
  group: RevenueGroup;
  /** Fração da carga do grupo que se perde (a taxa que `fiscal.ts` calcula: perda ÷ (arrecadado + perda)). */
  rate: number;
  /** Saturação: `rate ÷ perda_max` (0 = sem perda, 1 = perda máxima). */
  saturation: number;
  /** Perda do grupo, fração do PIB anualizada. */
  loss: number;
  text: string;
}

/**
 * Taxa de perda por base. É a taxa média do grupo, a mesma que o motor aplica a toda a carga do grupo: "de cada
 * R$ 1 cobrado, R$ 0,18 se perde". `null` em estados gravados antes da H8 (sem `revenueLossByGroup`).
 */
export function taxFatigue(
  f: Pick<FiscalState, 'revenueByGroup' | 'revenueLossByGroup'>,
  maxLoss: number,
): TaxFatigue[] | null {
  const byGroup = f.revenueLossByGroup;
  if (!byGroup) return null;
  return FATIGUE_GROUPS.map((group) => {
    const loss = Math.max(0, byGroup[group]);
    const gross = f.revenueByGroup[group] + loss;
    const rate = gross > 0 ? loss / gross : 0;
    const saturation = maxLoss > 0 ? Math.min(1, rate / maxLoss) : 0;
    const text =
      loss > 0
        ? `De cada R$ 1 cobrado, R$ ${formatNumber(rate, 2)} se perde (${formatPercent(saturation, 0)} do máximo)`
        : 'Sem perda: a carga está dentro da margem que a base aguenta';
    return { group, rate, saturation, loss, text };
  });
}
