/**
 * Calendário do motor. O tempo é um `monthIndex` inteiro (0 = jan/2027); nunca `Date` (ECONOMIC_MODEL.md §2).
 */

export const START_YEAR = 2027;

/** Mandato completo: jan/2027 a dez/2030 (GAME_DESIGN.md §4.1). */
export const TERM_MONTHS = 48;

/** Mandato (0, 1, …) a que pertence o mês. */
export function termOf(monthIndex: number): number {
  return Math.floor(monthIndex / TERM_MONTHS);
}

/** Mês dentro do mandato (0 = jan do ano da posse), usado pelo calendário eleitoral (Fase 08). */
export function monthOfTerm(monthIndex: number): number {
  return monthIndex % TERM_MONTHS;
}

export interface CalendarMonth {
  year: number;
  /** 1–12 */
  month: number;
}

export function toCalendar(monthIndex: number): CalendarMonth {
  if (!Number.isInteger(monthIndex) || monthIndex < 0) {
    throw new RangeError(`monthIndex inválido: ${monthIndex}`);
  }
  return { year: START_YEAR + Math.floor(monthIndex / 12), month: (monthIndex % 12) + 1 };
}

export function toMonthIndex({ year, month }: CalendarMonth): number {
  if (!Number.isInteger(year) || year < START_YEAR || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`mês inválido: ${year}-${month}`);
  }
  return (year - START_YEAR) * 12 + (month - 1);
}

/** "2027-01" — formato estável para chaves e logs. */
export function monthKey(monthIndex: number): string {
  const { year, month } = toCalendar(monthIndex);
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Meses do calendário civil relativos à posse, aceitando valores negativos (antes da posse; PLANO_CAMPANHA.md §2.4).
 * Só serve para rótulos: o mês do mandato (`monthIndex`) nunca é negativo, e `toCalendar` continua recusando-o.
 */
export function calendarAt(offset: number): CalendarMonth {
  if (!Number.isInteger(offset)) throw new RangeError(`mês inválido: ${offset}`);
  return { year: START_YEAR + Math.floor(offset / 12), month: (((offset % 12) + 12) % 12) + 1 };
}

/** "2026-08" → −5 (meses desde jan/2027; negativo antes da posse). */
export function offsetOfKey(key: string): number {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  const month = m ? Number(m[2]) : 0;
  if (!m || month < 1 || month > 12) throw new RangeError(`mês inválido: ${key}`);
  return (Number(m[1]) - START_YEAR) * 12 + (month - 1);
}

/** Chave "AAAA-MM" de qualquer mês, inclusive antes da posse. */
export function keyOfCalendar({ year, month }: CalendarMonth): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}
