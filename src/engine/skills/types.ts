/**
 * Ramos de habilidade (PLANO_EXPANSAO EX-21; F06): os dois iniciais e os dois avançados do R7 (ciência e tecnologia,
 * diplomacia). Cada ramo age por um canal identificável de uma regra que já existe; nenhum soma PIB, aprovação ou
 * intenção de voto.
 */
export const SKILL_BRANCH_IDS = ['negociacao', 'federalismo', 'ciencia_tecnologia', 'diplomacia'] as const;
export type SkillBranchId = (typeof SKILL_BRANCH_IDS)[number];

/** Meses de treino acumulados por ramo. O nível é derivado dos limiares da calibração (fonte única). */
export type CharacterSkills = Record<SkillBranchId, number>;

export interface SkillsState {
  /** Por id de personagem: a habilidade é da pessoa, não do cargo; um sucessor começa do zero. */
  characters: Record<string, CharacterSkills>;
}
