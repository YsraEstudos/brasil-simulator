import { describe, expect, it } from 'vitest';

import { TEST_DECREE, testContent, testState } from '@/tests/fixtures';
import { projectCommitments } from './commitments';

describe('compromissos de obras', () => {
  it('distribui o saldo não desembolsado por anos sem alterar o estado fiscal', () => {
    const policy = {
      ...TEST_DECREE,
      id: 'obra_longa',
      delivery: 'projeto' as const,
      timeline: { ...TEST_DECREE.timeline, planningMonths: 2, executionMonths: 24 },
    };
    const content = testContent({ policies: { [policy.id]: policy } });
    const initial = testState(42, 'estrategica', content);
    const state = {
      ...initial,
      monthIndex: 8,
      publicPolicies: {
        ...initial.publicPolicies,
        projects: [
          {
            proposalId: 'p',
            policyId: policy.id,
            phase: 'obra' as const,
            phaseMonth: 0,
            progress: 0.2,
            budgetMillions: 1000,
            spentMillions: 200,
            assetMillions: 0,
            maintenanceMillions: 0,
            delayMonths: 0,
            startMonth: 0,
          },
        ],
      },
    };
    const before = structuredClone(state);
    const rows = projectCommitments(state, content);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.reduce((sum, row) => sum + row.millions, 0)).toBeCloseTo(800, 8);
    expect(rows.every((row) => row.proposalId === 'p' && row.millions > 0)).toBe(true);
    expect(state).toEqual(before);
    const delayed = {
      ...state,
      publicPolicies: {
        ...state.publicPolicies,
        projects: [{ ...state.publicPolicies.projects[0], phase: 'planejamento' as const, startMonth: 24 }],
      },
    };
    const delayedRows = projectCommitments(delayed, content);
    expect(delayedRows.every((row) => row.year >= 2029)).toBe(true);
    expect(delayedRows.reduce((sum, row) => sum + row.millions, 0)).toBeCloseTo(800, 8);
  });
});
