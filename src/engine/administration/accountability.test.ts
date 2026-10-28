import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { toMonthIndex } from '../calendar';
import { createInitialState } from '../state';
import type { CareerState, GameContent, GameState, Proposal } from '../types';

import { accountability } from './accountability';

// PLANO_EXPANSAO EX-18: promessas com estado e evidência, derivadas do PPA, das marcas e dos compromissos.

const content: GameContent = loadContent(DEFAULT_SCENARIO_ID);
const POLICY = 'projeto_corredores_logisticos';
const createState = () => createInitialState({ content, difficulty: 'estrategica', seed: 5 });
const base = (): GameState => ({
  ...createState(),
  publicPolicies: {
    directives: [],
    projects: [],
    brands: [],
    capitalStockMillions: 0,
  },
});

const PPA = { kind: 'ppa' as const, year: 2028, priority: 'infraestrutura' as const, proposalId: 'ppa', enactedAt: 10 };
const LOA = {
  kind: 'loa' as const,
  year: 2028,
  priority: 'infraestrutura' as const,
  annualMillions: 1000,
  proposalId: 'loa',
  enactedAt: 20,
};
const project = (over: Partial<GameState['publicPolicies']['projects'][number]> = {}) => ({
  proposalId: 'obra',
  policyId: POLICY,
  phase: 'obra' as const,
  phaseMonth: 3,
  progress: 0.3,
  budgetMillions: 500,
  spentMillions: 100,
  assetMillions: 0,
  maintenanceMillions: 4,
  delayMonths: 0,
  startMonth: toMonthIndex({ year: 2028, month: 3 }),
  ...over,
});

function withPpa(opts: { loa?: boolean; project?: ReturnType<typeof project> }): GameState {
  const state = base();
  return {
    ...state,
    publicPolicies: {
      ...state.publicPolicies,
      budgetLaws: [PPA, ...(opts.loa ? [LOA] : [])],
      projects: opts.project ? [opts.project] : [],
    },
  };
}

describe('prestação de contas do PPA', () => {
  it('sem LOA no período, a prioridade é inviável', () => {
    const [account] = accountability(withPpa({}), content);
    expect(account).toMatchObject({ source: 'ppa', status: 'inviavel' });
    expect(account.evidence).toMatch(/Sem LOA/);
  });

  it('obra em operação cumpre a prioridade; obra em andamento fica parcial', () => {
    const done = accountability(
      withPpa({ loa: true, project: project({ phase: 'operacao', spentMillions: 480 }) }),
      content,
    )[0];
    expect(done.status).toBe('cumprida');
    expect(done.evidence).toMatch(/em operação/);

    const partial = accountability(withPpa({ loa: true, project: project() }), content)[0];
    expect(partial.status).toBe('parcial');
    expect(partial.evidence).toMatch(/nenhuma em operação/);
  });

  it('LOA sancionada sem desembolso é abandono, não inviabilidade', () => {
    const [account] = accountability(withPpa({ loa: true }), content);
    expect(account.status).toBe('abandonada');
    expect(account.evidence).toMatch(/nenhum desembolso/);
  });
});

describe('prestação de contas das marcas e compromissos', () => {
  it('a marca segue o desfecho da proposta e da obra', () => {
    const state = base();
    const proposal = { id: 'p1', policyId: POLICY, status: 'concluida' } as unknown as Proposal;
    const withBrand: GameState = {
      ...state,
      proposals: [proposal],
      publicPolicies: {
        ...state.publicPolicies,
        brands: [{ proposalId: 'p1', name: 'Corredores', term: 0 }],
      },
    };
    const [account] = accountability(withBrand, content);
    expect(account).toMatchObject({ source: 'marca', status: 'cumprida' });
    expect(account.promise).toMatch(/Corredores/);
  });

  it('compromisso pago é cumprido; vencido em aberto é abandonado', () => {
    const state = base();
    const career = {
      commitments: [
        {
          origin: 'dívida de campanha',
          obligation: 'pagar_divida',
          initialAmount: 40,
          remaining: 0,
          deadline: 4,
          status: 'cumprido',
        },
        {
          origin: 'fornecedor',
          obligation: 'pagar_divida',
          initialAmount: 30,
          remaining: 30,
          deadline: 4,
          status: 'expirado',
        },
      ],
    } as CareerState;
    const accounts = accountability({ ...state, career }, content);
    expect(accounts.map((a) => a.status)).toEqual(['cumprida', 'abandonada']);
    expect(accounts.every((a) => a.evidence.length > 0)).toBe(true);
  });
});
