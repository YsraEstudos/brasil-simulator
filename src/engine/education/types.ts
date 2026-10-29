/** Etapas de ensino acompanhadas por coorte (PLANO_EXPANSAO EX-19), na ordem do fluxo. */
export const EDUCATION_STAGE_IDS = ['fundamental', 'medio', 'superior'] as const;
export type EducationStageId = (typeof EDUCATION_STAGE_IDS)[number];

/** Maior etapa concluída por quem está na força de trabalho, em ordem crescente. */
export const ATTAINMENT_IDS = ['sem_fundamental', 'fundamental', 'medio', 'superior'] as const;
export type AttainmentId = (typeof ATTAINMENT_IDS)[number];

/**
 * Alavancas federais de educação. Cada uma é um alvo de impulso `educacao.<id>` emitido pela carteira (rotina com
 * dotação liberada, projeto em operação) e lido só por esta etapa: nunca mexem na economia diretamente.
 */
export const EDUCATION_LEVER_IDS = ['alfabetizacao', 'permanencia', 'docentes'] as const;
export type EducationLeverId = (typeof EDUCATION_LEVER_IDS)[number];

export interface EducationStageState {
  id: EducationStageId;
  /** Matriculados, em milhões de pessoas. */
  enrolled: number;
  /** Aprendizagem de quem conclui a etapa agora (0–1); anda devagar até o alvo da política. */
  learning: number;
}

export interface AttainmentState {
  id: AttainmentId;
  /** Pessoas na força de trabalho com esta escolaridade, em milhões. */
  workers: number;
  /** Aprendizagem média do estoque (média ponderada das coortes que entraram). */
  learning: number;
}

/** Fluxos do último mês processado, em milhões de pessoas (para a interface e para a conservação). */
export interface EducationFlows {
  entrants: number;
  graduates: Record<EducationStageId, number>;
  dropouts: Record<EducationStageId, number>;
  /** Saída da força de trabalho (aposentadoria e mortalidade). */
  exits: number;
}

/** Força de cada alavanca no último mês: soma bruta dos impulsos e efeito saturado (0–1). */
export interface EducationLeverState {
  id: EducationLeverId;
  strength: number;
  effect: number;
  /** Políticas que alimentaram a alavanca no mês, pela força de cada uma (maior primeiro). */
  sources: { label: string; strength: number }[];
}

export interface EducationState {
  stages: EducationStageState[];
  workforce: AttainmentState[];
  /**
   * Anos efetivos de estudo por trabalhador (anos × ajuste de aprendizagem). Começa no estado estacionário: sem
   * política ele não se move, então o potencial calibrado (que já contém a tendência do país) não ganha bônus.
   */
  humanCapital: number;
  flows: EducationFlows;
  levers: EducationLeverState[];
}
