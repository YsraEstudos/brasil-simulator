import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID } from '@/content';
import { migrate } from '@/database/migrate';
import { openNodeDatabase } from '@/database/nodeDatabase';
import type { SqlDatabase, SqlValue } from '@/database/types';
import type { Difficulty } from '@/engine';

import { EMPTY_DRAFT } from './agendaDraft';
import { createGameStore, type GameStore, type NewCampaignResult } from './gameStore';
import { DEFAULT_SETUP_PREFS, LAST_DIFFICULTY_KEY, LAST_SCENARIO_KEY, SEED_MAX } from './campaignSetup';

/** Sequência fixa no lugar de Math.random, para o teste ser reproduzível. */
const fakeRandom = () => {
  let i = 0;
  return () => ((i++ * 0.37) % 1) + 0.01;
};

/** Um "aparelho": o mesmo banco sobrevive a reaberturas do app (novas stores). */
async function device() {
  const db = openNodeDatabase();
  await migrate(db);
  const keepOpen: SqlDatabase = { ...db, close: async () => {} };
  const launchApp = async (conn: SqlDatabase = keepOpen): Promise<GameStore> => {
    const store = createGameStore({ openDb: async () => conn, random: fakeRandom() });
    await store.getState().init();
    return store;
  };
  return { db, launchApp };
}

/** Falhas injetáveis: ligadas e desligadas pelo teste, no momento da chamada. */
interface Faults {
  settingsWrite: boolean;
  listRead: boolean;
}

/** Envolve o banco real e falha só as operações marcadas em `faults`; o resto é delegado sem mudança. */
function faulty(db: SqlDatabase, faults: Faults): SqlDatabase {
  return {
    exec: (sql) => db.exec(sql),
    run: (sql, params) =>
      faults.settingsWrite && sql.includes('INSERT INTO settings')
        ? Promise.reject(new Error('disco cheio'))
        : db.run(sql, params),
    all: <T>(sql: string, params?: readonly SqlValue[]) =>
      faults.listRead && sql.includes('FROM campaigns')
        ? Promise.reject(new Error('leitura falhou'))
        : db.all<T>(sql, params),
    first: (sql, params) => db.first(sql, params),
    transaction: (task) => db.transaction(task),
    close: async () => {},
  };
}

interface CampaignRow {
  id: string;
  name: string;
  seed: number;
  scenario_id: string;
  difficulty: string;
}

const campaignRows = (db: SqlDatabase) =>
  db.all<CampaignRow>('SELECT id, name, seed, scenario_id, difficulty FROM campaigns');

/** Extrai o id de um resultado de sucesso; falha o teste com o motivo se não for sucesso. */
function okId(r: NewCampaignResult): string {
  if (!r.ok) throw new Error(`esperava sucesso, veio ${r.reason}: ${r.error}`);
  return r.campaignId;
}

describe('novo jogo: criação e validação', () => {
  it('cria com o cenário padrão quando nenhum é informado', async () => {
    const { db, launchApp } = await device();
    const app = await launchApp();
    const id = okId(await app.getState().newCampaign({ name: 'Padrão', difficulty: 'casual' }));
    expect(app.getState().active!.state.scenarioId).toBe(DEFAULT_SCENARIO_ID);
    expect(app.getState().active!.id).toBe(id);
    const rows = await campaignRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id, scenario_id: DEFAULT_SCENARIO_ID });
  });

  it('usa o cenário informado explicitamente', async () => {
    const { db, launchApp } = await device();
    const app = await launchApp();
    okId(
      await app.getState().newCampaign({ name: 'Versão 0.5', difficulty: 'casual', scenarioId: 'brasil_2027_01_v050' }),
    );
    expect(app.getState().active!.state.scenarioId).toBe('brasil_2027_01_v050');
    expect((await campaignRows(db))[0].scenario_id).toBe('brasil_2027_01_v050');
  });

  it('usa a semente informada, inclusive o máximo 4.294.967.295', async () => {
    const { db, launchApp } = await device();
    const app = await launchApp();
    okId(await app.getState().newCampaign({ name: 'Semente', difficulty: 'casual', seed: 12345 }));
    expect(app.getState().active!.state.seed).toBe(12345);
    expect((await campaignRows(db))[0].seed).toBe(12345);

    okId(await app.getState().newCampaign({ name: 'Semente máxima', difficulty: 'casual', seed: SEED_MAX }));
    expect(app.getState().active!.state.seed).toBe(SEED_MAX);
    expect((await campaignRows(db)).map((r) => r.seed)).toContain(SEED_MAX);
  });

  it('sorteia semente inteira em [0, 2^31) quando nenhuma é informada', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    okId(await app.getState().newCampaign({ name: 'Automática', difficulty: 'casual' }));
    const seed = app.getState().active!.state.seed;
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 31);
  });

  it('normaliza o nome antes de gravar: quebras viram espaço e as pontas são aparadas', async () => {
    const { db, launchApp } = await device();
    const app = await launchApp();
    okId(await app.getState().newCampaign({ name: '  Governo\nNovo  ', difficulty: 'casual' }));
    expect(app.getState().active!.name).toBe('Governo Novo');
    expect((await campaignRows(db))[0].name).toBe('Governo Novo');
  });

  it('rejeita nome vazio sem gravar nada e sem mudar a campanha ativa', async () => {
    const { db, launchApp } = await device();
    const app = await launchApp();
    const r = await app.getState().newCampaign({ name: '   ', difficulty: 'casual' });
    expect(r).toMatchObject({ ok: false, reason: 'invalido' });
    if (r.ok || r.reason !== 'invalido') throw new Error('esperava inválido');
    expect(r.errors.name).toBeDefined();
    expect(await campaignRows(db)).toHaveLength(0);
    expect(app.getState().active).toBeNull();
    expect(app.getState().busy).toBe(false);
  });

  it('rejeita dificuldade inválida sem gravar nada', async () => {
    const { db, launchApp } = await device();
    const app = await launchApp();
    const r = await app.getState().newCampaign({ name: 'Dificuldade', difficulty: 'facil' as unknown as Difficulty });
    expect(r).toMatchObject({ ok: false, reason: 'invalido' });
    expect(await campaignRows(db)).toHaveLength(0);
  });

  it('rejeita cenário desconhecido, inclusive "__proto__", sem gravar nada', async () => {
    const { db, launchApp } = await device();
    const app = await launchApp();
    for (const scenarioId of ['nao_existe', '__proto__']) {
      const r = await app.getState().newCampaign({ name: 'Cenário', difficulty: 'casual', scenarioId });
      expect(r).toMatchObject({ ok: false, reason: 'invalido' });
    }
    expect(await campaignRows(db)).toHaveLength(0);
    expect(app.getState().active).toBeNull();
  });

  it('rejeita sementes fora da faixa ou não inteiras sem gravar nada', async () => {
    const { db, launchApp } = await device();
    const app = await launchApp();
    for (const seed of [-1, 1.5, SEED_MAX + 1, NaN]) {
      const r = await app.getState().newCampaign({ name: 'Semente ruim', difficulty: 'casual', seed });
      expect(r).toMatchObject({ ok: false, reason: 'invalido' });
    }
    expect(await campaignRows(db)).toHaveLength(0);
  });
});

describe('novo jogo: preferências e falhas secundárias', () => {
  it('grava a última dificuldade e o último cenário usados', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    okId(
      await app
        .getState()
        .newCampaign({ name: 'Preferências', difficulty: 'realismo', scenarioId: 'brasil_2027_01_v050' }),
    );
    const restarted = await launchApp();
    expect(restarted.getState().setupPrefs).toEqual({ difficulty: 'realismo', scenarioId: 'brasil_2027_01_v050' });
  });

  it('falha ao gravar as preferências depois do commit: a campanha continua criada e ativa', async () => {
    const { db } = await device();
    const faults: Faults = { settingsWrite: false, listRead: false };
    const app = createGameStore({ openDb: async () => faulty(db, faults), random: fakeRandom() });
    await app.getState().init();
    faults.settingsWrite = true;

    const r = await app.getState().newCampaign({ name: 'Sem preferência', difficulty: 'casual' });
    expect(r.ok).toBe(true);
    const id = okId(r);
    expect((await campaignRows(db)).map((c) => c.id)).toEqual([id]);
    expect(app.getState().active!.id).toBe(id);
    expect(app.getState().active!.name).toBe('Sem preferência');
    expect(app.getState().error).toBeUndefined();
    expect(app.getState().busy).toBe(false);
    expect(app.getState().setupPrefs).toEqual({ difficulty: 'casual', scenarioId: DEFAULT_SCENARIO_ID });
  });

  it('falha ao reler a lista depois do commit: a campanha fica gravada e ativa', async () => {
    const { db } = await device();
    const faults: Faults = { settingsWrite: false, listRead: false };
    const app = createGameStore({ openDb: async () => faulty(db, faults), random: fakeRandom() });
    await app.getState().init();
    faults.listRead = true;

    const r = await app.getState().newCampaign({ name: 'Lista falha', difficulty: 'casual' });
    const id = okId(r);
    expect((await campaignRows(db)).map((c) => c.id)).toEqual([id]);
    expect(app.getState().active!.id).toBe(id);
    expect(app.getState().busy).toBe(false);
  });

  it('falha antes do commit: a transação desfaz tudo, a campanha ativa e o rascunho continuam', async () => {
    const { db, launchApp } = await device();
    const app = await launchApp();
    const idA = okId(await app.getState().newCampaign({ name: 'A', difficulty: 'casual' }));
    app.getState().toggleEventChoice('evento_x', 'escolha_y');
    const draftBefore = app.getState().draft;
    expect(draftBefore).not.toEqual(EMPTY_DRAFT);

    await db.exec('DROP TABLE snapshots');
    const r = await app.getState().newCampaign({ name: 'B', difficulty: 'casual' });
    expect(r).toMatchObject({ ok: false, reason: 'falha' });
    expect(app.getState().active!.id).toBe(idA);
    expect(app.getState().draft).toEqual(draftBefore);
    expect(app.getState().busy).toBe(false);
    const rows = await campaignRows(db);
    expect(rows.map((c) => c.id)).toEqual([idA]);
  });

  it('troca bem-sucedida: a nova fica ativa com rascunho vazio e a anterior continua salva', async () => {
    const { db, launchApp } = await device();
    const app = await launchApp();
    const idA = okId(await app.getState().newCampaign({ name: 'A', difficulty: 'casual' }));
    app.getState().toggleEventChoice('evento_x', 'escolha_y');
    const idB = okId(await app.getState().newCampaign({ name: 'B', difficulty: 'casual' }));

    expect(app.getState().active!.id).toBe(idB);
    expect(app.getState().draft).toEqual(EMPTY_DRAFT);
    expect((await campaignRows(db)).map((c) => c.id)).toEqual(expect.arrayContaining([idA, idB]));
    expect(app.getState().campaigns.map((c) => c.id)).toEqual(expect.arrayContaining([idA, idB]));
  });

  it('segunda chamada enquanto a primeira não terminou é recusada como ocupado; depois disso volta a funcionar', async () => {
    const { db, launchApp } = await device();
    const app = await launchApp();
    const p1 = app.getState().newCampaign({ name: 'Primeira', difficulty: 'casual' });
    const p2 = app.getState().newCampaign({ name: 'Segunda', difficulty: 'casual' });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.ok).toBe(true);
    expect(r2).toMatchObject({ ok: false, reason: 'ocupado' });
    expect(await campaignRows(db)).toHaveLength(1);

    const r3 = await app.getState().newCampaign({ name: 'Terceira', difficulty: 'casual' });
    expect(r3.ok).toBe(true);
    expect(app.getState().busy).toBe(false);
    expect(await campaignRows(db)).toHaveLength(2);
  });
});

describe('novo jogo: retomada e reprodutibilidade', () => {
  it('após reabrir o app, a campanha aparece na lista e retoma com o estado inicial', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    const id = okId(await app.getState().newCampaign({ name: 'Retomada', difficulty: 'estrategica', seed: 2024 }));
    const created = app.getState().active!.state;

    const restarted = await launchApp();
    expect(restarted.getState().campaigns).toMatchObject([{ id, seed: created.seed }]);
    expect(await restarted.getState().continueCampaign(id)).toBe(true);
    expect(restarted.getState().active!.state).toEqual(created);
  });

  it('continuar a campanha já ativa mantém o rascunho e o mesmo objeto', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    const id = okId(await app.getState().newCampaign({ name: 'Ativa', difficulty: 'casual' }));
    app.getState().toggleEventChoice('evento_x', 'escolha_y');
    const draftBefore = app.getState().draft;
    const activeBefore = app.getState().active;

    expect(await app.getState().continueCampaign(id)).toBe(true);
    expect(app.getState().draft).toEqual(draftBefore);
    expect(app.getState().active).toBe(activeBefore);
  });

  it('mesma semente, mesmo cenário e dificuldade: estados iniciais e meses seguintes são idênticos', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    const idA = okId(await app.getState().newCampaign({ name: 'Par A', difficulty: 'estrategica', seed: 777 }));
    const stateA = app.getState().active!.state;
    const idB = okId(await app.getState().newCampaign({ name: 'Par B', difficulty: 'estrategica', seed: 777 }));
    const stateB = app.getState().active!.state;
    expect(idA).not.toBe(idB);
    expect(stateA).toEqual(stateB);
    expect(stateA.rng).toEqual(stateB.rng);

    expect(await app.getState().continueCampaign(idA)).toBe(true);
    expect(await app.getState().endMonth()).toBe(true);
    const afterA = { state: app.getState().active!.state, report: app.getState().active!.lastReport };

    expect(await app.getState().continueCampaign(idB)).toBe(true);
    expect(await app.getState().endMonth()).toBe(true);
    const afterB = { state: app.getState().active!.state, report: app.getState().active!.lastReport };

    expect(afterA.state.monthIndex).toBe(1);
    expect(afterB.state).toEqual(afterA.state);
    expect(afterB.report).toEqual(afterA.report);
  });
});

describe('novo jogo: preferências corrompidas e exclusão', () => {
  it('preferências corrompidas no banco voltam aos padrões sem impedir a abertura', async () => {
    const { db, launchApp } = await device();
    await db.run('INSERT INTO settings (key, value_json) VALUES (?, ?)', [LAST_DIFFICULTY_KEY, '{"x":1}']);
    await db.run('INSERT INTO settings (key, value_json) VALUES (?, ?)', [LAST_SCENARIO_KEY, 'not json']);
    await db.run('INSERT INTO settings (key, value_json) VALUES (?, ?)', ['textScale', '"huge"']);

    const app = await launchApp();
    expect(app.getState().setupPrefs).toEqual(DEFAULT_SETUP_PREFS);
    expect(app.getState().textScale).toBe(1);
    expect(app.getState().status).toBe('pronto');
  });

  it('excluir a campanha ativa limpa a ativa e o rascunho', async () => {
    const { db, launchApp } = await device();
    const app = await launchApp();
    const id = okId(await app.getState().newCampaign({ name: 'Excluir', difficulty: 'casual' }));
    app.getState().toggleEventChoice('evento_x', 'escolha_y');

    expect(await app.getState().deleteCampaign(id)).toBe(true);
    expect(app.getState().active).toBeNull();
    expect(app.getState().draft).toEqual(EMPTY_DRAFT);
    expect(await campaignRows(db)).toHaveLength(0);
    expect(app.getState().campaigns).toEqual([]);
  });
});
