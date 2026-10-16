/** Funções puras do personagem no briefing do evento (FASE_07.md, T7). Personagens fictícios. */

/** Prestígio a partir do qual a relação é "boa" ou "ruim" (−100…100). */
export const STANDING_BAND_LIMIT = 30;

export type StandingBand = 'boa' | 'neutra' | 'ruim';

export function standingBand(standing: number): StandingBand {
  if (standing >= STANDING_BAND_LIMIT) return 'boa';
  if (standing <= -STANDING_BAND_LIMIT) return 'ruim';
  return 'neutra';
}

/** Texto da relação com o governo, sempre com a palavra (não só cor). */
export function standingText(standing: number): string {
  return `Relação: ${standingBand(standing)}`;
}

/** Personagem já resolvido para a tela: nome, papel do cenário e prestígio atual. */
export interface CharacterBrief {
  id: string;
  name: string;
  role: string;
  standing: number;
}

/** "Nome — papel", como aparece antes da descrição do evento. */
export function characterHeading(character: Pick<CharacterBrief, 'name' | 'role'>): string {
  return `${character.name} — ${character.role}`;
}
