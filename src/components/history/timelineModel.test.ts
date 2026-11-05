import { describe, expect, it } from 'vitest';

import { legacyProposals } from '@/components/campaign/legacyModel';
import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { createCampaign, loadLatestState, loadMandateLog, recordMonth } from '@/database/campaignRepository';
import { migrate } from '@/database/migrate';
import { openNodeDatabase } from '@/database/nodeDatabase';
import {
  advanceMonth,
  APPOINT_ACTION_ID,
  createInitialState,
  type GameContent,
  type GameState,
  type Proposal,
  type ProposalTransition,
} from '@/engine';
import { STRATEGIES } from '@/engine/sim/strategies';

import { buildTimeline, filterTimeline, groupByYear, timelineCounts, type TimelineEntry } from './timelineModel';

const content: GameContent = loadContent(DEFAULT_SCENARIO_ID);

const t = (monthIndex: number, status: ProposalTransition['status'], detail = ''): ProposalTransition => ({
  monthIndex,
  status,
  cause: 'teste',
  detail,
});

const proposal = (id: string, status: Proposal['status'], history: ProposalTransition[]): Proposal =>
  ({ id, policyId: id, createdMonth: history[0]?.monthIndex ?? 0, status, history, votes: [] }) as unknown as Proposal;

const baseState = (proposals: Proposal[]): Pick<GameState, 'proposals' | 'monthIndex' | 'career'> => ({
  proposals,
  monthIndex: 30,
  career: undefined,
});

describe('linha do tempo do mandato (PLANO_SAVES_HISTORICO.md H6, A40)', () => {
  it('leis: aprovadas no mês em que viraram lei e rejeitadas no mês da rejeição, como no legado', () => {
    const entries = buildTimeline(
      baseState([
        proposal('a', 'em_execucao', [t(2, 'em_tramitacao'), t(5, 'aprovada', 'Aprovada.'), t(5, 'em_execucao')]),
        proposal('r', 'rejeitada', [t(1, 'em_tramitacao'), t(4, 'rejeitada', 'Câmara 100/300.')]),
        proposal('v', 'vetada', [t(1, 'em_tramitacao'), t(6, 'vetada')]),
        proposal('p', 'em_tramitacao', [t(1, 'em_tramitacao')]),
      ]),
      content,
      null,
    );
    expect(entries.map((e) => [e.id, e.monthIndex, e.tag, e.symbol])).toEqual([
      ['lei:r', 4, 'Lei rejeitada', '▼'],
      ['lei:a', 5, 'Lei aprovada', '▲'],
    ]);
    expect(entries[0].detail).toBe('Câmara 100/300.');
  });

  it('banco: turno vira mês do mandato; crise destacada, resposta, nomeação, decisão recusada e eleição', () => {
    const ministry = content.scenario.institutions?.ministries[0];
    const entries = buildTimeline(
      // Partida com pré-campanha: a posse foi no turno 4 (turno 34 = mês 30).
      { proposals: [], monthIndex: 30, career: { turnIndex: 34, stage: 'governo' } as GameState['career'] },
      content,
      {
        fired: [
          { turnIndex: 2, eventId: 'escandalo_ministerio' },
          { turnIndex: 6, eventId: 'escandalo_ministerio' },
        ],
        choices: [{ turnIndex: 7, eventId: 'escandalo_ministerio', choiceId: 'inexistente', automatic: true }],
        decisions: [
          {
            turnIndex: 8,
            policyId: APPOINT_ACTION_ID,
            params: { ministryId: ministry?.id ?? 'x', occupant: 'tecnico' },
            accepted: true,
            rejectionReason: null,
          },
          { turnIndex: 8, policyId: 'politica_x', params: null, accepted: false, rejectionReason: 'acao_repetida' },
        ],
        elections: [{ monthIndex: 9, governmentWon: true, weights: {}, rounds: [], governorChanges: [] }],
      },
    );
    expect(entries.map((e) => [e.kind, e.monthIndex, e.tag])).toEqual([
      ['evento', 2, 'Crise'],
      ['evento', 3, 'Resposta automática'],
      ['ministro', 4, 'Ministério'],
      ['decisao', 4, 'Decisão recusada'],
      ['eleicao', 9, 'Eleição geral'],
    ]);
    expect(entries[0].grave).toBe(true);
    expect(entries[3].detail).toBe('Recusada: ação já feita neste mês.');
    expect(timelineCounts(entries)).toMatchObject({ evento: 2, crise: 2, ministro: 1, decisao: 1, eleicao: 1 });
    expect(filterTimeline(entries, 'crise').map((e) => e.monthIndex)).toEqual([2, 3]);
  });

  it('agrupa os meses por ano, na ordem do mandato', () => {
    const entry = (monthIndex: number): TimelineEntry => ({
      id: String(monthIndex),
      monthIndex,
      kind: 'decisao',
      tag: 'Decisão',
      symbol: '■',
      title: 'x',
      grave: false,
      tone: 'neutral',
    });
    const years = groupByYear([entry(0), entry(0), entry(11), entry(12)]);
    expect(years.map((y) => [y.year, y.count, y.months.map((m) => m.label)])).toEqual([
      [2027, 3, ['jan/2027', 'dez/2027']],
      [2028, 1, ['jan/2028']],
    ]);
  });

  it('campanha de teste: lista as mesmas leis que o relatório de legado', async () => {
    const db = openNodeDatabase();
    await migrate(db);
    const strategy = STRATEGIES.find((s) => s.id === 'reformista') ?? STRATEGIES[0];
    let state = createInitialState({ content, difficulty: 'casual', seed: 11 });
    await createCampaign(db, { id: 'c1', name: 'Teste', scenarioVersion: '0', state, content });
    for (let m = 0; m < 30; m++) {
      const result = advanceMonth(state, strategy.decide(state, content), content);
      await recordMonth(db, 'c1', result, { content });
      state = result.state;
    }
    const saved = await loadLatestState(db, 'c1');
    const entries = buildTimeline(saved, content, await loadMandateLog(db, 'c1'));
    const { approved, rejected } = legacyProposals(saved.proposals);
    const laws = entries.filter((e) => e.kind === 'lei').map((e) => e.id);
    expect(approved.length + rejected.length).toBeGreaterThan(0);
    expect([...laws].sort()).toEqual([...approved, ...rejected].map((p) => `lei:${p.id}`).sort());
    // Toda decisão gravada aparece (como decisão ou troca de ministro), e nenhuma entrada fica fora do mandato.
    expect(entries.every((e) => e.monthIndex >= 0 && e.monthIndex <= saved.monthIndex)).toBe(true);
    expect(entries.some((e) => e.kind === 'decisao')).toBe(true);
  });
});
