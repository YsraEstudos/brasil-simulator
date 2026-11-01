import { AGENDA_ACTIONS, BRAND_ACTION_ID, DIRECTIVE_ACTION_ID, type Decision, type GameContent } from '@/engine';

export function decisionLabel(decision: Decision, content: GameContent): string {
  const params = decision.params ?? {};
  if (decision.policyId === DIRECTIVE_ACTION_ID && typeof params.policyId === 'string') {
    return `Diretriz: ${content.policies[params.policyId]?.name ?? params.policyId}`;
  }
  if (decision.policyId === BRAND_ACTION_ID && typeof params.name === 'string') return `Marca: ${params.name}`;
  const action = AGENDA_ACTIONS[decision.policyId];
  const base = content.policies[decision.policyId]?.name ?? action?.name ?? decision.policyId;
  const keys = action?.targetParams ?? [];
  const ordered = keys.includes('proposalId') ? ['proposalId', ...keys.filter((key) => key !== 'proposalId')] : keys;
  const targets = ordered.flatMap((key) => {
    const value = params[key];
    return typeof value === 'string' && value.trim() ? [value.trim()] : [];
  });
  return targets.length ? `${base}: ${targets.join(' · ')}` : base;
}
