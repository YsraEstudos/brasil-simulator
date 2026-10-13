import type { ImpulseTarget, ScheduledImpulse } from './types';

/** Fila de efeitos agendados (ECONOMIC_MODEL.md §5.11): consultas usadas por todas as etapas. */

export function isActive(impulse: ScheduledImpulse, monthIndex: number): boolean {
  return impulse.startMonth <= monthIndex && (impulse.endMonth === null || impulse.endMonth >= monthIndex);
}

/** Impulsos ativos no mês para os alvos pedidos, na ordem da fila. */
export function activeImpulses(
  impulses: readonly ScheduledImpulse[],
  monthIndex: number,
  targets: readonly ImpulseTarget[],
): ScheduledImpulse[] {
  return impulses.filter((i) => targets.includes(i.target) && isActive(i, monthIndex));
}

/** Soma dos `delta` ativos de um alvo no mês. */
export function sumActive(impulses: readonly ScheduledImpulse[], monthIndex: number, target: ImpulseTarget): number {
  return activeImpulses(impulses, monthIndex, [target]).reduce((s, i) => s + i.delta, 0);
}

/** Remove os impulsos que já terminaram antes de `nextMonth`, para a fila não crescer sem limite. */
export function pruneImpulses(impulses: readonly ScheduledImpulse[], nextMonth: number): ScheduledImpulse[] {
  return impulses.filter((i) => i.endMonth === null || i.endMonth >= nextMonth);
}
