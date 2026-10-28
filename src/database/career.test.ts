import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';

import {
  advanceMonth,
  careerSchedule,
  createInitialState,
  sumActive,
  turnIndexOf,
  type GameState,
  type MonthResult,
  type MonthStep,
  type ScheduledImpulse,
} from '../engine';
import {
  createCampaign,
  listCampaigns,
  loadCareerSummary,
  loadIndicatorHistory,
  loadLatestState,
  loadRegionalHistory,
  loadReport,
  loadStateAt,
  recordMonth,
  REPORT_RETENTION_MONTHS,
  SNAPSHOT_RETENTION_MONTHS,
} from './campaignRepository';
import { migrate } from './migrate';
import { openNodeDatabase } from './nodeDatabase';
import type { SqlDatabase } from './types';

// PLANO_CAMPANHA.md Fase C1 (M1.1): identidade dos turnos, gravação e retomada antes e depois da transição mínima.

const content = loadContent(DEFAULT_SCENARIO_ID);
const PRE_TURNS = careerSchedule(content, 'corrida').length;
// Estes testes atravessam a posse; a semente 11 vence sem decisões na calibração atual.
const start = (seed = 11) => createInitialState({ content, difficulty: 'estrategica', seed, startPoint: 'corrida' });

const count = async (db: SqlDatabase, table: string) =>
  (await db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE campaign_id = 'c1'`))!.n;

describe('carreira no banco (PLANO_CAMPANHA.md §2.3)', () => {
  let db: SqlDatabase;
  beforeEach(async () => {
    db = openNodeDatabase();
    await migrate(db);
  });

  /** Joga e grava `n` turnos, retomando do banco antes de cada um (como fechar e reabrir o app). */
  async function playResuming(n: number, decide = () => [{ policyId: 'politica_qualquer', agendaCost: 1 }]) {
    const results: MonthResult[] = [];
    for (let i = 0; i < n; i++) {
      const state = await loadLatestState(db, 'c1');
      const r = advanceMonth(state, { decisions: decide() }, content);
      await recordMonth(db, 'c1', r, { content });
      expect(await loadLatestState(db, 'c1')).toEqual(r.state);
      results.push(r);
    }
    return results;
  }

  it('salva, fecha e retoma em cada turno da campanha e através da transição para o governo', async () => {
    const s0 = start();
    await createCampaign(db, { id: 'c1', name: 'Corrida', scenarioVersion: '0.8.0', state: s0, content });
    expect(await listCampaigns(db)).toMatchObject([{ currentTurn: 0, currentMonth: 0, stage: 'corrida' }]);

    const results = await playResuming(PRE_TURNS + 2);
    const [summary] = await listCampaigns(db);
    expect(summary).toMatchObject({ currentTurn: PRE_TURNS + 2, currentMonth: 2, stage: null });

    // Cada turno tem um snapshot, um relatório e as próprias decisões, nem duplicados nem perdidos.
    const snaps = await db.all<{ turn_index: number }>(
      "SELECT turn_index FROM snapshots WHERE campaign_id = 'c1' ORDER BY turn_index",
    );
    expect(snaps.map((r) => r.turn_index)).toEqual(Array.from({ length: PRE_TURNS + 3 }, (_, i) => i));
    expect(await count(db, 'month_reports')).toBe(PRE_TURNS + 2);
    const decisions = await db.all<{ turn_index: number; accepted: number; rejection_reason: string | null }>(
      "SELECT turn_index, accepted, rejection_reason FROM decisions WHERE campaign_id = 'c1' ORDER BY id",
    );
    expect(decisions.map((d) => d.turn_index)).toEqual(Array.from({ length: PRE_TURNS + 2 }, (_, i) => i));
    expect(decisions.slice(0, PRE_TURNS).every((d) => d.rejection_reason === 'fora_do_estagio')).toBe(true);

    // Retomar imediatamente antes e depois da transição: o estado e o relatório do turno são os gravados.
    expect(await loadStateAt(db, 'c1', PRE_TURNS - 1)).toEqual(results[PRE_TURNS - 2].state);
    expect(await loadStateAt(db, 'c1', PRE_TURNS)).toEqual(results[PRE_TURNS - 1].state);
    expect((await loadStateAt(db, 'c1', PRE_TURNS))!.career!.stage).toBe('governo');
    expect(await loadReport(db, 'c1', PRE_TURNS - 1)).toMatchObject({ turnIndex: PRE_TURNS - 1, monthIndex: 0 });
    expect(await loadReport(db, 'c1', PRE_TURNS)).toMatchObject({ turnIndex: PRE_TURNS, monthIndex: 0 });
    // Estado do PRNG gravado e retomado sem perda: o turno seguinte joga igual sem ou com o reinício.
    const resumed = await loadLatestState(db, 'c1');
    expect(resumed.rng).toEqual(results.at(-1)!.state.rng);
  });

  it('a pesquisa é a mesma ao retomar o save, no estado e no relatório do turno (PLANO_CAMPANHA.md Fase C2)', async () => {
    await createCampaign(db, { id: 'c1', name: 'Corrida', scenarioVersion: '0.8.0', state: start(), content });
    const results = await playResuming(2, () => []);
    const resumed = await loadLatestState(db, 'c1');
    expect(resumed.career!.poll).toEqual(results[1].state.career!.poll);
    expect((await loadReport(db, 'c1', 0))!.career!.poll).toEqual(results[0].report.career!.poll);
    expect((await loadReport(db, 'c1', 1))!.career!.poll).toEqual(resumed.career!.poll);
    // Jogar o turno seguinte a partir do save dá a mesma pesquisa que sem reiniciar.
    const fromSave = advanceMonth(resumed, { decisions: [] }, content);
    const direct = advanceMonth(results[1].state, { decisions: [] }, content);
    expect(fromSave.state.career!.poll).toEqual(direct.state.career!.poll);
  });

  it('recusa gravar o mesmo turno duas vezes (o mês do mandato parado não colide)', async () => {
    const s0 = start();
    await createCampaign(db, { id: 'c1', name: 'Corrida', scenarioVersion: '0.8.0', state: s0, content });
    const r = advanceMonth(s0, { decisions: [] }, content);
    await recordMonth(db, 'c1', r, { content });
    await expect(recordMonth(db, 'c1', r, { content })).rejects.toThrow(/não está no turno 0/);
    expect(await count(db, 'snapshots')).toBe(2);
  });

  it('falha no meio da gravação não deixa nada parcial', async () => {
    const s0 = start();
    await createCampaign(db, { id: 'c1', name: 'Corrida', scenarioVersion: '0.8.0', state: s0, content });
    // Sem o resumo, a gravação do turno pré-posse falha depois de já ter escrito decisões e relatório na transação.
    await db.run("DELETE FROM career_summaries WHERE campaign_id = 'c1'");
    const r = advanceMonth(s0, { decisions: [{ policyId: 'x', agendaCost: 1 }] }, content);
    await expect(recordMonth(db, 'c1', r, { content })).rejects.toThrow(/sem resumo/);
    expect(await count(db, 'decisions')).toBe(0);
    expect(await count(db, 'month_reports')).toBe(0);
    expect(await count(db, 'snapshots')).toBe(1);
    expect(await listCampaigns(db)).toMatchObject([{ currentTurn: 0, stage: 'corrida' }]);
    expect(await loadLatestState(db, 'c1')).toEqual(s0);
  });

  it('as séries de governo começam na posse e não recebem turnos da campanha (linha de base = posse)', async () => {
    await createCampaign(db, { id: 'c1', name: 'Corrida', scenarioVersion: '0.8.0', state: start(), content });
    expect(await loadIndicatorHistory(db, 'c1')).toEqual([]);
    const results = await playResuming(PRE_TURNS + 3, () => []);
    const history = await loadIndicatorHistory(db, 'c1');
    expect(history.map((p) => p.monthIndex)).toEqual([0, 1, 2, 3]);
    // O primeiro ponto da série é a posse (o estado que abriu o governo), não o primeiro turno da partida.
    expect(history[0].indicators).toEqual(results[PRE_TURNS - 1].state.indicators);
    expect((await loadRegionalHistory(db, 'c1')).map((p) => p.monthIndex)).toEqual([0, 1, 2, 3]);
  });

  it('o resumo compacto da pré-campanha sobrevive à retenção de relatórios e snapshots', async () => {
    await createCampaign(db, { id: 'c1', name: 'Corrida', scenarioVersion: '0.8.0', state: start(), content });
    const total = PRE_TURNS + SNAPSHOT_RETENTION_MONTHS + 2;
    await playResuming(total, () => []);
    const reports = await db.all<{ turn_index: number }>(
      "SELECT turn_index FROM month_reports WHERE campaign_id = 'c1' ORDER BY turn_index",
    );
    expect(reports[0].turn_index).toBe(total - REPORT_RETENTION_MONTHS);
    expect(reports[0].turn_index).toBeGreaterThanOrEqual(PRE_TURNS);
    // Dos turnos antigos só sobra o da posse (base do "na posse"); os da campanha saem todos.
    const snaps = await db.all<{ turn_index: number }>(
      "SELECT turn_index FROM snapshots WHERE campaign_id = 'c1' ORDER BY turn_index",
    );
    expect(snaps[0].turn_index).toBe(PRE_TURNS);
    expect(snaps[1].turn_index).toBeGreaterThan(PRE_TURNS + 1);

    const summary = await loadCareerSummary(db, 'c1');
    expect(summary).toMatchObject({ startPoint: 'corrida', profileId: 'ex_governador' });
    expect(summary!.turns.map((t) => [t.turnIndex, t.stage, t.from, t.to])).toEqual([
      [0, 'corrida', '2026-08', '2026-08'],
      [1, 'corrida', '2026-09', '2026-09'],
      [2, 'eleicao', '2026-10', '2026-10'],
      [3, 'transicao', '2026-11', '2026-12'],
    ]);
  });

  it('partida que começa na posse não tem resumo da carreira e grava como antes', async () => {
    const s0 = createInitialState({ content, difficulty: 'estrategica', seed: 3 });
    await createCampaign(db, { id: 'c1', name: 'Posse', scenarioVersion: '0.8.0', state: s0, content });
    const r = advanceMonth(s0, { decisions: [] }, content);
    await recordMonth(db, 'c1', r, { content });
    expect(await loadCareerSummary(db, 'c1')).toBeNull();
    expect(await listCampaigns(db)).toMatchObject([{ currentTurn: 1, currentMonth: 1, stage: null }]);
    expect(turnIndexOf(r.state)).toBe(1);
  });

  it('efeito criado no último turno pré-posse atravessa salvar e retomar e vale uma única vez (§2.3, item 5)', async () => {
    const impulse: ScheduledImpulse = {
      sourceId: 'teste:campanha',
      label: 'Promessa de campanha',
      target: 'aprovacao',
      delta: 0.01,
      startMonth: 0,
      endMonth: 0,
    };
    const probe: MonthStep = (s, ctx) => {
      const active = sumActive(s.impulses, s.monthIndex, 'aprovacao');
      if (active !== 0) ctx.draft.notes.push(`ativo:${active}`);
      return { state: s, contributions: [] };
    };
    let state: GameState = start();
    await createCampaign(db, { id: 'c1', name: 'Corrida', scenarioVersion: '0.8.0', state, content });
    const notes: string[][] = [];
    for (let i = 0; i < PRE_TURNS + 2; i++) {
      state = await loadLatestState(db, 'c1');
      if (i === PRE_TURNS - 1) state = { ...state, impulses: [...state.impulses, impulse] };
      const r = advanceMonth(state, { decisions: [] }, content, [probe]);
      await recordMonth(db, 'c1', r, { content });
      notes.push(r.report.notes.filter((n) => n.startsWith('ativo')));
    }
    expect(notes).toEqual([[], [], [], [], ['ativo:0.01'], []]);
  });
});

// PLANO_CAMPANHA.md Fase C3: finanças persistidas no estado, relatório e resumo durável.
it('guarda caixa e sobra ao retomar após a transição', async () => {
  const db = openNodeDatabase();
  await migrate(db);
  let state = start();
  await createCampaign(db, { id: 'c1', name: 'Corrida', scenarioVersion: '0.8.0', state, content });
  for (let i = 0; i < PRE_TURNS; i++) {
    const result = advanceMonth(state, { decisions: [] }, content);
    await recordMonth(db, 'c1', result, { content });
    state = await loadLatestState(db, 'c1');
  }
  expect(state.career!.expandedFinance?.closure?.remaining.party).toBe(11000);
  expect((await loadReport(db, 'c1', PRE_TURNS - 1))!.career!.expandedFinance?.closure?.remaining.party).toBe(11000);
  const summary = await loadCareerSummary(db, 'c1');
  expect(summary!.turns.at(-1)!.expandedFinance?.closure?.remaining.party).toBe(11000);
});

// PLANO_CAMPANHA.md §4.1: a ordem original sobrevive à gravação mesmo com rejeições intermediárias.
it('persiste as decisões financeiras na ordem enviada', async () => {
  const db = openNodeDatabase();
  await migrate(db);
  const configured = {
    ...content,
    scenario: {
      ...content.scenario,
      career: {
        ...content.scenario.career!,
        finance: {
          initialBalance: 100,
          spendingLimit: 200,
          dataStatus: 'FICTICIO' as const,
          costs: [
            { id: 'acao_a', cost: 70 },
            { id: 'acao_b', cost: 31 },
            { id: 'acao_c', cost: 30 },
          ],
        },
      },
    },
  };
  const state = createInitialState({ content: configured, difficulty: 'estrategica', seed: 1, startPoint: 'corrida' });
  await createCampaign(db, { id: 'c1', name: 'Ordem', scenarioVersion: '0.8.0', state, content: configured });
  const decisions = ['acao_a', 'acao_b', 'acao_c'].map((policyId) => ({ policyId, agendaCost: 0 }));
  const result = advanceMonth(state, { decisions }, configured);
  await recordMonth(db, 'c1', result, { content: configured });
  const rows = await db.all<{ policy_id: string; accepted: number }>(
    "SELECT policy_id, accepted FROM decisions WHERE campaign_id = 'c1' ORDER BY position",
  );
  expect(rows).toEqual([
    { policy_id: 'acao_a', accepted: 1 },
    { policy_id: 'acao_b', accepted: 0 },
    { policy_id: 'acao_c', accepted: 1 },
  ]);
});

// PLANO_CAMPANHA.md Fase C3: descoberta e notícia sobrevivem ao salvamento e à retomada.
it('persiste investigação de campanha e sua data anterior à posse', async () => {
  const db = openNodeDatabase();
  await migrate(db);
  const configured = {
    ...content,
    scenario: {
      ...content.scenario,
      career: {
        ...content.scenario.career!,
        finance: {
          initialBalance: 0,
          spendingLimit: 1000,
          dataStatus: 'FICTICIO' as const,
          expanded: {
            personalAvailable: 100,
            personalLimit: 100,
            debtLimit: 0,
            debtDeadline: 4,
            illicit: { decay: 0.5, sensitivity: 100, maxHazard: 1, monthlyLimit: 100 },
          },
        },
      },
    },
  };
  const state = createInitialState({ content: configured, difficulty: 'estrategica', seed: 11, startPoint: 'corrida' });
  await createCampaign(db, { id: 'c1', name: 'Fiscalização', scenarioVersion: '0.8.0', state, content: configured });
  const result = advanceMonth(
    state,
    { decisions: [{ policyId: 'usar_caixa_dois', agendaCost: 0, params: { valor: 10 } }] },
    configured,
  );
  await recordMonth(db, 'c1', result, { content: configured });
  const resumed = await loadLatestState(db, 'c1');
  expect(resumed.career!.illicit!.investigations).toBe(1);
  expect(resumed.events.news).toContainEqual(
    expect.objectContaining({ sourceId: 'caixa_dois', careerPeriod: '2026-08', turnIndex: 0 }),
  );
  expect((await loadCareerSummary(db, 'c1'))!.turns[0].illicit).toMatchObject({ discovered: true, volume: 10 });
});
