import { describe, expect, it } from 'vitest';

import { migrate } from '@/database/migrate';
import { openNodeDatabase } from '@/database/nodeDatabase';
import type { SqlDatabase } from '@/database/types';
import { campaignMonths, DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { advanceMonth, checkInvariants, createInitialState, legislativeInstrument, type GameState } from '@/engine';

import {
  DEV_CAUSE,
  devAddApproval,
  devAddCapital,
  devApproveAll,
  devCongressProposals,
  devEventList,
  devFireEvent,
  devRejectAll,
} from './devCheats';
import { createGameStore } from './gameStore';

const content = loadContent(DEFAULT_SCENARIO_ID);
const initial = () => createInitialState({ content, difficulty: 'casual', seed: 7 });

/** O mês seguinte ao atalho roda pelo motor completo sem quebrar invariantes. */
function nextMonthIsValid(state: GameState) {
  const result = advanceMonth(state, { decisions: [] }, content);
  expect(checkInvariants(state, result.state, result.report, content)).toEqual([]);
  return result.state;
}

/** Estado com uma proposta de projeto de lei (não MP) enviada ao Congresso. */
function withBillInCongress(): GameState {
  const bill = Object.values(content.policies).find((p) => {
    const i = legislativeInstrument(p);
    return i !== null && i !== 'medida_provisoria' && i !== 'pec';
  });
  if (!bill) throw new Error('cenário sem projeto de lei');
  const { state } = advanceMonth(
    initial(),
    { decisions: [{ policyId: bill.id, agendaCost: bill.agendaCost }] },
    content,
  );
  expect(devCongressProposals(state).length).toBeGreaterThan(0);
  return state;
}

describe('painel de desenvolvedor: recursos', () => {
  it('capital e aprovação somam, ficam nos limites e o mês seguinte continua válido', () => {
    const s = initial();
    expect(devAddCapital(s, 500).resources.politicalCapital).toBe(100);
    expect(devAddCapital(s, -500).resources.politicalCapital).toBe(0);
    const up = devAddApproval(s, 0.1);
    expect(up.indicators.approval).toBeCloseTo(Math.min(1, s.indicators.approval + 0.1));
    for (const [i, u] of up.regions.ufs.entries()) expect(u.approval).toBeGreaterThanOrEqual(s.regions.ufs[i].approval);
    expect(s.indicators.approval).toBe(initial().indicators.approval); // não altera o recebido
    nextMonthIsValid(devAddCapital(up, 50));
  });
});

describe('painel de desenvolvedor: eventos', () => {
  it('lista os eventos do sorteio e põe qualquer um na caixa de entrada, uma vez', () => {
    const list = devEventList(content, DEFAULT_SCENARIO_ID);
    expect(list.length).toBeGreaterThan(0);
    const s = initial();
    const fired = devFireEvent(s, content, list[0].id);
    if (!fired.ok) throw new Error(fired.error);
    expect(fired.state.events.pending.map((p) => p.eventId)).toContain(list[0].id);
    expect(devFireEvent(fired.state, content, list[0].id).ok).toBe(false);
    expect(devFireEvent(s, content, 'nao_existe').ok).toBe(false);
    // Sem resposta, o motor resolve com a escolha padrão no prazo (GAME_DESIGN.md §4.2).
    const after = nextMonthIsValid(nextMonthIsValid(fired.state));
    expect(after.events.pending.some((p) => p.instanceId === `${list[0].id}#0`)).toBe(false);
  });
});

describe('painel de desenvolvedor: Congresso', () => {
  it('aprovar todas: projeto vai à sanção no mês e o motor o põe em execução ao encerrar', () => {
    const approved = devApproveAll(withBillInCongress(), content);
    expect(devCongressProposals(approved)).toEqual([]);
    const p = approved.proposals.find((x) => x.history.at(-1)?.cause === DEV_CAUSE)!;
    expect(p.status).toBe('aguardando_sancao');
    const next = nextMonthIsValid(approved);
    expect(next.proposals.find((x) => x.id === p.id)!.status).toBe('em_execucao');
  });

  it('rejeitar todas: sai do Congresso e o mês seguinte continua válido', () => {
    const rejected = devRejectAll(withBillInCongress(), content);
    expect(devCongressProposals(rejected)).toEqual([]);
    expect(rejected.proposals.some((p) => p.status === 'rejeitada' && p.history.at(-1)?.cause === DEV_CAUSE)).toBe(
      true,
    );
    nextMonthIsValid(rejected);
  });
});

describe('painel de desenvolvedor: store', () => {
  async function app() {
    const db = openNodeDatabase();
    await migrate(db);
    const keepOpen: SqlDatabase = { ...db, close: async () => {} };
    let i = 0;
    const launch = async () => {
      const store = createGameStore({ openDb: async () => keepOpen, random: () => ((i++ * 0.37) % 1) + 0.01 });
      await store.getState().init();
      return store;
    };
    return launch;
  }

  it('o atalho é gravado no turno atual e sobrevive a reabrir o app', async () => {
    const launch = await app();
    let store = await launch();
    await store.getState().newCampaign({ name: 'Dev', difficulty: 'casual' });
    expect(await store.getState().devApply((s) => devAddCapital(s, -500))).toBe(true);
    const id = store.getState().active!.id;
    store = await launch();
    await store.getState().continueCampaign(id);
    expect(store.getState().active!.state.resources.politicalCapital).toBe(0);
  });

  it('pula meses simulando cada um e para no fim da campanha', async () => {
    const launch = await app();
    const store = await launch();
    await store.getState().newCampaign({ name: 'Pulo', difficulty: 'casual' });
    const seen: number[] = [];
    expect(await store.getState().devSkipTo(3, (m) => seen.push(m))).toBe(true);
    expect(store.getState().active!.state.monthIndex).toBe(3);
    expect(seen).toEqual([1, 2, 3]);
    const end = campaignMonths(store.getState().active!.state.scenarioId);
    expect(await store.getState().devSkipTo(end + 10)).toBe(true);
    expect(store.getState().active!.finished).toBe(true);
    expect(await store.getState().devApply((s) => s)).toBe(false);
  }, 120_000);
});
