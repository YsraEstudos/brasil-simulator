import { describe, expect, it } from 'vitest';
import { budgetCalendar } from './budgetCalendar';

describe('calendário orçamentário federal', () => {
  it('distingue o PPA herdado do projeto do primeiro ano e os prazos anuais', () => {
    expect(budgetCalendar('brasil_2027_01_v080', 0)).toMatchObject({
      year: 2027,
      scheduledPpa: { from: 2024, to: 2027 },
      proposedPpa: { from: 2028, to: 2031, deadline: '2027-08-31' },
      ldoDeadline: '2027-04-15',
      loaDeadline: '2027-08-31',
    });
    expect(budgetCalendar('brasil_2027_01_v080', 12)).toMatchObject({
      year: 2028,
      scheduledPpa: { from: 2028, to: 2031 },
      proposedPpa: null,
    });
    expect(budgetCalendar('prototipo_ficticio', 0)).toBeNull();
    expect(budgetCalendar('toString', 0)).toBeNull();
  });
});
