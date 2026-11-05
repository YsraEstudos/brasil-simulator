/**
 * Identidade do save (PLANO_SAVES_HISTORICO.md H2): limites e valores aceitos do bloco de notas (D31) e da cor de
 * destaque (D44). Ficam em `src/types` porque o banco e a interface usam os mesmos.
 */

/** Tamanho máximo do bloco de notas, em unidades UTF-16. */
export const CAMPAIGN_NOTES_MAX = 2000;

/** Cores de destaque do cartão do save, na ordem de exibição; as mesmas do CHECK da migração 11. */
export const CAMPAIGN_ACCENTS = ['dourado', 'verde', 'azul', 'vermelho'] as const;
export type CampaignAccent = (typeof CAMPAIGN_ACCENTS)[number];

export function isCampaignAccent(value: unknown): value is CampaignAccent {
  return typeof value === 'string' && (CAMPAIGN_ACCENTS as readonly string[]).includes(value);
}
