import { TERM_MONTHS, toCalendar } from '@/engine/calendar';
import { VEDACAO_MESES } from '@/engine/elections/vedacao';

/** Prazos documentados em POLITICAL_RULES.md §4.1; são lembretes, não ações simuladas. */
export const BUDGET_DATES = [
  { month: 4, name: 'LDO', date: '15 de abril' },
  { month: 8, name: 'PLOA', date: '31 de agosto' },
] as const;

export function governmentCalendar(
  monthIndex: number,
  options: { electionMonth?: number; copomMonths: readonly number[]; honeymoonMonths: number; casual: boolean },
) {
  const { month } = toCalendar(monthIndex);
  const termStart = Math.floor(monthIndex / TERM_MONTHS) * TERM_MONTHS;
  const termMonth = monthIndex - termStart;
  const election = options.electionMonth === undefined ? null : termStart + options.electionMonth;
  const nextElection = election === null ? null : election >= monthIndex ? election : election + TERM_MONTHS;
  const currentElectionYear = election !== null && Math.floor(election / 12) === Math.floor(monthIndex / 12);
  const copomOffset = Array.from({ length: 12 }, (_, i) => i).find((i) =>
    options.copomMonths.includes(((month - 1 + i) % 12) + 1),
  );
  return {
    electionIn: nextElection === null ? null : nextElection - monthIndex,
    recess: month === 1 && !options.casual,
    honeymoonLeft: Math.max(0, options.honeymoonMonths - termMonth),
    electionYear:
      month === 1 && currentElectionYear && election !== null
        ? {
            election,
            banStart: options.casual ? null : election - VEDACAO_MESES,
            banEnd: options.casual ? null : election - 1,
          }
        : null,
    nextCopom: copomOffset === undefined ? null : monthIndex + copomOffset,
    budget: BUDGET_DATES.filter((entry) => entry.month === month),
  };
}
