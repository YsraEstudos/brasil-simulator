import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { insertLegacyCampaign } from '@/tests/legacyDb';
import { TEST_BILL, TEST_DECREE, TEST_PEC, testContent, testState } from '@/tests/fixtures';

import {
  advanceMonth,
  createInitialState,
  STATE_SCHEMA_VERSION,
  type GameState,
  type MonthResult,
  type MonthStep,
} from '../engine';
import {
  CampaignNotFoundError,
  createCampaign,
  deleteCampaign,
  listCampaigns,
  loadIndicatorHistory,
  loadLatestState,
  loadProfileHistory,
  loadRegionalHistory,
  loadReport,
  loadStateAt,
  recordMonth,
  REGIONAL_FIELDS,
  PROFILE_HISTORY_MONTHS,
  REPORT_RETENTION_MONTHS,
  SaveTooNewError,
  SNAPSHOT_RETENTION_MONTHS,
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
    await insertLegacyCampaign(db, { id: 'c1', name: 'Antiga', scenarioVersion: '0.1.0', state: newState() });
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

  it('migração 3 cria month_reports', async () => {
    const db = openNodeDatabase();
    await migrate(db);
    expect(await tables(db)).toContain('month_reports');
  });

  it('migra um banco v2 para v3 mantendo as campanhas', async () => {
    const db = openNodeDatabase();
    await migrate(db, MIGRATIONS.slice(0, 2));
    await insertLegacyCampaign(db, { id: 'c1', name: 'Antiga', scenarioVersion: '0.1.0', state: newState() });
    expect(await migrate(db)).toEqual([3, 4, 5]);
    expect(await currentVersion(db)).toBe(LATEST_DB_VERSION);
    expect((await listCampaigns(db)).map((c) => c.name)).toEqual(['Antiga']);
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
      { policy_id: TEST_DECREE.id, accepted: 0, rejection_reason: 'sem_acoes_de_agenda' },
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

  it('guarda só os últimos 12 relatórios mensais e recupera cada um pelo mês', async () => {
    const results: MonthResult[] = [];
    let state = newState(5);
    await createCampaign(db, { id: 'c1', name: 'x', scenarioVersion: '0.1.0', state });
    for (let m = 0; m < 15; m++) {
      const r = advanceMonth(state, { decisions: [] }, content, []);
      await recordMonth(db, 'c1', r);
      results.push(r);
      state = r.state;
    }

    // Mês 14 é o último: mantém 3..14 (12 meses), descarta 0..2.
    expect(REPORT_RETENTION_MONTHS).toBe(12);
    const kept = await db.all<{ month_index: number }>(
      'SELECT month_index FROM month_reports WHERE campaign_id = ? ORDER BY month_index',
      ['c1'],
    );
    expect(kept.map((r) => r.month_index)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(await loadReport(db, 'c1', 14)).toEqual(results[14].report);
    expect(await loadReport(db, 'c1', 2)).toBeNull();
  });

  it('relatório gravado antes da Fase 05 (sem explicação por UF) volta com `regional` nulo', async () => {
    const state = newState(6);
    await createCampaign(db, { id: 'c1', name: 'x', scenarioVersion: '0.1.0', state });
    const { regional: _omit, ...old } = advanceMonth(state, { decisions: [] }, content, []).report;
    await db.run('INSERT INTO month_reports (campaign_id, month_index, report_json) VALUES (?, ?, ?)', [
      'c1',
      0,
      JSON.stringify(old),
    ]);
    expect((await loadReport(db, 'c1', 0))?.regional).toBeNull();
  });

  it('relatório gravado antes da v10 (sem decisões que moveram o perfil) volta com `profileMoves` vazio', async () => {
    const state = newState(6);
    await createCampaign(db, { id: 'c1', name: 'x', scenarioVersion: '0.1.0', state });
    const { profileMoves: _omit, ...old } = advanceMonth(state, { decisions: [] }, content, []).report;
    await db.run('INSERT INTO month_reports (campaign_id, month_index, report_json) VALUES (?, ?, ?)', [
      'c1',
      0,
      JSON.stringify(old),
    ]);
    expect((await loadReport(db, 'c1', 0))?.profileMoves).toEqual([]);
  });

  it('relatório gravado antes da v9 (motivo "sem_pontos_de_agenda") volta com o motivo atual', async () => {
    const state = newState(6);
    await createCampaign(db, { id: 'c1', name: 'x', scenarioVersion: '0.1.0', state });
    const report = advanceMonth(state, { decisions: [] }, content, []).report;
    const legacy = {
      ...report,
      rejected: [{ decision: { policyId: TEST_PEC.id, agendaCost: 2 }, reason: 'sem_pontos_de_agenda' }],
    };
    await db.run('INSERT INTO month_reports (campaign_id, month_index, report_json) VALUES (?, ?, ?)', [
      'c1',
      0,
      JSON.stringify(legacy),
    ]);
    expect((await loadReport(db, 'c1', 0))?.rejected[0]?.reason).toBe('sem_acoes_de_agenda');
  });

  it('guarda snapshots completos só dos últimos 13 meses e a série de indicadores inteira (ECONOMIC_MODEL.md §11)', async () => {
    let state = newState(8);
    await createCampaign(db, { id: 'c1', name: 'x', scenarioVersion: '0.1.0', state });
    for (let m = 0; m < 20; m++) {
      const r = advanceMonth(state, { decisions: [] }, content, [noise]);
      await recordMonth(db, 'c1', r);
      state = r.state;
    }
    expect(SNAPSHOT_RETENTION_MONTHS).toBe(13);
    const snaps = await db.all<{ month_index: number }>(
      'SELECT month_index FROM snapshots WHERE campaign_id = ? ORDER BY month_index',
      ['c1'],
    );
    expect(snaps.map((r) => r.month_index)).toEqual(Array.from({ length: 13 }, (_, i) => i + 8));
    expect(await loadLatestState(db, 'c1')).toEqual(state);
    expect(await loadStateAt(db, 'c1', 19)).not.toBeNull();
    expect(await loadStateAt(db, 'c1', 7)).toBeNull();

    const history = await loadIndicatorHistory(db, 'c1');
    expect(history.map((p) => p.monthIndex)).toEqual(Array.from({ length: 21 }, (_, i) => i));
    expect(history[20]?.indicators).toEqual(state.indicators);
    expect(history[20]?.grossDebt).toBe(state.economy.grossDebt);
  });

  it('a migração 4 preenche a série com os snapshots que já existiam', async () => {
    const old = openNodeDatabase();
    await migrate(old, MIGRATIONS.slice(0, 3));
    const state = newState(2);
    await old.run(
      `INSERT INTO campaigns (id, name, scenario_id, scenario_version, difficulty, seed, engine_version, current_month)
       VALUES ('c1', 'x', ?, '0.1.0', 'estrategica', 2, '0.2.0', 0)`,
      [state.scenarioId],
    );
    await old.run(
      'INSERT INTO snapshots (campaign_id, month_index, state_schema_version, state_json) VALUES (?, ?, ?, ?)',
      ['c1', 0, state.schemaVersion, JSON.stringify(state)],
    );
    expect(await migrate(old)).toEqual([4, 5]);
    const [point] = await loadIndicatorHistory(old, 'c1');
    expect(point?.indicators).toEqual(state.indicators);
    expect(point?.selic).toBe(state.economy.selic);
  });

  it('grava eventos disparados (no mês seguinte, sem escolha) e resolvidos (com a escolha)', async () => {
    const state = newState();
    await createCampaign(db, { id: 'c1', name: 'x', scenarioVersion: '0.1.0', state });
    const real = advanceMonth(state, { decisions: [] }, content, []);
    const fake: MonthResult = {
      ...real,
      report: {
        ...real.report,
        eventsFired: ['teste_choque'],
        eventsResolved: [{ eventId: 'teste_choque', choiceId: 'subsidiar', automatic: true }],
      },
    };
    await recordMonth(db, 'c1', fake);
    const rows = await db.all<{
      month_index: number;
      event_id: string;
      choice_id: string | null;
      payload_json: string | null;
    }>('SELECT month_index, event_id, choice_id, payload_json FROM events ORDER BY id');
    expect(rows).toEqual([
      { month_index: real.report.monthIndex + 1, event_id: 'teste_choque', choice_id: null, payload_json: null },
      {
        month_index: real.report.monthIndex,
        event_id: 'teste_choque',
        choice_id: 'subsidiar',
        payload_json: JSON.stringify({ automatic: true }),
      },
    ]);
  });

  it('carrega um save da v1 (Fase 01) atualizado para a versão atual, sem recusá-lo', async () => {
    // Save real da Fase 01 gravado por SQL, como estava no banco antes da migração (AI_INSTRUCTIONS.md §2.10).
    const v1State =
      '{"schemaVersion":1,"engineVersion":"0.1.0","scenarioId":"prototipo_ficticio","difficulty":"casual","seed":1,"rng":[1,2,3,4],"monthIndex":3,"indicators":{"approval":0.45,"gdpGrowth12m":0.02,"inflation12m":0.045,"unemployment":0.06,"primaryBalance12m":-0.004},"resources":{"politicalCapital":70,"agendaPointsPerMonth":4},"decisionLog":[]}';
    await db.run(
      `INSERT INTO campaigns (id, name, scenario_id, scenario_version, difficulty, seed, engine_version, current_month)
       VALUES ('antiga', 'Save v1', 'prototipo_ficticio', '0.1.0', 'casual', 1, '0.1.0', 3)`,
    );
    await db.run(
      'INSERT INTO snapshots (campaign_id, month_index, state_schema_version, state_json) VALUES (?, ?, ?, ?)',
      ['antiga', 3, 1, v1State],
    );

    const state = await loadLatestState(db, 'antiga');
    expect(state.schemaVersion).toBe(STATE_SCHEMA_VERSION);
    expect(state.monthIndex).toBe(3);
    expect(state.indicators).toEqual({
      approval: 0.45,
      gdpGrowth12m: 0.02,
      inflation12m: 0.045,
      unemployment: 0.06,
      primaryBalance12m: -0.004,
    });
    expect(state.economy).toBeDefined();
    const numbers = Object.values(state.economy).filter((v): v is number => typeof v === 'number');
    expect(numbers.length).toBeGreaterThan(0);
    for (const n of numbers) expect(Number.isFinite(n)).toBe(true);
    expect(state.proposals).toEqual([]);
    expect(state.impulses).toEqual([]);
    expect(state.events.pending).toEqual([]);
  });

  it('apagar a campanha também remove os relatórios mensais', async () => {
    const state = newState();
    await createCampaign(db, { id: 'c1', name: 'x', scenarioVersion: '0.1.0', state });
    const r = advanceMonth(state, { decisions: [] }, content, []);
    await recordMonth(db, 'c1', r);
    expect(await loadReport(db, 'c1', 0)).not.toBeNull();
    await deleteCampaign(db, 'c1');
    expect(await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM month_reports')).toEqual({ n: 0 });
  });

  it('recusa save com estado de versão mais nova', async () => {
    const state = newState();
    await createCampaign(db, { id: 'c1', name: 'x', scenarioVersion: '0.1.0', state });
    await db.run('UPDATE snapshots SET state_schema_version = 99');
    await expect(loadLatestState(db, 'c1')).rejects.toBeInstanceOf(SaveTooNewError);
  });
});

describe('série regional (PLANO_GLOBO.md, PR 3)', () => {
  const real = loadContent(DEFAULT_SCENARIO_ID);
  const regionalState = (seed = 3) => createInitialState({ content: real, difficulty: 'estrategica', seed });
  let db: SqlDatabase;
  beforeEach(async () => {
    db = openNodeDatabase();
    await migrate(db);
  });

  it('a migração 5 cria a tabela', async () => {
    expect(await tables(db)).toContain('regional_indicator_history');
  });

  it('a campanha nasce com a posse (mês 0) e cada mês gravado entra na série', async () => {
    let state = regionalState();
    await createCampaign(db, { id: 'c1', name: 'x', scenarioVersion: '0.1.0', state });
    let history = await loadRegionalHistory(db, 'c1');
    expect(history.map((p) => p.monthIndex)).toEqual([0]);
    expect(Object.keys(history[0].ufs)).toHaveLength(27);
    for (let m = 0; m < 3; m++) {
      const r = advanceMonth(state, { decisions: [] }, real, []);
      await recordMonth(db, 'c1', r);
      state = r.state;
    }
    history = await loadRegionalHistory(db, 'c1');
    expect(history.map((p) => p.monthIndex)).toEqual([0, 1, 2, 3]);
    // Os valores gravados são os do estado, campo a campo.
    for (const uf of state.regions.ufs) {
      for (const f of REGIONAL_FIELDS) expect(history[3].ufs[uf.id][f]).toBe(uf[f]);
    }
  });

  it('o mês regional é gravado na mesma transação do recordMonth (falhou, nada fica)', async () => {
    const state = regionalState();
    await createCampaign(db, { id: 'c1', name: 'x', scenarioVersion: '0.1.0', state });
    await db.run('INSERT INTO regional_indicator_history (campaign_id, month_index, point_json) VALUES (?, ?, ?)', [
      'c1',
      1,
      '{}',
    ]);
    await expect(recordMonth(db, 'c1', advanceMonth(state, { decisions: [] }, real, []))).rejects.toThrow();
    expect(await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM month_reports')).toEqual({ n: 0 });
    expect((await listCampaigns(db))[0].currentMonth).toBe(0);
  });

  it('depois do mês 13 a posse continua na série, mesmo sem o snapshot do mês 0', async () => {
    let state = regionalState(4);
    await createCampaign(db, { id: 'c1', name: 'x', scenarioVersion: '0.1.0', state });
    const posse = state.regions.ufs.map((u) => u.approval);
    for (let m = 0; m < 15; m++) {
      const r = advanceMonth(state, { decisions: [] }, real, []);
      await recordMonth(db, 'c1', r);
      state = r.state;
    }
    expect(await loadStateAt(db, 'c1', 0)).toBeNull();
    const history = await loadRegionalHistory(db, 'c1');
    expect(history.map((p) => p.monthIndex)).toEqual(Array.from({ length: 16 }, (_, i) => i));
    expect(Object.values(history[0].ufs).map((v) => v.approval)).toEqual(posse);
  });

  it('a migração 5 preenche a série com os snapshots que ainda existem; o que já se perdeu fica de fora', async () => {
    const old = openNodeDatabase();
    await migrate(old, MIGRATIONS.slice(0, 4));
    const s0 = regionalState(5);
    const s1 = advanceMonth(s0, { decisions: [] }, real, []).state;
    const { regions: _omit, ...semRegioes } = s0;
    await old.run(
      `INSERT INTO campaigns (id, name, scenario_id, scenario_version, difficulty, seed, engine_version, current_month)
       VALUES ('c1', 'x', ?, '0.1.0', 'estrategica', 5, '0.2.0', 1)`,
      [s0.scenarioId],
    );
    const put = (month: number, json: unknown) =>
      old.run(
        'INSERT INTO snapshots (campaign_id, month_index, state_schema_version, state_json) VALUES (?, ?, ?, ?)',
        ['c1', month, s0.schemaVersion, JSON.stringify(json)],
      );
    await put(0, { ...s0, regions: { ufs: [] } }); // save que ainda não processara as UFs
    await put(1, s1);
    await put(2, semRegioes); // snapshot de formato sem o bloco regional

    expect(await migrate(old)).toEqual([5]);
    const history = await loadRegionalHistory(old, 'c1');
    expect(history.map((p) => p.monthIndex)).toEqual([1]);
    for (const uf of s1.regions.ufs) {
      // json_extract/json_array pode arredondar um REAL em 1 ULP entre versões do SQLite.
      for (const f of REGIONAL_FIELDS) expect(history[0].ufs[uf.id][f]).toBeCloseTo(uf[f], 14);
    }
  });

  it('apagar a campanha remove a série regional', async () => {
    await createCampaign(db, { id: 'c1', name: 'x', scenarioVersion: '0.1.0', state: regionalState() });
    await deleteCampaign(db, 'c1');
    expect(await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM regional_indicator_history')).toEqual({ n: 0 });
  });

  it('cenário sem dados regionais não grava linha (lacuna, não zeros)', async () => {
    await createCampaign(db, { id: 'c1', name: 'x', scenarioVersion: '0.1.0', state: newState() });
    expect(await loadRegionalHistory(db, 'c1')).toEqual([]);
  });
});

describe('rastro do perfil do governo (PLANO_GLOBO.md §5.2, PR 4)', () => {
  let db: SqlDatabase;
  beforeEach(async () => {
    db = openNodeDatabase();
    await migrate(db);
  });

  async function play(months: number, withMoves = false): Promise<GameState> {
    let state: GameState = { ...newState(), government: { profile: { economic: 0.4, social: -0.2 } } };
    await createCampaign(db, { id: 'c1', name: 'x', scenarioVersion: '0.1.0', state });
    for (let m = 0; m < months; m++) {
      const r = advanceMonth(state, { decisions: [] }, content, []);
      const profileMoves = withMoves
        ? [
            {
              sourceId: 'p' + m,
              kind: 'sancao' as const,
              label: 'Lei ' + m,
              delta: { economic: 0.01 * (m + 1), social: 0 },
            },
          ]
        : undefined;
      await recordMonth(db, 'c1', { ...r, report: { ...r.report, profileMoves } });
      state = r.state;
    }
    return state;
  }

  it('devolve o perfil de cada mês gravado, do mais antigo ao mais recente, a começar pela posse', async () => {
    const state = await play(3);
    const { trail, moves } = await loadProfileHistory(db, 'c1');
    expect(trail.map((p) => p.monthIndex)).toEqual([0, 1, 2, 3]);
    expect(trail[0].profile).toEqual({ economic: 0.4, social: -0.2 });
    expect(trail[3].profile).toEqual(state.government.profile);
    expect(moves).toEqual([]);
  });

  it(`guarda no máximo os últimos ${PROFILE_HISTORY_MONTHS} meses`, async () => {
    await play(SNAPSHOT_RETENTION_MONTHS + 2);
    const { trail } = await loadProfileHistory(db, 'c1');
    expect(trail).toHaveLength(PROFILE_HISTORY_MONTHS);
    expect(trail[trail.length - 1].monthIndex).toBe(SNAPSHOT_RETENTION_MONTHS + 2);
  });

  it('snapshot anterior à v10 não entra no rastro (nada de perfil neutro inventado)', async () => {
    await play(2);
    await db.run('UPDATE snapshots SET state_schema_version = 9 WHERE campaign_id = ? AND month_index <= 1', ['c1']);
    const { trail } = await loadProfileHistory(db, 'c1');
    expect(trail.map((p) => p.monthIndex)).toEqual([2]);
  });

  it('decisões que moveram o perfil: dos relatórios, do mês mais recente para o mais antigo, sem meses vazios', async () => {
    await play(3, true);
    const { moves } = await loadProfileHistory(db, 'c1');
    expect(moves.map((m) => m.monthIndex)).toEqual([2, 1, 0]);
    expect(moves[0].moves[0]).toMatchObject({ sourceId: 'p2', kind: 'sancao' });
  });

  it('relatório antigo (sem o campo) e campanha sem dados voltam vazios', async () => {
    await play(2);
    const { trail, moves } = await loadProfileHistory(db, 'c1');
    expect(trail).toHaveLength(3);
    expect(moves).toEqual([]);
    expect(await loadProfileHistory(db, 'inexistente')).toEqual({ trail: [], moves: [] });
  });
});
