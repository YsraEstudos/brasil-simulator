import { formatNumber, formatPercent } from '@/components/ui/format';
import {
  steadyStateEducation,
  type AttainmentId,
  type EducationLeverId,
  type EducationStageId,
  type EducationState,
} from '@/engine';

/**
 * Modelo do cartão "Educação" (PLANO_EXPANSAO EX-19): matrículas e fluxo por etapa, escolaridade da força de trabalho,
 * alavancas com as políticas que as alimentam e o capital humano contra o início. Só lê o estado do motor.
 */

const STAGE_LABEL: Record<EducationStageId, string> = {
  fundamental: 'Ensino fundamental',
  medio: 'Ensino médio',
  superior: 'Ensino superior',
};

const ATTAINMENT_LABEL: Record<AttainmentId, string> = {
  sem_fundamental: 'Sem fundamental completo',
  fundamental: 'Fundamental completo',
  medio: 'Médio completo',
  superior: 'Superior completo',
};

const LEVER_LABEL: Record<EducationLeverId, string> = {
  alfabetizacao: 'Alfabetização',
  permanencia: 'Permanência no médio',
  docentes: 'Formação docente',
};

const LEVER_EFFECT: Record<EducationLeverId, string> = {
  alfabetizacao: 'aprendizagem e evasão no fundamental',
  permanencia: 'evasão no médio e passagem do fundamental ao médio',
  docentes: 'aprendizagem no fundamental e no médio',
};

const MONTHS_PER_YEAR = 12;

export interface EducationStageView {
  id: EducationStageId;
  label: string;
  enrolled: string;
  flows: string;
  learning: string;
}

export interface EducationLeverView {
  id: EducationLeverId;
  label: string;
  /** "Sem política ativa" ou "efeito 54% do teto · Rotina de apoio à alfabetização". */
  text: string;
  active: boolean;
}

export interface EducationView {
  stages: EducationStageView[];
  workforce: { id: AttainmentId; label: string; share: string }[];
  humanCapital: string;
  humanCapitalChange: string;
  levers: EducationLeverView[];
}

const millions = (value: number) => `${formatNumber(value, 1)} mi`;
const perYear = (monthly: number) => `${formatNumber(monthly * MONTHS_PER_YEAR * 1000, 0)} mil/ano`;

export function educationView(education: EducationState): EducationView {
  const start = steadyStateEducation().humanCapital;
  const totalWorkers = education.workforce.reduce((s, w) => s + w.workers, 0);
  const change = education.humanCapital - start;
  return {
    stages: education.stages.map((stage) => ({
      id: stage.id,
      label: STAGE_LABEL[stage.id],
      enrolled: `${millions(stage.enrolled)} matriculados`,
      flows: `Concluem ${perYear(education.flows.graduates[stage.id])} · abandonam ${perYear(education.flows.dropouts[stage.id])}`,
      learning: `Aprendizagem de quem conclui: ${formatPercent(stage.learning, 0)}`,
    })),
    workforce: education.workforce.map((w) => ({
      id: w.id,
      label: ATTAINMENT_LABEL[w.id],
      share: totalWorkers > 0 ? formatPercent(w.workers / totalWorkers, 1) : '—',
    })),
    humanCapital: `${formatNumber(education.humanCapital, 2)} anos efetivos de estudo por trabalhador`,
    humanCapitalChange:
      Math.abs(change) < 0.005
        ? 'Igual ao início do mandato: sem política, a escolaridade não muda o PIB potencial.'
        : `${change > 0 ? '+' : '−'}${formatNumber(Math.abs(change), 2)} ano desde o início; entra no PIB potencial aos poucos.`,
    levers: education.levers.map((lever) => {
      const active = lever.strength > 0;
      const sources = lever.sources.map((s) => s.label).join(', ');
      return {
        id: lever.id,
        label: LEVER_LABEL[lever.id],
        active,
        text: active
          ? `Efeito ${formatPercent(lever.effect, 0)} do teto em ${LEVER_EFFECT[lever.id]} · ${sources}`
          : `Sem política ativa (age em ${LEVER_EFFECT[lever.id]})`,
      };
    }),
  };
}
