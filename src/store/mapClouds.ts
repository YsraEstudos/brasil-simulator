/**
 * Nuvens do mapa (PLANO_GLOBO.md §4.2): ligar ou desligar. Fica na tabela `settings`, fora do `GameState`: é escolha do
 * aparelho, só visual. Desligadas, o globo nem desenha a malha das nuvens (nenhuma chamada de desenho) e o mapa 2D não
 * mostra os ícones de chuva; os dados de chuva e seca continuam nas camadas, na lista e no cartão. Os perfis de
 * qualidade ainda mandam: o Econômico não tem nuvens mesmo com a opção ligada.
 */

/** Chave em `settings` (JSON: `true` ou `false`). */
export const MAP_CLOUDS_KEY = 'mapa_nuvens';

/** Padrão: ligadas (o perfil de qualidade decide se o aparelho as desenha). */
export const DEFAULT_MAP_CLOUDS = true;

/** Valor lido do banco → escolha válida; qualquer coisa que não seja booleano volta ao padrão. */
export function resolveMapClouds(saved: unknown): boolean {
  return typeof saved === 'boolean' ? saved : DEFAULT_MAP_CLOUDS;
}

/** Texto de Configurações → Nuvens. */
export const MAP_CLOUDS_DESCRIPTION =
  'Nuvens sobre o Brasil: mais densas e cinzentas onde chove acima do normal. Só visual. Não aparecem no perfil ' +
  'Econômico e no Alto andam devagar; no mapa 2D viram um ícone por estado com chuva acima do normal.';
