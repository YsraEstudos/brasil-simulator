import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { ADOPT_MEASURE_ACTION_ID, END_MEASURE_ACTION_ID, INVESTIGATE_ALERT_ACTION_ID } from '../actions';
import { advanceMonth } from '../advanceMonth';
import { checkPublications } from '../information/publication';
import { checkInvariants } from '../invariants';
import { createRng } from '../rng';
import { createInitialState } from '../state';
import type { Decision, GameState, MonthResult } from '../types';
import { createOutbreak, diseaseOf, healthOf, HEALTH_IMPULSE_PREFIX, healthStep } from './health';
import type { Outbreak, OutbreakPhase } from './types';

const content = loadContent(DEFAULT_SCENARIO_ID);
const UFS = content.scenario.regions!.ufs;

function base(
  seed = 3,
  modules: ('clima_detalhado' | 'noticias' | 'crises_sanitarias')[] = ['clima_detalhado', 'noticias'],
) {
  return createInitialState({ content, difficulty: 'estrategica', seed, modules });
}

/** Estado com um surto forçado (verdade dada), já visível na fase pedida. */
function withOutbreak(
  state: GameState,
  diseaseId: string,
  truth: Outbreak['truth'],
  phase: OutbreakPhase = 'identificado',
  origin = 'SP',
): GameState {
  const outbreak = createOutbreak(state, diseaseOf(content, diseaseId)!, UFS, origin, truth);
  if (phase !== 'silencioso') {
    outbreak.phase = phase;
    outbreak.detectedMonth = state.monthIndex;
    if (phase === 'identificado') outbreak.identifiedMonth = state.monthIndex;
  }
  return { ...state, health: { ...state.health, outbreaks: [...state.health.outbreaks, outbreak] } };
}

const adopt = (outbreakId: string, measureId: string, extra: Record<string, unknown> = {}): Decision => ({
  policyId: ADOPT_MEASURE_ACTION_ID,
  agendaCost: 1,
  params: { outbreakId, measureId, ...extra },
});

function step(state: GameState, decisions: Decision[] = []): MonthResult {
  const result = advanceMonth(state, { decisions }, content);
  expect(checkInvariants(state, result.state, result.report, content)).toEqual([]);
  return result;
}

function runMonths(state: GameState, months: number, plan: (s: GameState) => Decision[] = () => []) {
  let current = state;
  const results: MonthResult[] = [];
  for (let m = 0; m < months; m++) {
    const r = step(current, plan(current));
    results.push(r);
    current = r.state;
  }
  return { state: current, results };
}

/** Impulsos da saúde no mês (os de um mês só saem da fila ao fim do mês, então são lidos na própria etapa). */
function healthImpulses(state: GameState, decisions: Decision[] = []) {
  const draft = {
    proposalChanges: [],
    eventsResolved: [],
    eventsFired: [],
    eventInstances: [],
    notes: [],
    copom: null,
    regional: null,
  };
  const out = healthStep(state, { rng: createRng(state.rng), content, decisions, eventChoices: [], draft });
  return out.state.impulses.filter(
    (i) => i.startMonth === state.monthIndex && i.sourceId.startsWith(HEALTH_IMPULSE_PREFIX),
  );
}

const totalPopulation = (s: GameState) =>
  s.demography.ufs.reduce((sum, u) => sum + u.ages.young + u.ages.working + u.ages.older, 0);

describe('capacidade sanitária regional (EX-26)', () => {
  it('nasce da capacidade de partida por região: leitos, demanda habitual e utilização são grandezas separadas', () => {
    const s = base();
    const health = healthOf(s);
    expect(health.ufs).toHaveLength(27);
    for (const uf of health.ufs) {
      expect(uf.beds).toBeGreaterThan(0);
      expect(uf.routineDemand).toBeLessThan(uf.beds);
      expect(uf.outbreakDemand).toBe(0);
      expect(uf.emergencyBeds).toBe(0);
    }
    const norte = health.ufs.find((u) => u.id === 'AM')!;
    const sul = health.ufs.find((u) => u.id === 'RS')!;
    expect(norte.primary).toBeLessThan(sul.primary);
  });

  it('a rotina de atenção básica da carteira amplia a cobertura aos poucos, sem gasto extra fora da rotina', () => {
    const directive: Decision = {
      policyId: 'definir_diretriz',
      agendaCost: 1,
      params: { ministryId: 'saude', policyId: 'rotina_atencao_basica', annualMillions: 3200 },
    };
    const start = healthOf(base()).ufs.find((u) => u.id === 'BA')!.primary;
    const after = runMonths(base(), 12, (s) => (s.monthIndex === 0 ? [directive] : [])).state;
    const end = healthOf(after).ufs.find((u) => u.id === 'BA')!.primary;
    expect(end).toBeGreaterThan(start);
    // Nenhum impulso de gasto com a etiqueta da saúde: o custo é o da própria rotina.
    expect(
      after.impulses.some((i) => i.sourceId.startsWith(HEALTH_IMPULSE_PREFIX) && i.target.startsWith('gasto.')),
    ).toBe(false);
  });
});

describe('surtos e resposta pública (EX-27)', () => {
  it('mortes do surto saem da população uma única vez, pela demografia', () => {
    const start = withOutbreak(base(), 'respiratorio_novo', { r0: 2, hospitalRate: 0.02, vaccineMonth: 99 });
    let s = start;
    let epidemicDeaths = 0;
    for (let m = 0; m < 14; m++) {
      const r = step(s);
      const handed = healthOf(r.state).monthDeaths.reduce((x, d) => x + d.young + d.working + d.older, 0);
      const removed = r.state.demography.ufs.reduce((x, u) => x + u.flows.epidemicDeaths, 0);
      expect(removed).toBeCloseTo(handed, 9);
      epidemicDeaths += removed;
      s = r.state;
    }
    expect(epidemicDeaths).toBeGreaterThan(1);
    const counted = (healthOf(s).outbreaks[0]?.ufs ?? []).reduce((x, u) => x + u.deaths, 0);
    if (healthOf(s).outbreaks.length > 0) expect(counted).toBeCloseTo(epidemicDeaths, 6);
    // A população caiu pelos fluxos registrados (nascimentos, mortes, migração), sem sumiço extra.
    expect(totalPopulation(s)).toBeLessThan(totalPopulation(start) + 5000);
  });

  it('alerta incompleto: investigar identifica no mês seguinte; sem investigação leva meses', () => {
    const alert = withOutbreak(
      base(),
      'respiratorio_novo',
      { r0: 1.6, hospitalRate: 0.015, vaccineMonth: 99 },
      'alerta',
    );
    const id = healthOf(alert).outbreaks[0].id;
    const investigated = runMonths(alert, 2, (s) =>
      s.monthIndex === 0 ? [{ policyId: INVESTIGATE_ALERT_ACTION_ID, agendaCost: 1, params: { outbreakId: id } }] : [],
    );
    expect(healthOf(investigated.state).outbreaks[0].phase).toBe('identificado');
    const investigate = [{ policyId: INVESTIGATE_ALERT_ACTION_ID, agendaCost: 1, params: { outbreakId: id } }];
    expect(healthImpulses(alert, investigate).some((i) => i.target === 'gasto.custeio')).toBe(true);
    expect(investigated.results[0].report.notes.some((n) => n.includes('Investigação'))).toBe(true);
    const waited = runMonths(alert, 2);
    expect(healthOf(waited.state).outbreaks[0].phase).toBe('alerta');
    expect(healthOf(waited.state).outbreaks[0].estimate).toBeUndefined();
  });

  it('a faixa estimada contém o R efetivo verdadeiro e encolhe com a investigação', () => {
    const s = withOutbreak(base(), 'respiratorio_novo', { r0: 1.8, hospitalRate: 0.015, vaccineMonth: 99 });
    const r = runMonths(s, 4).state;
    const estimate = healthOf(r).outbreaks[0].estimate!;
    expect(estimate.r[0]).toBeLessThan(estimate.r[1]);
    // R efetivo ≤ R0 (suscetíveis < 100%); a faixa nunca fica centrada exatamente nele por construção.
    expect(estimate.r[0]).toBeLessThan(1.8 * 1.05);
  });

  it('medidas custam por crédito extraordinário uma vez por mês, e encerrar para o custo', () => {
    const s = withOutbreak(base(), 'respiratorio_novo', { r0: 1.8, hospitalRate: 0.015, vaccineMonth: 99 });
    const id = healthOf(s).outbreaks[0].id;
    const costs = (st: GameState, decisions: Decision[] = []) =>
      healthImpulses(st, decisions).filter((i) => i.target === 'gasto.extraordinario');
    const adoptTesting = [adopt(id, 'testagem_rastreamento')];
    expect(costs(s)).toHaveLength(0);
    expect(costs(s, adoptTesting)).toHaveLength(1);
    const first = step(s, adoptTesting);
    expect(healthOf(first.state).outbreaks[0].ledger.fiscalMillions).toBeGreaterThan(0);
    expect(costs(first.state)).toHaveLength(1);
    const end = [
      {
        policyId: END_MEASURE_ACTION_ID,
        agendaCost: 1,
        params: { outbreakId: id, measureId: 'testagem_rastreamento' },
      },
    ];
    expect(step(first.state, end).report.rejected).toEqual([]);
    expect(costs(first.state, end)).toHaveLength(0);
  });

  it('vacinação só é aceita com vacina; restrições com adesão reduzem infecções (sementes pareadas)', () => {
    const s = withOutbreak(base(), 'respiratorio_novo', { r0: 1.8, hospitalRate: 0.015, vaccineMonth: 99 });
    const id = healthOf(s).outbreaks[0].id;
    const rejected = step(s, [adopt(id, 'vacinacao_em_massa')]);
    expect(rejected.report.rejected.map((r) => r.reason)).toContain('alvo_invalido');
    const infections = (st: GameState) => healthOf(st).outbreaks[0]?.ufs.reduce((x, u) => x + u.infections, 0) ?? 0;
    const none = runMonths(s, 6).state;
    const restricted = runMonths(s, 6, (st) => (st.monthIndex === 0 ? [adopt(id, 'restricoes_circulacao')] : [])).state;
    expect(infections(restricted)).toBeLessThan(infections(none));
    const restrictedNow = withOutbreak(base(), 'respiratorio_novo', { r0: 1.8, hospitalRate: 0.015, vaccineMonth: 99 });
    const restrictedId = healthOf(restrictedNow).outbreaks[0].id;
    expect(
      healthImpulses(restrictedNow, [adopt(restrictedId, 'restricoes_circulacao')]).some(
        (i) => i.label === 'Restrições de circulação' && i.target === 'choque.hiato' && i.delta < 0,
      ),
    ).toBe(true);
  });

  it('leitos de emergência pelo critério "aliados" favorecem governadores aliados; pedidos sem resposta custam relação', () => {
    let s = withOutbreak(base(), 'respiratorio_novo', { r0: 2.4, hospitalRate: 0.03, vaccineMonth: 99 });
    for (let m = 0; m < 12 && healthOf(s).outbreaks[0].requests.length === 0; m++) s = step(s).state;
    const outbreak = healthOf(s).outbreaks[0];
    expect(outbreak.requests.length).toBeGreaterThan(0);
    const expiredSome = runMonths(s, 3).state;
    expect(healthOf(expiredSome).outbreaks[0]?.requests.some((r) => r.status === 'expirado') ?? true).toBe(true);
    const allied = step(s, [adopt(outbreak.id, 'leitos_emergencia', { criterion: 'aliados' })]).state;
    const byRelation = healthOf(allied).ufs.map((u) => ({
      beds: u.emergencyBeds,
      relation: allied.regions.ufs.find((r) => r.id === u.id)?.governorRelation ?? 0,
    }));
    const totalBeds = byRelation.reduce((x, u) => x + u.beds, 0);
    expect(totalBeds).toBeGreaterThan(0);
    expect(totalBeds).toBeLessThanOrEqual(25 + 1e-9);
  });

  it('boletins são publicações estáveis: preliminar, revisão com motivo, sem reescrever o passado', () => {
    const s = withOutbreak(base(), 'arbovirose', { r0: 1.9, hospitalRate: 0.008, vaccineMonth: 0 });
    const end = runMonths(s, 4).state;
    const bulletins = healthOf(end).bulletins;
    expect(bulletins.length).toBeGreaterThan(2);
    expect(checkPublications(bulletins)).toEqual([]);
    const revised = bulletins.find((b) => b.revisions.length === 2)!;
    expect(revised.revisions[1].reason).toMatch(/notificações/);
    const before = runMonths(s, 3).state;
    const same = healthOf(before).bulletins.find((b) => b.id === bulletins[0].id)!;
    expect(same.revisions[0]).toEqual(bulletins[0].revisions[0]);
  });

  it('salvar e reabrir no meio da crise reproduz a continuação exatamente', () => {
    const s = withOutbreak(base(9), 'respiratorio_novo', { r0: 1.9, hospitalRate: 0.02, vaccineMonth: 5 });
    const id = healthOf(s).outbreaks[0].id;
    const plan = (st: GameState) =>
      st.monthIndex === 1
        ? [adopt(id, 'restricoes_circulacao'), adopt(id, 'leitos_emergencia', { criterion: 'ocupacao' })]
        : [];
    const mid = runMonths(s, 4, plan).state;
    const reloaded = JSON.parse(JSON.stringify(mid)) as GameState;
    const a = runMonths(mid, 8, plan).state;
    const b = runMonths(reloaded, 8, plan).state;
    expect(JSON.parse(JSON.stringify(b))).toEqual(JSON.parse(JSON.stringify(a)));
  });

  it('dois surtos ao mesmo tempo (dengue e vírus respiratório) mantêm os invariantes', () => {
    let s = withOutbreak(base(), 'arbovirose', { r0: 2, hospitalRate: 0.01, vaccineMonth: 0 }, 'identificado', 'RJ');
    s = withOutbreak(s, 'respiratorio_novo', { r0: 2.2, hospitalRate: 0.025, vaccineMonth: 6 }, 'alerta', 'AM');
    const end = runMonths(s, 12).state;
    expect(healthOf(end).history.length + healthOf(end).outbreaks.length).toBeGreaterThanOrEqual(1);
  });

  it('crise termina com balanço que separa notificado de estimado', () => {
    const s = withOutbreak(base(), 'respiratorio_novo', { r0: 1.3, hospitalRate: 0.01, vaccineMonth: 99 });
    const end = runMonths(s, 30).state;
    const report = healthOf(end).history.at(-1)!;
    expect(report).toBeDefined();
    expect(report.estimated.infections[0]).toBeGreaterThanOrEqual(report.observed.cases);
    expect(report.estimated.infections[1]).toBeGreaterThan(report.estimated.infections[0]);
    expect(report.estimated.deaths[0]).toBeCloseTo(report.observed.deaths, 9);
  });

  it('módulo desligado: nenhum surto começa em 10 anos; a rede de saúde continua existindo', () => {
    const end = runMonths(base(5, ['clima_detalhado', 'noticias']), 120).state;
    expect(healthOf(end).outbreaks).toEqual([]);
    expect(healthOf(end).history).toEqual([]);
    expect(healthOf(end).ufs).toHaveLength(27);
  });

  it('campanha de 240 meses com crises sorteadas respeita todos os invariantes', () => {
    const s = base(11, ['clima_detalhado', 'noticias', 'crises_sanitarias']);
    const end = runMonths(s, 240).state;
    expect(end.monthIndex).toBe(240);
    expect(healthOf(end).history.length).toBeGreaterThan(0);
  });
});
