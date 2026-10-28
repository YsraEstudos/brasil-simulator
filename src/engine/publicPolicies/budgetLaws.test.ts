import { describe, expect, it } from 'vitest';
import { testState } from '@/tests/fixtures';
import type { Proposal } from '@/engine/types';
import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { createInitialState } from '@/engine/state';
import { advanceMonth } from '@/engine/advanceMonth';
import { budgetDraftOf, recordBudgetLaws } from './budgetLaws';

describe('leis de planejamento', () => {
  it('só registra autorização após aprovação e sanção, sem criar gasto', () => {
    const state = testState();
    const proposal = {
      id: 'orcamento_loa_0',
      policyId: 'orcamento_loa',
      createdMonth: 0,
      status: 'em_tramitacao',
      budgetDraft: { kind: 'loa', year: 2028, priority: 'saude', annualMillions: 10000 },
      history: [],
    } as unknown as Proposal;
    const before = { ...state, proposals: [proposal] };
    expect(recordBudgetLaws(before).publicPolicies.budgetLaws ?? []).toEqual([]);
    expect(
      recordBudgetLaws({ ...before, proposals: [{ ...proposal, status: 'em_execucao' }] }).publicPolicies.budgetLaws ??
        [],
    ).toEqual([]);
    const enacted = {
      ...proposal,
      status: 'em_execucao',
      history: [{ monthIndex: 3, status: 'em_execucao', cause: 'sancao', detail: 'Sancionada.' }],
    } as Proposal;
    const updated = recordBudgetLaws({ ...before, proposals: [enacted] });
    expect(updated.publicPolicies.budgetLaws).toMatchObject([
      { proposalId: proposal.id, kind: 'loa', year: 2028, priority: 'saude', annualMillions: 10000 },
    ]);
    expect(updated.economy).toEqual(before.economy);
    expect(updated.impulses).toEqual(before.impulses);
    expect(recordBudgetLaws(updated).publicPolicies.budgetLaws).toHaveLength(1);
  });

  it('a prioridade do PPA aprovado orienta a LDO e a LDO aprovada orienta a LOA', () => {
    const content = loadContent(DEFAULT_SCENARIO_ID);
    const initial = createInitialState({ content, difficulty: 'estrategica', seed: 8 });
    const state = {
      ...initial,
      publicPolicies: {
        ...initial.publicPolicies,
        budgetLaws: [
          { proposalId: 'ppa', kind: 'ppa' as const, year: 2028, priority: 'educacao' as const, enactedAt: 1 },
          { proposalId: 'ldo', kind: 'ldo' as const, year: 2028, priority: 'educacao' as const, enactedAt: 2 },
        ],
      },
    };
    const make = (policyId: string, priority: string) => ({
      policyId,
      agendaCost: 1,
      params: { priority, annualMillions: 10000 },
    });
    expect(budgetDraftOf(make('orcamento_ldo', 'saude'), state)).toBeNull();
    expect(budgetDraftOf(make('orcamento_loa', 'saude'), state)).toBeNull();
    expect(budgetDraftOf(make('orcamento_ldo', 'educacao'), state)?.priority).toBe('educacao');
    expect(budgetDraftOf(make('orcamento_loa', 'educacao'), state)?.priority).toBe('educacao');
  });

  it('LDO tramita como PLN; só depois da sanção pode ser enviada a LOA do mesmo exercício', () => {
    const content = loadContent(DEFAULT_SCENARIO_ID);
    const initial = createInitialState({ content, difficulty: 'casual', seed: 8 });
    let state = {
      ...initial,
      congress: {
        ...initial.congress,
        blocs: initial.congress.blocs.map((bloc) => ({ ...bloc, governmentRelation: 100 })),
      },
    };
    const loa = { policyId: 'orcamento_loa', agendaCost: 1, params: { priority: 'saude', annualMillions: 10000 } };
    expect(advanceMonth(state, { decisions: [loa] }, content).report.rejected[0]?.reason).toBe('alvo_invalido');
    const sent = advanceMonth(
      state,
      { decisions: [{ policyId: 'orcamento_ldo', agendaCost: 1, params: { priority: 'saude' } }] },
      content,
    );
    expect(sent.report.rejected).toEqual([]);
    expect(sent.state.proposals.find((proposal) => proposal.policyId === 'orcamento_ldo')?.budgetDraft).toMatchObject({
      kind: 'ldo',
      year: 2028,
      priority: 'saude',
    });
    expect(sent.state.publicPolicies.budgetLaws ?? []).toEqual([]);
    state = sent.state;
    for (
      let month = 0;
      month < 18 && !(state.publicPolicies.budgetLaws ?? []).some((law) => law.kind === 'ldo');
      month++
    ) {
      state = advanceMonth(state, { decisions: [] }, content).state;
    }
    expect(state.publicPolicies.budgetLaws).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'ldo', year: 2028 })]),
    );
    const loaSent = advanceMonth(state, { decisions: [loa] }, content);
    expect(loaSent.report.rejected).toEqual([]);
    state = loaSent.state;
    for (
      let month = 0;
      month < 18 && !(state.publicPolicies.budgetLaws ?? []).some((law) => law.kind === 'loa');
      month++
    ) {
      state = advanceMonth(state, { decisions: [] }, content).state;
    }
    expect(state.publicPolicies.budgetLaws).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'loa', year: 2028, annualMillions: 10000 })]),
    );
    expect(
      state.impulses.filter(
        (impulse) =>
          impulse.sourceId.startsWith('proposta:orcamento_loa') &&
          impulse.target.startsWith('gasto.') &&
          impulse.delta !== 0,
      ),
    ).toEqual([]);
  });
});
