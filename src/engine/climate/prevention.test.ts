import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent, POLICIES, SCENARIOS } from '@/content';
import { CLIMATOLOGY } from '@/content/climate';
import { advanceMonth } from '@/engine/advanceMonth';
import { DIRECTIVE_ACTION_ID } from '@/engine/actions';
import { checkInvariants } from '@/engine/invariants';
import { regionsOf } from '@/engine/regions/regions';
import { createInitialState } from '@/engine/state';
import type { ClimateState, GameState, MonthStep, Proposal, ScheduledImpulse, UfClimate } from '@/engine/types';
import { publicPoliciesStep } from '@/engine/publicPolicies/publicPolicies';
import { initialPublicPolicies } from '@/engine/publicPolicies/types';
import { createRng } from '@/engine/rng';
import { parsePolicy } from '@/types/policy';
import { UF_IDS } from '@/types/regions';

import { CLIMATE_EXPECTED_DAMAGE, climateParam } from './calibration';
import { initialClimate } from './climate';
import {
  CLIMATE_CAUSES,
  climateDamageIndices,
  climateDamageOf,
  noPrevention,
  preventionOf,
  protectionOf,
  responseImpulses,
  scenarioUfs,
} from './effects';
import { climateEvolutionStep, evolveClimate } from './evolution';

// PLANO_GLOBO.md §7, PR 13: a prevenção reduz o dano esperado do clima (PR 8), nunca a chuva nem a seca.

const content = loadContent(DEFAULT_SCENARIO_ID);
const ufs = regionsOf(content);
const EMPTY = { decisions: [] };

/** Impulso de prevenção de teste (id fora da carteira, para a fila não o podar nem recriar). */
function prevention(
  target: 'clima.prevencao_seca' | 'clima.prevencao_cheia',
  delta: number,
  scope: readonly string[] = [],
): ScheduledImpulse {
  return {
    sourceId: 'teste:prevencao',
    label: 'Prevenção de teste',
    target,
    delta,
    startMonth: 0,
    endMonth: null,
    ...(scope.length > 0 ? { regional: { key: 'populacao' as const, scope: [...scope] } } : {}),
  };
}

/** Prevenção forte e nacional: o teto da proteção nas duas frentes. */
const FULL: readonly ScheduledImpulse[] = [
  prevention('clima.prevencao_seca', 10),
  prevention('clima.prevencao_cheia', 10),
];

function withImpulses(state: GameState, impulses: readonly ScheduledImpulse[]): GameState {
  return { ...state, impulses: [...state.impulses, ...impulses] };
}

function withClimate(state: GameState, byUf: Record<string, Partial<UfClimate>>): GameState {
  const climate: ClimateState = {
    enso: 0,
    protection: state.climate.protection,
    rng: state.climate.rng,
    ufs: state.climate.ufs.map((u) => ({ ...u, rain: 0, dryness: 0, ...byUf[u.id] })),
  };
  return { ...state, climate };
}

/** O clima em si (ENSO, chuva, seca e PRNG). A proteção guardada no mês é a única parte que depende da prevenção. */
const weather = ({ enso, ufs, rng }: { enso: number; ufs: unknown; rng: unknown }) => ({ enso, ufs, rng });

describe('proteção e prevenção por UF (PR 13)', () => {
  it('a proteção cresce com a força, satura no teto e dá retornos decrescentes', () => {
    const teto = climateParam('prevencao_teto');
    expect(protectionOf(0)).toBe(0);
    expect(protectionOf(-1)).toBe(0);
    expect(protectionOf(0.4)).toBeGreaterThan(0);
    expect(protectionOf(0.4)).toBeLessThan(protectionOf(0.8));
    expect(protectionOf(0.8)).toBeLessThan(protectionOf(1.6));
    // Dois programas valem menos que o dobro de um.
    expect(protectionOf(1.4)).toBeLessThan(2 * protectionOf(0.7));
    // Nunca passa do teto, por mais programas que existam.
    expect(protectionOf(1_000)).toBeLessThanOrEqual(teto);
    expect(protectionOf(1_000)).toBeCloseTo(teto, 9);
    expect(teto).toBeLessThan(1);
  });

  it('sem programas ativos não há proteção; o escopo regional é respeitado; impulso vencido ou futuro não vale', () => {
    expect(preventionOf([], 3, ufs)).toEqual(noPrevention(ufs));
    const impulses: ScheduledImpulse[] = [
      prevention('clima.prevencao_seca', 0.7, ['CE', 'PI']),
      prevention('clima.prevencao_cheia', 0.7, ['sudeste']),
      { ...prevention('clima.prevencao_seca', 0.7), startMonth: 10 },
      { ...prevention('clima.prevencao_cheia', 0.7), endMonth: 1 },
    ];
    const p = preventionOf(impulses, 3, ufs);
    const at = (id: string) => ufs.findIndex((u) => u.id === id);
    expect(p.drought[at('CE')]).toBeCloseTo(protectionOf(0.7), 12);
    expect(p.drought[at('PI')]).toBeCloseTo(protectionOf(0.7), 12);
    expect(p.drought[at('BA')]).toBe(0);
    expect(p.drought[at('SP')]).toBe(0);
    expect(p.flood[at('SP')]).toBeCloseTo(protectionOf(0.7), 12);
    expect(p.flood[at('RJ')]).toBeCloseTo(protectionOf(0.7), 12);
    expect(p.flood[at('CE')]).toBe(0);
  });

  it('vários programas na mesma UF somam a força e depois saturam', () => {
    const impulses = [
      prevention('clima.prevencao_seca', 0.7, ['CE']),
      prevention('clima.prevencao_seca', 0.2),
      prevention('clima.prevencao_seca', 0.2, ['nordeste']),
    ];
    const p = preventionOf(impulses, 0, ufs);
    const at = (id: string) => ufs.findIndex((u) => u.id === id);
    expect(p.drought[at('CE')]).toBeCloseTo(protectionOf(1.1), 12);
    expect(p.drought[at('SP')]).toBeCloseTo(protectionOf(0.2), 12);
  });
});

describe('dano com prevenção sobre o mesmo clima', () => {
  const drought = (id: string[]) =>
    withClimate(
      createInitialState({ content, difficulty: 'estrategica', seed: 1 }),
      Object.fromEntries(id.map((u) => [u, { dryness: 0.9, rain: -0.4 }])),
    ).climate;

  it('reduz cada termo do dano, nunca abaixo do piso do teto, e não toca o clima', () => {
    const climate = drought(UF_IDS.slice());
    const p = preventionOf(FULL, 0, ufs);
    const raw = climateDamageIndices(climate, content)!;
    const safe = climateDamageIndices(climate, content, p)!;
    const teto = climateParam('prevencao_teto');
    for (const key of ['droughtGdp', 'droughtFood', 'droughtEnergy'] as const) {
      expect(safe[key], key).toBeLessThan(raw[key]);
      // tanh((1 − p)·x) ≥ (1 − p)·tanh(x): a prevenção nunca evita mais que o teto.
      expect(safe[key], key).toBeGreaterThanOrEqual((1 - teto) * raw[key] - 1e-12);
    }
    const damage = climateDamageOf(climate, content, 'estrategica');
    const protectedDamage = climateDamageOf(climate, content, 'estrategica', p);
    expect(protectedDamage.droughtGdp).toBeLessThan(damage.droughtGdp);
    expect(protectedDamage.droughtFood).toBeLessThan(damage.droughtFood);
    expect(protectedDamage.droughtEnergy).toBeLessThan(damage.droughtEnergy);
    // O clima do estado é o mesmo objeto: a função não o altera.
    expect(climate).toEqual(drought(UF_IDS.slice()));
  });

  it('só protege onde há programa: seca no Sul com prevenção no semiárido não muda o dano', () => {
    const climate = drought(['RS', 'SC']);
    const p = preventionOf([prevention('clima.prevencao_seca', 5, ['CE', 'PI', 'BA'])], 0, ufs);
    expect(climateDamageOf(climate, content, 'estrategica', p)).toEqual(
      climateDamageOf(climate, content, 'estrategica'),
    );
  });

  it('em 120 meses de clima reduz o dano médio e o pico, sem passar do teto, nas três dificuldades', () => {
    const teto = climateParam('prevencao_teto');
    const p = preventionOf(FULL, 0, ufs);
    for (const difficulty of ['casual', 'estrategica', 'realismo'] as const) {
      const expected = CLIMATE_EXPECTED_DAMAGE[difficulty];
      let climate = initialClimate(11);
      let rawSum = 0;
      let safeSum = 0;
      let rawPeak = -Infinity;
      let safePeak = -Infinity;
      for (let m = 0; m < 120; m++) {
        climate = evolveClimate(climate, (m % 12) + 1, difficulty, CLIMATOLOGY);
        const raw = climateDamageOf(climate, content, difficulty).droughtGdp;
        const safe = climateDamageOf(climate, content, difficulty, p).droughtGdp;
        rawSum += raw;
        safeSum += safe;
        rawPeak = Math.max(rawPeak, raw);
        safePeak = Math.max(safePeak, safe);
        // Piso: o índice protegido é ao menos (1 − teto) do índice sem prevenção.
        const idxRaw = climateDamageIndices(climate, content)!.droughtGdp;
        const idxSafe = climateDamageIndices(climate, content, p)!.droughtGdp;
        expect(idxSafe).toBeGreaterThanOrEqual((1 - teto) * idxRaw - 1e-12);
        expect(idxSafe).toBeLessThanOrEqual(idxRaw);
      }
      expect(safeSum / 120, difficulty).toBeLessThan(rawSum / 120);
      expect(safePeak, difficulty).toBeLessThan(rawPeak);
      // O ganho médio é o dano médio evitado (≤ teto × esperado × teto do termo), não um bônus ilimitado.
      const avoided = (rawSum - safeSum) / 120;
      expect(avoided, difficulty).toBeLessThanOrEqual(
        teto * expected.droughtGdp * climateParam('dano_pib_seca_max') * 1.5,
      );
    }
  });
});

describe('a chuva não é desligada (PLANO_GLOBO.md §8)', () => {
  it('mesma semente, com e sem prevenção: chuva, seca, ENSO e PRNG do clima idênticos em 36 meses', () => {
    const base = createInitialState({ content, difficulty: 'estrategica', seed: 5 });
    let free = base;
    let covered = withImpulses(base, FULL);
    for (let m = 0; m < 36; m++) {
      free = advanceMonth(free, EMPTY, content).state;
      covered = advanceMonth(covered, EMPTY, content).state;
      expect(weather(covered.climate), `mês ${m}`).toEqual(weather(free.climate));
    }
  });

  it('a etapa do clima não consome o PRNG principal nem muda o do clima com a prevenção ligada', () => {
    const base = createInitialState({ content, difficulty: 'realismo', seed: 9 });
    const a = advanceMonth(base, EMPTY, content, [climateEvolutionStep]);
    const b = advanceMonth(withImpulses(base, FULL), EMPTY, content, [climateEvolutionStep]);
    expect(b.state.rng).toEqual(base.rng);
    expect(a.state.rng).toEqual(base.rng);
    expect(weather(b.state.climate)).toEqual(weather(a.state.climate));
  });
});

describe('determinismo com as escolhas de prevenção (PLANO_GLOBO.md §8, teste 1)', () => {
  it('mesma semente e mesmas decisões → mesmo estado em 40 meses; outra semente → outro', () => {
    const run = (seed: number) => {
      let state = createInitialState({ content, difficulty: 'estrategica', seed });
      for (let m = 0; m < 40; m++) {
        const decisions =
          m === 0
            ? [
                { policyId: 'projeto_seguranca_hidrica', agendaCost: 2 },
                {
                  policyId: DIRECTIVE_ACTION_ID,
                  agendaCost: 1,
                  params: { ministryId: 'cidades', policyId: 'rotina_defesa_civil', annualMillions: 2000 },
                },
              ]
            : [];
        state = advanceMonth(state, { decisions }, content).state;
      }
      return JSON.stringify(state);
    };
    expect(run(5)).toBe(run(5));
    expect(run(5)).not.toBe(run(6));
  });
});

describe('o mês com prevenção: causas, regiões e invariantes', () => {
  it('numa seca forte o "Por que mudou?" mostra a prevenção e a explicação da UF também', () => {
    const base = withClimate(createInitialState({ content, difficulty: 'estrategica', seed: 3 }), {
      CE: { dryness: 0.95, rain: -0.5 },
      PI: { dryness: 0.95, rain: -0.5 },
      MT: { dryness: 0.9, rain: -0.4 },
      GO: { dryness: 0.9, rain: -0.4 },
      MS: { dryness: 0.9, rain: -0.4 },
    });
    const covered = withImpulses(base, [prevention('clima.prevencao_seca', 5)]);
    const withIt = advanceMonth(covered, EMPTY, content);
    const without = advanceMonth(base, EMPTY, content);
    const causes = (r: typeof withIt.report) => new Set(r.contributions.map((c) => c.cause));
    expect(causes(withIt.report)).toContain(CLIMATE_CAUSES.droughtPrevention);
    expect(causes(without.report)).not.toContain(CLIMATE_CAUSES.droughtPrevention);
    // A seca em si continua aparecendo: a prevenção é uma parcela à parte.
    expect(causes(withIt.report)).toContain(CLIMATE_CAUSES.drought);
    // Explicação regional: o dano evitado entra como parcela a favor, junto da seca.
    const mt = withIt.report.regional?.find((u) => u.id === 'MT');
    const piece = mt?.activity.find((p) => p.cause === CLIMATE_CAUSES.droughtPrevention);
    expect(piece?.delta ?? 0).toBeGreaterThan(0);
    expect(mt?.activity.some((p) => p.cause === CLIMATE_CAUSES.drought)).toBe(true);
    // O PIB cai menos com a prevenção.
    expect(withIt.state.indicators.gdpGrowth12m).toBeGreaterThanOrEqual(without.state.indicators.gdpGrowth12m);
  });

  it('sem prevenção o motor produz exatamente o mesmo mês que produzia (o termo evitado é zero)', () => {
    const base = withClimate(createInitialState({ content, difficulty: 'estrategica', seed: 3 }), {
      CE: { dryness: 0.95, rain: -0.5 },
    });
    const out = advanceMonth(base, EMPTY, content);
    expect(
      out.report.contributions.filter((c) => c.cause.endsWith('_prevencao') || c.cause.includes('prevencao')),
    ).toEqual([]);
    expect(out.state.impulses.some((i) => i.target.startsWith('clima.'))).toBe(false);
  });

  it('invariantes D7 e dos indicadores valem com prevenção forte em 60 meses, nas três dificuldades', () => {
    for (const difficulty of ['casual', 'estrategica', 'realismo'] as const) {
      let state = withImpulses(createInitialState({ content, difficulty, seed: 21 }), FULL);
      const errors: string[] = [];
      for (let m = 0; m < 60; m++) {
        const out = advanceMonth(state, EMPTY, content);
        errors.push(...checkInvariants(state, out.state, out.report, content));
        state = out.state;
      }
      expect(errors, difficulty).toEqual([]);
    }
  });
});

describe('resposta federal e governador (governabilidade)', () => {
  const emergency = (id: string) =>
    withClimate(createInitialState({ content, difficulty: 'estrategica', seed: 4 }), {
      [id]: { dryness: 1, rain: 0.6 },
    });

  it('com prevenção ativa na UF atingida a relação com o governador sobe; sem prevenção, ou sem emergência, não', () => {
    const base = emergency('CE');
    const covered = withImpulses(base, [prevention('clima.prevencao_seca', 5, ['CE'])]);
    const response = responseImpulses(covered, content);
    expect(response).toHaveLength(1);
    expect(response[0].target).toBe('governadores.relacao');
    expect(response[0].regional?.scope).toEqual(['CE']);
    expect(response[0].delta).toBeGreaterThan(0);
    expect(response[0].delta).toBeLessThanOrEqual(climateParam('prevencao_relacao_max'));
    // Sem prevenção, sem resposta.
    expect(responseImpulses(base, content)).toEqual([]);
    // Prevenção em outra UF não responde por esta.
    expect(responseImpulses(withImpulses(base, [prevention('clima.prevencao_seca', 5, ['RS'])]), content)).toEqual([]);
    // Sem emergência (clima neutro), nada.
    const calm = withImpulses(createInitialState({ content, difficulty: 'estrategica', seed: 4 }), FULL);
    expect(responseImpulses(calm, content)).toEqual([]);
  });

  it('no mês a relação do governador atingido fica acima da de um mês sem a prevenção', () => {
    const base = emergency('CE');
    const covered = withImpulses(base, [prevention('clima.prevencao_seca', 5, ['CE'])]);
    // Sem sorteio de evento no meio: só as etapas do clima e das regiões.
    const relation = (state: GameState) =>
      advanceMonth(state, EMPTY, content).state.regions.ufs.find((u) => u.id === 'CE')!.governorRelation;
    expect(relation(covered)).toBeGreaterThan(relation(base));
  });
});

/** Proposta em execução de uma política (para a carteira criar o projeto). */
function executing(policyId: string): Proposal {
  return {
    id: `${policyId}_0`,
    policyId,
    createdMonth: 0,
    status: 'em_execucao',
    scale: 1,
    voteMonth: null,
    stage: 0,
    rapporteur: null,
    textAltered: false,
    postponements: 0,
    negotiation: { blocs: {}, amendments: false, textConceded: false, urgency: false },
    rider: 0,
    veto: null,
    judicial: null,
    executionStart: 0,
    executionEnd: null,
    adherents: null,
    votes: [],
    history: [],
  };
}

function preventionQueue(state: GameState, target: 'clima.prevencao_seca' | 'clima.prevencao_cheia') {
  return state.impulses.filter((i) => i.target === target && i.sourceId.startsWith('projeto:'));
}

describe('a carteira de políticas entrega a prevenção (projeto e rotina)', () => {
  const policy = POLICIES.projeto_seguranca_hidrica;
  const nominalAsset = policy.cost.annualMillions * (policy.timeline.executionMonths / 12) * policy.project!.efficiency;

  function withProject(phase: 'planejamento' | 'obra' | 'operacao', extra: Record<string, number> = {}) {
    const base = createInitialState({ content, difficulty: 'estrategica', seed: 6 });
    return {
      ...base,
      proposals: [executing(policy.id)],
      publicPolicies: {
        ...initialPublicPolicies(),
        projects: [
          {
            proposalId: `${policy.id}_0`,
            policyId: policy.id,
            phase,
            phaseMonth: 0,
            progress: 0,
            budgetMillions: nominalAsset / policy.project!.efficiency,
            spentMillions: 0,
            assetMillions: 0,
            maintenanceMillions: 0,
            delayMonths: 0,
            startMonth: 0,
            ...extra,
          },
        ],
      },
    } as GameState;
  }

  /**
   * Só a etapa da carteira, sem podar a fila no fim do mês (os impulsos de projeto valem um mês e são recriados a cada
   * mês). O estado volta com o mês seguinte, como o `advanceMonth` faz.
   */
  const publicStep = (state: GameState): GameState => {
    const ctx = {
      content,
      decisions: [],
      eventChoices: [],
      rng: createRng(state.rng),
      draft: { proposalChanges: [], eventsResolved: [], eventsFired: [], notes: [], copom: null, regional: null },
    };
    const out = publicPoliciesStep(state, ctx).state;
    // Guarda a fila desta etapa para a leitura e a tira antes do mês seguinte.
    return { ...out, monthIndex: state.monthIndex } as GameState;
  };

  it('planejamento não protege; a obra entrega uma fração proporcional ao avanço; em operação, ativo ÷ ativo nominal', () => {
    expect(preventionQueue(publicStep(withProject('planejamento')), 'clima.prevencao_seca')).toEqual([]);

    const afterBuilding = publicStep(withProject('obra', { progress: 0.5, phaseMonth: 5, spentMillions: 100 }));
    const building = preventionQueue(afterBuilding, 'clima.prevencao_seca');
    const progress = afterBuilding.publicPolicies.projects[0].progress;
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThan(1);
    // A obra entrega `prevencao_fracao_obra` × avanço físico (já com o avanço do mês) da força de 0,7: bem abaixo da operação.
    expect(building).toHaveLength(1);
    expect(building[0].delta).toBeCloseTo(0.7 * climateParam('prevencao_fracao_obra') * progress, 12);
    expect(building[0].delta).toBeLessThan(0.7 * climateParam('prevencao_fracao_obra'));

    const half = preventionQueue(
      publicStep(withProject('operacao', { progress: 1, assetMillions: nominalAsset / 2 })),
      'clima.prevencao_seca',
    );
    expect(half).toHaveLength(1);
    // A depreciação do mês tira um pouco do ativo antes da medida.
    expect(half[0].delta).toBeLessThanOrEqual(0.7 * 0.5 + 1e-9);
    expect(half[0].delta).toBeGreaterThan(0.7 * 0.45);

    const full = preventionQueue(
      publicStep(withProject('operacao', { progress: 1, assetMillions: nominalAsset * 3 })),
      'clima.prevencao_seca',
    );
    // Com sobrecusto o ativo passa do nominal, mas a cobertura é limitada a 1.
    expect(full[0].delta).toBeCloseTo(0.7, 9);
    // O projeto de seca não protege contra cheia.
    expect(
      preventionQueue(publicStep(withProject('operacao', { assetMillions: nominalAsset })), 'clima.prevencao_cheia'),
    ).toEqual([]);
  });

  it('o escopo regional da política vai no impulso: só as UFs do semiárido recebem', () => {
    const queue = preventionQueue(
      publicStep(withProject('operacao', { progress: 1, assetMillions: nominalAsset })),
      'clima.prevencao_seca',
    );
    expect(queue[0].regional?.scope).toEqual(['PI', 'CE', 'RN', 'PB', 'PE', 'AL', 'SE', 'BA', 'MG']);
    const p = preventionOf(queue, 0, ufs);
    expect(p.drought[ufs.findIndex((u) => u.id === 'CE')]).toBeGreaterThan(0);
    expect(p.drought[ufs.findIndex((u) => u.id === 'RS')]).toBe(0);
  });

  it('a obra de um projeto aprovado menor protege na proporção da escala aprovada', () => {
    const nominalBudget = policy.cost.annualMillions * (policy.timeline.executionMonths / 12);
    const small = publicStep(
      withProject('obra', { progress: 0.5, phaseMonth: 5, spentMillions: 100, budgetMillions: nominalBudget / 2 }),
    );
    const progress = small.publicPolicies.projects[0].progress;
    const [impulse] = preventionQueue(small, 'clima.prevencao_seca');
    // escala aprovada = orçamento ÷ custo nominal = 0,5: a obra protege metade do que protegeria no projeto cheio
    expect(impulse.delta).toBeCloseTo(0.7 * climateParam('prevencao_fracao_obra') * progress * 0.5, 12);
  });

  it('uma obra pronta deprecia: a proteção cai devagar, mês a mês, e volta a subir se o ativo for reposto', () => {
    let state = withProject('operacao', { progress: 1, assetMillions: nominalAsset });
    const strengths: number[] = [];
    for (let m = 0; m < 24; m++) {
      state = publicStep(state);
      strengths.push(preventionQueue(state, 'clima.prevencao_seca')[0]?.delta ?? 0);
      state = { ...state, monthIndex: state.monthIndex + 1 } as GameState;
    }
    expect(strengths[23]).toBeLessThan(strengths[0]);
    expect(strengths.every((s, i) => i === 0 || s <= strengths[i - 1] + 1e-12)).toBe(true);
    // Uma queda lenta (depreciação anual de poucos %), não um precipício.
    expect(strengths[23]).toBeGreaterThan(0.85 * strengths[0]);
  });

  it('Defesa Civil: a dotação vira prevenção só depois da maturação, proporcional ao liberado, e some sem a dotação', () => {
    const rotina = POLICIES.rotina_defesa_civil;
    const lag = rotina.timeline.maturationMonths;
    expect(lag).toBeGreaterThan(0);
    let state = createInitialState({ content, difficulty: 'estrategica', seed: 8 });
    const directive = {
      policyId: DIRECTIVE_ACTION_ID,
      agendaCost: 1,
      params: { ministryId: 'cidades', policyId: rotina.id, annualMillions: rotina.cost.annualMillions },
    };
    const strengthAt = (s: GameState, month: number) =>
      s.impulses
        .filter((i) => i.target === 'clima.prevencao_cheia' && i.startMonth <= month && (i.endMonth ?? month) >= month)
        .reduce((n, i) => n + i.delta, 0);
    const seen: number[] = [];
    for (let m = 0; m < lag + 3; m++) {
      const out = advanceMonth(state, m === 0 ? { decisions: [directive] } : EMPTY, content);
      expect(out.report.rejected, `mês ${m}`).toEqual([]);
      state = out.state;
      seen.push(strengthAt(state, state.monthIndex));
    }
    // Antes da maturação não há efeito; depois, a força cheia da política (0,25 contra cheia) na dotação plena.
    expect(seen.slice(0, lag - 1).every((x) => x === 0)).toBe(true);
    expect(seen[lag]).toBeGreaterThan(0);
    expect(seen[lag]).toBeLessThanOrEqual(rotina.prevention!.flood! + 1e-9);
    // Sem a diretriz do ano seguinte (a rotina é por ano) o efeito de um programa que não existe não pode aparecer
    // para a seca além do que a política declara.
    const drought = state.impulses
      .filter((i) => i.target === 'clima.prevencao_seca')
      .reduce((n, i) => Math.max(n, i.delta), 0);
    expect(drought).toBeLessThanOrEqual(rotina.prevention!.drought! + 1e-9);
  });
});

describe('conteúdo da prevenção (PR 13)', () => {
  const ids = ['projeto_seguranca_hidrica', 'projeto_drenagem_contencao', 'rotina_defesa_civil'];

  it('as três políticas são válidas, de prevenção e só o cenário v0.8.0 as oferece', () => {
    for (const id of ids) {
      const policy = POLICIES[id];
      expect(parsePolicy(policy).ok, id).toBe(true);
      expect(policy.prevention, id).toBeDefined();
      expect(policy.dataStatus, id).toBe('PROVISORIO');
      for (const [scenarioId, scenario] of Object.entries(SCENARIOS)) {
        expect(scenario.policies.includes(id), `${id} em ${scenarioId}`).toBe(scenarioId === DEFAULT_SCENARIO_ID);
      }
    }
  });

  it('projetos passam pelo Congresso (projeto de lei), custam ações de agenda e orçamento; a rotina é ato executivo', () => {
    for (const id of ['projeto_seguranca_hidrica', 'projeto_drenagem_contencao']) {
      const policy = POLICIES[id];
      expect(policy.delivery).toBe('projeto');
      expect(policy.instruments).toContain('projeto_lei');
      expect(policy.timeline.expectedLegislativeMonths).toBeGreaterThan(0);
      expect(policy.agendaCost).toBeGreaterThanOrEqual(2);
      expect(policy.cost.annualMillions).toBeGreaterThan(0);
      expect(policy.project!.annualMaintenanceRate).toBeGreaterThan(0);
      expect(policy.conditions).toContain('espaco_no_limite_de_despesas');
    }
    expect(POLICIES.rotina_defesa_civil.delivery).toBe('rotina');
    expect(POLICIES.rotina_defesa_civil.timeline.expectedLegislativeMonths).toBe(0);
  });

  it('o jogador envia os projetos: entram na tramitação do Congresso, sem sorteio fora do que a política declara', () => {
    for (const id of ['projeto_seguranca_hidrica', 'projeto_drenagem_contencao']) {
      const state = createInitialState({ content, difficulty: 'estrategica', seed: 2 });
      const out = advanceMonth(state, { decisions: [{ policyId: id, agendaCost: 2 }] }, content);
      expect(out.report.rejected, id).toEqual([]);
      expect(out.report.accepted.map((d) => d.policyId)).toContain(id);
      expect(out.state.proposals.find((p) => p.policyId === id)?.status, id).toBe('em_tramitacao');
    }
  });

  it('o escopo de cada projeto só cita UFs reais do cenário ou fica vazio (nacional): nenhuma coordenada', () => {
    const real = new Set(ufs.map((u) => u.id));
    for (const id of ids) {
      for (const entry of POLICIES[id].regional?.scope ?? []) {
        expect(real.has(entry) || ['norte', 'nordeste', 'centro_oeste', 'sudeste', 'sul'].includes(entry), entry).toBe(
          true,
        );
      }
    }
    expect(POLICIES.projeto_seguranca_hidrica.regional?.scope.every((e) => real.has(e))).toBe(true);
    expect(POLICIES.projeto_drenagem_contencao.regional?.scope).toEqual([]);
  });

  it('prevenção exige entrega por carteira: política legada com prevenção é recusada', () => {
    const { delivery: _delivery, project: _project, ...legacy } = POLICIES.projeto_drenagem_contencao;
    void _delivery;
    void _project;
    expect(parsePolicy(legacy).ok).toBe(false);
    expect(parsePolicy({ ...POLICIES.rotina_defesa_civil, prevention: {} }).ok).toBe(false);
  });
});

describe('o hiato da prevenção não salta quando um programa começa (revisão do PR 13)', () => {
  it('no mês em que a proteção começa, o impulso de hiato é só o dano evitado daquele mês', () => {
    const state = withClimate(
      createInitialState({ content, difficulty: 'estrategica', seed: 1 }),
      Object.fromEntries(UF_IDS.map((u) => [u, { dryness: 0.9, rain: -0.4 }])),
    );
    const start = withImpulses(state, FULL);
    const captured: ScheduledImpulse[] = [];
    let after = null as ClimateState | null;
    const spy: MonthStep = (input, ctx) => {
      const out = climateEvolutionStep(input, ctx);
      after = out.state.climate;
      captured.push(...out.state.impulses.slice(input.impulses.length));
      return out;
    };
    advanceMonth(start, EMPTY, content, [spy]);
    if (after === null) throw new Error('a etapa do clima não rodou');
    const sem = climateDamageOf(after, content, 'estrategica');
    const com = climateDamageOf(
      after,
      content,
      'estrategica',
      preventionOf(start.impulses, start.monthIndex, scenarioUfs(content)),
    );
    const savedNow = com.droughtGdp - sem.droughtGdp;
    expect(savedNow).toBeLessThan(0);
    const hiato = captured.find((i) => i.sourceId === CLIMATE_CAUSES.droughtPrevention && i.target === 'choque.hiato');
    // sem proteção no mês anterior, a base do hiato é zero: o termo é o dano evitado de agora, sem resíduo de mês antigo
    expect(hiato?.delta).toBeCloseTo(-savedNow, 12);
  });
});
