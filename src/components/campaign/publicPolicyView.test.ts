import { expect, it } from 'vitest';
import { currentDirective } from './publicPolicyView';

it('exibe a diretriz do ano corrente usando o índice persistido, inclusive após a virada do ano', () => {
  const old = { ministryId: 'fazenda', policyId: 'rotina', annualMillions: 800, year: 0 };
  const next = { ...old, annualMillions: 900, year: 1 };
  expect(currentDirective([old, next], 'fazenda', 1)).toEqual(old);
  expect(currentDirective([old, next], 'fazenda', 12)).toEqual(next);
  expect(currentDirective([old], 'fazenda', 12)).toBeUndefined();
});
