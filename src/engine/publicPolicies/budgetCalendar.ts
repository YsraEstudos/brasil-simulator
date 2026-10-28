import { toCalendar } from '../calendar';

/** Calendário federal para os cenários brasileiros atuais; não representa uma lei aprovada. */
const FEDERAL_RULES_V1 = {
  firstTermYear: 2027,
  termYears: 4,
  ppaDeadline: '08-31',
  ldoDeadline: '04-15',
  loaDeadline: '08-31',
} as const;

const RULES_BY_SCENARIO: Readonly<Record<string, typeof FEDERAL_RULES_V1>> = {
  brasil_2027_01: FEDERAL_RULES_V1,
  brasil_2027_01_v050: FEDERAL_RULES_V1,
  brasil_2027_01_v060: FEDERAL_RULES_V1,
  brasil_2027_01_v070: FEDERAL_RULES_V1,
  brasil_2027_01_v080: FEDERAL_RULES_V1,
};

export function budgetCalendar(scenarioId: string, monthIndex: number) {
  if (!Object.hasOwn(RULES_BY_SCENARIO, scenarioId)) return null;
  const rules = RULES_BY_SCENARIO[scenarioId];
  if (!rules) return null;
  const year = toCalendar(monthIndex).year;
  const firstPpaYear = rules.firstTermYear - 3;
  const periodStart = firstPpaYear + Math.floor((year - firstPpaYear) / rules.termYears) * rules.termYears;
  const firstTermYear = (year - rules.firstTermYear) % rules.termYears === 0;
  return {
    year,
    rulesVersion: 'federal_2027_v1' as const,
    scheduledPpa: { from: periodStart, to: periodStart + rules.termYears - 1 },
    proposedPpa: firstTermYear
      ? { from: year + 1, to: year + rules.termYears, deadline: `${year}-${rules.ppaDeadline}` }
      : null,
    ldoDeadline: `${year}-${rules.ldoDeadline}`,
    loaDeadline: `${year}-${rules.loaDeadline}`,
    budgetYear: year + 1,
  };
}
