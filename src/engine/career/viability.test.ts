import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import brasilV080 from '@/data/scenarios/brasil_2027_01_v080.json';
import { parseScenario } from '@/types/scenario';

import { advanceMonth } from '../advanceMonth';
import { checkInvariants } from '../invariants';
import { createInitialState } from '../state';
import type { GameState } from '../types';

import { CAREER_PARAMS, careerParam } from './calibration';
import { aggregateTallies, tallyUf } from './electorate';
import { ballotOptions, candidateIdentities, PLAYER_CANDIDATE_ID } from './opponents';
import { electorateParams, ufElectorates } from './polls';
import { alignment, eligibilityCeiling, nationalRecognition, opinion, stepRecognition, utility } from './viability';

import { careerSchedule } from '.';

// PLANO_CAMPANHA.md Fase C2 (tarefas C2.1, C2.3 e C2.5): viabilidade, adversários e invariantes.

const content = loadContent(DEFAULT_SCENARIO_ID);
const ufs = content.scenario.regions!.ufs;
const PRE_TURNS = careerSchedule(content, 'corrida').length;
const corrida = (seed = 5) => createInitialState({ content, difficulty: 'estrategica', seed, startPoint: 'corrida' });

describe('viabilidade (PLANO_CAMPANHA.md Fase C2, C2.1)', () => {
  it('aprovação e rejeição entre quem conhece não são complementares: há neutros', () => {
    for (const u of [-3, -1, 0, 0.5, 2]) {
      const o = opinion(u);
      expect(o.approval + o.rejection + careerParam('neutros')).toBeCloseTo(1, 12);
      expect(o.approval + o.rejection).toBeLessThan(1);
    }
    expect(opinion(1).rejection).toBeLessThan(opinion(-1).rejection);
  });

  it('o alinhamento vai de −1 (opostos) a 1 (iguais) e é 0 sem inclinação', () => {
    const bloc = { ideology: { economic: 1, social: 1 } };
    expect(alignment(bloc, { lean: { economic: 1, social: 1 } })).toBeCloseTo(1, 12);
    expect(alignment(bloc, { lean: { economic: -1, social: -1 } })).toBeCloseTo(-1, 12);
    expect(alignment(bloc, {})).toBe(0);
  });

  it('teto de elegibilidade = quem conhece e não rejeita, sempre em [0, R]', () => {
    for (const r of [0, 0.3, 1]) {
      for (const u of [-2, 0, 2]) {
        const c = eligibilityCeiling(r, u);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(r);
      }
    }
  });

  it('um mês de reconhecimento: esquecimento antes, crescimento depois, sempre em [0, 1]', () => {
    for (const r of [0, 0.02, careerParam('ostracismo_piso'), 0.3, 0.99, 1]) {
      for (const organic of [0, careerParam('organico_pre_campanha'), careerParam('organico_campanha'), 1]) {
        const s = stepRecognition(r, organic);
        expect(s.next).toBeGreaterThanOrEqual(0);
        expect(s.next).toBeLessThanOrEqual(1);
        expect(s.decay).toBeLessThanOrEqual(0);
        expect(s.growth).toBeGreaterThanOrEqual(0);
        expect(s.next).toBeCloseTo(r + s.decay + s.growth, 12);
        // Abaixo do piso o esquecimento não age; acima, nunca o cruza.
        if (r <= careerParam('ostracismo_piso')) expect(s.decay).toBe(0);
        else expect(r + s.decay).toBeGreaterThanOrEqual(careerParam('ostracismo_piso'));
      }
    }
  });

  it('na campanha oficial o reconhecimento sobe; a variação nacional é a soma das contribuições', () => {
    let state: GameState = corrida();
    for (let t = 0; t < PRE_TURNS; t++) {
      const before = nationalRecognition(state.career!.recognition, ufs);
      const r = advanceMonth(state, { decisions: [] }, content);
      expect(checkInvariants(state, r.state, r.report, content)).toEqual([]);
      const after = nationalRecognition(r.state.career!.recognition, ufs);
      const explained = r.report.contributions
        .filter((c) => c.indicator === 'careerRecognition')
        .reduce((s, c) => s + c.delta, 0);
      expect(after - before).toBeCloseTo(explained, 12);
      if (r.report.career!.stage === 'transicao') expect(after).toBe(before);
      else expect(after).toBeGreaterThan(before);
      state = r.state;
    }
  });

  it('a invariante acusa reconhecimento fora de [0, 1] e variação sem causa', () => {
    const s0 = corrida();
    const r = advanceMonth(s0, { decisions: [] }, content);
    const broken: GameState = {
      ...r.state,
      career: { ...r.state.career!, recognition: { ...r.state.career!.recognition, SP: 1.2 } },
    };
    const errors = checkInvariants(s0, broken, r.report, content);
    expect(errors.some((e) => e.includes('SP fora de [0, 1]'))).toBe(true);
    expect(errors.some((e) => e.startsWith('careerRecognition'))).toBe(true);
  });

  it('todo parâmetro de CAREER_PARAMS é lido pelo motor da carreira', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(process.cwd(), 'src', 'engine', 'career');
    const sources = ['viability.ts', 'polls.ts', 'electorate.ts']
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n');
    for (const name of Object.keys(CAREER_PARAMS)) expect(sources, name).toContain(`'${name}'`);
    for (const [name, p] of Object.entries(CAREER_PARAMS)) {
      expect(p.value, name).toBeGreaterThanOrEqual(p.min);
      expect(p.value, name).toBeLessThanOrEqual(p.max);
    }
  });
});

describe('adversários (PLANO_CAMPANHA.md Fase C2, C2.3, D-C17)', () => {
  it('o jogador ocupa a vaga do bloco do seu partido; os nomes vêm de elections.candidatos', () => {
    const career = corrida().career!;
    const profile = content.scenario.career!.profiles[0];
    expect(career.opponents.map((o) => o.blocId)).not.toContain(profile.blocId);
    expect(career.opponents).toHaveLength(content.scenario.career!.opponents.length - 1);
    const ids = candidateIdentities(career, content);
    expect(ids[0]).toMatchObject({ id: PLAYER_CANDIDATE_ID, player: true, blocId: profile.blocId });
    for (const c of ids.slice(1)) {
      expect(c.name).toBe(content.scenario.elections!.candidatos!.find((x) => x.blocId === c.blocId)!.name);
    }
  });

  it('o Zod recusa disputa com menos de dois candidatos e adversário sem identidade', () => {
    const base = brasilV080 as unknown as { career: { opponents: { blocId: string }[] } };
    const only = {
      ...base,
      career: { ...base.career, opponents: base.career.opponents.filter((o) => o.blocId === 'centro') },
    };
    const r1 = parseScenario(only);
    expect(r1.ok).toBe(false);
    expect(!r1.ok && r1.errors.join('\n')).toMatch(/pelo menos dois candidatos/);
    const ghost = {
      ...base,
      career: {
        ...base.career,
        opponents: [...base.career.opponents, { ...base.career.opponents[0], blocId: 'fantasma' }],
      },
    };
    const r2 = parseScenario(ghost);
    expect(r2.ok).toBe(false);
    expect(!r2.ok && r2.errors.join('\n')).toMatch(/sem candidato em elections\.candidatos/);
  });

  it('monotonicidade pela cadeia inteira: mais valência para o jogador não reduz os votos dele', () => {
    const career = corrida().career!;
    const electorates = ufElectorates(content);
    const votesWith = (valence: number) =>
      aggregateTallies(
        ufs.map((u, i) =>
          tallyUf(electorates[i], ballotOptions({ ...career, valence }, content, u.id), electorateParams(), 'eleicao'),
        ),
        career.opponents.length + 1,
      ).votes[0];
    let last = -1;
    for (const v of [-1, -0.5, 0, 0.1, 0.5, 1]) {
      const votes = votesWith(v);
      expect(votes).toBeGreaterThanOrEqual(last);
      last = votes;
    }
    expect(utility(1, 0)).toBeGreaterThan(utility(0, 0));
  });
});

// PLANO_CAMPANHA.md Fase C3: invariantes financeiros também são checados em simulações.
it('invariante detecta saldos negativos e teto de gastos ultrapassado', () => {
  const before = corrida();
  const result = advanceMonth(before, { decisions: [] }, content);
  const finance = result.state.career!.expandedFinance!;
  const broken: GameState = {
    ...result.state,
    career: {
      ...result.state.career!,
      expandedFinance: {
        ...finance,
        pockets: { ...finance.pockets, party: -1 },
        spent: finance.spendingLimit + 1,
      },
    },
  };
  const errors = checkInvariants(before, broken, result.report, content);
  expect(errors.some((item) => item.includes('saldo'))).toBe(true);
  expect(errors.some((item) => item.includes('teto'))).toBe(true);
});

// PLANO_CAMPANHA.md Fase C3: entradas e saídas explicam a variação dos bolsos.
it('detecta criação de dinheiro sem recebimento ou aporte', () => {
  const before = corrida();
  const result = advanceMonth(before, { decisions: [] }, content);
  const finance = result.state.career!.expandedFinance!;
  const broken: GameState = {
    ...result.state,
    career: {
      ...result.state.career!,
      expandedFinance: {
        ...finance,
        pockets: { ...finance.pockets, party: finance.pockets.party + 1 },
      },
    },
  };
  expect(checkInvariants(before, broken, result.report, content).some((error) => error.includes('conservação'))).toBe(
    true,
  );
});

// PLANO_CAMPANHA.md Fase C3: conservação do caixa simples.
it('detecta saldo criado sem causa no caixa simples', () => {
  const configured = {
    ...content,
    scenario: {
      ...content.scenario,
      career: {
        ...content.scenario.career!,
        finance: {
          initialBalance: 100,
          spendingLimit: 1000,
          dataStatus: 'FICTICIO' as const,
        },
      },
    },
  };
  const before = createInitialState({ content: configured, difficulty: 'estrategica', seed: 1, startPoint: 'corrida' });
  const result = advanceMonth(before, { decisions: [] }, configured);
  const simple = result.state.career!.finance!;
  const broken: GameState = {
    ...result.state,
    career: { ...result.state.career!, finance: { ...simple, balance: simple.balance + 1 } },
  };
  expect(
    checkInvariants(before, broken, result.report, configured).some((error) => error.includes('conservação')),
  ).toBe(true);
});
