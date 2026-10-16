import { describe, expect, it } from 'vitest';

import { migrate } from '@/database/migrate';
import { LATEST_DB_VERSION, MIGRATIONS } from '@/database/migrations';
import { openNodeDatabase } from '@/database/nodeDatabase';
import type { SqlDatabase } from '@/database/types';
import { createCampaign } from '@/database/campaignRepository';
import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { createInitialState, DIRECTIVE_ACTION_ID } from '@/engine';

import { createGameStore } from './gameStore';
import { campaignMonths, PROTOTYPE_MONTHS, SCENARIOS } from './scenarios';

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
  const launchApp = async () => {
    const store = createGameStore({ openDb: async () => keepOpen, random: fakeRandom() });
    await store.getState().init();
    return store;
  };
  return { db, launchApp };
}

describe('cenário embutido', () => {
  it('o cenário do protótipo é válido e todo número é provisório ou fictício', () => {
    const s = SCENARIOS.prototipo_ficticio;
    for (const v of Object.values(s.indicators)) expect(['PROVISORIO', 'FICTICIO']).toContain(v.status);
  });
});

describe('criar, salvar, fechar e retomar (critério da Fase 01)', () => {
  it('diretriz só executa ao encerrar o mês e persiste após fechar/reabrir', async () => {
    const { launchApp } = await device();
    let app = await launchApp();
    await app.getState().newCampaign({ name: 'Diretrizes', difficulty: 'casual' });
    const initial = app.getState().active!.state;
    const content = loadContent(initial.scenarioId);
    const routine = Object.values(content.policies).find((p) => p.delivery === 'rotina');
    const ministry = content.scenario.institutions!.ministries.find((m) => routine && m.areas.includes(routine.area));
    if (!routine || !ministry) throw new Error('sem rotina e pasta');
    app.getState().toggleDecision({
      policyId: DIRECTIVE_ACTION_ID,
      agendaCost: 1,
      params: { ministryId: ministry.id, policyId: routine.id, annualMillions: 800 },
    });
    expect(app.getState().active!.state).toEqual(initial);
    await app.getState().endMonth();
    const before = app.getState().active!;
    expect(before.state.publicPolicies.directives).toHaveLength(1);
    expect(app.getState().error).toBeUndefined();
    app = await launchApp();
    await app.getState().continueCampaign(before.id);
    expect(app.getState().active!.state).toEqual(before.state);
    expect(app.getState().draft.decisions).toEqual([]);
  });

  it('campanha do cenário legado continua limitada a 12 meses', async () => {
    const { db, launchApp } = await device();
    const legacy = loadContent('brasil_2027_01');
    const state = createInitialState({ content: legacy, difficulty: 'casual', seed: 1 });
    await createCampaign(db, { id: 'legada', name: 'Legada', scenarioVersion: legacy.scenario.version, state });
    const app = await launchApp();
    await app.getState().continueCampaign('legada');
    for (let month = 0; month < 14; month++) await app.getState().endMonth();
    expect(app.getState().active!.state.monthIndex).toBe(12);
    expect(app.getState().active!.finished).toBe(true);
  });
  it('retoma a campanha exatamente onde parou após "fechar o app"', async () => {
    const { launchApp } = await device();

    let app = await launchApp();
    expect(app.getState().status).toBe('pronto');
    await app.getState().newCampaign({ name: '  Governo Teste  ', difficulty: 'casual' });
    const id = app.getState().active!.id;
    expect(app.getState().active!.name).toBe('Governo Teste');
    for (const policyId of ['contingenciamento', 'iof_credito_reducao', 'irpf_tabela']) {
      await app.getState().endMonth({ decisions: [{ policyId, agendaCost: 1 }] });
    }
    const before = app.getState().active!.state;
    const beforePrevious = app.getState().active!.previous;
    const lastReport = app.getState().active!.lastReport;
    expect(before.monthIndex).toBe(3);

    // Fecha o app: nova store, nada em memória.
    app = await launchApp();
    expect(app.getState().active).toBeNull();
    expect(app.getState().campaigns).toMatchObject([{ id, name: 'Governo Teste', currentMonth: 3, status: 'ativa' }]);

    await app.getState().continueCampaign(id);
    const resumed = app.getState().active!;
    expect(resumed.state).toEqual(before);
    expect(resumed.previous).toEqual(beforePrevious); // mês anterior carregado do snapshot
    expect(resumed.state.decisionLog).toHaveLength(3);
    expect(resumed.lastReport).toEqual(lastReport); // relatório do mês anterior vem do banco
  });

  it('encerrar o mês sem entrada usa o rascunho da agenda e o limpa; nova campanha começa sem rascunho', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    await app.getState().newCampaign({ name: 'Rascunho', difficulty: 'estrategica' });
    app.getState().toggleDecision({ policyId: 'contingenciamento', agendaCost: 0 });
    app.getState().toggleDecision({ policyId: 'pressionar_banco_central', agendaCost: 0 });
    await app.getState().endMonth();
    const report = app.getState().active!.lastReport!;
    expect(report.accepted.map((d) => d.policyId)).toEqual(['contingenciamento', 'pressionar_banco_central']);
    expect(report.rejected).toEqual([]);
    expect(app.getState().draft.decisions).toEqual([]);

    app.getState().toggleDecision({ policyId: 'irpf_tabela', agendaCost: 0 });
    await app.getState().newCampaign({ name: 'Outra', difficulty: 'casual' });
    expect(app.getState().draft.decisions).toEqual([]);
  });

  it('cenário novo continua após 12 meses e encerra no mês 48, sem avançar mais', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    await app.getState().newCampaign({ name: 'Curta', difficulty: 'estrategica' });
    const months = campaignMonths(app.getState().active!.state.scenarioId);
    for (let m = 0; m < PROTOTYPE_MONTHS; m++) await app.getState().endMonth();
    expect(app.getState().active!.finished).toBe(false);
    expect(months).toBe(48);
    for (let m = PROTOTYPE_MONTHS; m < months + 2; m++) await app.getState().endMonth();
    expect(app.getState().active!.finished).toBe(true);
    expect(app.getState().active!.state.monthIndex).toBe(months);
    expect(app.getState().campaigns[0].status).toBe('encerrada');
  });

  it('corrige ao carregar uma campanha com o último mês gravado mas ainda "ativa"', async () => {
    const { db, launchApp } = await device();
    let app = await launchApp();
    await app.getState().newCampaign({ name: 'Interrompida', difficulty: 'casual' });
    const id = app.getState().active!.id;
    const months = campaignMonths(app.getState().active!.state.scenarioId);
    for (let m = 0; m < months; m++) await app.getState().endMonth();
    // Simula um save antigo: último mês gravado, status não atualizado.
    await db.run("UPDATE campaigns SET status = 'ativa' WHERE id = ?", [id]);

    app = await launchApp();
    await app.getState().continueCampaign(id);
    expect(app.getState().active!.finished).toBe(true);
    await app.getState().endMonth();
    expect(app.getState().active!.state.monthIndex).toBe(months);
    expect(app.getState().campaigns[0].status).toBe('encerrada');
  });

  it('apaga campanhas e mantém a lista coerente', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    await app.getState().newCampaign({ name: 'A', difficulty: 'casual' });
    await app.getState().leaveCampaign();
    await app.getState().newCampaign({ name: 'B', difficulty: 'casual' });
    const b = app.getState().active!.id;
    await app.getState().deleteCampaign(b);
    expect(app.getState().active).toBeNull();
    expect(app.getState().campaigns.map((c) => c.name)).toEqual(['A']);
  });

  it('salva o tamanho do texto entre aberturas do app', async () => {
    const { launchApp } = await device();
    await (await launchApp()).getState().setTextScale(1.3);
    expect((await launchApp()).getState().textScale).toBe(1.3);
  });

  it('erros de banco viram mensagem, sem derrubar o app', async () => {
    const { db, launchApp } = await device();
    const app = await launchApp();
    await db.exec('DROP TABLE snapshots');
    await app.getState().newCampaign({ name: 'X', difficulty: 'casual' });
    expect(app.getState().error).toMatch(/snapshots/);
    expect(app.getState().busy).toBe(false);
  });
});

describe('fim da campanha por impeachment (FASE_07.md; POLITICAL_RULES.md §10)', () => {
  it('estado com a marca impeachment_condenado encerra a campanha ao carregar', async () => {
    const { db, launchApp } = await device();
    const state = createInitialState({ content: loadContent(DEFAULT_SCENARIO_ID), difficulty: 'casual', seed: 3 });
    const condemned = { ...state, events: { ...state.events, flags: { impeachment_condenado: 0 } } };
    await createCampaign(db, {
      id: 'condenada',
      name: 'Condenada',
      scenarioVersion: SCENARIOS[DEFAULT_SCENARIO_ID].version,
      state: condemned,
    });

    const app = await launchApp();
    await app.getState().continueCampaign('condenada');
    expect(app.getState().active!.finished).toBe(true);
    expect(app.getState().campaigns).toMatchObject([{ id: 'condenada', status: 'encerrada' }]);
  });

  it('a marca de condenação encerra a campanha ao avançar o mês, e a campanha fica encerrada depois', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    await app.getState().newCampaign({ name: 'Condenação', difficulty: 'casual' });
    const active = app.getState().active!;
    const flagged = { ...active.state, events: { ...active.state.events, flags: { impeachment_condenado: 0 } } };
    app.setState({ active: { ...active, state: flagged } });

    await app.getState().endMonth();
    expect(app.getState().active!.finished).toBe(true);
    expect(app.getState().active!.state.monthIndex).toBe(1);
    expect(app.getState().campaigns).toMatchObject([{ status: 'encerrada' }]);

    // Encerrada: não avança mais.
    await app.getState().endMonth();
    expect(app.getState().active!.state.monthIndex).toBe(1);
  });
});

describe('série do Painel (histórico de indicadores)', () => {
  it('sem partida não há série', async () => {
    const app = await (await device()).launchApp();
    expect(await app.getState().history()).toEqual([]);
  });

  it('acompanha os meses gravados, inclusive entre aberturas do app', async () => {
    const { launchApp } = await device();
    let app = await launchApp();
    await app.getState().newCampaign({ name: 'Série', difficulty: 'casual' });
    const id = app.getState().active!.id;
    await app.getState().endMonth();
    await app.getState().endMonth();
    let points = await app.getState().history();
    expect(points.map((p) => p.monthIndex)).toEqual([0, 1, 2]);
    expect(points[2].indicators).toEqual(app.getState().active!.state.indicators);

    app = await launchApp();
    await app.getState().continueCampaign(id);
    points = await app.getState().history();
    expect(points.map((p) => p.monthIndex)).toEqual([0, 1, 2]);
  });
});

describe('migração 2 (configurações)', () => {
  it('atualiza um banco da versão 1 com campanha salva sem perder nada', async () => {
    const db = openNodeDatabase();
    await migrate(db, MIGRATIONS.slice(0, 1));
    const v1 = createGameStore({ openDb: async () => ({ ...db, close: async () => {} }), random: fakeRandom() });
    // A store exige a v2 (settings) só ao ler preferências; criamos a campanha direto pelo repositório.
    const { insertLegacyCampaign } = await import('@/tests/legacyDb');
    const { createInitialState } = await import('@/engine');
    const { loadContent } = await import('@/content');
    await insertLegacyCampaign(db, {
      id: 'antiga',
      name: 'Campanha da v1',
      scenarioVersion: '0.1.0',
      state: createInitialState({ content: loadContent('prototipo_ficticio'), difficulty: 'casual', seed: 1 }),
    });
    expect(await migrate(db)).toEqual([2, 3, 4]);
    expect(LATEST_DB_VERSION).toBe(4);
    await v1.getState().init();
    expect(v1.getState().campaigns.map((c) => c.name)).toEqual(['Campanha da v1']);
  });
});
