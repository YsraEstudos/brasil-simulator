import type { ImageProps } from 'expo-image';

/**
 * Fotos das capas-bomba do jornal, pelo `sourceId` da notícia (id do evento de origem, ou `eleicao_geral`,
 * `eleicao_municipal`, `declaracao_reeleicao`). Para pôr uma foto numa capa:
 *
 * 1. salve a imagem em `assets/images/jornal/` (JPG ou PNG, de preferência em paisagem, ~1600 px de largura);
 * 2. acrescente uma linha aqui, por exemplo:
 *    `eleicao_geral: { photo: require('@/assets/images/jornal/eleicao.jpg'), caption: 'Apuração em Brasília' },`
 *
 * Uma notícia com entrada aqui vira capa-bomba mesmo que não seja institucional (ver `isBombshell`). Imagens só
 * fictícias ou de uso livre: nada de logotipos oficiais nem fotos de pessoas reais (AI_INSTRUCTIONS.md §8).
 */
export interface FrontPagePhoto {
  photo?: ImageProps['source'];
  /** Legenda curta sob a foto. */
  caption?: string;
}

export const FRONT_PAGE_PHOTOS: Record<string, FrontPagePhoto> = {};

/** `sourceId`s que viram capa-bomba por terem entrada acima. */
export const FRONT_PAGE_IDS: ReadonlySet<string> = new Set(Object.keys(FRONT_PAGE_PHOTOS));
