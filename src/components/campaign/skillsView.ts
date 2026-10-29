import { formatPercent } from '@/components/ui/format';
import {
  canTrain,
  characterSkills,
  levelFromTraining,
  monthsToNextLevel,
  SKILL_BRANCH_IDS,
  SKILL_LABEL,
  SKILL_MAX_LEVEL,
  skillParam,
  type GameState,
  type SkillBranchId,
} from '@/engine';

/**
 * Modelo do cartão "Habilidades" (PLANO_EXPANSAO EX-21): nível, progresso do treino e o efeito em cada canal, agora e no
 * próximo nível. Os efeitos são escritos como mudança de regra ("custa menos capital"), nunca como bônus de indicador.
 */

export interface SkillBranchView {
  branch: SkillBranchId;
  label: string;
  /** "Nível 1 de 3". */
  level: string;
  /** "4 meses de treino · faltam 4 para o nível 2" ou "nível máximo". */
  progress: string;
  /** Efeito vigente, pelo canal da regra. */
  effect: string;
  /** Efeito do próximo nível (`null` no máximo). */
  next: string | null;
  trainable: boolean;
}

function effectText(branch: SkillBranchId, level: number): string {
  if (level === 0) {
    return branch === 'negociacao'
      ? 'Sem efeito: cada negociação com bloco custa o capital político cheio.'
      : 'Sem efeito: a adesão dos governadores depende só da relação.';
  }
  if (branch === 'negociacao') {
    return `Cada negociação com bloco custa ${formatPercent(level * skillParam('negociacao_desconto'), 0)} menos capital político; o apoio ganho é o mesmo.`;
  }
  return `+${Math.round(level * skillParam('federalismo_adesao') * 100)} pontos percentuais na chance de cada governador aderir a convênio.`;
}

export function skillsView(state: GameState): SkillBranchView[] {
  const skills = characterSkills(state);
  return SKILL_BRANCH_IDS.map((branch) => {
    const months = skills[branch];
    const level = levelFromTraining(months);
    const missing = monthsToNextLevel(months);
    return {
      branch,
      label: SKILL_LABEL[branch],
      level: `Nível ${level} de ${SKILL_MAX_LEVEL}`,
      progress:
        missing === null
          ? `${months} meses de treino · nível máximo`
          : `${months} ${months === 1 ? 'mês' : 'meses'} de treino · ${missing === 1 ? 'falta 1' : `faltam ${missing}`} para o nível ${level + 1}`,
      effect: effectText(branch, level),
      next: level < SKILL_MAX_LEVEL ? effectText(branch, level + 1) : null,
      trainable: canTrain(state, branch),
    };
  });
}

/** Custo do treino, para o rodapé do cartão. */
export function trainingCostText(): string {
  return `Cada mês de treino custa 1 ação de agenda e ${skillParam('treino_capital')} pontos de capital político. Um treino por mês; o nível novo vale a partir do mês seguinte.`;
}
