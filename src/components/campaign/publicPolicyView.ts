import type { MinistryDirective } from '@/engine/publicPolicies/types';
import { START_YEAR, toCalendar } from '@/engine/calendar';

/** O motor persiste anos desde a posse (0 = 2027); a tela exibe o ano civil. */
export function currentDirective(directives: readonly MinistryDirective[], ministryId: string, monthIndex: number) {
  return directives.find((d) => d.ministryId === ministryId && d.year === toCalendar(monthIndex).year - START_YEAR);
}
