import { describe, expect, it } from 'vitest';

import type { ProposalStatus } from '@/engine';
import type { Bloc } from '@/types/scenario';

import {
  baseVerdict,
  campOf,
  filterProposals,
  houseScore,
  situationCounts,
  situationOf,
  voteGap,
  weakestAlly,
  type WeakLinkFacts,
} from './congressBoard';

const bloc = (id: string, chamberSeats: number, senateSeats = 10): Bloc =>
  ({ id, name: id.toUpperCase(), chamberSeats, senateSeats, interests: [] }) as unknown as Bloc;

const BLOCS = [bloc('a', 200, 30), bloc('b', 80, 15), bloc('c', 133, 20), bloc('d', 100, 16)];
const RELATIONS: Record<string, number> = { a: 50, b: 25, c: 0, d: -40 };
const relationOf = (b: Bloc) => RELATIONS[b.id] ?? 0;
const QUORUM = { majority: 257, pec: 308 };
const chamber = houseScore(BLOCS, relationOf, (b) => b.chamberSeats, QUORUM);
const noFacts: WeakLinkFacts = { ministries: 1, demandsAmendments: false, presides: [] };

describe('placar base × independentes × oposição (B38)', () => {
  it('usa o mesmo corte do hemiciclo (acima de +20 é base; abaixo de −20, oposição)', () => {
    expect(campOf(21)).toBe('base');
    expect(campOf(20)).toBe('independentes');
    expect(campOf(-20)).toBe('independentes');
    expect(campOf(-21)).toBe('oposicao');
  });

  it('soma as cadeiras de cada lado', () => {
    expect(chamber).toEqual({ base: 280, independentes: 133, oposicao: 100, total: 513, majority: 257, pec: 308 });
  });

  it('diz se a base aprova sozinha ou depende de alguém', () => {
    expect(baseVerdict(chamber)).toEqual({ text: 'A base tem maioria; para PEC faltam 28', tone: 'positive' });
    expect(baseVerdict({ ...chamber, base: 310 })).toEqual({ text: 'A base sozinha aprova até PEC', tone: 'positive' });
    expect(baseVerdict({ ...chamber, base: 200 }).tone).toBe('warning');
    expect(baseVerdict({ ...chamber, base: 100, independentes: 50 }).tone).toBe('negative');
  });
});

describe('elo mais fraco da base (D38)', () => {
  it('é o aliado com a relação mais baixa, com a distância até sair da base', () => {
    const weak = weakestAlly(BLOCS, relationOf, () => noFacts, chamber);
    expect(weak?.bloc.id).toBe('b');
    expect(weak?.margin).toBe(5);
    expect(weak?.reasons[0]).toBe('Está a 5 pontos de deixar a base.');
  });

  it('explica por que perdê-lo pesa e o que ele cobra', () => {
    const weak = weakestAlly(
      BLOCS,
      relationOf,
      () => ({ ministries: 0, demandsAmendments: true, presides: ['a Câmara'] }),
      chamber,
    );
    expect(weak?.reasons).toEqual([
      'Está a 5 pontos de deixar a base.',
      'Sem os 80 deputados dele, a base perde a maioria na Câmara.',
      'Não tem pasta no governo.',
      'Cobra emendas para votar.',
      'Preside a Câmara: pode travar a pauta.',
    ]);
  });

  it('sem base não há elo mais fraco', () => {
    expect(
      weakestAlly(
        BLOCS,
        () => 0,
        () => noFacts,
        chamber,
      ),
    ).toBeNull();
  });
});

describe('votos que faltam (B33)', () => {
  it('no Casual, número exato', () => {
    expect(voteGap({ exact: true, shown: 249, low: 249, high: 249, required: 257 })).toEqual({
      text: 'Faltam 8 votos',
      tone: 'negative',
    });
    expect(voteGap({ exact: true, shown: 258, low: 258, high: 258, required: 257 }).text).toBe('Sobram 1 voto');
    expect(voteGap({ exact: true, shown: 257, low: 257, high: 257, required: 257 }).tone).toBe('warning');
  });

  it('com faixa, nunca mais preciso que a estimativa', () => {
    expect(voteGap({ exact: false, shown: 240, low: 220, high: 250, required: 257 }).text).toBe(
      'Faltam de 7 a 37 votos',
    );
    expect(voteGap({ exact: false, shown: 290, low: 270, high: 310, required: 257 }).text).toBe(
      'Sobram de 13 a 53 votos',
    );
    expect(voteGap({ exact: false, shown: 257, low: 240, high: 270, required: 257 }).tone).toBe('warning');
  });
});

describe('filtro das propostas (B35)', () => {
  const p = (policyId: string, status: ProposalStatus, veto: { kind: 'total'; overridden: null } | null = null) => ({
    policyId,
    status,
    veto,
  });
  const PROPOSALS = [
    p('mp1', 'em_tramitacao'),
    p('pl1', 'parada'),
    p('pec1', 'em_tramitacao'),
    p('pl2', 'apreciacao_veto'),
    p('pl3', 'em_execucao', { kind: 'total', overridden: null }),
    p('pl4', 'rejeitada'),
  ];
  const kindOf = (id: string) =>
    (id.startsWith('mp') ? 'mp' : id.startsWith('pec') ? 'pec' : 'pl') as 'mp' | 'pl' | 'pec';

  it('situação de cada proposta (veto pendente de lei em execução conta como veto)', () => {
    expect(PROPOSALS.map(situationOf)).toEqual(['votacao', 'parada', 'votacao', 'veto', 'veto', 'fora']);
  });

  it('combina situação e tipo', () => {
    const ids = (filter: Parameters<typeof filterProposals>[1]) =>
      filterProposals(PROPOSALS, filter, kindOf).map((x) => x.policyId);
    expect(ids({ situation: 'votacao', kind: null })).toEqual(['mp1', 'pec1']);
    expect(ids({ situation: 'votacao', kind: 'pec' })).toEqual(['pec1']);
    expect(ids({ situation: null, kind: 'pl' })).toEqual(['pl1', 'pl2', 'pl3', 'pl4']);
  });

  it('conta por situação respeitando o tipo escolhido', () => {
    expect(situationCounts(PROPOSALS, null, kindOf)).toEqual({ votacao: 2, parada: 1, veto: 2, fora: 1 });
    expect(situationCounts(PROPOSALS, 'pl', kindOf)).toEqual({ votacao: 0, parada: 1, veto: 2, fora: 1 });
  });
});
