import { describe, expect, it } from 'vitest';

import { migrate } from '@/database/migrate';
import { openNodeDatabase } from '@/database/nodeDatabase';
import { turnIndexOf } from '@/engine';

import { duplicateBlock, rewindBlock, rewindConfirmMessage, RULE_REASONS, saveAsBlock } from './campaignRules';
import { createGameStore, type NewCampaignResult } from './gameStore';

async function app() {
  const db = openNodeDatabase();
  await migrate(db);
  let i = 0;
  const store = createGameStore({ openDb: async () => db, random: () => ((i++ * 0.37) % 1) + 0.01 });
  await store.getState().init();
  return { db, store };
}

const okId = (r: NewCampaignResult) => {
  if (!r.ok) throw new Error(r.error);
  return r.campaignId;
};

const base = { ironman: false, difficulty: 'casual' as const, finished: false, currentTurn: 3, rewoundTurn: null };

// PLANO_SAVES_HISTORICO.md, Fase H3: Modo sem volta (B53) e voltar ao mês anterior (D34).
describe('regras da partida', () => {
  it('Ironman bloqueia duplicar, "Salvar como" e voltar o mês, com o motivo escrito', () => {
    expect(duplicateBlock({ ironman: true })).toBe(RULE_REASONS.ironmanDuplicate);
    expect(saveAsBlock({ ironman: true })).toBe(RULE_REASONS.ironmanSaveAs);
    expect(rewindBlock({ ...base, ironman: true })).toBe(RULE_REASONS.ironmanRewind);
    expect(duplicateBlock({ ironman: false })).toBeNull();
    expect(saveAsBlock({ ironman: false })).toBeNull();
  });

  it('voltar o mês: só Casual e Estratégica, ativa, com turno anterior e uma vez por mês jogado', () => {
    expect(rewindBlock(base)).toBeNull();
    expect(rewindBlock({ ...base, difficulty: 'estrategica' })).toBeNull();
    expect(rewindBlock({ ...base, difficulty: 'realismo' })).toBe(RULE_REASONS.realismRewind);
    expect(rewindBlock({ ...base, finished: true })).toBe(RULE_REASONS.finishedRewind);
    expect(rewindBlock({ ...base, currentTurn: 0 })).toBe(RULE_REASONS.firstTurn);
    // Voltou para o turno 2: no 2 (logo depois) e no 3 (o 2 jogado de novo), não; no 4, sim.
    expect(rewindBlock({ ...base, currentTurn: 2, rewoundTurn: 2 })).toBe(RULE_REASONS.alreadyRewound);
    expect(rewindBlock({ ...base, currentTurn: 3, rewoundTurn: 2 })).toBe(RULE_REASONS.alreadyRewound);
    expect(rewindBlock({ ...base, currentTurn: 4, rewoundTurn: 2 })).toBeNull();
  });

  it('a confirmação avisa que os mesmos sorteios voltam a acontecer', () => {
    expect(rewindConfirmMessage(false)).toMatch(/mesmos sorteios voltam a acontecer/);
    expect(rewindConfirmMessage(true)).toMatch(/não confirmadas/);
  });

  it('pela store: Ironman fica no setup_json, não duplica nem volta, exporta, e a cópia importada perde o selo', async () => {
    const { store } = await app();
    const id = okId(await store.getState().newCampaign({ name: 'Sem volta', difficulty: 'casual', ironman: true }));
    expect(store.getState().campaigns.find((c) => c.id === id)).toMatchObject({
      ironman: true,
      setup: { ironman: true },
    });
    expect(await store.getState().duplicateCampaign(id)).toBeNull();
    expect(store.getState().error).toBe(RULE_REASONS.ironmanDuplicate);

    expect(await store.getState().endMonth()).toBe(true);
    expect(await store.getState().rewindMonth()).toBe(false);
    expect(store.getState().error).toBe(RULE_REASONS.ironmanRewind);
    expect(turnIndexOf(store.getState().active!.state)).toBe(1);

    const exported = await store.getState().exportCampaign(id);
    expect(exported).not.toBeNull();
    const imported = await store.getState().importCampaign(exported!.json);
    if (!imported.ok) throw new Error(imported.error);
    const copy = store.getState().campaigns.find((c) => c.id === imported.campaignId)!;
    expect(copy.ironman).toBe(false);
    expect(copy.setup).not.toHaveProperty('ironman');
    expect(store.getState().campaigns.find((c) => c.id === id)?.ironman).toBe(true);
  });

  it('pela store: recomeçar uma partida Ironman mantém o modo', async () => {
    const { store } = await app();
    const id = okId(await store.getState().newCampaign({ name: 'Dura', difficulty: 'estrategica', ironman: true }));
    const again = okId(await store.getState().restartCampaign(id));
    expect(store.getState().campaigns.find((c) => c.id === again)?.ironman).toBe(true);
  });

  it('pela store: voltar e jogar de novo com as mesmas decisões dá o mesmo estado; no Realismo, recusa', async () => {
    const { store } = await app();
    okId(await store.getState().newCampaign({ name: 'Casual', difficulty: 'casual', seed: 4242 }));
    expect(await store.getState().endMonth()).toBe(true);
    const inicio = store.getState().active!.state;
    store.getState().toggleDecision({ policyId: 'contingenciamento', agendaCost: 1 });
    expect(await store.getState().endMonth()).toBe(true);
    const depois = store.getState().active!.state;

    store.getState().toggleDecision({ policyId: 'iof_credito_reducao', agendaCost: 1 });
    expect(await store.getState().rewindMonth()).toBe(true);
    expect(store.getState().active!.state).toEqual(inicio);
    expect(store.getState().draft.decisions).toEqual([]);
    expect(store.getState().active!.previous).toBeDefined();

    store.getState().toggleDecision({ policyId: 'contingenciamento', agendaCost: 1 });
    expect(await store.getState().endMonth()).toBe(true);
    expect(store.getState().active!.state).toEqual(depois);
    // O mesmo mês não volta uma segunda vez.
    expect(await store.getState().rewindMonth()).toBe(false);
    expect(store.getState().error).toBe(RULE_REASONS.alreadyRewound);

    okId(await store.getState().newCampaign({ name: 'Real', difficulty: 'realismo' }));
    expect(await store.getState().endMonth()).toBe(true);
    expect(await store.getState().rewindMonth()).toBe(false);
    expect(store.getState().error).toBe(RULE_REASONS.realismRewind);
  });
});
