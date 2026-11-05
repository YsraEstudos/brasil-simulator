import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';

import { advanceMonth, createInitialState, turnIndexOf, type Decision, type GameState } from '../engine';
import { BUNDLE_CHILD_TABLES } from './campaignBundle';
import {
  CampaignRewindError,
  createCampaign,
  finishCampaign,
  listCampaigns,
  loadElectionResults,
  loadLatestState,
  recordMonth,
  rewindCampaign,
} from './campaignRepository';
import { migrate } from './migrate';
import { openNodeDatabase } from './nodeDatabase';
import type { SqlDatabase } from './types';

// PLANO_SAVES_HISTORICO.md, Fase H3 (D34): "Voltar ao mês anterior" desfaz o último turno numa transação.
const content = loadContent(DEFAULT_SCENARIO_ID);
const ID = 'c1';
/** Da pré-campanha ("corrida") até depois da eleição geral do mandato: passa pela posse e por um mês de eleição. */
const TURNOS = 52;

const DECISOES: Decision[][] = [
  [{ policyId: 'contingenciamento', agendaCost: 1 }],
  [],
  [{ policyId: 'iof_credito_reducao', agendaCost: 1 }],
  [],
];
const decisoesDo = (turno: number) => ({ decisions: DECISOES[turno % DECISOES.length] });

/** Tudo o que o banco guarda da campanha, menos as colunas que mudam sozinhas (datas e a marca da volta). */
async function retrato(db: SqlDatabase): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const table of BUNDLE_CHILD_TABLES) {
    const rows = await db.all<Record<string, unknown>>(`SELECT * FROM ${table} WHERE campaign_id = ?`, [ID]);
    out[table] = rows
      .map((r) => {
        const copy = { ...r };
        if (table === 'decisions' || table === 'events') delete copy.id;
        return JSON.stringify(copy);
      })
      .sort();
  }
  const campaign = await db.first<Record<string, unknown>>('SELECT * FROM campaigns WHERE id = ?', [ID]);
  const row = { ...campaign };
  for (const k of ['updated_at', 'last_played_at', 'rewound_turn']) delete row[k];
  out.campaigns = [JSON.stringify(row)];
  return out;
}

/**
 * O retrato de antes do mês sem as linhas que a retenção descartou ao gravá-lo: nas tabelas com retenção, só ficam
 * as linhas que ainda existiam depois do mês. A linha da campanha e o resumo da pré-campanha são reescritos pelo mês
 * e ficam como estavam antes.
 */
function semRetencao(antes: Record<string, string[]>, depois: Record<string, string[]>): Record<string, string[]> {
  const out = { ...antes };
  for (const table of ['snapshots', 'month_reports'])
    out[table] = antes[table].filter((r) => depois[table].includes(r));
  return out;
}

async function novaCampanha(
  difficulty: 'casual' | 'estrategica' = 'casual',
): Promise<{ db: SqlDatabase; state: GameState }> {
  const db = openNodeDatabase();
  await migrate(db);
  const state = createInitialState({ content, difficulty, seed: 2027, startPoint: 'corrida' });
  await createCampaign(db, { id: ID, name: 'Volta', scenarioVersion: content.scenario.version, state, content });
  return { db, state };
}

async function jogar(db: SqlDatabase, state: GameState): Promise<GameState> {
  const result = advanceMonth(state, decisoesDo(turnIndexOf(state)), content);
  await recordMonth(db, ID, result, { content });
  return result.state;
}

describe('voltar ao mês anterior (rewindCampaign, D34)', () => {
  it('em cada turno: nada do mês desfeito sobra, e jogar de novo com as mesmas decisões dá o mesmo estado', async () => {
    let { db, state } = await novaCampanha();
    let antes = await retrato(db);
    let passouPelaEleicao = false;
    for (let t = 0; t < TURNOS; t++) {
      const depois = await jogar(db, state);
      const retratoDepois = await retrato(db);

      // Volta: o banco fica como antes do mês, e o estado devolvido é o do início dele. A única diferença permitida é
      // o que a retenção (13 snapshots, 12 relatórios) já tinha descartado ao gravar o mês: isso não volta.
      const voltou = await rewindCampaign(db, ID);
      expect(voltou).toEqual(state);
      expect(await loadLatestState(db, ID)).toEqual(state);
      expect(await retrato(db)).toEqual(semRetencao(antes, retratoDepois));

      // De novo, com as mesmas decisões: mesmo estado e mesmo banco que na primeira vez.
      state = await jogar(db, voltou);
      expect(state).toEqual(depois);
      expect(await retrato(db)).toEqual(retratoDepois);
      if ((await loadElectionResults(db, ID)).length > 0) passouPelaEleicao = true;
      antes = retratoDepois;
    }
    // O percurso cobre a posse e a eleição geral (as tabelas de governo e a fotografia da eleição).
    expect(state.career?.stage ?? 'governo').toBe('governo');
    expect(passouPelaEleicao).toBe(true);
  });

  it('cada mês só pode ser desfeito uma vez, e não dá para voltar dois meses seguidos', async () => {
    let { db, state } = await novaCampanha();
    state = await jogar(db, state);
    state = await jogar(db, state);
    const voltou = await rewindCampaign(db, ID);
    expect(turnIndexOf(voltou)).toBe(1);
    expect((await listCampaigns(db))[0]).toMatchObject({ currentTurn: 1, rewoundTurn: 1 });
    // Logo depois de voltar: o turno 0 não é desfeito (seriam dois meses).
    await expect(rewindCampaign(db, ID)).rejects.toBeInstanceOf(CampaignRewindError);
    // Jogou o turno 1 de novo: desfazê-lo outra vez também não vale.
    state = await jogar(db, voltou);
    await expect(rewindCampaign(db, ID)).rejects.toThrow(/já foi desfeito/);
    // Um mês novo jogado (o turno 2) pode ser desfeito.
    await jogar(db, state);
    expect(turnIndexOf(await rewindCampaign(db, ID))).toBe(2);
  });

  it('recusa sem mexer no banco: turno 0, campanha encerrada e campanha inexistente', async () => {
    let { db, state } = await novaCampanha();
    await expect(rewindCampaign(db, ID)).rejects.toThrow(/Ainda não há mês/);
    state = await jogar(db, state);
    await finishCampaign(db, ID);
    const antes = await retrato(db);
    await expect(rewindCampaign(db, ID)).rejects.toThrow(/encerrada/);
    expect(await retrato(db)).toEqual(antes);
    await expect(rewindCampaign(db, 'nada')).rejects.toThrow(/não encontrada/);
    expect(turnIndexOf(state)).toBe(1);
  });
});
