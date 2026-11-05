import { describe, expect, it } from 'vitest';

import type { PolicyKind } from '@/components/campaign/policyCatalogModel';
import type { Proposal, VoteResult } from '@/engine';

import { filterVotes, NO_VOTE_FILTER, outcomeCounts, voteHistory } from './voteHistoryModel';

const vote = (
  monthIndex: number,
  house: VoteResult['house'],
  round: number,
  yes: number,
  required: number,
): VoteResult => ({
  monthIndex,
  house,
  round,
  yes,
  no: (house === 'camara' ? 513 : 81) - yes,
  required,
  approved: yes >= required,
  blocs: [
    { blocId: 'centro', support: 1, yes: 80, no: 20 },
    { blocId: 'oposicao', support: -1, yes: 10, no: 10 },
  ],
});

type P = Pick<Proposal, 'id' | 'policyId' | 'votes' | 'history'>;

const proposals: P[] = [
  // POLITICAL_RULES.md §3: PEC exige 3/5 em dois turnos; aqui cai no 2º turno da Câmara.
  {
    id: 'pec_1',
    policyId: 'pec',
    votes: [vote(3, 'camara', 1, 320, 308), vote(3, 'camara', 2, 300, 308)],
    history: [],
  },
  // PL aprovado nas duas Casas e veto mantido em sessão conjunta (CF art. 66 §4º).
  {
    id: 'pl_2',
    policyId: 'pl',
    votes: [vote(4, 'camara', 1, 300, 257), vote(5, 'senado', 1, 50, 41), vote(8, 'camara', 1, 200, 257)],
    history: [{ monthIndex: 8, status: 'vetada', cause: 'veto_mantido', detail: '' }],
  },
];

const kindOf = (id: string): PolicyKind => (id === 'pec' ? 'pec' : 'pl');
const entries = voteHistory(
  proposals,
  (id) => `Política ${id}`,
  kindOf,
  (id) => `Bloco ${id}`,
);

describe('histórico de votações (PLANO_SAVES_HISTORICO.md H6, A39)', () => {
  it('cada votação com Casa, turno, placar e quórum, da mais recente para a mais antiga', () => {
    expect(entries.map((e) => [e.id, e.resultLabel, e.summary, e.quorumLabel])).toEqual([
      ['pl_2:2', 'Veto mantido', 'Sessão do veto, Câmara · 200 a 313 · precisava de 257', 'maioria absoluta'],
      ['pl_2:1', 'Aprovada', 'Senado · 50 a 31 · precisava de 41', 'maioria absoluta'],
      ['pl_2:0', 'Aprovada', 'Câmara · 300 a 213 · precisava de 257', 'maioria absoluta'],
      ['pec_1:1', 'Rejeitada', 'Câmara, 2º turno · 300 a 213 · precisava de 308', '3/5 (PEC)'],
      ['pec_1:0', 'Aprovada', 'Câmara, 1º turno · 320 a 193 · precisava de 308', '3/5 (PEC)'],
    ]);
  });

  it('o voto de cada bloco, com o lado da maioria do bloco', () => {
    expect(entries[0].blocs.map((b) => [b.name, b.side])).toEqual([
      ['Bloco centro', 'sim'],
      ['Bloco oposicao', 'empate'],
    ]);
  });

  it('filtros por resultado e tipo, com contagens', () => {
    expect(filterVotes(entries, { outcome: 'rejeitada', kind: null }).map((e) => e.id)).toEqual(['pl_2:2', 'pec_1:1']);
    expect(filterVotes(entries, { outcome: null, kind: 'pec' })).toHaveLength(2);
    expect(filterVotes(entries, NO_VOTE_FILTER)).toHaveLength(5);
    expect(outcomeCounts(entries, null)).toEqual({ aprovada: 3, rejeitada: 2 });
    expect(outcomeCounts(entries, 'pec')).toEqual({ aprovada: 1, rejeitada: 1 });
  });
});
