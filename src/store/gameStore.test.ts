import { describe, expect, it } from 'vitest';

import { migrate } from '@/database/migrate';
import { LATEST_DB_VERSION, MIGRATIONS } from '@/database/migrations';
import { openNodeDatabase } from '@/database/nodeDatabase';
import type { SqlDatabase } from '@/database/types';
import { createCampaign, finishCampaign, listCampaigns, loadStateAt } from '@/database/campaignRepository';
import { setSetting } from '@/database/settingsRepository';
import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { campaignOutcome, createInitialState, DIRECTIVE_ACTION_ID, turnIndexOf } from '@/engine';

import { LAST_DIFFICULTY_KEY, NAME_ERRORS } from './campaignSetup';
import { createGameStore, RESETTABLE_SETTING_KEYS, type NewCampaignResult } from './gameStore';
import { DEFAULT_MAP_QUALITY } from './mapQuality';
import { DEFAULT_PREFERENCES, PREFERENCE_DEFS, PREFERENCE_KEYS } from './preferences';
import { SAVED_LIST_PREFS_KEY } from './savedListPrefs';
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
    const baseline = app.getState().active!.baseline;
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
    expect(resumed.baseline).toEqual(baseline); // a posse vem do snapshot do mês 0 do save, não do cenário embutido
    expect(resumed.baseline?.monthIndex).toBe(0);
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

  it('enquanto o mês é gravado o rascunho não muda (a escolha não some com a limpeza do fim)', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    await app.getState().newCampaign({ name: 'Ocupada', difficulty: 'estrategica' });
    const closing = app.getState().endMonth();
    expect(app.getState().busy).toBe(true);
    app.getState().toggleDecision({ policyId: 'contingenciamento', agendaCost: 0 });
    app.getState().toggleEventChoice('alta_petroleo', 'qualquer');
    expect(app.getState().draft).toEqual({ decisions: [], eventChoices: {} });
    expect(await closing).toBe(true);
    app.getState().toggleDecision({ policyId: 'contingenciamento', agendaCost: 0 });
    expect(app.getState().draft.decisions).toHaveLength(1);
  });

  it('desfazer, limpar agenda e recomeçar o mês (PLANO_QUICK_WINS.md, Fase Q7)', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    await app.getState().newCampaign({ name: 'Desfazer', difficulty: 'estrategica' });
    const s = () => app.getState();
    s().toggleDecision({ policyId: 'contingenciamento', agendaCost: 0 });
    s().toggleEventChoice('alta_petroleo', 'qualquer');
    s().toggleDecision({ policyId: 'irpf_tabela', agendaCost: 0 });
    expect(s().draftHistory).toHaveLength(3);

    // Desfazer volta um passo por vez.
    s().undoDraft();
    expect(s().draft.decisions.map((d) => d.policyId)).toEqual(['contingenciamento']);
    expect(s().draft.eventChoices).toEqual({ alta_petroleo: 'qualquer' });

    // Limpar agenda tira as decisões e mantém as respostas a eventos; dá para desfazer.
    s().clearAgenda();
    expect(s().draft).toEqual({ decisions: [], eventChoices: { alta_petroleo: 'qualquer' } });
    s().undoDraft();
    expect(s().draft.decisions).toHaveLength(1);

    // Recomeçar tira tudo; também dá para desfazer.
    s().clearDraft();
    expect(s().draft).toEqual({ decisions: [], eventChoices: {} });
    s().undoDraft();
    expect(s().draft.eventChoices).toEqual({ alta_petroleo: 'qualquer' });

    // Virar o mês zera o histórico; desfazer sem histórico não faz nada.
    await s().endMonth();
    expect(s().draftHistory).toEqual([]);
    s().undoDraft();
    expect(s().draft).toEqual({ decisions: [], eventChoices: {} });
  });

  it('cenário novo continua após 12 meses e encerra no primeiro mandato (derrota ou fim), sem avançar mais', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    await app.getState().newCampaign({ name: 'Curta', difficulty: 'estrategica' });
    const months = campaignMonths(app.getState().active!.state.scenarioId);
    expect(months).toBe(96);
    for (let m = 0; m < PROTOTYPE_MONTHS; m++) await app.getState().endMonth();
    expect(app.getState().active!.finished).toBe(false);
    // Sem candidatura declarada, o 1º mandato termina na eleição geral (derrota) ou na posse (fim de mandato).
    for (let m = PROTOTYPE_MONTHS; m < months + 2 && !app.getState().active!.finished; m++) {
      await app.getState().endMonth();
    }
    const ended = app.getState().active!;
    expect(ended.finished).toBe(true);
    expect(ended.state.monthIndex).toBeLessThanOrEqual(48);
    expect(campaignOutcome(ended.state)).not.toBeNull();
    await app.getState().endMonth();
    expect(app.getState().active!.state.monthIndex).toBe(ended.state.monthIndex);
    expect(app.getState().campaigns[0].status).toBe('encerrada');
    // Encerrada, a campanha não aceita decisões novas (não há mês para elas).
    app.getState().toggleDecision({ policyId: 'contingenciamento', agendaCost: 0 });
    expect(app.getState().draft.decisions).toEqual([]);
  });

  it('corrige ao carregar uma campanha com o último mês gravado mas ainda "ativa"', async () => {
    const { db, launchApp } = await device();
    let app = await launchApp();
    await app.getState().newCampaign({ name: 'Interrompida', difficulty: 'casual' });
    const id = app.getState().active!.id;
    const months = campaignMonths(app.getState().active!.state.scenarioId);
    for (let m = 0; m < months && !app.getState().active!.finished; m++) await app.getState().endMonth();
    const lastMonth = app.getState().active!.state.monthIndex;
    expect(app.getState().active!.finished).toBe(true);
    // Simula um save antigo: último mês gravado, status não atualizado.
    await db.run("UPDATE campaigns SET status = 'ativa' WHERE id = ?", [id]);

    app = await launchApp();
    await app.getState().continueCampaign(id);
    expect(app.getState().active!.finished).toBe(true);
    await app.getState().endMonth();
    expect(app.getState().active!.state.monthIndex).toBe(lastMonth);
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

  it('a qualidade do mapa começa no Automático (Equilibrado) e a escolha persiste entre aberturas do app', async () => {
    const { launchApp } = await device();
    const first = await launchApp();
    expect(first.getState().mapQuality).toBe('automatico');
    expect(first.getState().autoProfile).toBe('equilibrado');
    await first.getState().setMapQuality('essencial-2d-leve');
    expect(first.getState().mapQuality).toBe('essencial-2d-leve');
    expect((await launchApp()).getState().mapQuality).toBe('essencial-2d-leve');
  });

  it('o perfil a que o ajuste automático chegou persiste e a escolha manual não o apaga', async () => {
    const { launchApp } = await device();
    const first = await launchApp();
    await first.getState().setAutoProfile('economico-3d');
    await first.getState().setMapQuality('alto');
    const second = await launchApp();
    expect(second.getState().mapQuality).toBe('alto');
    expect(second.getState().autoProfile).toBe('economico-3d');
  });

  it('migra a preferência antiga do mapa: globo→Automático, 2D→Essencial 2D, 2D leve→Essencial 2D leve', async () => {
    const cases = [
      ['globe', 'automatico'],
      ['flat', 'essencial-2d'],
      ['flat-light', 'essencial-2d-leve'],
    ] as const;
    for (const [legacy, expected] of cases) {
      const { db, launchApp } = await device();
      await setSetting(db, 'mapa_renderizador', legacy);
      const app = await launchApp();
      expect(app.getState().mapQuality).toBe(expected);
      // a escolha migrada passa a viver na chave nova: a antiga não é mais consultada
      await setSetting(db, 'mapa_renderizador', 'flat');
      expect((await launchApp()).getState().mapQuality).toBe(expected);
    }
  });

  it('preferência de qualidade corrompida no banco volta ao Automático sem impedir a abertura', async () => {
    const { db, launchApp } = await device();
    await setSetting(db, 'mapa_qualidade', 'holograma');
    await setSetting(db, 'mapa_qualidade_auto', 'essencial-2d');
    const app = await launchApp();
    expect(app.getState().mapQuality).toBe('automatico');
    expect(app.getState().autoProfile).toBe('equilibrado');
  });

  it('as nuvens do mapa começam ligadas, a escolha persiste e valor corrompido volta ao padrão', async () => {
    const { db, launchApp } = await device();
    const first = await launchApp();
    expect(first.getState().mapClouds).toBe(true);
    await first.getState().setMapClouds(false);
    expect(first.getState().mapClouds).toBe(false);
    expect((await launchApp()).getState().mapClouds).toBe(false);
    await setSetting(db, 'mapa_nuvens', 'talvez');
    expect((await launchApp()).getState().mapClouds).toBe(true);
  });

  it('erros de banco viram mensagem, sem derrubar o app', async () => {
    const { db, launchApp } = await device();
    const app = await launchApp();
    await db.exec('DROP TABLE snapshots');
    // NOVO JOGO devolve a falha no resultado (a tela mostra); o `error` global fica para as operações sem resultado.
    const result = await app.getState().newCampaign({ name: 'X', difficulty: 'casual' });
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error).toMatch(/snapshots/);
    expect(app.getState().error).toBeUndefined();
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

describe('série regional do cartão do estado', () => {
  it('sem partida não há série; com partida acompanha a posse e cada mês, inclusive entre aberturas', async () => {
    const { launchApp } = await device();
    let app = await launchApp();
    expect(await app.getState().regionalHistory()).toEqual([]);
    await app.getState().newCampaign({ name: 'Regional', difficulty: 'casual' });
    const id = app.getState().active!.id;
    await app.getState().endMonth();
    await app.getState().endMonth();
    let points = await app.getState().regionalHistory();
    expect(points.map((p) => p.monthIndex)).toEqual([0, 1, 2]);
    expect(Object.keys(points[2].ufs)).toHaveLength(27);

    app = await launchApp();
    await app.getState().continueCampaign(id);
    points = await app.getState().regionalHistory();
    expect(points.map((p) => p.monthIndex)).toEqual([0, 1, 2]);
  });
});

describe('fotografia da eleição geral (PLANO_GLOBO.md §5.3, PR 12)', () => {
  it('só existe depois do mês da eleição, fecha com o nacional e volta ao reabrir o app', async () => {
    const { launchApp } = await device();
    let app = await launchApp();
    expect(await app.getState().electionResults()).toEqual([]);
    await app.getState().newCampaign({ name: 'Eleição', difficulty: 'casual' });
    const id = app.getState().active!.id;
    const electionMonth = loadContent(app.getState().active!.state.scenarioId).scenario.elections!.mesEleicaoGeral;

    // Até o mês anterior ao pleito não há resultado.
    while (app.getState().active!.state.monthIndex < electionMonth) {
      expect(await app.getState().electionResults()).toEqual([]);
      expect(await app.getState().endMonth()).toBe(true);
    }
    expect(await app.getState().endMonth()).toBe(true);

    const [saved, ...others] = await app.getState().electionResults();
    expect(others).toEqual([]);
    expect(saved.monthIndex).toBe(electionMonth);
    expect(app.getState().active!.lastReport?.electionResult).toEqual(saved);
    for (const round of saved.rounds) {
      const sum = Object.entries(round.ufs).reduce((s, [uf, share]) => s + saved.weights[uf] * share, 0);
      expect(Math.abs(sum - round.national)).toBeLessThan(1e-9);
    }

    app = await launchApp();
    await app.getState().continueCampaign(id);
    expect(await app.getState().electionResults()).toEqual([saved]);
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
    // Ajuste: a lista de pendentes e a última versão ganharam a migração 10 (setup_json); a campanha antiga segue sem
    // setup e continua aparecendo.
    expect(await migrate(db)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(LATEST_DB_VERSION).toBe(10);
    await v1.getState().init();
    expect(v1.getState().campaigns.map((c) => c.name)).toEqual(['Campanha da v1']);
  });
});

describe('tempo de jogo e última jogada (PLANO_MENU_SAVES_CONFIG.md, Fase M2)', () => {
  it('abrir a partida grava a última jogada e não mexe em updated_at (a lista não reordena)', async () => {
    const { db, launchApp } = await device();
    let app = await launchApp();
    await app.getState().newCampaign({ name: 'Abrir', difficulty: 'casual' });
    const id = app.getState().active!.id;
    await db.run(
      "UPDATE campaigns SET last_played_at = '2000-01-01T00:00:00.000Z', updated_at = '2001-02-03T00:00:00.000Z' WHERE id = ?",
      [id],
    );
    app = await launchApp();
    expect(await app.getState().continueCampaign(id)).toBe(true);
    const summary = app.getState().campaigns.find((c) => c.id === id)!;
    expect(summary.lastPlayedAt).not.toBe('2000-01-01T00:00:00.000Z');
    expect(summary.updatedAt).toBe('2001-02-03T00:00:00.000Z');
    expect(app.getState().error).toBeUndefined();
  });

  it('falha ao marcar a jogada não impede abrir a partida', async () => {
    const { db, launchApp } = await device();
    const app = await launchApp();
    await app.getState().newCampaign({ name: 'Falha', difficulty: 'casual' });
    const id = app.getState().active!.id;
    const failingTouch: SqlDatabase = {
      ...db,
      run: (sql, params) =>
        sql.startsWith('UPDATE campaigns SET last_played_at')
          ? Promise.reject(new Error('disco cheio'))
          : db.run(sql, params),
      close: async () => {},
    };
    const degraded = createGameStore({ openDb: async () => failingTouch, random: fakeRandom() });
    await degraded.getState().init();
    expect(await degraded.getState().continueCampaign(id)).toBe(true);
    expect(degraded.getState().active?.id).toBe(id);
    expect(degraded.getState().error).toBeUndefined();
  });

  it('encerrar o mês atualiza o resumo do cartão na lista', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    await app.getState().newCampaign({ name: 'Resumo', difficulty: 'casual' });
    await app.getState().endMonth();
    const [summary] = app.getState().campaigns;
    expect(summary.currentMonth).toBe(1);
    expect(summary.cardSummary?.monthIndex).toBe(1);
    expect(summary.cardSummary?.approval).toBe(app.getState().active!.state.indicators.approval);
  });

  it('recordPlayTime soma na partida ativa, na lista e no banco; valores inválidos são ignorados', async () => {
    const { launchApp } = await device();
    let app = await launchApp();
    await app.getState().newCampaign({ name: 'Tempo', difficulty: 'casual' });
    const id = app.getState().active!.id;
    await app.getState().recordPlayTime(1500);
    await app.getState().recordPlayTime(-20);
    await app.getState().recordPlayTime(NaN);
    expect(app.getState().campaigns.find((c) => c.id === id)?.playTimeMs).toBe(1500);
    expect(app.getState().error).toBeUndefined();

    app = await launchApp();
    expect(app.getState().campaigns[0].playTimeMs).toBe(1500);
  });

  it('grava o tempo mesmo enquanto o mês é encerrado (busy), sem marcar erro', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    await app.getState().newCampaign({ name: 'Ocupada', difficulty: 'casual' });
    const month = app.getState().endMonth();
    expect(app.getState().busy).toBe(true);
    await app.getState().recordPlayTime(700);
    expect(await month).toBe(true);
    expect(app.getState().error).toBeUndefined();
    expect(app.getState().campaigns[0].playTimeMs).toBe(700);
  });

  it('com id explícito, grava na partida indicada mesmo que outra esteja ativa', async () => {
    const { db, launchApp } = await device();
    const app = await launchApp();
    await app.getState().newCampaign({ name: 'Ativa', difficulty: 'casual' });
    const activeId = app.getState().active!.id;
    await createCampaign(db, {
      id: 'antiga',
      name: 'Antiga',
      scenarioVersion: '0.1.0',
      state: app.getState().active!.state,
    });
    await app.getState().recordPlayTime(900, 'antiga');
    const saved = await listCampaigns(db);
    expect(saved.find((c) => c.id === 'antiga')?.playTimeMs).toBe(900);
    expect(saved.find((c) => c.id === activeId)?.playTimeMs).toBe(0);
  });
});

describe('organização dos saves (PLANO_MENU_SAVES_CONFIG.md, Fase M3)', () => {
  it('ordem e filtro da lista começam em mais recentes e todas', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    expect(app.getState().savedListPrefs).toEqual({ sort: 'recentes', filter: 'todas' });
  });

  it('setSavedListPrefs persiste e sobrevive a fechar e reabrir o app', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    expect(await app.getState().setSavedListPrefs({ sort: 'nome', filter: 'encerradas' })).toBe(true);
    expect(app.getState().savedListPrefs).toEqual({ sort: 'nome', filter: 'encerradas' });
    expect((await launchApp()).getState().savedListPrefs).toEqual({ sort: 'nome', filter: 'encerradas' });
  });

  it('valor inválido gravado direto no banco cai no padrão sem impedir a abertura', async () => {
    const { db, launchApp } = await device();
    await setSetting(db, SAVED_LIST_PREFS_KEY, { sort: 'aleatoria', filter: 'ativas' });
    const app = await launchApp();
    expect(app.getState().status).toBe('pronto');
    expect(app.getState().savedListPrefs).toEqual({ sort: 'recentes', filter: 'ativas' });
    await setSetting(db, SAVED_LIST_PREFS_KEY, 'lixo');
    expect((await launchApp()).getState().savedListPrefs).toEqual({ sort: 'recentes', filter: 'todas' });
  });

  it('renomear atualiza a lista e o nome da partida aberta, sem reordenar', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    await app.getState().newCampaign({ name: 'Antigo', difficulty: 'casual' });
    const id = app.getState().active!.id;
    const updatedAntes = app.getState().campaigns[0].updatedAt;
    expect(await app.getState().renameCampaign(id, '  Novo nome  ')).toBe(true);
    expect(app.getState().active!.name).toBe('Novo nome');
    expect(app.getState().campaigns).toMatchObject([{ id, name: 'Novo nome', updatedAt: updatedAntes }]);
    expect(app.getState().error).toBeUndefined();
  });

  it('renomear campanha que não está aberta muda só a lista, não a partida aberta', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    await app.getState().newCampaign({ name: 'A', difficulty: 'casual' });
    const idA = app.getState().active!.id;
    await app.getState().leaveCampaign();
    await app.getState().newCampaign({ name: 'B', difficulty: 'casual' });
    expect(await app.getState().renameCampaign(idA, 'A renomeada')).toBe(true);
    expect(app.getState().campaigns.find((c) => c.id === idA)?.name).toBe('A renomeada');
    expect(app.getState().active!.name).toBe('B');
  });

  it('nome vazio não renomeia: devolve false, preenche error e mantém o nome', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    await app.getState().newCampaign({ name: 'Original', difficulty: 'casual' });
    const id = app.getState().active!.id;
    expect(await app.getState().renameCampaign(id, '   ')).toBe(false);
    expect(app.getState().error).toBe(NAME_ERRORS.empty);
    expect(app.getState().active!.name).toBe('Original');
    expect(app.getState().campaigns[0].name).toBe('Original');
  });

  it('partida com cadeado não é apagada: devolve false com erro e continua na lista; destrancada, apaga', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    await app.getState().newCampaign({ name: 'Trancada', difficulty: 'casual' });
    const id = app.getState().active!.id;
    expect(await app.getState().setCampaignLocked(id, true)).toBe(true);
    expect(app.getState().campaigns).toMatchObject([{ id, locked: true }]);

    expect(await app.getState().deleteCampaign(id)).toBe(false);
    expect(app.getState().error).toMatch(/cadeado/);
    expect(app.getState().campaigns.map((c) => c.id)).toEqual([id]);
    expect(app.getState().active?.id).toBe(id);

    app.getState().clearError();
    expect(await app.getState().setCampaignLocked(id, false)).toBe(true);
    expect(await app.getState().deleteCampaign(id)).toBe(true);
    expect(app.getState().campaigns).toEqual([]);
    expect(app.getState().active).toBeNull();
  });

  it('deleteFinishedCampaigns apaga as encerradas sem cadeado, conta as trancadas e não mexe nas ativas', async () => {
    const { db, launchApp } = await device();
    const app = await launchApp();
    await app.getState().newCampaign({ name: 'Encerrada', difficulty: 'casual' });
    const encerrada = app.getState().active!.id;
    await app.getState().leaveCampaign();
    await app.getState().newCampaign({ name: 'Encerrada trancada', difficulty: 'casual' });
    const trancada = app.getState().active!.id;
    await app.getState().setCampaignLocked(trancada, true);
    await app.getState().leaveCampaign();
    await app.getState().newCampaign({ name: 'Em andamento', difficulty: 'casual' });
    const ativa = app.getState().active!.id;
    await finishCampaign(db, encerrada);
    await finishCampaign(db, trancada);

    expect(await app.getState().deleteFinishedCampaigns()).toEqual({ deleted: 1, keptLocked: 1 });
    expect(app.getState().error).toBeUndefined();
    expect(
      app
        .getState()
        .campaigns.map((c) => c.id)
        .sort(),
    ).toEqual([ativa, trancada].sort());
    expect(app.getState().active?.id).toBe(ativa);
  });

  it('apagar a partida aberta, encerrada e sem cadeado, zera a partida ativa', async () => {
    const { db, launchApp } = await device();
    let app = await launchApp();
    await app.getState().newCampaign({ name: 'Aberta e encerrada', difficulty: 'casual' });
    const id = app.getState().active!.id;
    await finishCampaign(db, id);
    app = await launchApp();
    expect(await app.getState().continueCampaign(id)).toBe(true);
    expect(app.getState().active?.id).toBe(id);

    expect(await app.getState().deleteFinishedCampaigns()).toEqual({ deleted: 1, keptLocked: 0 });
    expect(app.getState().active).toBeNull();
    expect(app.getState().campaigns).toEqual([]);
  });

  it('sem campanhas encerradas devolve {deleted: 0, keptLocked: 0} e não grava erro', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    await app.getState().newCampaign({ name: 'Só ativa', difficulty: 'casual' });
    expect(await app.getState().deleteFinishedCampaigns()).toEqual({ deleted: 0, keptLocked: 0 });
    expect(app.getState().error).toBeUndefined();
    expect(app.getState().active).not.toBeNull();
  });
});

// PLANO_MENU_SAVES_CONFIG.md, Fase M4: opções gravadas no Novo Jogo e "Recomeçar com as mesmas opções".
describe('recomeçar com as mesmas opções (Fase M4)', () => {
  const okId = (r: NewCampaignResult): string => {
    if (!r.ok) throw new Error(`esperava sucesso, veio ${r.reason}: ${r.error}`);
    return r.campaignId;
  };
  /**
   * Nova store sobre o mesmo banco, com sorteio real: a de `device()` recomeça a mesma sequência fixa e geraria o
   * mesmo id de campanha já gravada. A semente das partidas é sempre explícita aqui, então o sorteio só dá ids.
   */
  const reabrir = async (db: SqlDatabase) => {
    const store = createGameStore({ openDb: async () => ({ ...db, close: async () => {} }), random: Math.random });
    await store.getState().init();
    return store;
  };

  it('newCampaign grava as opções escolhidas (dificuldade, cenário, perfil, ponto de partida e semente)', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    okId(
      await app.getState().newCampaign({
        name: 'Opções',
        difficulty: 'realismo',
        scenarioId: DEFAULT_SCENARIO_ID,
        profileId: 'centro_esquerda',
        startPoint: 'corrida',
        seed: 31337,
      }),
    );
    const setup = {
      difficulty: 'realismo',
      scenarioId: DEFAULT_SCENARIO_ID,
      profileId: 'centro_esquerda',
      startPoint: 'corrida',
      seed: 31337,
    };
    expect(app.getState().campaigns).toMatchObject([{ setup }]);
    // Reabrir o app devolve as mesmas opções da lista.
    const reaberto = await launchApp();
    expect(reaberto.getState().campaigns).toMatchObject([{ setup }]);
  });

  it('sem perfil e ponto de partida escolhidos, o setup grava os padrões (Centro e posse)', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    okId(await app.getState().newCampaign({ name: 'Padrões', difficulty: 'casual', seed: 5 }));
    expect(app.getState().campaigns[0].setup).toEqual({
      difficulty: 'casual',
      scenarioId: DEFAULT_SCENARIO_ID,
      profileId: 'centro',
      startPoint: 'posse',
      seed: 5,
    });
  });

  it('recomeçar cria partida nova, ativa, com as mesmas opções, rascunho vazio e nome "<nome> (2)"', async () => {
    const { db, launchApp } = await device();
    const app = await launchApp();
    const origem = okId(
      await app.getState().newCampaign({
        name: 'Governo Azul',
        difficulty: 'realismo',
        profileId: 'centro_esquerda',
        startPoint: 'corrida',
        seed: 31337,
      }),
    );
    const original = app.getState().active!.state;
    const turno = turnIndexOf(original);
    const origemNoBanco = await loadStateAt(db, origem, turno);
    app.getState().toggleDecision({ policyId: 'contingenciamento', agendaCost: 0 });

    const novo = okId(await app.getState().restartCampaign(origem));
    expect(novo).not.toBe(origem);
    expect(app.getState().active).toMatchObject({ id: novo, name: 'Governo Azul (2)', finished: false });
    expect(app.getState().draft.decisions).toEqual([]);
    expect(
      app
        .getState()
        .campaigns.map((c) => c.name)
        .sort(),
    ).toEqual(['Governo Azul', 'Governo Azul (2)']);
    const lista = app.getState().campaigns;
    expect(lista.find((c) => c.id === novo)?.setup).toEqual(lista.find((c) => c.id === origem)?.setup);
    expect(lista.find((c) => c.id === novo)?.setup).toMatchObject({
      difficulty: 'realismo',
      profileId: 'centro_esquerda',
      startPoint: 'corrida',
      seed: 31337,
    });

    // Mesmo estado inicial que a partida original (gravado no banco, no mesmo turno de início).
    expect(origemNoBanco).not.toBeNull();
    expect(await loadStateAt(db, novo, turno)).toEqual(origemNoBanco);
    expect(app.getState().active!.state).toEqual(original);

    // Mesmos meses seguintes: encerrar o mês na nova e na original dá o mesmo estado.
    expect(await app.getState().endMonth()).toBe(true);
    const depoisNova = app.getState().active!.state;
    expect(await app.getState().continueCampaign(origem)).toBe(true);
    expect(await app.getState().endMonth()).toBe(true);
    expect(app.getState().active!.state).toEqual(depoisNova);

    // Segunda vez: o "(2)" já existe, então o nome pula para "(3)".
    const terceiro = okId(await app.getState().restartCampaign(origem));
    expect(terceiro).not.toBe(novo);
    expect(app.getState().active).toMatchObject({ id: terceiro, name: 'Governo Azul (3)' });
  });

  it('partida sem opções gravadas recomeça com a dificuldade, o cenário e a semente da linha', async () => {
    const { db, launchApp } = await device();
    let app = await launchApp();
    const origem = okId(await app.getState().newCampaign({ name: 'Antiga', difficulty: 'casual', seed: 777 }));
    const turno = turnIndexOf(app.getState().active!.state);
    const origemNoBanco = await loadStateAt(db, origem, turno);
    // Simula uma partida criada antes da migração 10: a linha continua com dificuldade, cenário e semente.
    await db.run('UPDATE campaigns SET setup_json = NULL WHERE id = ?', [origem]);
    app = await reabrir(db);
    expect(app.getState().campaigns.find((c) => c.id === origem)?.setup).toBeNull();

    const novo = okId(await app.getState().restartCampaign(origem));
    expect(app.getState().active).toMatchObject({ id: novo, name: 'Antiga (2)' });
    expect(app.getState().active!.state).toMatchObject({
      difficulty: 'casual',
      seed: 777,
      scenarioId: DEFAULT_SCENARIO_ID,
    });
    expect(app.getState().campaigns.find((c) => c.id === novo)?.setup).toEqual({
      difficulty: 'casual',
      scenarioId: DEFAULT_SCENARIO_ID,
      profileId: 'centro',
      startPoint: 'posse',
      seed: 777,
    });
    // Sem ponto de partida gravado, o padrão é a posse: a original também começou na posse.
    expect(origemNoBanco).not.toBeNull();
    expect(await loadStateAt(db, novo, turno)).toEqual(origemNoBanco);
  });

  it('recomeçar mantém o cenário do protótipo fictício', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    const origem = okId(
      await app
        .getState()
        .newCampaign({ name: 'Protótipo', difficulty: 'casual', scenarioId: 'prototipo_ficticio', seed: 12 }),
    );
    const novo = okId(await app.getState().restartCampaign(origem));
    expect(app.getState().active!.state.scenarioId).toBe('prototipo_ficticio');
    expect(app.getState().campaigns.find((c) => c.id === novo)?.setup).toEqual({
      difficulty: 'casual',
      scenarioId: 'prototipo_ficticio',
      profileId: 'centro',
      startPoint: 'posse',
      seed: 12,
    });
  });

  it('recomeçar uma campanha encerrada (a do Legado) abre a nova e deixa a encerrada salva', async () => {
    const { db, launchApp } = await device();
    let app = await launchApp();
    const origem = okId(await app.getState().newCampaign({ name: 'Encerrada', difficulty: 'casual', seed: 8 }));
    await finishCampaign(db, origem);
    app = await reabrir(db);
    expect(await app.getState().continueCampaign(origem)).toBe(true);
    expect(app.getState().active!.finished).toBe(true);

    const novo = okId(await app.getState().restartCampaign(origem));
    expect(app.getState().active).toMatchObject({ id: novo, name: 'Encerrada (2)', finished: false });
    expect(app.getState().campaigns.find((c) => c.id === origem)?.status).toBe('encerrada');
  });

  it('id inexistente devolve ok:false sem mexer na partida ativa nem na lista', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    okId(await app.getState().newCampaign({ name: 'Ativa', difficulty: 'casual', seed: 1 }));
    const ativa = app.getState().active;
    const lista = app.getState().campaigns;

    expect(await app.getState().restartCampaign('fantasma')).toEqual({
      ok: false,
      reason: 'falha',
      error: 'Campanha não encontrada.',
    });
    expect(app.getState().active).toBe(ativa);
    expect(app.getState().campaigns).toBe(lista);
  });
});

describe('salvar como, exportar e importar (PLANO_MENU_SAVES_CONFIG.md, Fase M5)', () => {
  /** Pacote de save como vem no arquivo (só os campos que estes testes leem). */
  type Pacote = {
    format: string;
    dbVersion: number;
    campaign: Record<string, unknown>;
    tables: Record<string, Record<string, unknown>[]>;
  };
  const pacoteDe = (json: string) => JSON.parse(json) as Pacote;

  it('duplicateCampaign: a cópia entra na lista com "<nome> — cópia", a partida ativa e a origem não mudam', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    await app.getState().newCampaign({ name: 'Origem', difficulty: 'casual', seed: 3 });
    const origem = app.getState().active!.id;
    const ativa = app.getState().active;
    const listaAntes = app.getState().campaigns.find((c) => c.id === origem);

    const copia = await app.getState().duplicateCampaign(origem);

    expect(copia).toEqual(expect.any(String));
    expect(copia).not.toBe(origem);
    expect(app.getState().campaigns.find((c) => c.id === copia)).toMatchObject({ name: 'Origem — cópia' });
    expect(app.getState().campaigns.find((c) => c.id === origem)).toEqual(listaAntes);
    expect(app.getState().active).toBe(ativa);
    expect(app.getState().error).toBeUndefined();
  });

  it('duplicar de novo usa o próximo número livre; a cópia abre no mesmo estado', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    await app.getState().newCampaign({ name: 'Origem', difficulty: 'casual', seed: 3 });
    const origem = app.getState().active!.id;
    const estado = app.getState().active!.state;
    await app.getState().duplicateCampaign(origem);
    const segunda = await app.getState().duplicateCampaign(origem);
    expect(app.getState().campaigns.find((c) => c.id === segunda)).toMatchObject({ name: 'Origem — cópia 2' });

    expect(await app.getState().continueCampaign(segunda!)).toBe(true);
    expect(app.getState().active!.state).toEqual(estado);
  });

  it('duplicar campanha inexistente devolve null e mostra "Campanha não encontrada."', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    expect(await app.getState().duplicateCampaign('fantasma')).toBeNull();
    expect(app.getState().error).toBe('Campanha não encontrada.');
  });

  it('exportCampaign devolve JSON parseável no formato do save e o nome do arquivo', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    await app.getState().newCampaign({ name: 'Governo Azul', difficulty: 'casual', seed: 3 });
    const exportado = await app.getState().exportCampaign(app.getState().active!.id);

    expect(exportado).not.toBeNull();
    expect(exportado!.fileName).toBe('governo-azul-mes1.brasilsave.json');
    expect(pacoteDe(exportado!.json)).toMatchObject({ format: 'brasil-save', campaign: { name: 'Governo Azul' } });
  });

  it('exportar campanha inexistente devolve null e mostra o erro', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    expect(await app.getState().exportCampaign('fantasma')).toBeNull();
    expect(app.getState().error).toBe('Campanha não encontrada.');
  });

  it('importCampaign do texto exportado cria campanha nova e abre no mesmo estado; nome repetido vira "(2)", depois "(3)"', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    await app.getState().newCampaign({ name: 'Origem', difficulty: 'casual', seed: 3 });
    const origem = app.getState().active!.id;
    const estado = app.getState().active!.state;
    const exportado = (await app.getState().exportCampaign(origem))!;

    const primeira = await app.getState().importCampaign(exportado.json);
    expect(primeira).toEqual({ ok: true, campaignId: expect.any(String) });
    if (!primeira.ok) throw new Error('a importação deveria funcionar');
    expect(app.getState().campaigns.find((c) => c.id === primeira.campaignId)).toMatchObject({ name: 'Origem (2)' });
    expect(app.getState().active!.id).toBe(origem);

    expect(await app.getState().continueCampaign(primeira.campaignId)).toBe(true);
    expect(app.getState().active!.state).toEqual(estado);

    const segunda = await app.getState().importCampaign(exportado.json);
    if (!segunda.ok) throw new Error('a segunda importação deveria funcionar');
    expect(app.getState().campaigns.find((c) => c.id === segunda.campaignId)?.name).toBe('Origem (3)');
  });

  it('importCampaign com nome do arquivo longo ou vazio grava um nome válido (até 60, nunca vazio)', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    await app.getState().newCampaign({ name: 'Origem', difficulty: 'casual', seed: 3 });
    const pacote = pacoteDe((await app.getState().exportCampaign(app.getState().active!.id))!.json);
    const comNome = (name: string) => JSON.stringify({ ...pacote, campaign: { ...pacote.campaign, name } });

    const longo = await app.getState().importCampaign(comNome('x'.repeat(90)));
    const vazio = await app.getState().importCampaign(comNome(''));

    if (!longo.ok || !vazio.ok) throw new Error('as importações deveriam funcionar');
    expect(app.getState().campaigns.find((c) => c.id === longo.campaignId)?.name).toBe('x'.repeat(60));
    expect(app.getState().campaigns.find((c) => c.id === vazio.campaignId)?.name).toBe('Campanha');
  });

  it('importCampaign de texto que não é save devolve ok:false com "não é um save"', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    for (const texto of ['texto solto', '{"foo":1}', '[]', 'null', '{"format":"outro"}']) {
      expect(await app.getState().importCampaign(texto)).toEqual({
        ok: false,
        error: expect.stringContaining('não é um save'),
      });
    }
    expect(app.getState().campaigns).toEqual([]);
  });

  it('importCampaign de save de versão mais nova ou anterior devolve ok:false com a mensagem da versão', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    await app.getState().newCampaign({ name: 'Origem', difficulty: 'casual', seed: 3 });
    const pacote = pacoteDe((await app.getState().exportCampaign(app.getState().active!.id))!.json);

    const maisNova = await app
      .getState()
      .importCampaign(JSON.stringify({ ...pacote, dbVersion: LATEST_DB_VERSION + 1 }));
    const anterior = await app
      .getState()
      .importCampaign(JSON.stringify({ ...pacote, dbVersion: LATEST_DB_VERSION - 1 }));
    expect(maisNova).toEqual({ ok: false, error: expect.stringContaining('mais nova') });
    expect(anterior).toEqual({ ok: false, error: expect.stringContaining('anterior') });
  });

  it('importCampaign de save com cenário inexistente (ou chave herdada do objeto) devolve ok:false com mensagem de cenário', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    await app.getState().newCampaign({ name: 'Origem', difficulty: 'casual', seed: 3 });
    const pacote = pacoteDe((await app.getState().exportCampaign(app.getState().active!.id))!.json);
    const campanhas = app.getState().campaigns.length;

    for (const scenario_id of ['cenario_removido', 'constructor', '__proto__']) {
      const texto = JSON.stringify({ ...pacote, campaign: { ...pacote.campaign, scenario_id } });
      expect(await app.getState().importCampaign(texto)).toEqual({
        ok: false,
        error: expect.stringContaining('cenário'),
      });
    }
    expect(app.getState().campaigns).toHaveLength(campanhas);
  });

  it('importCampaign que falha ao gravar (snapshot corrompido) não grava nada e não deixa "error" preso', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    await app.getState().newCampaign({ name: 'Origem', difficulty: 'casual', seed: 3 });
    const pacote = pacoteDe((await app.getState().exportCampaign(app.getState().active!.id))!.json);
    for (const s of pacote.tables.snapshots) s.state_json = '{"corrompido":';
    const campanhas = app.getState().campaigns.length;

    const r = await app.getState().importCampaign(JSON.stringify(pacote));

    expect(r).toEqual({ ok: false, error: expect.stringContaining('incompleto') });
    expect(app.getState().campaigns).toHaveLength(campanhas);
    expect(app.getState().error).toBeUndefined();
  });

  it('o "error" global não fica preso depois de uma importação com falha', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    expect(await app.getState().importCampaign('lixo')).toEqual({ ok: false, error: expect.any(String) });
    expect(app.getState().error).toBeUndefined();
    await app.getState().newCampaign({ name: 'Depois', difficulty: 'casual', seed: 3 });
    expect(app.getState().error).toBeUndefined();
  });
});

describe('restaurar configurações padrão (PLANO_MENU_SAVES_CONFIG.md M9)', () => {
  it('volta todas as preferências ao padrão e grava, sem tocar em partidas e escolhas do Novo Jogo', async () => {
    const { db, launchApp } = await device();
    try {
      const store = await launchApp();
      expect((await store.getState().newCampaign({ name: 'Mantida', difficulty: 'casual' })).ok).toBe(true);
      const s = store.getState();
      await s.setPreference('theme', 'escuro');
      await s.setPreference('colorBlind', true);
      await s.setPreference('fiscalUnit', 'reais');
      await s.setPreference('globeFps', 30);
      await s.setPreference('keepScreenAwake', true);
      await s.setPreference('hudClock', true);
      await s.setTextScale(1.3);
      await s.setReduceMotion(true);
      await s.setMapClouds(false);
      await s.setSavedListPrefs({ sort: 'nome', filter: 'ativas' });

      expect(await store.getState().resetSettings()).toBe(true);
      const after = store.getState();
      expect(after.prefs).toEqual(DEFAULT_PREFERENCES);
      // PLANO_SAVES_HISTORICO.md H1: tela acesa e relógio do HUD voltam a desligados.
      expect(after.prefs.keepScreenAwake).toBe(false);
      expect(after.prefs.hudClock).toBe(false);
      expect(after.textScale).toBe(1);
      expect(after.reduceMotion).toBe(false);
      expect(after.mapClouds).toBe(true);

      // Nada das chaves restauráveis sobra no banco; o que não é preferência das Configurações fica.
      const keys = (await db.all<{ key: string }>('SELECT key FROM settings')).map((r) => r.key);
      for (const k of RESETTABLE_SETTING_KEYS) expect(keys).not.toContain(k);
      expect(keys).toContain(SAVED_LIST_PREFS_KEY);
      expect(keys).toContain(LAST_DIFFICULTY_KEY);
      expect((await listCampaigns(db)).map((c) => c.name)).toEqual(['Mantida']);

      // Reabrir o app lê os padrões.
      const reopened = await launchApp();
      expect(reopened.getState().prefs).toEqual(DEFAULT_PREFERENCES);
      expect(reopened.getState().textScale).toBe(1);
      expect(reopened.getState().savedListPrefs).toEqual({ sort: 'nome', filter: 'ativas' });
    } finally {
      await db.close();
    }
  });

  it('a chave antiga do renderizador também sai, para a migração dela não trazer a escolha de volta', async () => {
    const { db, launchApp } = await device();
    try {
      await setSetting(db, 'mapa_renderizador', 'flat');
      const store = await launchApp();
      expect(await store.getState().resetSettings()).toBe(true);
      const reopened = await launchApp();
      expect(reopened.getState().mapQuality).toBe(DEFAULT_MAP_QUALITY);
    } finally {
      await db.close();
    }
  });

  it('cada preferência do registro está entre as chaves restauráveis', () => {
    for (const k of PREFERENCE_KEYS) expect(RESETTABLE_SETTING_KEYS).toContain(PREFERENCE_DEFS[k].key);
  });
});
