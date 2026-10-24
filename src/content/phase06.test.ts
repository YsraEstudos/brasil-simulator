import { describe, expect, it } from 'vitest';

import { parsePolicy } from '@/types/policy';

import { POLICIES, PREVENTION_POLICY_IDS } from './policies';
import { CAMPAIGN_MONTHS, LEGACY_SCENARIO_ID, PROTOTYPE_MONTHS, SCENARIOS, campaignMonths } from './scenarios';

const validRoutine = {
  id: 'teste_rotina',
  name: 'Rotina de teste',
  summary: 'Ato executivo provisório para testar o contrato de rotina.',
  area: 'teste',
  competence: 'federal',
  instruments: ['portaria'],
  agendaCost: 1,
  cost: { annualMillions: 100, disbursementProfile: [1] },
  fundingSources: ['dotacao_existente'],
  timeline: { planningMonths: 0, expectedLegislativeMonths: 0, executionMonths: 3, maturationMonths: 1 },
  conditions: [],
  impacts: [{ channel: 'custeio', magnitude: 100, lagMonths: 0 }],
  risks: [],
  affected: { groups: ['usuarios'], sectors: ['servicos'], regions: ['nacional'] },
  position: { economic: 0, social: 0 },
  dataStatus: 'PROVISORIO',
  delivery: 'rotina',
} as const;

const validProject = {
  ...validRoutine,
  id: 'teste_projeto',
  name: 'Projeto de teste',
  instruments: ['projeto_lei', 'ato_execucao'],
  cost: { annualMillions: 1000, disbursementProfile: [0.4, 0.6] },
  timeline: { planningMonths: 2, expectedLegislativeMonths: 4, executionMonths: 18, maturationMonths: 6 },
  impacts: [{ channel: 'investimento_publico', magnitude: 1000, lagMonths: 2 }],
  delivery: 'projeto',
  project: { licensingMonths: 3, procurementMonths: 4, efficiency: 0.8, annualMaintenanceRate: 0.03 },
} as const;

describe('contratos de políticas da Fase 06', () => {
  it('aceita uma rotina executiva com custeio positivo', () => {
    expect(parsePolicy(validRoutine).ok).toBe(true);
  });

  it('aceita um projeto com obra e metadados de carteira', () => {
    expect(parsePolicy(validProject).ok).toBe(true);
  });

  it('exige metadados e investimento positivo para projetos', () => {
    expect(parsePolicy({ ...validProject, project: undefined }).ok).toBe(false);
    expect(
      parsePolicy({
        ...validProject,
        timeline: { ...validProject.timeline, executionMonths: 0 },
        cost: { annualMillions: 1000, disbursementProfile: [1] },
      }).ok,
    ).toBe(false);
    expect(
      parsePolicy({
        ...validProject,
        cost: { annualMillions: 1000, disbursementProfile: [1] },
      }).ok,
    ).toBe(false);
    expect(
      parsePolicy({
        ...validProject,
        impacts: [{ channel: 'custeio', magnitude: 1, lagMonths: 0 }],
      }).ok,
    ).toBe(false);
    expect(parsePolicy({ ...validProject, cost: { annualMillions: 0, disbursementProfile: [1] } }).ok).toBe(false);
    expect(
      parsePolicy({
        ...validProject,
        impacts: [{ channel: 'capital_publico', magnitude: 1, lagMonths: 0 }],
      }).ok,
    ).toBe(false);
  });

  it('restringe rotinas a atos executivos e custeio positivo', () => {
    expect(parsePolicy({ ...validRoutine, instruments: ['projeto_lei'] }).ok).toBe(false);
    expect(parsePolicy({ ...validRoutine, cost: { annualMillions: -1, disbursementProfile: [1] } }).ok).toBe(false);
    expect(
      parsePolicy({
        ...validRoutine,
        impacts: [{ channel: 'transferencia_baixa_renda', magnitude: 1, lagMonths: 0 }],
      }).ok,
    ).toBe(false);
    expect(parsePolicy({ ...validRoutine, conditions: ['adesao_estadual'] }).ok).toBe(false);
  });

  it('carrega o catálogo completo e o cenário versionado sem alterar o legado', () => {
    expect(Object.keys(POLICIES).length).toBeGreaterThanOrEqual(30);
    // As políticas de prevenção (PR 13) só entram no v0.8.0: os cenários publicados seguem com o catálogo de antes.
    const published = Object.values(POLICIES).filter((policy) => !PREVENTION_POLICY_IDS.includes(policy.id));
    const current = SCENARIOS.brasil_2027_01_v050;
    const legacy = SCENARIOS[LEGACY_SCENARIO_ID];
    expect(current.id).toBe('brasil_2027_01_v050');
    expect(current.version).toBe('0.5.0');
    expect(current.policies).toHaveLength(published.length);
    expect([...current.policies].sort()).toEqual(published.map((policy) => policy.id).sort());
    expect(published.filter((policy) => policy.delivery === 'rotina')).toHaveLength(22);
    expect(published.filter((policy) => policy.delivery === 'projeto')).toHaveLength(10);
    expect(published.filter((policy) => policy.delivery === undefined)).toHaveLength(10);
    for (const policy of Object.values(POLICIES).filter((item) => item.delivery === 'projeto')) {
      expect(policy.timeline.executionMonths, policy.id).toBeGreaterThan(0);
      expect(policy.cost.disbursementProfile.length, policy.id).toBe(Math.ceil(policy.timeline.executionMonths / 12));
    }
    expect(legacy.id).toBe('brasil_2027_01');
    expect(legacy.version).toBe('0.4.0');
    expect(CAMPAIGN_MONTHS).toBe(48);
    expect(campaignMonths('brasil_2027_01_v050')).toBe(CAMPAIGN_MONTHS);
    expect(campaignMonths(LEGACY_SCENARIO_ID)).toBe(PROTOTYPE_MONTHS);
  });

  it('oferece duas rotinas para cada ministério do cenário novo', () => {
    const scenario = SCENARIOS.brasil_2027_01_v050;
    for (const ministry of scenario.institutions?.ministries ?? []) {
      const policies = Object.values(POLICIES).filter(
        (policy) => policy.delivery === 'rotina' && policy.area !== undefined && ministry.areas.includes(policy.area),
      );
      expect(policies.length, ministry.id).toBeGreaterThanOrEqual(2);
    }
  });
});
