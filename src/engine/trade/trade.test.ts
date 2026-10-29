import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent, TRADE } from '@/content';
import {
  ADJUST_TARIFF_ACTION_ID,
  NEGOTIATE_AGREEMENT_ACTION_ID,
  TRADE_MISSION_ACTION_ID,
  VISIT_ACTION_ID,
} from '@/engine/actions';
import { advanceMonth, DEFAULT_STEPS } from '@/engine/advanceMonth';
import { checkInvariants } from '@/engine/invariants';
import { createInitialState } from '@/engine/state';
import type { Decision, GameContent, GameState, MonthStep, ScheduledImpulse } from '@/engine/types';
import type { TradeCatalog } from '@/types/trade';

import { tradeParam } from './calibration';
import { agreementInForce, checkTrade, ratificationForecast, tradeStep } from './trade';

// PLANO_EXPANSAO F14 e EX-25: dois instrumentos (tarifa e missão), acordos com rodadas, ratificação e vigência, dois
// choques (barreira e cadeia), efeitos explicados em câmbio, setor e arrecadação, sem duplicar termos de troca.

const content: GameContent = loadContent(DEFAULT_SCENARIO_ID);
const fresh = (seed = 5): GameState => createInitialState({ content, difficulty: 'estrategica', seed });
/** Sem choques sorteados: isola o efeito das decisões. */
const calm: GameContent = { ...content, trade: { ...TRADE, shocks: [] } };

const tariff = (direction: 'elevar' | 'reduzir'): Decision => ({
  policyId: ADJUST_TARIFF_ACTION_ID,
  agendaCost: 1,
  params: { direction },
});
const mission = (partnerId: string): Decision => ({
  policyId: TRADE_MISSION_ACTION_ID,
  agendaCost: 1,
  params: { partnerId },
});
const negotiate = (partnerId: string): Decision => ({
  policyId: NEGOTIATE_AGREEMENT_ACTION_ID,
  agendaCost: 1,
  params: { partnerId },
});

/** Impulsos criados no mês (antes de a fila descartar os de um mês). */
function monthImpulses(
  state: GameState,
  decisions: Decision[],
  c = calm,
): { state: GameState; created: ScheduledImpulse[] } {
  let created: ScheduledImpulse[] = [];
  const probe: MonthStep = (s) => {
    created = s.impulses.filter((i) => i.sourceId.startsWith('comercio:'));
    return { state: s, contributions: [] };
  };
  const out = advanceMonth(state, { decisions }, c, [tradeStep, probe]);
  return { state: out.state, created };
}

describe('comércio: tarifa de importação (CF art. 153 §1º)', () => {
  it('elevar arrecada mais, reduz importações, sobe preços por um ano e piora as relações', () => {
    const start = fresh();
    const { state, created } = monthImpulses(start, [tariff('elevar')]);
    expect(state.trade.tariff).toBeCloseTo(TRADE.tariff.base + TRADE.tariff.step, 12);
    expect(state.trade.flows.imports).toBeLessThan(0);
    expect(state.trade.flows.tariffRevenue).toBeGreaterThan(0);
    const inflation = created.find((i) => i.target === 'choque.inflacao')!;
    expect(inflation.delta).toBeGreaterThan(0);
    expect(inflation.endMonth! - inflation.startMonth + 1).toBe(tradeParam('meses_repasse'));
    expect(created.find((i) => i.target === 'receita.tributaria')?.delta).toBeCloseTo(
      state.trade.flows.tariffRevenue,
      12,
    );
    // Menos importação melhora o saldo: hiato sobe e o câmbio aprecia, só na mudança.
    expect(created.find((i) => i.target === 'choque.hiato')!.delta).toBeGreaterThan(0);
    expect(created.find((i) => i.target === 'choque.cambio')!.delta).toBeLessThan(0);
    for (const p of state.trade.partners) {
      const initial = TRADE.partners.find((x) => x.id === p.id)!.initialRelation;
      expect(p.relation).toBeLessThan(initial);
    }
  });

  it('a tarifa fica na faixa do decreto: fora dela a ação é recusada', () => {
    let s = fresh();
    s = { ...s, trade: { ...s.trade, tariff: TRADE.tariff.max } };
    const out = advanceMonth(s, { decisions: [tariff('elevar')] }, calm);
    expect(out.report.rejected.map((r) => r.reason)).toEqual(['alvo_invalido']);
    const bad = advanceMonth(fresh(), { decisions: [{ ...tariff('elevar'), params: { direction: 'zerar' } }] }, calm);
    expect(bad.report.rejected.map((r) => r.reason)).toEqual(['alvo_invalido']);
  });

  it('o câmbio responde à mudança do saldo, não ao nível: tarifa parada não gera nova apreciação', () => {
    const first = monthImpulses(fresh(), [tariff('elevar')]).state;
    const { created } = monthImpulses(first, []);
    expect(created.some((i) => i.target === 'choque.cambio')).toBe(false);
    expect(created.some((i) => i.target === 'receita.tributaria')).toBe(true);
  });
});

describe('comércio: diplomacia e acordos (CF art. 49, I)', () => {
  it('missão comercial melhora a relação e encurta a barreira do parceiro', () => {
    const s0 = fresh();
    const withBarrier: GameState = {
      ...s0,
      trade: {
        ...s0.trade,
        shocks: [{ id: 'teste', kind: 'barreira', partnerId: 'china', startMonth: 0, endMonth: 8, size: 0.15 }],
      },
    };
    const out = advanceMonth(withBarrier, { decisions: [mission('china')] }, calm, [tradeStep]).state;
    const china = out.trade.partners.find((p) => p.id === 'china')!;
    expect(china.relation).toBeGreaterThan(TRADE.partners.find((p) => p.id === 'china')!.initialRelation);
    expect(out.trade.shocks[0].endMonth).toBe(8 - tradeParam('missao_reduz_barreira'));
    expect(out.trade.flows.exports).toBeLessThan(0);
    expect(out.trade.flows.sectors.agropecuaria).toBeCloseTo(out.trade.flows.exports, 12);
  });

  it('acordo: rodadas mensais, assinatura, votação no Congresso e vigência com contrapartidas', () => {
    let s = fresh();
    for (let m = 0; m < tradeParam('rodadas_acordo'); m++) {
      s = advanceMonth(s, { decisions: [negotiate('uniao_europeia')] }, calm, [tradeStep]).state;
    }
    const signed = s.trade.partners.find((p) => p.id === 'uniao_europeia')!.agreement!;
    expect(signed.stage).toBe('ratificacao');
    expect(signed.voteMonth).toBe(tradeParam('rodadas_acordo') - 1 + tradeParam('meses_ratificacao'));
    // Congresso alinhado: a ratificação passa.
    const friendly: GameState = {
      ...s,
      congress: {
        ...s.congress,
        blocs: content.scenario.blocs.map((b) => ({ id: b.id, governmentRelation: 100 })),
      },
    };
    let f = friendly;
    while (f.monthIndex <= signed.voteMonth!) f = advanceMonth(f, { decisions: [] }, calm, [tradeStep]).state;
    const agreement = f.trade.partners.find((p) => p.id === 'uniao_europeia')!.agreement!;
    expect(agreement.stage).toBe('vigente');
    expect(agreement.votes!.camara.yes).toBeGreaterThan(agreement.votes!.camara.no);
    f = advanceMonth(f, { decisions: [] }, calm, [tradeStep]).state;
    expect(agreementInForce(agreement, f.monthIndex - 1)).toBe(true);
    expect(f.trade.flows.exports).toBeGreaterThan(0);
    expect(f.trade.flows.imports).toBeGreaterThan(0);
    expect(f.trade.flows.tariffRevenue).toBeLessThan(0);
  });

  it('Congresso hostil rejeita; nova negociação só depois do prazo', () => {
    let s = fresh();
    for (let m = 0; m < tradeParam('rodadas_acordo'); m++)
      s = advanceMonth(s, { decisions: [negotiate('japao')] }, calm, [tradeStep]).state;
    s = {
      ...s,
      congress: {
        ...s.congress,
        blocs: content.scenario.blocs.map((b) => ({ id: b.id, governmentRelation: -100 })),
      },
      indicators: { ...s.indicators, approval: 0.1 },
    };
    expect(ratificationForecast(s, calm).every((h) => h.expectedYes < h.required)).toBe(true);
    const vote = s.trade.partners.find((p) => p.id === 'japao')!.agreement!.voteMonth!;
    while (s.monthIndex <= vote) s = advanceMonth(s, { decisions: [] }, calm, [tradeStep]).state;
    expect(s.trade.partners.find((p) => p.id === 'japao')!.agreement!.stage).toBe('rejeitado');
    const early = advanceMonth(s, { decisions: [negotiate('japao')] }, calm);
    expect(early.report.rejected.map((r) => r.reason)).toEqual(['alvo_invalido']);
  });

  it('parceiro sem acordo possível (união aduaneira) recusa a negociação', () => {
    const out = advanceMonth(fresh(), { decisions: [negotiate('mercosul')] }, calm);
    expect(out.report.rejected.map((r) => r.reason)).toEqual(['alvo_invalido']);
  });

  it('diplomacia soma avanço por rodada, mas ainda exige rodadas e ratificação', () => {
    const s = fresh();
    const skilled: GameState = {
      ...s,
      skills: {
        characters: {
          [s.control?.controlledCharacterId ?? 'presidente']: {
            negociacao: 0,
            federalismo: 0,
            ciencia_tecnologia: 0,
            diplomacia: 99,
          },
        },
      },
    };
    let a = skilled;
    let rounds = 0;
    while (a.trade.partners.find((p) => p.id === 'uniao_europeia')!.agreement?.stage !== 'ratificacao') {
      a = advanceMonth(a, { decisions: [negotiate('uniao_europeia')] }, calm, [tradeStep]).state;
      rounds++;
    }
    expect(rounds).toBeLessThan(tradeParam('rodadas_acordo'));
    expect(rounds).toBeGreaterThan(1);
  });
});

describe('comércio: choques externos', () => {
  const stormy: TradeCatalog = {
    ...TRADE,
    shocks: TRADE.shocks.map((s) => ({ ...s, monthlyProbability: 0.2 })),
  };
  const c: GameContent = { ...content, trade: stormy };

  it('sorteio por chave: mesma semente, mesmos choques, com ou sem outras ações no mês', () => {
    const play = (extra: boolean) => {
      let s = fresh(21);
      for (let m = 0; m < 24; m++) {
        const decisions: Decision[] = extra ? [{ policyId: VISIT_ACTION_ID, agendaCost: 1, params: { uf: 'BA' } }] : [];
        s = advanceMonth(s, { decisions }, c).state;
      }
      return s.trade.shocks.map((x) => x.id);
    };
    const a = play(false);
    expect(play(true)).toEqual(a);
    expect(play(false)).toEqual(a);
  });

  it('ruptura de cadeias sobe preços por meses; barreira derruba exportações do setor exposto', () => {
    let s = fresh(2);
    let sawBarrier = false;
    let sawChain = false;
    for (let m = 0; m < 36 && !(sawBarrier && sawChain); m++) {
      const before = s;
      s = advanceMonth(s, { decisions: [] }, c).state;
      for (const shock of s.trade.shocks.filter((x) => x.startMonth === before.monthIndex)) {
        if (shock.kind === 'barreira') {
          sawBarrier = true;
          expect(s.trade.flows.exports).toBeLessThan(0);
        } else {
          sawChain = true;
          expect(
            s.impulses.some(
              (i) => i.sourceId === `comercio:cadeia:${before.monthIndex}` && i.target === 'choque.inflacao',
            ),
          ).toBe(true);
        }
      }
    }
    expect(sawBarrier && sawChain).toBe(true);
  });

  it('acordo vigente reduz o risco de barreira; tarifa alta aumenta', () => {
    // Propriedade do sorteio: com a mesma chave, menor probabilidade nunca dispara quando a maior não disparou.
    const count = (state: GameState) => {
      let s = state;
      let n = 0;
      for (let m = 0; m < 60; m++) {
        s = advanceMonth(s, { decisions: [] }, c, [tradeStep]).state;
        n += s.trade.shocks.filter((x) => x.kind === 'barreira' && x.startMonth === m).length;
      }
      return n;
    };
    const base = fresh(4);
    const high: GameState = { ...base, trade: { ...base.trade, tariff: TRADE.tariff.max } };
    expect(count(high)).toBeGreaterThanOrEqual(count(base));
  });
});

describe('comércio: invariantes e campanha', () => {
  it('48 meses com tarifa, missões e acordo: invariantes do motor e do comércio', () => {
    const plan: Record<number, Decision[]> = {
      0: [tariff('elevar'), negotiate('uniao_europeia')],
      1: [negotiate('uniao_europeia'), mission('china')],
      2: [negotiate('uniao_europeia')],
      3: [negotiate('uniao_europeia')],
      10: [tariff('reduzir')],
    };
    let s = fresh(8);
    const errors: string[] = [];
    for (let m = 0; m < 48; m++) {
      const out = advanceMonth(s, { decisions: plan[m] ?? [] }, content, DEFAULT_STEPS);
      errors.push(...checkInvariants(s, out.state, out.report, content).map((e) => `mês ${m}: ${e}`));
      errors.push(...checkTrade(out.state.trade, TRADE));
      s = out.state;
    }
    expect(errors).toEqual([]);
    expect(s.trade.partners.find((p) => p.id === 'uniao_europeia')!.agreement).toBeDefined();
  });

  it('sem catálogo de comércio, a etapa é inerte', () => {
    const { trade: _omit, ...rest } = content;
    void _omit;
    const s = fresh();
    const out = advanceMonth(s, { decisions: [] }, rest as GameContent, [tradeStep]).state;
    expect(out.trade).toEqual(s.trade);
  });
});
