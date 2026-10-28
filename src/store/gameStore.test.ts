import { describe, expect, it } from 'vitest';

import { migrate } from '@/database/migrate';
import { LATEST_DB_VERSION, MIGRATIONS } from '@/database/migrations';
import { openNodeDatabase } from '@/database/nodeDatabase';
import type { SqlDatabase } from '@/database/types';
import { createCampaign } from '@/database/campaignRepository';
import { setSetting } from '@/database/settingsRepository';
import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { campaignOutcome, createInitialState, DIRECTIVE_ACTION_ID } from '@/engine';

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

  it('cenário novo continua após 12 meses e encerra na derrota ou no limite do cenário, sem avançar mais', async () => {
    const { launchApp } = await device();
    const app = await launchApp();
    await app.getState().newCampaign({ name: 'Curta', difficulty: 'estrategica' });
    const months = campaignMonths(app.getState().active!.state.scenarioId);
    expect(months).toBe(96);
    for (let m = 0; m < PROTOTYPE_MONTHS; m++) await app.getState().endMonth();
    expect(app.getState().active!.finished).toBe(false);
    // Sem candidatura declarada: ou a situação perde a eleição geral e a partida encerra em `derrota_eleitoral`, ou o
    // sucessor vence e o país continua até o limite de meses do cenário (onda R4, EX-16/EX-17).
    for (let m = PROTOTYPE_MONTHS; m < months + 2 && !app.getState().active!.finished; m++) {
      await app.getState().endMonth();
    }
    const ended = app.getState().active!;
    expect(ended.finished).toBe(true);
    expect(campaignOutcome(ended.state) !== null || ended.state.monthIndex >= months).toBe(true);
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
    expect(await migrate(db)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(LATEST_DB_VERSION).toBe(7);
    await v1.getState().init();
    expect(v1.getState().campaigns.map((c) => c.name)).toEqual(['Campanha da v1']);
  });
});
