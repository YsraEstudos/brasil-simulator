import { describe, expect, it } from 'vitest';

import { governmentsLabel, resolveGovernmentCount } from './governments';

describe('resolveGovernmentCount', () => {
  it('aceita só inteiros não negativos gravados', () => {
    expect(resolveGovernmentCount(0)).toBe(0);
    expect(resolveGovernmentCount(12)).toBe(12);
  });

  it('valores ausentes, corrompidos ou inválidos contam como zero', () => {
    expect(resolveGovernmentCount(null)).toBe(0);
    expect(resolveGovernmentCount(undefined)).toBe(0);
    expect(resolveGovernmentCount('3')).toBe(0);
    expect(resolveGovernmentCount(-1)).toBe(0);
    expect(resolveGovernmentCount(2.5)).toBe(0);
    expect(resolveGovernmentCount(Number.NaN)).toBe(0);
  });
});

describe('governmentsLabel', () => {
  it('fica vazio antes do primeiro governo', () => {
    expect(governmentsLabel(0)).toBe('');
  });

  it('usa o ordinal em português', () => {
    expect(governmentsLabel(1)).toBe('Seu 1º governo neste aparelho');
    expect(governmentsLabel(12)).toBe('Seu 12º governo neste aparelho');
  });
});
