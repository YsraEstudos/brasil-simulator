import { describe, expect, it } from 'vitest';

import type { ProposalTransition } from '@/engine';

import { crisisMarks, groupMarks, lawMarks, type ChartMark } from './chartMarks';

const t = (monthIndex: number, status: ProposalTransition['status']): ProposalTransition => ({
  monthIndex,
  status,
  cause: 'teste',
  detail: '',
});

describe('marcas de lei e de crise (A28)', () => {
  it('lei: a primeira transição para aprovada, em execução ou concluída, no ponto seguinte', () => {
    const marks = lawMarks(
      [
        { policyId: 'reforma', history: [t(2, 'em_tramitacao'), t(5, 'aprovada'), t(6, 'em_execucao')] },
        { policyId: 'decreto', history: [t(3, 'em_execucao')] },
        { policyId: 'rejeitada', history: [t(1, 'em_tramitacao'), t(4, 'rejeitada')] },
      ],
      (id) => `Política ${id}`,
    );
    expect(marks).toEqual([
      { monthIndex: 6, kind: 'lei', label: 'Política reforma' },
      { monthIndex: 4, kind: 'lei', label: 'Política decreto' },
    ]);
  });

  it('crise: só os eventos graves; desastre com local só com severidade alta', () => {
    const marks = crisisMarks(
      [
        { monthIndex: 3, eventId: 'escandalo_ministerio' },
        { monthIndex: 4, eventId: 'evento_comum' },
        { monthIndex: 5, eventId: 'enchentes_metropole', location: { affectedUfs: ['RS'], severityByUf: { RS: 0.3 } } },
        { monthIndex: 6, eventId: 'enchentes_metropole', location: { affectedUfs: ['RS'], severityByUf: { RS: 0.9 } } },
      ],
      (e) => e.eventId,
    );
    expect(marks.map((m) => m.monthIndex)).toEqual([3, 6]);
    expect(marks.every((m) => m.kind === 'crise')).toBe(true);
  });
});

describe('agrupamento', () => {
  const marks: ChartMark[] = [
    { monthIndex: 2, kind: 'lei', label: 'Lei A' },
    { monthIndex: 2, kind: 'crise', label: 'Crise B' },
    { monthIndex: 5, kind: 'lei', label: 'Lei C' },
    { monthIndex: 40, kind: 'lei', label: 'Fora do recorte' },
  ];

  it('um grupo por mês, só dentro do recorte, com símbolo misto quando há os dois tipos', () => {
    const groups = groupMarks(marks, 0, 12);
    expect(groups.map((g) => [g.monthIndex, g.symbol, g.title])).toEqual([
      [2, '●', '2 marcas'],
      [5, '▲', 'Lei C'],
    ]);
    expect(groups[0].description).toBe('◆ Crise B (mar/2027); ▲ Lei A (mar/2027)');
  });

  it('com muitos meses, junta os vizinhos em faixas', () => {
    const groups = groupMarks(marks, 0, 95, 12); // faixas de 8 meses
    expect(groups.map((g) => g.marks.length)).toEqual([3, 1]);
  });
});
