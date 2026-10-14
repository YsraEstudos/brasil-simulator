import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';

import { VISIT_ACTION_ID } from '../actions';
import { advanceMonth } from '../advanceMonth';
import { effectsToImpulses } from '../events/events';
import { checkInvariants } from '../invariants';
import { scheduleImpulses } from '../proposals/proposals';
import { createRng } from '../rng';
import { runCampaign } from '../sim/campaign';
import { STRATEGIES } from '../sim/strategies';
import { createInitialState } from '../state';
import type { GameContent, GameState, MonthInput, ReportDraft, ScheduledImpulse, UfState } from '../types';

import { initialRegions, keyWeights, populationShares, regionalDispersion, regionsOf, regionsView } from './regions';

// ECONOMIC_MODEL.md §5.12 e §5.15 (decisão D7): as UFs recebem uma distribuição do agregado nacional. Testes de
// sentido (direção do efeito) e de soma (invariante §7.9), não de valor exato.

const content: GameContent = loadContent(DEFAULT_SCENARIO_ID);
const ufs = regionsOf(content);
const pop = populationShares(ufs);
const EMPTY: MonthInput = { decisions: [] };

const uf = (state: GameState, id: string): UfState => {
  const found = state.regions.ufs.find((u) => u.id === id);
  if (!found) throw new Error(`UF ausente: ${id}`);
  return found;
};
/** Atividade da UF em relação à tendência (participação ÷ participação de tendência − 1). */
const activity = (state: GameState, id: string) => uf(state, id).share / uf(state, id).structuralShare - 1;
/** Aprovação da UF menos a nacional. */
const approvalGap = (state: GameState, id: string) => uf(state, id).approval - state.indicators.approval;

function start(seed = 1): GameState {
  return createInitialState({ content, difficulty: 'estrategica', seed });
}

/** Um mês com impulsos extras na fila (mesma semente: a única diferença é o impulso). */
function monthWith(impulses: ScheduledImpulse[], input: MonthInput = EMPTY, base: GameState = start()) {
  const state = { ...base, impulses: [...base.impulses, ...impulses] };
  return advanceMonth(state, input, content);
}

const impulse = (over: Partial<ScheduledImpulse> & Pick<ScheduledImpulse, 'target' | 'delta'>): ScheduledImpulse => ({
  sourceId: 'teste',
  label: 'Teste',
  startMonth: 0,
  endMonth: 11,
  ...over,
});

describe('distribuição inicial (ECONOMIC_MODEL.md §5.15, invariante §7.9)', () => {
  const state = start();

  it('o cenário tem as 27 UFs, com as siglas do globo', () => {
    expect(ufs).toHaveLength(27);
    expect(state.regions.ufs.map((u) => u.id)).toEqual(ufs.map((u) => u.id));
  });

  it('participações somam 1; desemprego e aprovação médios são os nacionais', () => {
    const s = state.regions.ufs;
    expect(s.reduce((n, u) => n + u.share, 0)).toBeCloseTo(1, 12);
    expect(s.reduce((n, u, i) => n + pop[i] * u.unemployment, 0)).toBeCloseTo(state.indicators.unemployment, 12);
    expect(s.reduce((n, u, i) => n + pop[i] * u.approval, 0)).toBeCloseTo(state.indicators.approval, 12);
  });

  it('o desemprego relativo segue a estrutura do cenário (BA acima de SC)', () => {
    expect(uf(state, 'BA').unemployment).toBeGreaterThan(uf(state, 'SC').unemployment);
  });

  it('cada explicação soma exatamente a diferença que explica', () => {
    const { ufs: view, explanations } = initialRegions(state, content);
    explanations.forEach((x, i) => {
      const total = (p: readonly { delta: number }[]) => p.reduce((n, piece) => n + piece.delta, 0);
      expect(total(x.activity)).toBeCloseTo(view[i].share / view[i].structuralShare - 1, 12);
      expect(total(x.unemployment)).toBeCloseTo(view[i].unemployment - state.indicators.unemployment, 12);
      expect(total(x.approval)).toBeCloseTo(view[i].approval - state.indicators.approval, 12);
    });
  });

  it('save antigo sem UFs: a interface recebe a distribuição inicial', () => {
    const old = { ...state, regions: { ufs: [] } };
    expect(regionsView(old, content).map((u) => u.share)).toEqual(state.regions.ufs.map((u) => u.share));
  });
});

describe('chaves de distribuição (ECONOMIC_MODEL.md §5.15)', () => {
  const structural = ufs.map((u) => u.gdpShare);
  const share = (w: number[], id: string) => w[ufs.findIndex((u) => u.id === id)];
  const ratio = (w: number[], id: string) => share(w, id) / share(pop, id);

  it('pobreza põe mais por habitante no Nordeste; renda alta, no Sudeste e no DF', () => {
    const poverty = keyWeights(ufs, structural, { key: 'pobreza', scope: [] });
    const rich = keyWeights(ufs, structural, { key: 'renda_alta', scope: [] });
    expect(ratio(poverty, 'MA')).toBeGreaterThan(1.5);
    expect(ratio(poverty, 'SC')).toBeLessThan(0.5);
    expect(ratio(rich, 'SP')).toBeGreaterThan(ratio(rich, 'BA'));
    expect(ratio(rich, 'DF')).toBeGreaterThan(1.5);
  });

  it('o escopo zera as UFs de fora e o peso extra concentra na UF indicada', () => {
    const ne = keyWeights(ufs, structural, { key: 'populacao', scope: ['nordeste'] });
    expect(share(ne, 'SP')).toBe(0);
    expect(ne.reduce((n, w) => n + w, 0)).toBeCloseTo(1, 12);
    const df = keyWeights(ufs, structural, { key: 'populacao', scope: [], boost: { DF: 6 } });
    expect(ratio(df, 'DF')).toBeGreaterThan(5);
  });
});

describe('efeitos regionais diferentes e explicáveis (testes de sentido, ECONOMIC_MODEL.md §9)', () => {
  const base = monthWith([]);

  it('transferência à baixa renda favorece Norte e Nordeste: atividade e aprovação sobem mais na BA que em SP', () => {
    const r = monthWith([
      impulse({ target: 'gasto.transferencia_baixa_renda', delta: 0.003, regional: { key: 'pobreza', scope: [] } }),
    ]);
    expect(activity(r.state, 'BA') - activity(base.state, 'BA')).toBeGreaterThan(0);
    expect(activity(r.state, 'SP') - activity(base.state, 'SP')).toBeLessThan(0);
    expect(approvalGap(r.state, 'MA') - approvalGap(base.state, 'MA')).toBeGreaterThan(0.005);
    expect(approvalGap(r.state, 'SC') - approvalGap(base.state, 'SC')).toBeLessThan(0);
    // A causa aparece na explicação da UF, com o rótulo do impulso.
    const ba = r.report.regional?.find((x) => x.id === 'BA');
    expect(ba?.approval.some((p) => p.cause === 'teste' && p.delta > 0)).toBe(true);
  });

  it('tributo sobre a renda pesa mais no Sudeste e no DF que no Nordeste', () => {
    const r = monthWith([
      impulse({ target: 'receita.renda', delta: 0.003, regional: { key: 'renda_alta', scope: [] } }),
    ]);
    const change = (id: string) => approvalGap(r.state, id) - approvalGap(base.state, id);
    expect(change('DF')).toBeLessThan(0);
    expect(change('SP')).toBeLessThan(change('MA'));
  });

  it('a seca concentra a perda no Nordeste e no Centro-Oeste, sem mudar o total nacional', () => {
    const seca = content.events.find((e) => e.id === 'seca_safra_energia');
    if (!seca) throw new Error('evento ausente');
    const shock = effectsToImpulses(seca.onFire, 0, 'evento:seca', seca.title).filter(
      (i) => i.target === 'regiao.atividade',
    );
    const r = monthWith(shock);
    expect(activity(r.state, 'PI')).toBeLessThan(activity(base.state, 'PI'));
    expect(activity(r.state, 'MT')).toBeLessThan(activity(base.state, 'MT'));
    expect(activity(r.state, 'SP')).toBeGreaterThan(activity(base.state, 'SP'));
    // O nacional não muda: só a distribuição (D7).
    expect(r.state.indicators).toEqual(base.state.indicators);
    expect(uf(r.state, 'PI').unemployment).toBeGreaterThan(uf(base.state, 'PI').unemployment);
  });

  it('termos de troca favoráveis puxam as UFs agrícolas e extrativas; recessão pesa mais nas industriais', () => {
    const s0 = start();
    const boom = advanceMonth({ ...s0, economy: { ...s0.economy, termsOfTrade: 0.1 } }, EMPTY, content).state;
    const calm = advanceMonth({ ...s0, economy: { ...s0.economy, termsOfTrade: 0 } }, EMPTY, content).state;
    expect(activity(boom, 'MT') - activity(calm, 'MT')).toBeGreaterThan(0);
    expect(activity(boom, 'PA') - activity(calm, 'PA')).toBeGreaterThan(activity(boom, 'MT') - activity(calm, 'MT'));
    expect(activity(boom, 'DF') - activity(calm, 'DF')).toBeLessThan(0);

    const slump = advanceMonth({ ...s0, economy: { ...s0.economy, outputGap: -0.03 } }, EMPTY, content).state;
    const normal = advanceMonth({ ...s0, economy: { ...s0.economy, outputGap: 0 } }, EMPTY, content).state;
    expect(activity(slump, 'SC') - activity(normal, 'SC')).toBeLessThan(activity(slump, 'DF') - activity(normal, 'DF'));
  });

  it('governador aliado puxa a aprovação local para cima; hostil, para baixo', () => {
    const s0 = start();
    const set = (relation: number): GameState => ({
      ...s0,
      regions: { ufs: s0.regions.ufs.map((u) => (u.id === 'GO' ? { ...u, governorRelation: relation } : u)) },
    });
    const allied = advanceMonth(set(80), EMPTY, content).state;
    const hostile = advanceMonth(set(-80), EMPTY, content).state;
    expect(approvalGap(allied, 'GO')).toBeGreaterThan(approvalGap(hostile, 'GO'));
  });

  it('visitar o estado: aprovação local e relação com o governador sobem; a nacional não muda', () => {
    const s0 = start();
    const visit: MonthInput = { decisions: [{ policyId: VISIT_ACTION_ID, agendaCost: 1, params: { uf: 'PE' } }] };
    const r = advanceMonth(s0, visit, content);
    const without = advanceMonth(s0, EMPTY, content);
    expect(r.report.accepted).toHaveLength(1);
    expect(approvalGap(r.state, 'PE')).toBeGreaterThan(approvalGap(without.state, 'PE'));
    expect(uf(r.state, 'PE').governorRelation).toBeGreaterThan(uf(without.state, 'PE').governorRelation);
    expect(r.state.indicators).toEqual(without.state.indicators);
  });

  it('visita a UF inexistente é recusada', () => {
    const r = advanceMonth(
      start(),
      { decisions: [{ policyId: VISIT_ACTION_ID, agendaCost: 1, params: { uf: 'XX' } }] },
      content,
    );
    expect(r.report.rejected[0]?.reason).toBe('alvo_invalido');
  });
});

describe('governadores e adesão a convênios (POLITICAL_RULES.md §2.1)', () => {
  const policy = content.policies.seguranca_cooperacao;
  const draft = (): ReportDraft => ({
    proposalChanges: [],
    eventsResolved: [],
    eventsFired: [],
    notes: [],
    copom: null,
    regional: null,
  });
  const adherents = (relation: number, seed: number): string[] => {
    const s0 = start(seed);
    const state = { ...s0, regions: { ufs: s0.regions.ufs.map((u) => ({ ...u, governorRelation: relation })) } };
    const ctx = { rng: createRng(state.rng), content, decisions: [], eventChoices: [], draft: draft() };
    return scheduleImpulses(policy, 'seguranca_cooperacao_0', 1, 1, state, ctx).adherents ?? [];
  };

  it('governadores aliados aderem mais que hostis (20 sementes)', () => {
    const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
    const allied = seeds.reduce((n, s) => n + adherents(80, s).length, 0);
    const hostile = seeds.reduce((n, s) => n + adherents(-80, s).length, 0);
    expect(allied).toBeGreaterThan(hostile * 1.5);
  });

  it('o gasto do programa só chega às UFs que aderiram e encolhe com a adesão', () => {
    const s0 = start(3);
    const ctx = { rng: createRng(s0.rng), content, decisions: [], eventChoices: [], draft: draft() };
    const schedule = scheduleImpulses(policy, 'seguranca_cooperacao_0', 1, 1, s0, ctx);
    const fiscal = schedule.impulses.filter((i) => i.target.startsWith('gasto.'));
    expect(fiscal.every((i) => i.regional?.scope.join() === schedule.adherents?.join())).toBe(true);
    const full = scheduleImpulses(
      policy,
      'x',
      1,
      1,
      { ...s0, difficulty: 'casual' },
      { ...ctx, rng: createRng(s0.rng) },
    );
    expect(full.adherents).toBeNull();
    expect(fiscal[0].delta).toBeLessThanOrEqual(full.impulses.filter((i) => i.target.startsWith('gasto.'))[0].delta);
  });

  it('a relação dos governadores fica em −100…100 e segue o bloco do governador', () => {
    let state = start();
    for (let m = 0; m < 24; m++) state = advanceMonth(state, EMPTY, content).state;
    for (const u of state.regions.ufs) expect(Math.abs(u.governorRelation)).toBeLessThanOrEqual(100);
  });
});

describe('campanhas com efeitos regionais (ECONOMIC_MODEL.md §9)', () => {
  it('distributiva × inerte em 24 meses: o programa de transferência eleva a aprovação relativa do Nordeste', () => {
    const play = (id: string, seed: number) => {
      const s = STRATEGIES.find((x) => x.id === id);
      if (!s) throw new Error(`estratégia ausente: ${id}`);
      let state = start(seed);
      let report = null;
      const errors: string[] = [];
      for (let m = 0; m < 24; m++) {
        const r = advanceMonth(state, s.decide(state, content), content);
        errors.push(...checkInvariants(state, r.state, r.report, content));
        state = r.state;
        report = r.report;
      }
      expect(errors).toEqual([]);
      return { state, report };
    };
    const gap = (s: GameState, region: string) =>
      s.regions.ufs.reduce(
        (n, u, i) => (ufs[i].region === region ? n + pop[i] * (u.approval - s.indicators.approval) : n),
        0,
      );
    // Média de 6 sementes: eventos regionais (seca, enchentes) sorteados em cada campanha somam ruído.
    const seeds = [1, 2, 3, 4, 5, 6];
    let northeast = 0;
    let south = 0;
    for (const seed of seeds) {
      const d = play('distributiva', seed);
      const i = play('inerte', seed);
      northeast += gap(d.state, 'nordeste') - gap(i.state, 'nordeste');
      south += gap(d.state, 'sul') - gap(i.state, 'sul');
      // A explicação da UF atribui a diferença ao programa (positivo no MA, negativo em SC).
      const piece = (id: string) =>
        d.report?.regional
          ?.find((x) => x.id === id)
          ?.approval.find((p) => p.label === content.policies.transferencia_renda_ampliacao.name)?.delta ?? 0;
      expect(piece('MA')).toBeGreaterThan(0);
      expect(piece('SC')).toBeLessThan(0);
    }
    expect(northeast).toBeGreaterThan(0);
    expect(south).toBeLessThan(0);
  });

  it('impulsos enormes ficam saturados: aprovação das UFs em [0, 1] e invariantes valem', () => {
    const r = monthWith([
      impulse({ target: 'gasto.transferencia_baixa_renda', delta: 0.2, regional: { key: 'pobreza', scope: ['AC'] } }),
      impulse({ target: 'regiao.aprovacao', delta: 0.5, regional: { key: 'populacao', scope: ['AC'] } }),
    ]);
    const s0 = start();
    expect(checkInvariants(s0, r.state, r.report, content)).toEqual([]);
    // O desvio da UF satura em `desvio_atividade_max`; descontado o das demais, fica em até o dobro.
    expect(Math.abs(Math.log(uf(r.state, 'AC').share / uf(r.state, 'AC').structuralShare))).toBeLessThanOrEqual(
      2 * content.calibration.desvio_atividade_max,
    );
  });

  it('a dispersão regional é positiva e determinística', () => {
    const a = runCampaign(STRATEGIES[0], 1, 12, content);
    const b = runCampaign(STRATEGIES[0], 1, 12, content);
    expect(a).toEqual(b);
    expect(regionalDispersion(start().regions.ufs, content)).toBeGreaterThan(0.2);
  });
});
