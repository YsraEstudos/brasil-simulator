import { toCalendar } from '../calendar';
import { policyCapacity, policyManagement } from '../congress/management';
import type { GameContent, GameState } from '../types';

export interface ProjectCommitment {
  proposalId: string;
  policyId: string;
  year: number;
  /** Saldo nominal projetado, em R$ milhões; não é despesa já executada. */
  millions: number;
  horizonLimited: boolean;
}

/** Limite de apresentação para impedir listas imensas com eficiência de cenário extrema. */
const MAX_FORECAST_MONTHS = 480;

/**
 * Estimativa uniforme do saldo ainda necessário por ano, a partir da carteira existente.
 * Não altera dotações nem considera a previsão como autorização orçamentária.
 */
export function projectCommitments(state: Readonly<GameState>, content: GameContent): ProjectCommitment[] {
  const result: ProjectCommitment[] = [];
  for (const project of state.publicPolicies.projects) {
    const policy = content.policies[project.policyId];
    const remaining = Math.max(0, project.budgetMillions - project.spentMillions);
    if (!policy || remaining <= 0 || project.phase === 'cancelado' || project.phase === 'operacao') continue;
    const efficiency = Math.max(1e-9, policy.project?.efficiency ?? 1);
    const duration = Math.max(
      1,
      Math.ceil(policy.timeline.executionMonths / (efficiency * policyCapacity(state, content, policy.area))),
    );
    const actualRemainingMonths = Math.max(1, duration - (project.phase === 'obra' ? project.phaseMonth : 0));
    const remainingMonths = Math.min(MAX_FORECAST_MONTHS, actualRemainingMonths);
    const horizonLimited = actualRemainingMonths > MAX_FORECAST_MONTHS;
    const management = policyManagement(state, content, policy.area);
    const stages = [
      { id: 'planejamento', duration: policy.timeline.planningMonths, rate: management?.competence ?? 1 },
      { id: 'licenciamento', duration: policy.project?.licensingMonths ?? 0, rate: management?.coordination ?? 1 },
      { id: 'licitacao', duration: policy.project?.procurementMonths ?? 0, rate: management?.experience ?? 1 },
    ];
    const phaseIndex = stages.findIndex((stage) => stage.id === project.phase);
    const preparationMonths =
      phaseIndex < 0
        ? 0
        : stages.slice(phaseIndex).reduce((sum, stage, index) => {
            const completed = index === 0 ? (project.phaseEffort ?? 0) : 0;
            return sum + Math.ceil(Math.max(0, stage.duration - completed) / stage.rate);
          }, 0);
    const startsIn = Math.max(project.startMonth - state.monthIndex, 0) + preparationMonths;
    const years = new Map<number, number>();
    for (let offset = 0; offset < remainingMonths; offset++) {
      const year = toCalendar(state.monthIndex + startsIn + offset).year;
      years.set(year, (years.get(year) ?? 0) + remaining / remainingMonths);
    }
    for (const [year, millions] of years) {
      result.push({ proposalId: project.proposalId, policyId: project.policyId, year, millions, horizonLimited });
    }
  }
  return result;
}
