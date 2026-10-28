import { describe, expect, it } from 'vitest';

import { migrate } from '@/database/migrate';
import { openNodeDatabase } from '@/database/nodeDatabase';
import type { SqlDatabase } from '@/database/types';
import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { careerSchedule, INAUGURATION_NOTE } from '@/engine';

import { checkNewCampaignInput, startPointsOf } from './campaignSetup';
import { createGameStore } from './gameStore';
import { SCENARIOS } from './scenarios';

// PLANO_CAMPANHA.md Fase C1 (tarefas C1.5 e C1.7): store e entrada mínima de nova campanha com o ponto 'corrida'.

const PRE_TURNS = careerSchedule(loadContent(DEFAULT_SCENARIO_ID), 'corrida').length;

const fakeRandom = () => {
  let i = 0;
  return () => ((i++ * 0.37) % 1) + 0.01;
};

async function device() {
  const db = openNodeDatabase();
  await migrate(db);
  const keepOpen: SqlDatabase = { ...db, close: async () => {} };
  // Um gerador para o aparelho todo: reabrir o app não repete os ids das campanhas.
  const random = fakeRandom();
  return async () => {
    const store = createGameStore({ openDb: async () => keepOpen, random });
    await store.getState().init();
    return store;
  };
}

describe('pontos de partida na configuração (PLANO_CAMPANHA.md Fase C1)', () => {
  // PLANO_CAMPANHA.md Fase C8.1: perfil eleitoral validado pelo cenário.
  it('aceita o perfil eleitoral do cenário e rejeita um perfil desconhecido', () => {
    const selected = checkNewCampaignInput({
      name: 'X',
      difficulty: 'casual',
      startPoint: 'corrida',
      careerProfileId: 'ex_governador',
    });
    expect(selected.ok && selected.input.careerProfileId).toBe('ex_governador');
    const unknown = checkNewCampaignInput({
      name: 'X',
      difficulty: 'casual',
      startPoint: 'corrida',
      careerProfileId: 'inexistente',
    });
    expect(unknown.ok).toBe(false);
  });
  it('o cenário padrão oferece a corrida; cenários sem carreira, só a posse', () => {
    expect(startPointsOf(DEFAULT_SCENARIO_ID)).toEqual(['posse', 'corrida']);
    expect(startPointsOf('prototipo_ficticio')).toEqual(['posse']);
    expect(startPointsOf('inexistente')).toEqual(['posse']);
  });

  it('recusa ponto de partida que o cenário não oferece', () => {
    const ok = checkNewCampaignInput({ name: 'X', difficulty: 'casual', startPoint: 'corrida' });
    expect(ok.ok && ok.input.startPoint).toBe('corrida');
    const missing = checkNewCampaignInput({
      name: 'X',
      difficulty: 'casual',
      scenarioId: 'prototipo_ficticio',
      startPoint: 'corrida',
    });
    expect(missing.ok).toBe(false);
    expect(!missing.ok && missing.errors.startPoint).toBe('Escolha um ponto de partida deste cenário.');
    const unknown = checkNewCampaignInput({ name: 'X', difficulty: 'casual', startPoint: 'segundo_turno' });
    expect(unknown.ok).toBe(false);
  });
});

describe('store com a partida que começa na corrida (PLANO_CAMPANHA.md §2.3)', () => {
  it('grava e retoma o perfil eleitoral selecionado', async () => {
    const launchApp = await device();
    const app = await launchApp();
    const result = await app.getState().newCampaign({
      name: 'Perfil',
      difficulty: 'estrategica',
      startPoint: 'corrida',
      careerProfileId: 'ex_governador',
    });
    expect(result.ok).toBe(true);
    const id = app.getState().active!.id;
    const reopened = await launchApp();
    expect(await reopened.getState().continueCampaign(id)).toBe(true);
    expect(reopened.getState().active!.state.career?.profileId).toBe('ex_governador');
  });

  it('encaminha um segundo perfil do cenário ao motor e o conserva ao reabrir', async () => {
    const profiles = SCENARIOS[DEFAULT_SCENARIO_ID].career!.profiles;
    const second = { ...profiles[0], id: 'perfil_teste', name: 'Outro candidato' };
    profiles.push(second);
    try {
      const launchApp = await device();
      const app = await launchApp();
      const result = await app.getState().newCampaign({
        name: 'Outro perfil',
        difficulty: 'estrategica',
        startPoint: 'corrida',
        careerProfileId: second.id,
      });
      expect(result.ok).toBe(true);
      expect(app.getState().active!.state.career?.profileId).toBe(second.id);
      const id = app.getState().active!.id;
      const reopened = await launchApp();
      expect(await reopened.getState().continueCampaign(id)).toBe(true);
      expect(reopened.getState().active!.state.career?.profileId).toBe(second.id);
    } finally {
      profiles.pop();
    }
  });
  it('cria, joga, fecha e retoma antes e depois da posse, com a linha de base na posse', async () => {
    const launchApp = await device();
    let app = await launchApp();
    const created = await app
      .getState()
      .newCampaign({ name: 'Corrida', difficulty: 'estrategica', startPoint: 'corrida', seed: 11 });
    expect(created.ok).toBe(true);
    const id = app.getState().active!.id;
    expect(app.getState().active!.state.career).toMatchObject({ stage: 'corrida', turnIndex: 0 });
    expect(app.getState().active!.baseline).toBeUndefined();

    // Joga até o último turno antes da posse, reabrindo o app no meio.
    for (let i = 0; i < PRE_TURNS - 1; i++) {
      expect(await app.getState().endMonth()).toBe(true);
      app = await launchApp();
      expect(await app.getState().continueCampaign(id)).toBe(true);
      expect(app.getState().active!.state.career!.turnIndex).toBe(i + 1);
      expect(app.getState().active!.baseline).toBeUndefined();
      expect(app.getState().active!.lastReport?.turnIndex).toBe(i);
    }
    expect(app.getState().campaigns).toMatchObject([{ id, currentTurn: PRE_TURNS - 1, stage: 'transicao' }]);

    // Turno da transição: o estado seguinte é a posse e vira a linha de base.
    await app.getState().endMonth();
    const atPosse = app.getState().active!;
    expect(atPosse.state.career).toMatchObject({ stage: 'governo', turnIndex: PRE_TURNS });
    expect(atPosse.lastReport!.notes).toContain(INAUGURATION_NOTE);
    expect(atPosse.baseline).toEqual(atPosse.state);
    // Na posse não há mês anterior de governo: nada de variação contra nov–dez/2026.
    expect(atPosse.previous).toBeUndefined();

    // Retomar imediatamente depois da posse e depois de um mês de governo: a base continua sendo a posse.
    app = await launchApp();
    await app.getState().continueCampaign(id);
    expect(app.getState().active!.baseline).toEqual(atPosse.state);
    expect(app.getState().active!.previous).toBeUndefined();
    await app.getState().endMonth();
    app = await launchApp();
    await app.getState().continueCampaign(id);
    const after = app.getState().active!;
    expect(after.state.monthIndex).toBe(1);
    expect(after.baseline).toEqual(atPosse.state);
    expect(after.previous).toEqual(atPosse.state.indicators);
    expect(after.lastReport).toMatchObject({ turnIndex: PRE_TURNS, monthIndex: 0 });
    expect(app.getState().campaigns).toMatchObject([{ id, currentTurn: PRE_TURNS + 1, currentMonth: 1, stage: null }]);
  });
});

describe('derrota na eleição e nova tentativa (PLANO_CAMPANHA.md Fase C5, D-C18)', () => {
  it('retoma e repete a configuração inicial e permite outra semente', async () => {
    const launchApp = await device();
    let app = await launchApp();
    await app.getState().newCampaign({
      name: 'Replay',
      difficulty: 'realismo',
      startPoint: 'corrida',
      profileId: 'esquerda',
      careerProfileId: 'ex_governador',
      startSituationId: 'pressao_externa',
      challenge: { economicPressure: 0.8, oppositionStrength: 0.7, coalitionStability: 0.3, crisisFrequency: 0.2 },
      institutionalRules: 'simplificadas',
      assistance: { informationClarity: 'incerta', hints: false },
      seed: 123,
    });
    const original = app.getState().active!;
    app = await launchApp();
    expect(await app.getState().continueCampaign(original.id)).toBe(true);
    expect(await app.getState().retryCareer('same')).toMatchObject({ ok: true });
    const replay = app.getState().active!.state;
    expect(replay).toEqual(original.state);
    expect(await app.getState().retryCareer('new')).toMatchObject({ ok: true });
    const next = app.getState().active!.state;
    expect(next.seed).not.toBe(original.state.seed);
    expect(next.government.profile).toEqual(original.state.government.profile);
    expect(next.career?.profileId).toBe('ex_governador');
  });

  it('a derrota encerra e sobrevive ao reinício; a nova tentativa começa outra corrida e mantém a perdida', async () => {
    const launchApp = await device();
    let app = await launchApp();
    await app.getState().newCampaign({
      name: 'Derrota',
      difficulty: 'realismo',
      startPoint: 'corrida',
      profileId: 'esquerda',
      careerProfileId: 'ex_governador',
      seed: 123,
    });
    const originalProfile = app.getState().active!.state.government.profile;
    const id = app.getState().active!.id;
    const content = loadContent(DEFAULT_SCENARIO_ID);
    const electionTurn = careerSchedule(content, 'corrida').findIndex((t) => t.stage === 'eleicao');
    for (let i = 0; i < electionTurn; i++) await app.getState().endMonth();

    // Candidatura enfraquecida antes da eleição (só na memória: o turno gravado a seguir parte deste estado).
    const active = app.getState().active!;
    const weak = Object.fromEntries(Object.keys(active.state.career!.recognition).map((uf) => [uf, 0.02]));
    app.setState({
      active: {
        ...active,
        state: { ...active.state, career: { ...active.state.career!, recognition: weak, valence: -1 } },
      },
    });
    expect(await app.getState().endMonth()).toBe(true);
    expect(app.getState().active!.finished).toBe(true);
    expect(app.getState().active!.state.career!.election!.outcome).toMatch(/^derrotado/);
    // Não há próximo turno.
    expect(await app.getState().endMonth()).toBe(true);
    expect(app.getState().active!.state.career!.turnIndex).toBe(electionTurn + 1);

    app = await launchApp();
    expect(await app.getState().continueCampaign(id)).toBe(true);
    expect(app.getState().active!.finished).toBe(true);
    expect(app.getState().campaigns.find((c) => c.id === id)).toMatchObject({ status: 'encerrada' });

    const retry = await app.getState().retryCareer();
    expect(retry).toMatchObject({ ok: true });
    const next = app.getState().active!;
    expect(next.id).not.toBe(id);
    expect(next.name).toBe('Derrota · nova tentativa');
    expect(next.state.difficulty).toBe('realismo');
    expect(next.state.government.profile).toEqual(originalProfile);
    expect(next.state.career).toMatchObject({ stage: 'corrida', turnIndex: 0, profileId: 'ex_governador' });
    expect(app.getState().campaigns.map((c) => c.id)).toEqual(expect.arrayContaining([id, next.id]));
  });
});
