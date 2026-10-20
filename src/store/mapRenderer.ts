/**
 * Preferência do renderizador do mapa regional (PLANO_GLOBO.md §3.1 e §3.4). Fica na tabela `settings`, fora do
 * `GameState`: é escolha do aparelho, não da partida.
 */

/** `globe`: globo 3D. `flat`: mapa 2D completo (siglas). `flat-light`: 2D leve (só cores, seleção e lista). */
export const MAP_RENDERERS = ['globe', 'flat', 'flat-light'] as const;
export type MapRendererPref = (typeof MAP_RENDERERS)[number];

export const DEFAULT_MAP_RENDERER: MapRendererPref = 'globe';

/** Chave na tabela `settings`. */
export const MAP_RENDERER_KEY = 'mapa_renderizador';

/** Opções da tela Configurações: nome e uma linha de explicação, na ordem de exibição. */
export const MAP_RENDERER_OPTIONS: readonly { id: MapRendererPref; label: string; description: string }[] = [
  { id: 'globe', label: 'Globo 3D', description: 'O globo girável, com relevo e zoom. Pede mais do aparelho.' },
  {
    id: 'flat',
    label: 'Mapa 2D',
    description: 'O Brasil plano, com siglas e todas as camadas. Não usa gráficos 3D.',
  },
  {
    id: 'flat-light',
    label: 'Mapa 2D leve',
    description: 'Só cores e seleção, sem siglas: o mais leve. A lista de estados mostra os números.',
  },
];

/** Valor lido do banco → preferência válida; qualquer coisa desconhecida ou corrompida volta ao padrão. */
export function resolveMapRenderer(saved: unknown): MapRendererPref {
  return (MAP_RENDERERS as readonly unknown[]).includes(saved) ? (saved as MapRendererPref) : DEFAULT_MAP_RENDERER;
}
