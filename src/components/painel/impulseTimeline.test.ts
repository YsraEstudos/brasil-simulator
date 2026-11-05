import { describe, expect, it } from 'vitest';

import type { ScheduledImpulse } from '@/engine';

import { activeEffects, impulseSpans, impulseTimeline } from './impulseTimeline';
import { ministrySignature, railNews } from './railNews';

const imp = (
  sourceId: string,
  label: string,
  startMonth: number,
  endMonth: number | null,
  target: ScheduledImpulse['target'] = 'aprovacao',
): ScheduledImpulse => ({ sourceId, label, target, delta: 0.01, startMonth, endMonth });

describe('efeitos e esteira (D6, C2)', () => {
  it('junta impulsos da mesma origem e nome', () => {
    const spans = impulseSpans([
      imp('proposta:a', 'Obras', 3, 8, 'gasto.investimento'),
      imp('proposta:a', 'Obras', 5, 12, 'oferta.potencial'),
      imp('proposta:b', 'Corte', 1, null),
      imp('proposta:b', 'Corte', 0, 4),
    ]);
    expect(spans).toEqual([
      { key: 'proposta:a|Obras', label: 'Obras', startMonth: 3, endMonth: 12 },
      { key: 'proposta:b|Corte', label: 'Corte', startMonth: 0, endMonth: null },
    ]);
  });

  it('efeitos temporários valendo agora, e a lua de mel no começo do mandato', () => {
    const state = {
      monthIndex: 4,
      impulses: [
        imp('evento:choque', 'Choque de juros', 2, 5),
        imp('proposta:p', 'Reforma', 0, null), // permanente: fica de fora
        imp('proposta:f', 'Obra futura', 6, 10), // ainda não começou
      ],
    };
    expect(activeEffects(state, 6)).toEqual([
      { key: 'evento:choque|Choque de juros', label: 'Choque de juros', remaining: 2, remainingText: 'restam 2 meses' },
      {
        key: 'lua_de_mel',
        label: 'Lua de mel',
        remaining: 2,
        remainingText: 'restam 2 meses',
        detail: 'Perdas de aprovação pesam menos no começo do mandato.',
      },
    ]);
    expect(activeEffects({ monthIndex: 6, impulses: [] }, 6)).toEqual([]);
    // Segundo mandato: a lua de mel volta.
    expect(activeEffects({ monthIndex: 48, impulses: [] }, 6)[0]).toMatchObject({ remaining: 6 });
  });

  it('esteira de 12 meses: o que começa e o que acaba na janela', () => {
    const state = {
      monthIndex: 10,
      impulses: [
        imp('a', 'Acaba logo', 2, 11),
        imp('b', 'Começa depois', 14, null),
        imp('c', 'Segue além', 9, 40),
        imp('d', 'Permanente antigo', 0, null),
        imp('e', 'Fora da janela', 30, 35),
        imp('f', 'Já acabou', 1, 9),
      ],
    };
    const t = impulseTimeline(state);
    expect(t.rows.map((r) => [r.label, r.from, r.to, r.startsLater, r.endsInside])).toEqual([
      ['Acaba logo', 0, 1, false, true],
      ['Segue além', 0, 11, false, false],
      ['Começa depois', 4, 11, true, false],
    ]);
    expect(t.rows[0].text).toBe('Acaba logo: já vale, acaba em dez/2027');
    expect(t.rows[2].text).toBe('Começa depois: começa em mar/2028, sem data para acabar');
    expect(impulseTimeline(state, 12, 2).more).toBe(1);
  });
});

describe('pontos de novidade (B24)', () => {
  const sig = ministrySignature([
    { id: 'fazenda', occupant: 'Quadro técnico' },
    { id: 'saude', occupant: 'Centrão' },
  ]);

  it('relatório não aberto e ministério que trocou de ocupante', () => {
    expect(railNews({ reportMonth: 3, ministries: sig, seen: { report: 2, ministries: sig } })).toEqual({
      relatorio: 'relatório novo',
    });
    expect(railNews({ reportMonth: 3, ministries: sig, seen: { report: 3, ministries: sig } })).toEqual({});
    expect(railNews({ reportMonth: null, ministries: `${sig}x`, seen: { report: -1, ministries: sig } })).toEqual({
      ministerios: 'ministério com novo ocupante',
    });
  });
});
