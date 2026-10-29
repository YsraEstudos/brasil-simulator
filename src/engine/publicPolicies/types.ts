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
export type ProjectBottleneck =
  | 'capacidade'
  | 'orcamento'
  | 'suspensao'
  | 'cronograma'
  /** Obra federativa: estado do convênio sem pagar a contrapartida (PLANO_EXPANSAO EX-20). */
  | 'contrapartida'
  | 'nenhum';

/**
 * Situação de um estado num convênio de obra federativa (PLANO_EXPANSAO EX-20): `aderiu` (em dia), `recusou`,
 * `inadimplente` (aderiu, mas não paga a contrapartida) e `excluido` (inadimplente no fim da vigência).
 */
export type FederativeMemberStatus = 'aderiu' | 'recusou' | 'inadimplente' | 'excluido';

export interface FederativeMember {
  uf: string;
  status: FederativeMemberStatus;
  /** Fração do valor da obra na UF paga pelo estado (contrapartida). */
  counterpartShare: number;
  /** A União já negociou com este governador (uma vez por obra). */
  negotiated: boolean;
}

/**
 * Convênio de uma obra federativa. Vive dentro do próprio `PublicProject`: não há segunda carteira. Os governadores
 * decidem no planejamento; a assinatura (fim do planejamento) fixa escopo, orçamento federal e vigência.
 */
export interface FederativeAgreement {
  members: FederativeMember[];
  /** Mês da assinatura; `null` enquanto os governadores decidem (planejamento). */
  signedMonth: number | null;
  /** Último mês da vigência; renovado por aditivo, só com os estados em dia. */
  expiresMonth: number | null;
  /** Parcela federal do valor da obra (0–1), fixada na assinatura: converte desembolso federal em ativo. */
  federalShare: number;
}

export interface BudgetLawDraft {
  kind: 'ppa' | 'ldo' | 'loa';
  year: number;
  priority: 'saude' | 'educacao' | 'infraestrutura';
  /** Limite anual para novas alocações da carteira (R$ milhões), apenas para LOA. */
  annualMillions?: number;
}

export interface BudgetLaw extends BudgetLawDraft {
  proposalId: string;
  enactedAt: number;
}

export interface PublicProject {
  proposalId: string;
  policyId: string;
  phase: ProjectPhase;
  /** Meses consumidos na fase atual. */
  phaseMonth: number;
  /** Trabalho acumulado nas etapas anteriores à obra, em meses equivalentes de capacidade plena. */
  phaseEffort?: number;
  /** Principal limitação observada no último processamento da carteira. */
  bottleneck?: ProjectBottleneck;
  /** Avanço físico da obra, 0–1. */
  progress: number;
  /** Custo total aprovado, incluindo sobrecusto já sorteado. */
  budgetMillions: number;
  spentMillions: number;
  /**
   * Desembolso do último mês processado (R$ milhões nominais), já contido em `spentMillions`. Só alimenta o painel de
   * investimentos por setor (PLANO_EXPANSAO EX-31); ausente = nada pago naquele mês.
   */
  monthSpentMillions?: number;
  /** Ativo real líquido de depreciação (preços do início da campanha). */
  assetMillions: number;
  maintenanceMillions: number;
  delayMonths: number;
  /** Primeiro mês em que a carteira pode processar este projeto. */
  startMonth: number;
  /** Convênio com os estados, só nas obras federativas (`Policy.federative`). */
  federative?: FederativeAgreement;
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
  /** Projetos de planejamento efetivamente sancionados ou promulgados após derrubada de veto. */
  budgetLaws?: BudgetLaw[];
}

export function initialPublicPolicies(): PublicPolicyState {
  return { directives: [], projects: [], brands: [], capitalStockMillions: 0 };
}
