import { describe, expect, it } from 'vitest';

import type { ProposalStatus } from '@/engine';
import type { Instrument, Policy } from '@/types/policy';

import {
  areaFilterLabel,
  areaFilters,
  buildCatalog,
  DEFAULT_CATALOG_QUERY,
  foldSearch,
  isFiltering,
  isSaturated,
  panelFilterCount,
  policyKind,
  queryCatalog,
  resultsLabel,
  shortByLabel,
  type CatalogInput,
  type CatalogQuery,
  type SaturationLimits,
} from './policyCatalogModel';

type Impact = Policy['impacts'][number];

function policy(
  id: string,
  name: string,
  area: string,
  options: { cost?: number; millions?: number; instrument?: Instrument; impacts?: Impact[] } = {},
): Policy {
  return {
    id,
    name,
    area,
    instruments: [options.instrument ?? 'decreto_regulamentar'],
    agendaCost: options.cost ?? 1,
    cost: { annualMillions: options.millions ?? 100, disbursementProfile: [1] },
    impacts: options.impacts ?? [{ channel: 'custeio', magnitude: 1, lagMonths: 0 }],
  } as Policy;
}

const LIMITS: SaturationLimits = {
  approval: { value: 0.5, min: 0.05, max: 0.9 },
  credibility: { value: 0.75, min: 0, max: 1 },
};

const POLICIES = [
  policy('sus', 'Mais Médicos', 'saude', { cost: 2, millions: 900, instrument: 'projeto_lei' }),
  policy('ubs', 'Reforma de UBS', 'saude', { cost: 1, millions: 300 }),
  policy('pec_teto', 'Novo teto de gastos', 'fiscal', { cost: 3, millions: -500, instrument: 'pec' }),
  policy('credito', 'Crédito à educação', 'educacao', { cost: 1, millions: 200, instrument: 'medida_provisoria' }),
];

const AREA_NAMES: Record<string, string> = { saude: 'Saúde', fiscal: 'Fiscal', educacao: 'Educação' };

function input(overrides: Partial<CatalogInput> = {}): CatalogInput {
  const statuses: Record<string, ProposalStatus> = { sus: 'em_tramitacao', ubs: 'rejeitada' };
  return {
    policies: POLICIES,
    latestStatus: (id) => statuses[id],
    inProgressStatuses: new Set<ProposalStatus>(['em_tramitacao', 'em_execucao']),
    barred: new Set(['credito']),
    selected: [],
    actionsLeft: 2,
    costOf: (p) => p.agendaCost,
    instrumentOf: (p) => (p.instruments[0] === 'decreto_regulamentar' ? null : (p.instruments[0] ?? null)),
    areaName: (area) => AREA_NAMES[area] ?? area,
    limits: LIMITS,
    ...overrides,
  };
}

const query = (overrides: Partial<CatalogQuery> = {}): CatalogQuery => ({ ...DEFAULT_CATALOG_QUERY, ...overrides });
const ids = (entries: readonly { policy: Policy }[]) => entries.map((entry) => entry.policy.id);

describe('policyKind: o selo de cada decisão', () => {
  it('ato do Executivo vira Decreto; os caminhos do Congresso viram MP, PL ou PEC', () => {
    expect(policyKind(null)).toBe('decreto');
    expect(policyKind('medida_provisoria')).toBe('mp');
    expect(policyKind('pec')).toBe('pec');
    expect(policyKind('projeto_lei')).toBe('pl');
    expect(policyKind('projeto_lei_complementar')).toBe('pl');
    expect(policyKind('pln')).toBe('pl');
  });
});

describe('buildCatalog', () => {
  it('marca andamento, trava, custo que falta e tipo', () => {
    const [sus, ubs, pec, credito] = buildCatalog(input());
    expect(sus).toMatchObject({ kind: 'pl', inProgress: true, locked: true, shortBy: 0, areaName: 'Saúde' });
    expect(ubs).toMatchObject({ kind: 'decreto', inProgress: false, locked: false, status: 'rejeitada' });
    expect(pec).toMatchObject({ kind: 'pec', shortBy: 1 });
    expect(credito).toMatchObject({ kind: 'mp', barred: true, locked: true });
  });

  it('o que já está na agenda nunca "falta ação"', () => {
    const pec = buildCatalog(input({ selected: ['pec_teto'], actionsLeft: 0 }))[2];
    expect(pec).toMatchObject({ selected: true, shortBy: 0 });
  });
});

describe('queryCatalog: busca, filtros e ordem se combinam', () => {
  const entries = buildCatalog(input());

  it('sem nada ligado, mostra tudo em ordem alfabética', () => {
    expect(ids(queryCatalog(entries, query()))).toEqual(['credito', 'sus', 'pec_teto', 'ubs']);
  });

  it('busca ignora acento e maiúscula e olha nome, área e tipo', () => {
    expect(ids(queryCatalog(entries, query({ search: 'MEDICOS' })))).toEqual(['sus']);
    expect(ids(queryCatalog(entries, query({ search: 'saude' })))).toEqual(['sus', 'ubs']);
    expect(ids(queryCatalog(entries, query({ search: 'pec' })))).toEqual(['pec_teto']);
    expect(ids(queryCatalog(entries, query({ search: '  educação  crédito ' })))).toEqual(['credito']);
  });

  it('filtra por área, tipo e custo ao mesmo tempo', () => {
    expect(ids(queryCatalog(entries, query({ area: 'saude', cost: 1 })))).toEqual(['ubs']);
    expect(ids(queryCatalog(entries, query({ kind: 'pl' })))).toEqual(['sus']);
    expect(ids(queryCatalog(entries, query({ area: 'fiscal', kind: 'decreto' })))).toEqual([]);
  });

  it('"cabe agora" esconde o que está travado ou pede mais ações do que há', () => {
    expect(ids(queryCatalog(entries, query({ onlyAffordable: true })))).toEqual(['ubs']);
  });

  it('ordena por custo (ações, depois R$) e por área', () => {
    expect(ids(queryCatalog(entries, query({ sort: 'custo' })))).toEqual(['credito', 'ubs', 'sus', 'pec_teto']);
    expect(ids(queryCatalog(entries, query({ sort: 'area' })))).toEqual(['credito', 'pec_teto', 'sus', 'ubs']);
  });

  it('não altera a lista recebida', () => {
    const before = ids(entries);
    queryCatalog(entries, query({ sort: 'custo' }));
    expect(ids(entries)).toEqual(before);
  });
});

describe('contadores e textos', () => {
  it('cada área conta o total e quantas estão em andamento, em ordem alfabética', () => {
    expect(areaFilters(buildCatalog(input()))).toEqual([
      { id: 'educacao', name: 'Educação', total: 1, active: 0 },
      { id: 'fiscal', name: 'Fiscal', total: 1, active: 0 },
      { id: 'saude', name: 'Saúde', total: 2, active: 1 },
    ]);
  });

  it('rótulos em português, no singular e no plural', () => {
    expect(areaFilterLabel({ id: 'saude', name: 'Saúde', total: 2, active: 1 })).toBe('Saúde, 1 em andamento');
    expect(areaFilterLabel({ id: 'saude', name: 'Saúde', total: 2, active: 0 })).toBe('Saúde, nenhuma em andamento');
    expect(resultsLabel(4, 4)).toBe('4 decisões');
    expect(resultsLabel(1, 4)).toBe('1 de 4 decisões');
    expect(resultsLabel(1, 1)).toBe('1 decisão');
    expect(shortByLabel(1)).toBe('Falta 1 ação');
    expect(shortByLabel(2)).toBe('Faltam 2 ações');
  });

  it('conta os filtros do painel e sabe quando algo está escondendo decisões', () => {
    expect(panelFilterCount(query())).toBe(0);
    expect(panelFilterCount(query({ kind: 'mp', cost: 2, onlyAffordable: true }))).toBe(3);
    expect(isFiltering(query())).toBe(false);
    expect(isFiltering(query({ sort: 'custo' }))).toBe(false);
    expect(isFiltering(query({ search: '   ' }))).toBe(false);
    expect(isFiltering(query({ area: 'saude' }))).toBe(true);
  });

  it('foldSearch tira acento, maiúscula e espaço nas pontas', () => {
    expect(foldSearch('  Previdência SOCIAL ')).toBe('previdencia social');
  });
});

describe('isSaturated: teto ou piso atingido (D-Q3)', () => {
  const approvalUp = { impacts: [{ channel: 'aprovacao', magnitude: 0.01, lagMonths: 0 }] as Impact[] };
  const atMax: SaturationLimits = { ...LIMITS, approval: { value: 0.9, min: 0.05, max: 0.9 } };

  it('avisa quando todo impacto empurra um número que já está no limite', () => {
    expect(isSaturated(approvalUp, atMax)).toBe(true);
    expect(isSaturated(approvalUp, LIMITS)).toBe(false);
  });

  it('olha a direção: baixar a aprovação no teto não satura', () => {
    const approvalDown = { impacts: [{ channel: 'aprovacao', magnitude: -0.01, lagMonths: 0 }] as Impact[] };
    expect(isSaturated(approvalDown, atMax)).toBe(false);
  });

  it('credibilidade no piso satura o que a derruba', () => {
    const credibilityDown = {
      impacts: [{ channel: 'credibilidade_fiscal', magnitude: -0.1, lagMonths: 0 }] as Impact[],
    };
    expect(isSaturated(credibilityDown, { ...LIMITS, credibility: { value: 0, min: 0, max: 1 } })).toBe(true);
  });

  it('basta um canal sem limite (gasto, receita) para não avisar', () => {
    const mixed = {
      impacts: [
        { channel: 'aprovacao', magnitude: 0.01, lagMonths: 0 },
        { channel: 'custeio', magnitude: 100, lagMonths: 0 },
      ] as Impact[],
    };
    expect(isSaturated(mixed, atMax)).toBe(false);
    expect(isSaturated({ impacts: [] }, atMax)).toBe(false);
  });
});
