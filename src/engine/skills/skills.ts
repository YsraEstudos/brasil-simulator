import { TRAIN_SKILL_ACTION_ID } from '../actions';
import type { GameState, MonthStep, ScheduledImpulse } from '../types';
import { skillParam } from './calibration';
import { SKILL_BRANCH_IDS, type CharacterSkills, type SkillBranchId } from './types';

/**
 * Habilidades iniciais (PLANO_EXPANSAO EX-21; F06). O personagem controlado treina um ramo por mês com a ação de agenda
 * `treinar_habilidade` (custa a ação e capital político); o nível sobe ao cruzar limiares de meses acumulados. Os
 * efeitos só agem por canais de regras existentes:
 *
 * - **Negociação:** reduz o capital político gasto em cada `negociar_bloco` (`proposals.ts`). O apoio ganho é o mesmo.
 * - **Federalismo:** soma probabilidade à adesão de cada governador a convênio (`adhesionProbability`, programas e
 *   obras federativas). Não toca na relação nem obriga o estado: governador hostil ainda recusa.
 * - **Ciência e tecnologia (R7):** reduz a chance de falha parcial ao fim de cada estágio de pesquisa ou absorção da
 *   árvore de tecnologias (`research/`). Não acelera o estágio nem paga o custo.
 * - **Diplomacia (R7):** soma avanço a cada rodada de negociação de acordo comercial (`trade/`). Não ratifica: o
 *   Congresso continua votando o acordo.
 *
 * Nenhum ramo soma PIB, aprovação ou intenção de voto (plano §10). O treino entra no fim do mês: o nível novo vale
 * a partir do mês seguinte.
 */

export const SKILL_MAX_LEVEL = 3;
/** Personagem quando o cenário não tem identidade de administração (sem bloco `elections`). */
export const DEFAULT_CHARACTER_ID = 'presidente';

const LEVEL_PARAMS = ['treino_nivel_1', 'treino_nivel_2', 'treino_nivel_3'] as const;

/** Nome do ramo para notas e interface. */
export const SKILL_LABEL: Readonly<Record<SkillBranchId, string>> = {
  negociacao: 'Negociação',
  federalismo: 'Federalismo',
  ciencia_tecnologia: 'Ciência e tecnologia',
  diplomacia: 'Diplomacia',
};

export function isSkillBranch(value: unknown): value is SkillBranchId {
  return typeof value === 'string' && (SKILL_BRANCH_IDS as readonly string[]).includes(value);
}

/** Quem o jogador controla agora: as habilidades acompanham a pessoa (EX-17). */
export function controlledCharacterId(state: Pick<GameState, 'control'>): string {
  return state.control?.controlledCharacterId ?? DEFAULT_CHARACTER_ID;
}

const NO_TRAINING: CharacterSkills = { negociacao: 0, federalismo: 0, ciencia_tecnologia: 0, diplomacia: 0 };

/** Meses de treino do personagem controlado. */
export function characterSkills(state: Pick<GameState, 'control' | 'skills'>): CharacterSkills {
  return { ...NO_TRAINING, ...state.skills?.characters[controlledCharacterId(state)] };
}

/** Nível dado o treino acumulado: quantos limiares foram cruzados (0 a 3). */
export function levelFromTraining(months: number): number {
  return LEVEL_PARAMS.filter((name) => months >= skillParam(name)).length;
}

export function skillLevel(state: Pick<GameState, 'control' | 'skills'>, branch: SkillBranchId): number {
  return levelFromTraining(characterSkills(state)[branch]);
}

/** Meses de treino que faltam para o próximo nível (`null` no nível máximo). */
export function monthsToNextLevel(months: number): number | null {
  const next = LEVEL_PARAMS.find((name) => months < skillParam(name));
  return next ? skillParam(next) - months : null;
}

/** Fração do custo de capital de uma negociação que a habilidade poupa (0 sem habilidade). */
export function negotiationDiscount(state: Pick<GameState, 'control' | 'skills'>): number {
  return skillLevel(state, 'negociacao') * skillParam('negociacao_desconto');
}

/** Probabilidade somada à adesão de cada governador a convênio (0 sem habilidade). */
export function federalismAdhesionBonus(state: Pick<GameState, 'control' | 'skills'>): number {
  return skillLevel(state, 'federalismo') * skillParam('federalismo_adesao');
}

/** Fração da chance de falha de um estágio da árvore de tecnologias que a habilidade evita (0 sem habilidade). */
export function researchFailureReduction(state: Pick<GameState, 'control' | 'skills'>): number {
  return skillLevel(state, 'ciencia_tecnologia') * skillParam('ciencia_falha');
}

/** Avanço somado a cada rodada de negociação de acordo comercial, em rodadas (0 sem habilidade). */
export function diplomacyProgressBonus(state: Pick<GameState, 'control' | 'skills'>): number {
  return skillLevel(state, 'diplomacia') * skillParam('diplomacia_avanco');
}

/** O ramo ainda pode ser treinado (nível abaixo do máximo). */
export function canTrain(state: Pick<GameState, 'control' | 'skills'>, branch: SkillBranchId): boolean {
  return skillLevel(state, branch) < SKILL_MAX_LEVEL;
}

/**
 * Etapa do mês: aplica o treino aceito (no máximo um por mês, pela chave da ação de agenda). Soma um mês de treino ao
 * ramo e agenda o custo em capital político para a opinião pública do mesmo mês (a dona do capital).
 */
export const skillsStep: MonthStep = (state, ctx) => {
  const decision = ctx.decisions.find((d) => d.policyId === TRAIN_SKILL_ACTION_ID);
  const branch = decision?.params?.branch;
  if (!decision || !isSkillBranch(branch) || !canTrain(state, branch)) return { state, contributions: [] };
  const id = controlledCharacterId(state);
  const before = characterSkills(state);
  const trained = { ...before, [branch]: before[branch] + 1 };
  const t = state.monthIndex;
  const cost: ScheduledImpulse = {
    sourceId: `habilidade:treino:${branch}:${t}`,
    label: `Treino: ${SKILL_LABEL[branch]}`,
    target: 'capital_politico',
    delta: -skillParam('treino_capital'),
    startMonth: t,
    endMonth: t,
  };
  const levelBefore = levelFromTraining(before[branch]);
  const levelAfter = levelFromTraining(trained[branch]);
  ctx.draft.notes.push(
    levelAfter > levelBefore
      ? `Habilidade ${SKILL_LABEL[branch]}: nível ${levelAfter} alcançado; vale a partir do próximo mês.`
      : `Habilidade ${SKILL_LABEL[branch]}: mais um mês de treino (${trained[branch]} no total).`,
  );
  return {
    state: {
      ...state,
      skills: { characters: { ...state.skills?.characters, [id]: trained } },
      impulses: [...state.impulses, cost],
    },
    contributions: [],
  };
};
