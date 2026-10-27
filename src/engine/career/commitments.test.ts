import { describe, expect, it } from 'vitest';
import { debtCommitment, settleDebt, expireDebt } from './commitments';

// PLANO_CAMPANHA.md Fase C3: obrigação identificada, prazo e consequência explícita.
describe('compromisso de dívida da campanha', () => {
  it('registra origem, valor, obrigação e prazo de governo', () => {
    expect(debtCommitment('fornecedor_ficticio', 100, 3)).toMatchObject({
      origin: 'fornecedor_ficticio',
      obligation: 'pagar_divida',
      remaining: 100,
      deadline: 3,
      status: 'pendente',
    });
  });
  it('pagamentos parciais preservam a obrigação e a quitação a cumpre', () => {
    const initial = debtCommitment('fornecedor_ficticio', 100, 3);
    const partial = settleDebt(initial, 40, 2);
    expect(partial).toMatchObject({ remaining: 60, status: 'pendente' });
    expect(settleDebt(partial, 60, 3)).toMatchObject({ remaining: 0, status: 'cumprido' });
    expect(() => settleDebt(initial, 101, 1)).toThrow();
    expect(() => settleDebt(initial, 1, 4)).toThrow();
  });
  it('vence somente após o prazo e registra cobrança uma vez', () => {
    const initial = debtCommitment('fornecedor_ficticio', 100, 3);
    expect(expireDebt(initial, 3)).toEqual({ commitment: initial, charge: false });
    const expired = expireDebt(initial, 4);
    expect(expired.commitment.status).toBe('expirado');
    expect(expired.charge).toBe(true);
    expect(expireDebt(expired.commitment, 5).charge).toBe(false);
  });
});
