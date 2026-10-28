import { z } from 'zod';
import type { Decision, GameState } from '../types';
import { budgetCalendar } from './budgetCalendar';
import type { BudgetLawDraft } from './types';

export const BUDGET_POLICY_IDS = { ppa: 'orcamento_ppa', ldo: 'orcamento_ldo', loa: 'orcamento_loa' } as const;
export function isBudgetPolicy(policyId: string): boolean {
  return Object.values(BUDGET_POLICY_IDS).some((id) => id === policyId);
}
const draftSchema = z
  .object({
    kind: z.enum(['ppa', 'ldo', 'loa']),
    year: z.number().int().min(2027).max(9999),
    priority: z.enum(['saude', 'educacao', 'infraestrutura']),
    annualMillions: z.number().finite().min(0).max(1_000_000_000).optional(),
  })
  .strict()
  .refine((value) => (value.kind === 'loa' ? value.annualMillions !== undefined : value.annualMillions === undefined));

/** Valida a escolha, sem presumir que enviar o projeto o transforme em lei. */
export function budgetDraftOf(decision: Decision, state: Readonly<GameState>): BudgetLawDraft | null {
  const kind = (Object.keys(BUDGET_POLICY_IDS) as (keyof typeof BUDGET_POLICY_IDS)[]).find(
    (key) => BUDGET_POLICY_IDS[key] === decision.policyId,
  );
  const calendar = budgetCalendar(state.scenarioId, state.monthIndex);
  if (!kind || !calendar) return null;
  const parsed = draftSchema.safeParse({
    kind,
    year: kind === 'ppa' ? (calendar.proposedPpa?.from ?? calendar.scheduledPpa.from) : calendar.budgetYear,
    priority: decision.params?.priority,
    ...(kind === 'loa' ? { annualMillions: decision.params?.annualMillions } : {}),
  });
  if (!parsed.success) return null;
  const laws = state.publicPolicies.budgetLaws ?? [];
  const preceding = laws
    .filter((law) =>
      kind === 'ldo'
        ? law.kind === 'ppa' && law.year <= parsed.data.year && parsed.data.year < law.year + 4
        : kind === 'loa' && law.kind === 'ldo' && law.year === parsed.data.year,
    )
    .sort(
      (a, b) => b.enactedAt - a.enactedAt || (a.proposalId < b.proposalId ? -1 : a.proposalId > b.proposalId ? 1 : 0),
    )[0];
  if ((kind === 'loa' && !preceding) || (preceding && preceding.priority !== parsed.data.priority)) return null;
  return parsed.data;
}

/** Copia a autorização somente após sanção (ou derrubada de veto), sem registrar desembolso. */
export function recordBudgetLaws(state: Readonly<GameState>): GameState {
  const laws = [...(state.publicPolicies.budgetLaws ?? [])];
  const initialCount = laws.length;
  for (const proposal of state.proposals) {
    const parsed = draftSchema.safeParse(proposal.budgetDraft);
    if (!parsed.success || proposal.policyId !== BUDGET_POLICY_IDS[parsed.data.kind]) continue;
    if (!['em_execucao', 'concluida'].includes(proposal.status) || laws.some((law) => law.proposalId === proposal.id))
      continue;
    const enactment = proposal.history.find((entry) =>
      ['sancao', 'sancao_tacita', 'veto_parcial', 'veto_derrubado'].includes(entry.cause),
    );
    if (!enactment) continue;
    laws.push({ ...parsed.data, proposalId: proposal.id, enactedAt: enactment.monthIndex });
  }
  return laws.length === initialCount
    ? (state as GameState)
    : { ...state, publicPolicies: { ...state.publicPolicies, budgetLaws: laws } };
}
