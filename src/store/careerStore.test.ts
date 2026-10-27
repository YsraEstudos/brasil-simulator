import { describe, expect, it } from 'vitest';

import { migrate } from '@/database/migrate';
import { openNodeDatabase } from '@/database/nodeDatabase';
import type { SqlDatabase } from '@/database/types';
import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { careerSchedule, INAUGURATION_NOTE } from '@/engine';

import { checkNewCampaignInput, startPointsOf } from './campaignSetup';
import { createGameStore } from './gameStore';

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
  return async () => {
    const store = createGameStore({ openDb: async () => keepOpen, random: fakeRandom() });
    await store.getState().init();
    return store;
  };
}

describe('pontos de partida na configuração (PLANO_CAMPANHA.md Fase C1)', () => {
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
  it('cria, joga, fecha e retoma antes e depois da posse, com a linha de base na posse', async () => {
    const launchApp = await device();
    let app = await launchApp();
    const created = await app
      .getState()
      .newCampaign({ name: 'Corrida', difficulty: 'estrategica', startPoint: 'corrida' });
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
