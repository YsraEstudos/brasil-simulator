import type { TechnologyRouteId, TechnologyStageId } from '../../types/technology';

/**
 * Programa de aquisição de uma tecnologia (PLANO_EXPANSAO EX-24 e EX-32). Um por nó da árvore: começar de novo
 * substitui o anterior, levando os estágios já concluídos (resultado intermediário).
 */
export type ResearchStatus = 'em_andamento' | 'adotada' | 'falhou' | 'suspensa';

/** O que segurou o programa no mês (`null` = andou no ritmo pleno). */
export type ResearchBottleneck = 'orcamento' | 'infraestrutura' | 'energia' | 'parceiro' | null;

export interface ResearchProgram {
  nodeId: string;
  route: TechnologyRouteId;
  /** Parceiro da transferência (rota `transferir`). */
  partnerId?: string;
  status: ResearchStatus;
  /** Estágio atual (na adoção concluída, fica `adocao`). */
  stage: TechnologyStageId;
  /** Meses-equivalentes cumpridos no estágio atual: financiamento do mês × ritmo. */
  stageProgress: number;
  /** Estágios concluídos, inclusive os herdados de um programa anterior do mesmo nó. */
  completedStages: TechnologyStageId[];
  startedMonth: number;
  /** Falhas parciais acumuladas. */
  setbacks: number;
  /** Desembolso acumulado e do mês, R$ milhões correntes; a parte paga a fornecedores externos à parte. */
  spentMillions: number;
  monthSpentMillions: number;
  monthImportedMillions: number;
  bottleneck: ResearchBottleneck;
  adoptedMonth?: number;
  /** Fração da manutenção paga no mês (0–1). */
  maintained: number;
  /** Nível do efeito em vigor (0–1): segue a manutenção paga aos poucos depois da adoção. */
  effectLevel: number;
  /** Domínio técnico local alcançado (0–1), da rota concluída. */
  capability: number;
  /** Mês do pedido de certificação de exportação. */
  certifiedMonth?: number;
}

export interface ResearchState {
  programs: ResearchProgram[];
}
