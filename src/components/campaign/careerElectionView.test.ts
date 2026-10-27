import { describe, expect, it } from 'vitest';

import { endMonthControl } from '@/components/painel/mesaNav';
import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { advanceMonth, careerSchedule, createInitialState, type GameState } from '@/engine';

import { careerCampaignSummary, careerElectionViewModel } from './careerElectionView';

// PLANO_CAMPANHA.md Fase C5 (tarefas C5.1 e C5.2): o que o jogador vê do resultado e do resumo da derrota.

const content = loadContent(DEFAULT_SCENARIO_ID);
const ufs = content.scenario.regions!.ufs;
const ELECTION_TURN = careerSchedule(content, 'corrida').findIndex((t) => t.stage === 'eleicao');
const flat = (r: number) => Object.fromEntries(ufs.map((u) => [u.id, r]));

function toElection(seed = 11, decisions = [] as Parameters<typeof advanceMonth>[1]['decisions']): GameState {
  let s = createInitialState({ content, difficulty: 'estrategica', seed, startPoint: 'corrida' });
  for (let i = 0; i < ELECTION_TURN; i++) s = advanceMonth(s, { decisions }, content).state;
  return s;
}

describe('resultado da eleição na tela (PLANO_CAMPANHA.md Fase C5)', () => {
  it('nada antes da eleição; depois, os turnos com percentuais dos válidos, do mais ao menos votado', () => {
    const s = toElection();
    expect(careerElectionViewModel(s, content)).toBeNull();
    const after = advanceMonth(s, { decisions: [] }, content).state;
    const view = careerElectionViewModel(after, content)!;
    const election = after.career!.election!;
    expect(view.rounds).toHaveLength(election.second ? 2 : 1);
    expect(view.won).toBe(election.outcome.startsWith('eleito'));
    for (const round of view.rounds) {
      const shares = round.rows.map((r) => Number(r.share.replace('%', '').replace(',', '.')));
      expect(shares).toEqual([...shares].sort((a, b) => b - a));
      expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0);
      expect(round.rows.filter((r) => r.player)).toHaveLength(round.rows.some((r) => r.id === 'jogador') ? 1 : 0);
    }
    expect(view.rounds.at(-1)!.rows.filter((r) => r.winner)).toHaveLength(1);
    expect(view.ufSummary[0]).toMatch(/de 27 estados|nenhum estado/);
    expect(view.pollVsResult).toMatch(/última pesquisa/);
  });

  it('o resumo da derrota explica fatores, escolhas e o externo em texto, sem números do motor', () => {
    const caravana = { policyId: 'caravana_regional', agendaCost: 0, params: { bolso: 'party', uf: 'BA' } };
    const s = toElection(11, [caravana]);
    const lost = advanceMonth(
      { ...s, career: { ...s.career!, recognition: flat(0.02), valence: -1 } },
      { decisions: [] },
      content,
    ).state;
    const summary = careerCampaignSummary(lost, content)!;
    expect(summary.election.won).toBe(false);
    expect(summary.election.title).toMatch(/^Derrota/);
    expect(summary.factors).toHaveLength(2);
    expect(summary.choices).toEqual(expect.arrayContaining([expect.stringMatching(/^Caravana/)]));
    expect(summary.choices.some((l) => l.includes('não fez ações'))).toBe(false);
    expect(summary.external.length).toBeGreaterThanOrEqual(2);
    for (const line of [...summary.factors, ...summary.choices, ...summary.external]) expect(line).not.toMatch(/\d/);
  });

  it('sem ações de campanha, o resumo diz que a disputa correu só com a exposição natural', () => {
    const s = toElection();
    const lost = advanceMonth({ ...s, career: { ...s.career!, valence: -1 } }, { decisions: [] }, content).state;
    expect(careerCampaignSummary(lost, content)!.choices.at(-1)).toMatch(/não fez ações de campanha/);
  });

  it('o botão da doca leva ao resumo quando a eleição foi perdida', () => {
    const base = { hasCampaign: true, finished: true, busy: false, actionsUsed: 0, actionsMax: 3 };
    expect(endMonthControl({ ...base, campaignLost: true })).toMatchObject({ mode: 'legado', label: 'Ver resumo' });
    expect(endMonthControl(base)).toMatchObject({ mode: 'legado', label: 'Ver legado' });
  });
});
