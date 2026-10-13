import { beforeEach, describe, expect, it } from 'vitest';

import { TEST_BILL, TEST_DECREE, TEST_PEC, testContent, testState } from '@/tests/fixtures';

import { advanceMonth, type GameState, type MonthStep } from '../engine';
import {
  CampaignNotFoundError,
  createCampaign,
  deleteCampaign,
  listCampaigns,
  loadLatestState,
  recordMonth,
  SaveTooNewError,
} from './campaignRepository';
import { currentVersion, DatabaseTooNewError, migrate } from './migrate';
import { LATEST_DB_VERSION, MIGRATIONS, type Migration } from './migrations';
import { openNodeDatabase } from './nodeDatabase';
import type { SqlDatabase } from './types';

const content = testContent();
const newState = (seed = 7): GameState => testState(seed);

const noise: MonthStep = (s, ctx) => ({
  state: { ...s },
  contributions: [{ indicator: 'approval', cause: 'ruido_teste', delta: ctx.rng.normal() * 0.001 }],
});

const tables = async (db: SqlDatabase) =>
  (await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).map(
    (r) => r.name,
  );

describe('migrações', () => {
  it('cria todas as tabelas num banco novo e registra a versão', async () => {
    const db = openNodeDatabase();
    expect(await migrate(db)).toEqual(MIGRATIONS.map((m) => m.version));
    expect(await currentVersion(db)).toBe(LATEST_DB_VERSION);
    expect(await tables(db)).toEqual(
      expect.arrayContaining(['campaigns', 'snapshots', 'decisions', 'events', 'schema_migrations']),
    );
  });

  it('é idempotente: rodar de novo não aplica nada', async () => {
    const db = openNodeDatabase();
    await migrate(db);
    expect(await migrate(db)).toEqual([]);
  });

  it('aplica só as pendentes num banco antigo, preservando os dados', async () => {
    const db = openNodeDatabase();
    await migrate(db, MIGRATIONS.slice(0, 1));
    await createCampaign(db, { id: 'c1', name: 'Antiga', scenarioVersion: '0.1.0', state: newState() });
    const v2: Migration = {
      version: LATEST_DB_VERSION + 1,
      name: 'teste_coluna_nova',
      sql: "ALTER TABLE campaigns ADD COLUMN notes TEXT NOT NULL DEFAULT '';",
    };
    // pendentes = todas depois da v1, mais a nova
    expect(await migrate(db, [...MIGRATIONS, v2])).toEqual([...MIGRATIONS.slice(1).map((m) => m.version), v2.version]);
    expect((await listCampaigns(db)).map((c) => c.name)).toEqual(['Antiga']);
  });

  it('migração com erro não deixa nada pela metade', async () => {
    const db = openNodeDatabase();
    await migrate(db);
    const broken: Migration = {
      version: LATEST_DB_VERSION + 1,
      name: 'quebrada',
      sql: 'CREATE TABLE tmp_ok (x INTEGER); CREATE TABLE campaigns (x INTEGER);',
    };
    await expect(migrate(db, [...MIGRATIONS, broken])).rejects.toThrow();
    expect(await currentVersion(db)).toBe(LATEST_DB_VERSION);
    expect(await tables(db)).not.toContain('tmp_ok');
  });

  it('recusa banco criado por versão mais nova do app', async () => {
    const db = openNodeDatabase();
    await migrate(db);
    await db.run('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [LATEST_DB_VERSION + 5, 'futura']);
    await expect(migrate(db)).rejects.toBeInstanceOf(DatabaseTooNewError);
  });
});

describe('campanhas', () => {
  let db: SqlDatabase;
  beforeEach(async () => {
    db = openNodeDatabase();
    await migrate(db);
  });

  it('salva mês a mês e retoma exatamente de onde parou', async () => {
    let state = newState(99);
    await createCampaign(db, { id: 'c1', name: 'Minha campanha', scenarioVersion: '0.1.0', state });
    for (let m = 0; m < 6; m++) {
      const r = advanceMonth(
        state,
        { decisions: m === 0 ? [{ policyId: TEST_DECREE.id, agendaCost: 1, params: { aliquota: 0.01 } }] : [] },
        content,
        [noise],
      );
      await recordMonth(db, 'c1', r);
      state = r.state;
    }

    // "Fechar e reabrir o app": só o que está no banco.
    const resumed = await loadLatestState(db, 'c1');
    expect(resumed).toEqual(state);

    // Continuar a partir do save dá o mesmo que continuar sem salvar (determinismo).
    expect(advanceMonth(resumed, { decisions: [] }, content, [noise]).state).toEqual(
      advanceMonth(state, { decisions: [] }, content, [noise]).state,
    );

    const [summary] = await listCampaigns(db);
    expect(summary).toMatchObject({ id: 'c1', currentMonth: 6, difficulty: 'estrategica', status: 'ativa' });
  });

  it('grava decisões aceitas e recusadas com o motivo', async () => {
    const state = newState();
    await createCampaign(db, { id: 'c1', name: 'x', scenarioVersion: '0.1.0', state });
    await recordMonth(
      db,
      'c1',
      advanceMonth(
        state,
        {
          decisions: [
            { policyId: TEST_PEC.id, agendaCost: 2 },
            { policyId: TEST_BILL.id, agendaCost: 1 },
            { policyId: TEST_DECREE.id, agendaCost: 1 },
          ],
        },
        content,
        [],
      ),
    );
    const rows = await db.all<{ policy_id: string; accepted: number; rejection_reason: string | null }>(
      'SELECT policy_id, accepted, rejection_reason FROM decisions ORDER BY position',
    );
    expect(rows).toEqual([
      { policy_id: TEST_PEC.id, accepted: 1, rejection_reason: null },
      { policy_id: TEST_BILL.id, accepted: 1, rejection_reason: null },
      { policy_id: TEST_DECREE.id, accepted: 0, rejection_reason: 'sem_pontos_de_agenda' },
    ]);
  });

  it('recusa gravar um mês fora de ordem (não sobrescreve o save)', async () => {
    const state = newState();
    await createCampaign(db, { id: 'c1', name: 'x', scenarioVersion: '0.1.0', state });
    const r = advanceMonth(state, { decisions: [] }, content, []);
    await recordMonth(db, 'c1', r);
    await expect(recordMonth(db, 'c1', r)).rejects.toThrow(/não está no mês 0/);
    expect((await loadLatestState(db, 'c1')).monthIndex).toBe(1);
  });

  it('apagar a campanha remove snapshots e decisões em cascata', async () => {
    const state = newState();
    await createCampaign(db, { id: 'c1', name: 'x', scenarioVersion: '0.1.0', state });
    await recordMonth(
      db,
      'c1',
      advanceMonth(state, { decisions: [{ policyId: TEST_DECREE.id, agendaCost: 1 }] }, content, []),
    );
    await deleteCampaign(db, 'c1');
    for (const t of ['campaigns', 'snapshots', 'decisions']) {
      expect(await db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)).toEqual({ n: 0 });
    }
    await expect(loadLatestState(db, 'c1')).rejects.toBeInstanceOf(CampaignNotFoundError);
  });

  it('recusa save com estado de versão mais nova', async () => {
    const state = newState();
    await createCampaign(db, { id: 'c1', name: 'x', scenarioVersion: '0.1.0', state });
    await db.run('UPDATE snapshots SET state_schema_version = 99');
    await expect(loadLatestState(db, 'c1')).rejects.toBeInstanceOf(SaveTooNewError);
  });
});
