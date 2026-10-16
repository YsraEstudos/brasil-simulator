import type { Contribution, IndicatorKey, ScheduledImpulse } from '../types';

/** Uma parcela de variação, com causa, antes de virar `Contribution` (ECONOMIC_MODEL.md §1.6). */
export interface Piece {
  cause: string;
  label: string;
  delta: number;
}

export const sumOf = (pieces: readonly Piece[]): number => pieces.reduce((s, p) => s + p.delta, 0);

export const impulsePiece = (impulse: ScheduledImpulse, delta: number): Piece => ({
  cause: impulse.sourceId,
  label: impulse.label,
  delta,
});

/** Multiplica cada parcela por `factor` (a soma escala junto, então continua exata). */
export const scalePieces = (pieces: readonly Piece[], factor: number): Piece[] =>
  pieces.map((p) => ({ ...p, delta: p.delta * factor }));

/** Converte parcelas em contribuições, sem as de variação exatamente zero (AI_INSTRUCTIONS.md §3). */
export function toContributions(indicator: IndicatorKey, pieces: readonly Piece[]): Contribution[] {
  return pieces
    .filter((p) => p.delta !== 0)
    .map((p) => ({ indicator, cause: p.cause, label: p.label, delta: p.delta }));
}

export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
