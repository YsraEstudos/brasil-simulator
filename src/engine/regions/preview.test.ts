import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';

import { VEDACAO_MESES } from '../elections/vedacao';
import { createRng } from '../rng';
import { createInitialState } from '../state';
import type { GameContent, GameState, Proposal } from '../types';

import { buildRegionalDecisionPreview } from './preview';
import { expectedAdhesion, keyWeights, populationShares, regionsOf } from './regions';

// PLANO_GLOBO.md §5.2 e §7 (PR 1): a prévia regional da decisão é estimativa, determinística e não altera o estado.
// ECONOMIC_MODEL.md §5.15: pesos pela chave de distribuição; POLITICAL_RULES.md §2.1: adesão dos governadores.

const content: GameContent = loadContent(DEFAULT_SCENARIO_ID);
const ufs = regionsOf(content);
const pop = populationShares(ufs);

function start(difficulty: GameState['difficulty'] = 'estrategica'): GameState {
  return createInitialState({ content, difficulty, seed: 7 });
}

/** Congela o objeto inteiro: qualquer escrita lança erro em modo estrito (módulos ES). */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

type Preview = NonNullable<ReturnType<typeof buildRegionalDecisionPreview>>;

function preview(state: GameState, policyId: string): Preview {
  const result = buildRegionalDecisionPreview(state, content, policyId);
  if (!result) throw new Error(`prévia ausente: ${policyId}`);
  return result;
}

const ufPreview = (p: Preview, id: string) => {
  const found = p.ufs.find((u) => u.id === id);
  if (!found) throw new Error(`UF ausente: ${id}`);
  return found;
};
/** Incidência per capita da grande região (1 = média nacional). */
const regionRatio = (p: Preview, region: string) => {
  const weight = p.ufs.filter((u) => u.region === region).reduce((n, u) => n + u.weight, 0);
  const people = ufs.reduce((n, u, i) => (u.region === region ? n + pop[i] : n), 0);
  return weight / people;
};

describe('prévia regional da decisão (PLANO_GLOBO.md §5.2)', () => {
  const state = start();

  it('devolve null para política inexistente ou cenário sem UFs', () => {
    expect(buildRegionalDecisionPreview(state, content, 'nao_existe')).toBeNull();
    const semUfs: GameContent = { ...content, scenario: { ...content.scenario, regions: undefined } };
    expect(buildRegionalDecisionPreview(state, semUfs, 'transferencia_renda_ampliacao')).toBeNull();
  });

  it('não trata propriedades herdadas do protótipo como políticas', () => {
    for (const policyId of ['__proto__', 'constructor', 'toString']) {
      expect(buildRegionalDecisionPreview(state, content, policyId)).toBeNull();
    }
  });

  it('uma entrada por UF na ordem do cenário, com pesos que somam 1 (ECONOMIC_MODEL.md §5.15)', () => {
    for (const policyId of Object.keys(content.policies)) {
      const p = preview(state, policyId);
      expect(p.ufs.map((u) => u.id)).toEqual(ufs.map((u) => u.id));
      expect(p.ufs.reduce((n, u) => n + u.weight, 0)).toBeCloseTo(1, 12);
      p.ufs.forEach((u, i) => expect(u.perCapitaRatio).toBeCloseTo(u.weight / pop[i], 12));
    }
  });

  it('pesos iguais aos da chave de distribuição do perfil regional da política', () => {
    for (const policyId of ['transferencia_renda_ampliacao', 'irpf_tabela', 'seguranca_cooperacao']) {
      const regional = content.policies[policyId].regional;
      if (!regional) throw new Error(`${policyId} sem perfil regional`);
      const expected = keyWeights(
        ufs,
        ufs.map((u) => u.gdpShare),
        regional,
      );
      const p = preview(state, policyId);
      expect(p.differential).toBe(true);
      expect(p.key).toBe(regional.key);
      p.ufs.forEach((u, i) => expect(u.weight).toBeCloseTo(expected[i], 12));
    }
  });

  it('chave pobreza concentra no Nordeste e no Norte; renda alta, no Sudeste e no DF (§5.15)', () => {
    const poverty = preview(state, 'transferencia_renda_ampliacao');
    expect(regionRatio(poverty, 'nordeste')).toBeGreaterThan(1);
    expect(regionRatio(poverty, 'norte')).toBeGreaterThan(1);
    expect(regionRatio(poverty, 'nordeste')).toBeGreaterThan(regionRatio(poverty, 'sudeste'));
    expect(regionRatio(poverty, 'norte')).toBeGreaterThan(regionRatio(poverty, 'sul'));
    expect(ufPreview(poverty, 'MA').perCapitaRatio).toBeGreaterThan(ufPreview(poverty, 'SP').perCapitaRatio);

    const rich = preview(state, 'irpf_tabela');
    expect(regionRatio(rich, 'sudeste')).toBeGreaterThan(1);
    expect(regionRatio(rich, 'sudeste')).toBeGreaterThan(regionRatio(rich, 'nordeste'));
    expect(regionRatio(rich, 'sudeste')).toBeGreaterThan(regionRatio(rich, 'norte'));
    expect(ufPreview(rich, 'DF').perCapitaRatio).toBeGreaterThan(ufPreview(rich, 'BA').perCapitaRatio);
  });

  it('política sem perfil regional: proporcional ao PIB de tendência, marcada como não diferenciada', () => {
    const semPerfil = Object.values(content.policies).find((policy) => policy.regional === undefined);
    if (!semPerfil) throw new Error('o catálogo precisa de uma política sem perfil regional');
    const p = preview(state, semPerfil.id);
    expect(p.differential).toBe(false);
    expect(p.key).toBeNull();
    p.ufs.forEach((u, i) => expect(u.weight).toBeCloseTo(state.regions.ufs[i].structuralShare, 12));
  });

  it('direção: gasto é benefício; tributo líquido é custo (mesmo critério dos pareceres)', () => {
    expect(preview(state, 'transferencia_renda_ampliacao').direction).toBe('benefit');
    const taxa = {
      ...content.policies.irpf_tabela,
      id: 'irpf_aumento_teste',
      impacts: [{ channel: 'receita_renda' as const, magnitude: 10000, lagMonths: 0 }],
    };
    const comTributo: GameContent = { ...content, policies: { ...content.policies, [taxa.id]: taxa } };
    expect(buildRegionalDecisionPreview(state, comTributo, taxa.id)?.direction).toBe('cost');
  });
});

describe('adesão dos governadores na prévia (POLITICAL_RULES.md §2.1)', () => {
  it('soma das probabilidades por UF = adesão esperada do parecer', () => {
    const state = start();
    const p = preview(state, 'seguranca_cooperacao');
    const expected = expectedAdhesion(state, content);
    if (!expected) throw new Error('cenário sem UFs');
    const probabilities = p.ufs.map((u) => u.adhesionProbability);
    expect(probabilities.every((x) => x !== null && x >= 0 && x <= 1)).toBe(true);
    expect(probabilities.reduce<number>((n, x) => n + (x ?? 0), 0)).toBeCloseTo(expected.states, 12);
    expect(p.ufs.reduce((n, u, i) => n + (u.adhesionProbability ?? 0) * pop[i], 0)).toBeCloseTo(
      expected.populationShare,
      12,
    );
    expect(p.adhesion?.expectedStates).toBeCloseTo(expected.states, 12);
    expect(p.adhesion?.expectedPopulationShare).toBeCloseTo(expected.populationShare, 12);
    expect(p.uncertain).toContain('adesao_sorteada');
  });

  it('governador aliado tem chance maior que o hostil', () => {
    const s0 = start();
    const ufsState = s0.regions.ufs.map((u, i) => ({ ...u, governorRelation: i % 2 === 0 ? 90 : -90 }));
    const p = preview({ ...s0, regions: { ufs: ufsState } }, 'seguranca_cooperacao');
    expect(p.ufs[0].adhesionProbability).toBeGreaterThan(p.ufs[1].adhesionProbability ?? 1);
  });

  it('sem adesão no Casual e em política que não depende de convênio', () => {
    const initial = start('casual');
    const casual = preview(
      {
        ...initial,
        initialCampaignConfiguration: { ...initial.initialCampaignConfiguration, institutionalRules: 'simplificadas' },
      },
      'seguranca_cooperacao',
    );
    expect(casual.adhesion).toBeNull();
    expect(casual.ufs.every((u) => u.adhesionProbability === null)).toBe(true);
    expect(casual.uncertain).not.toContain('adesao_sorteada');
    const other = preview(start(), 'transferencia_renda_ampliacao');
    expect(other.adhesion).toBeNull();
    expect(other.ufs.every((u) => u.adhesionProbability === null)).toBe(true);
  });
});

describe('incertezas, defasagem e impedimentos da prévia', () => {
  it('lei de transferência: depende do Congresso e tem efeito defasado (estimativa, não garantia)', () => {
    const p = preview(start(), 'transferencia_renda_ampliacao');
    expect(p.uncertain).toEqual(expect.arrayContaining(['votacao_congresso', 'efeito_defasado']));
    expect(p.lagMonths).toEqual({ earliest: 1, longest: 1 });
  });

  it('MP rejeitada no ano não pode ser reeditada (CF art. 62 §10): reedicao_vedada', () => {
    const state = start();
    const rejected = {
      id: 'seguranca_cooperacao_0',
      policyId: 'seguranca_cooperacao',
      createdMonth: 0,
      status: 'rejeitada',
      history: [{ monthIndex: 1 }],
    } as unknown as Proposal;
    expect(preview(state, 'seguranca_cooperacao').barred).toBeNull();
    expect(preview({ ...state, proposals: [rejected] }, 'seguranca_cooperacao').barred).toBe('reedicao_vedada');
  });

  it('novo benefício na janela de vedação eleitoral: vedacao_eleitoral; fora dela e no Casual, não', () => {
    const elections = content.scenario.elections;
    if (!elections) throw new Error('o cenário padrão precisa de eleições');
    const inWindow = { ...start(), monthIndex: elections.mesEleicaoMunicipal - VEDACAO_MESES };
    expect(preview(inWindow, 'transferencia_renda_ampliacao').barred).toBe('vedacao_eleitoral');
    expect(preview(inWindow, 'irpf_tabela').barred).toBeNull();
    expect(
      preview(
        {
          ...inWindow,
          difficulty: 'casual',
          initialCampaignConfiguration: {
            ...inWindow.initialCampaignConfiguration,
            institutionalRules: 'simplificadas',
          },
        },
        'transferencia_renda_ampliacao',
      ).barred,
    ).toBeNull();
    expect(preview(start(), 'transferencia_renda_ampliacao').barred).toBeNull();
  });
});

describe('pureza da prévia (AI_INSTRUCTIONS.md §3: motor puro, sem sorteio)', () => {
  it('estado congelado, mesma saída duas vezes e o PRNG do estado não avança', () => {
    const state = deepFreeze(start());
    const rngBefore = JSON.stringify(state.rng);
    const first = buildRegionalDecisionPreview(state, content, 'seguranca_cooperacao');
    const second = buildRegionalDecisionPreview(state, content, 'seguranca_cooperacao');
    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    expect(JSON.stringify(state.rng)).toBe(rngBefore);
    // O PRNG do estado segue produzindo a mesma sequência de antes da prévia.
    expect(createRng(state.rng).nextUint32()).toBe(createRng(JSON.parse(rngBefore)).nextUint32());
  });
});
