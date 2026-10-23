import {
  DEFAULT_PROFILE_3D,
  is3dProfile,
  QUALITY_PROFILES,
  rendererOfProfile,
  type Profile3d,
  type ProfileRenderer,
  type QualityProfile,
} from '@/globe/qualityProfiles';

/**
 * Qualidade do mapa regional (PLANO_GLOBO.md §3.1). Fica na tabela `settings`, fora do `GameState`: é escolha do
 * aparelho, não da partida. O jogador escolhe "Automático" ou um perfil fixo; no automático o globo mede os quadros
 * depois de aquecer e guarda o último perfil 3D em que parou (`autoProfile`) para o próximo início já começar nele.
 */

/** Escolha do jogador: o ajuste automático ou um perfil fixo. */
export const MAP_QUALITY_AUTO = 'automatico';
export type MapQualityChoice = typeof MAP_QUALITY_AUTO | QualityProfile;

/** Todas as escolhas válidas, na ordem de exibição. */
export const MAP_QUALITY_CHOICES: readonly MapQualityChoice[] = [MAP_QUALITY_AUTO, ...QUALITY_PROFILES];

/** Padrão: automático, que começa no Equilibrado (os tetos que o globo já tinha: nada muda até medir algo). */
export const DEFAULT_MAP_QUALITY: MapQualityChoice = MAP_QUALITY_AUTO;

/** Chave da escolha em `settings` (JSON: `"automatico"` ou o id de um perfil). */
export const MAP_QUALITY_KEY = 'mapa_qualidade';
/** Chave do último perfil 3D escolhido pelo ajuste automático (JSON: o id do perfil). */
export const MAP_QUALITY_AUTO_KEY = 'mapa_qualidade_auto';
/** Chave da preferência antiga (antes dos perfis): só é lida, uma vez, para migrar. */
export const LEGACY_MAP_RENDERER_KEY = 'mapa_renderizador';

export function isMapQualityChoice(value: unknown): value is MapQualityChoice {
  return (MAP_QUALITY_CHOICES as readonly unknown[]).includes(value);
}

/**
 * Migração do valor antigo de `mapa_renderizador`:
 * - `globe` → Automático. O globo era a escolha 3D única, sem noção de qualidade; o automático parte do Equilibrado
 *   (os mesmos tetos de antes) e só desce se o aparelho não aguentar, que é o que quem escolheu "Globo 3D" quer;
 * - `flat` → Essencial 2D e `flat-light` → Essencial 2D leve (mesmo renderizador, mesmo nome por dentro).
 * Qualquer outro valor não migra (`null`).
 */
export function migrateLegacyRenderer(legacy: unknown): MapQualityChoice | null {
  if (legacy === 'globe') return MAP_QUALITY_AUTO;
  if (legacy === 'flat') return 'essencial-2d';
  if (legacy === 'flat-light') return 'essencial-2d-leve';
  return null;
}

/**
 * Valores lidos do banco → escolha válida. A chave nova vale quando é reconhecida; senão migra a antiga; senão o
 * padrão (valor corrompido ou desconhecido nunca impede abrir o jogo).
 */
export function resolveMapQuality(saved: unknown, legacy: unknown): MapQualityChoice {
  if (isMapQualityChoice(saved)) return saved;
  return migrateLegacyRenderer(legacy) ?? DEFAULT_MAP_QUALITY;
}

/** Último perfil do ajuste automático: só perfis 3D valem (o automático nunca vai para o 2D). */
export function resolveAutoProfile(saved: unknown): Profile3d {
  return is3dProfile(saved) ? saved : DEFAULT_PROFILE_3D;
}

/** O que o mapa desenha dadas a escolha e o último perfil automático. */
export interface MapQualityPlan {
  renderer: ProfileRenderer;
  /** Perfil 3D para o globo (ignorado quando `renderer` é plano). */
  profile3d: Profile3d;
  /** O globo deve medir os quadros e ajustar o perfil sozinho. */
  auto: boolean;
}

export function planMapQuality(choice: MapQualityChoice, autoProfile: Profile3d): MapQualityPlan {
  if (choice === MAP_QUALITY_AUTO) return { renderer: 'globe', profile3d: autoProfile, auto: true };
  return {
    renderer: rendererOfProfile(choice),
    profile3d: is3dProfile(choice) ? choice : autoProfile,
    auto: false,
  };
}

/** Opções de Configurações → Mapa: nome e uma explicação curta, na ordem de exibição. */
export const MAP_QUALITY_OPTIONS: readonly { id: MapQualityChoice; label: string; description: string }[] = [
  {
    id: MAP_QUALITY_AUTO,
    label: 'Automático',
    description:
      'Globo 3D que se ajusta sozinho: o jogo observa a fluidez neste aparelho e sobe ou desce a qualidade, um passo de cada vez.',
  },
  {
    id: 'economico-3d',
    label: 'Econômico 3D',
    description: 'Globo 3D mais leve: menos detalhe de relevo e imagem menos nítida. Para aparelhos fracos.',
  },
  {
    id: 'equilibrado',
    label: 'Equilibrado',
    description: 'Globo 3D com o detalhe padrão do jogo.',
  },
  {
    id: 'alto',
    label: 'Alto',
    description: 'Globo 3D com mais detalhe de relevo e imagem. Pede um aparelho moderno.',
  },
  {
    id: 'essencial-2d',
    label: 'Essencial 2D',
    description: 'O Brasil plano, com siglas e todas as camadas. Não usa gráficos 3D.',
  },
  {
    id: 'essencial-2d-leve',
    label: 'Essencial 2D leve',
    description: 'Só cores e seleção, sem siglas: o mais leve. A lista de estados mostra os números.',
  },
];

/** Nome do perfil 3D para mostrar "agora: …" no modo automático. */
export function profileLabel(profile: QualityProfile): string {
  return MAP_QUALITY_OPTIONS.find((o) => o.id === profile)?.label ?? profile;
}
