import { turnIndexOf, type GameState } from '@/engine';

/**
 * Leitura compacta de um turno para as comparações da aba Economia (PLANO_SAVES_HISTORICO.md H8): variação mensal de
 * setores e quintis (B41), arrecadação contra o mesmo mês do ano anterior (A67) e ritmo das discricionárias (C3).
 * Guardar só estes números, e não 13 estados inteiros, mantém a store leve. A janela é a mesma dos snapshots
 * (`SNAPSHOT_RETENTION_MONTHS`): o turno atual e os 12 anteriores.
 */
export interface TurnReading {
  turnIndex: number;
  monthIndex: number;
  /** Receita primária líquida do mês, fração do PIB anualizada. */
  revenue: number;
  /** PIB real, índice (potencial × e^hiato): converte a receita em fração do PIB num valor real. */
  realGdpIndex: number;
  /** Nível de preços (IPCA), índice. */
  priceLevel: number;
  /** Discricionárias livres executadas, fração do PIB anualizada. */
  discretionary: number;
  sectors: Record<string, { output: number; share: number }>;
  quintiles: Record<string, { realIncome: number; incomeShare: number }>;
}

/** Quantos turnos a trilha guarda: o atual e os 12 anteriores. */
export const RECENT_TURNS = 13;

export function turnReading(state: Readonly<GameState>): TurnReading {
  const e = state.economy;
  return {
    turnIndex: turnIndexOf(state),
    monthIndex: state.monthIndex,
    revenue: e.revenue,
    realGdpIndex: e.potentialIndex * Math.exp(e.outputGap),
    priceLevel: e.priceLevel,
    discretionary: e.fiscal.discretionary,
    sectors: Object.fromEntries(state.society.sectors.map((s) => [s.id, { output: s.output, share: s.share }])),
    quintiles: Object.fromEntries(
      state.society.quintiles.map((q) => [q.id, { realIncome: q.realIncome, incomeShare: q.incomeShare }]),
    ),
  };
}

/**
 * Acrescenta a leitura do turno novo à trilha (mais antiga primeiro). Descarta o que estiver fora da janela e o que
 * for do mesmo turno ou posterior (partida que voltou um mês): a trilha nunca tem buraco nem leitura do futuro.
 */
export function pushReading(trail: readonly TurnReading[], reading: TurnReading): TurnReading[] {
  const oldest = reading.turnIndex - (RECENT_TURNS - 1);
  return [...trail.filter((r) => r.turnIndex >= oldest && r.turnIndex < reading.turnIndex), reading];
}

/** Leitura de `turnsAgo` turnos atrás (0 = o turno atual), ou `undefined` se a trilha não a tiver. */
export function readingAgo(trail: readonly TurnReading[], turnsAgo: number): TurnReading | undefined {
  const last = trail[trail.length - 1];
  if (!last) return undefined;
  return trail.find((r) => r.turnIndex === last.turnIndex - turnsAgo);
}
