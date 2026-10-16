/** Estado persistido da Fase 06. Valores monetários em R$ milhões. */
export interface MinistryDirective {
  ministryId: string;
  policyId: string;
  /** Dotação anual solicitada; execução é limitada pelo espaço disponível a cada mês. */
  annualMillions: number;
  year: number;
}

export const PROJECT_PHASES = ['planejamento', 'licenciamento', 'licitacao', 'obra', 'operacao'] as const;
export type ProjectPhase = (typeof PROJECT_PHASES)[number] | 'cancelado';

export interface PublicProject {
  proposalId: string;
  policyId: string;
  phase: ProjectPhase;
  phaseMonth: number;
  /** Avanço físico da obra, 0–1. */
  progress: number;
  /** Custo total aprovado, incluindo sobrecusto já sorteado. */
  budgetMillions: number;
  spentMillions: number;
  /** Ativo real líquido de depreciação (preços do início da campanha). */
  assetMillions: number;
  maintenanceMillions: number;
  delayMonths: number;
  /** Primeiro mês em que a carteira pode processar este projeto. */
  startMonth: number;
}

export interface GovernmentBrand {
  proposalId: string;
  name: string;
  /** Mandato contado desde a primeira posse, sem implementar eleições. */
  term: number;
}

export interface PublicPolicyState {
  directives: MinistryDirective[];
  projects: PublicProject[];
  brands: GovernmentBrand[];
  /** Soma dos ativos líquidos dos projetos; não inclui o estoque herdado. */
  capitalStockMillions: number;
}

export function initialPublicPolicies(): PublicPolicyState {
  return { directives: [], projects: [], brands: [], capitalStockMillions: 0 };
}
