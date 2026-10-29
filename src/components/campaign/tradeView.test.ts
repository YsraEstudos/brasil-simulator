import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { createInitialState, type GameState } from '@/engine';

import { tradeView } from './tradeView';

// PLANO_EXPANSAO F14/EX-25: tarifa e faixa legal, fluxos com unidade e sinal, parceiros com acesso, acordos e choques.

const content = loadContent(DEFAULT_SCENARIO_ID);
const state = createInitialState({ content, difficulty: 'estrategica', seed: 1 });

describe('cartão de comércio exterior', () => {
  it('no início: tarifa-base, faixa do decreto, sem fluxos e parceiros com relação e acesso normais', () => {
    const view = tradeView(state, content)!;
    expect(view.tariff).toContain('8%');
    expect(view.tariff).toContain('4%');
    expect(view.canRaise && view.canLower).toBe(true);
    expect(view.flows).toEqual([]);
    const mercosul = view.partners.find((p) => p.id === 'mercosul')!;
    expect(mercosul.canNegotiate).toBe(false);
    expect(mercosul.agreement).toContain('Sem acordo possível');
    expect(view.partners.find((p) => p.id === 'uniao_europeia')!.canNegotiate).toBe(true);
    expect(view.partners[0].status).toContain('acesso 100% do normal');
  });

  it('barreira ativa aparece no parceiro e reduz o acesso mostrado', () => {
    const blocked: GameState = {
      ...state,
      monthIndex: 3,
      trade: {
        ...state.trade,
        shocks: [{ id: 'x', kind: 'barreira', partnerId: 'china', startMonth: 2, endMonth: 6, size: 0.15 }],
      },
    };
    const china = tradeView(blocked, content)!.partners.find((p) => p.id === 'china')!;
    expect(china.shock).toContain('4 meses');
    expect(china.status).toContain('acesso 85% do normal');
  });

  it('sem catálogo de comércio não há cartão', () => {
    expect(tradeView(state, { ...content, trade: undefined })).toBeNull();
  });
});
