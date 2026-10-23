import { LOD_TEXEL_THRESHOLD, MAX_CONCURRENT_LOADS, MAX_LEVEL, TILE_CACHE_BLOCKS } from './config';

/**
 * Perfis de qualidade do mapa (PLANO_GLOBO.md §3.1). Módulo puro (sem three/React/SQLite): a escolha do jogador vive
 * em `src/store/mapQuality.ts`; o globo só lê o `GlobeBudget` do perfil 3D ativo.
 *
 * Os dois perfis 2D não têm orçamento de GPU: eles escolhem o renderizador plano (completo ou leve). Os três perfis
 * 3D usam o mesmo globo e os mesmos assets (nada é regerado); mudam só os tetos abaixo.
 */

/** Perfis que desenham o globo (WebGL). A ordem é do mais leve para o mais pesado: o ajuste automático anda por ela. */
export const PROFILES_3D = ['economico-3d', 'equilibrado', 'alto'] as const;
export type Profile3d = (typeof PROFILES_3D)[number];

/** Perfis que desenham o mapa plano (SVG, sem WebGL). */
export const PROFILES_2D = ['essencial-2d', 'essencial-2d-leve'] as const;
export type Profile2d = (typeof PROFILES_2D)[number];

/** Todos os perfis, na ordem de exibição em Configurações: do mais leve ao mais pesado. */
export const QUALITY_PROFILES = [...PROFILES_2D, ...PROFILES_3D] as const;
export type QualityProfile = (typeof QUALITY_PROFILES)[number];

/** Perfil 3D usado quando nada foi medido nem escolhido: o comportamento atual do globo (nenhuma mudança). */
export const DEFAULT_PROFILE_3D: Profile3d = 'equilibrado';

/** Renderizador que cada perfil pede ao `MapSurface`. */
export type ProfileRenderer = 'globe' | 'flat' | 'flat-light';

export function rendererOfProfile(profile: QualityProfile): ProfileRenderer {
  if (profile === 'essencial-2d') return 'flat';
  if (profile === 'essencial-2d-leve') return 'flat-light';
  return 'globe';
}

export function is3dProfile(value: unknown): value is Profile3d {
  return (PROFILES_3D as readonly unknown[]).includes(value);
}

/**
 * Efeitos visuais que o perfil PERMITE. Reservados: nada os lê ainda. Nuvens e luzes entram nos PRs 6 e 10 do plano,
 * que consultam estes booleanos em vez de criar a própria régua de aparelho.
 */
export interface GlobeEffects {
  /** Nuvens estáticas sobre o Brasil (PR 10). Desligadas no Econômico (§3.1). */
  clouds: boolean;
  /** Nuvens animadas, no máximo 30 qps (PR 10). Só no Alto. */
  animatedClouds: boolean;
  /** Textura de luzes noturnas recortada para o Brasil (PR 6, "se medida"). Só no Alto. As luzes por pontos valem em todos. */
  cityLightsTexture: boolean;
}

/** Tetos de recursos do globo para um perfil 3D. */
export interface GlobeBudget {
  /** Máximo de blocos (atlas de tiles) na GPU. O bloco raiz nunca é descartado e conta neste total. */
  tileCacheBlocks: number;
  /** Máximo de blocos sendo baixados e decodificados ao mesmo tempo. */
  maxConcurrentLoads: number;
  /** Px de tela por texel acima do qual um tile é subdividido: maior = menos detalhe, menos tiles. */
  lodTexelThreshold: number;
  /** Nível máximo de tile desenhado (`0…MAX_LEVEL`; os assets só vão até `MAX_LEVEL`). */
  maxLevel: number;
  /** Teto da razão de pixels do Canvas. Vale na web; no nativo o expo-gl desenha na resolução do aparelho. */
  dprCap: number;
  effects: GlobeEffects;
}

/** Razão de pixels máxima do Equilibrado: o padrão do R3F (`dpr = [1, 2]`), ou seja, o que o globo já usa hoje. */
const DPR_CAP_BALANCED = 2;
/** Econômico: 1,25 em vez de 2 desenha ~60% menos pixels numa tela de densidade 2 (o custo de preenchimento cai junto). */
const DPR_CAP_ECONOMIC = 1.25;

/** Econômico: 12 blocos (~60% do atual; de 107 MiB para ~64 MiB no pior caso de cor com mipmaps). */
const ECONOMIC_CACHE_BLOCKS = 12;
/** Econômico: 2 downloads/decodificações simultâneas, para o pico de CPU e memória na chegada dos tiles ser menor. */
const ECONOMIC_CONCURRENT_LOADS = 2;
/** Econômico: um texel pode ocupar até 1,5 px antes de dividir o tile (um pouco mais macio, bem menos tiles). */
const ECONOMIC_LOD_THRESHOLD = 1.5;
/** Econômico: para um nível antes do máximo (o último nível quadruplica os tiles e só aparece em zoom muito próximo). */
const ECONOMIC_MAX_LEVEL = MAX_LEVEL - 1;

/** Alto: 8 blocos a mais que o atual (~40%): cabe o Brasil inteiro em nível médio mais um estado em detalhe. */
const HIGH_CACHE_BLOCKS = TILE_CACHE_BLOCKS + 8;
/** Alto: subdivide um pouco antes (0,75 px por texel). Só vale se a medição sustentar (o ajuste automático desce se não). */
const HIGH_LOD_THRESHOLD = 0.75;

/**
 * Orçamento de cada perfil 3D. O Equilibrado reaproveita as constantes de `config.ts` (sem número novo: nenhuma
 * mudança de comportamento). O Alto sobe só onde é seguro: o cache e o LOD (o nível máximo e a razão de pixels já
 * estão no teto dos assets e do expo-gl).
 */
export const GLOBE_BUDGETS: Readonly<Record<Profile3d, GlobeBudget>> = {
  'economico-3d': {
    tileCacheBlocks: ECONOMIC_CACHE_BLOCKS,
    maxConcurrentLoads: ECONOMIC_CONCURRENT_LOADS,
    lodTexelThreshold: ECONOMIC_LOD_THRESHOLD,
    maxLevel: ECONOMIC_MAX_LEVEL,
    dprCap: DPR_CAP_ECONOMIC,
    effects: { clouds: false, animatedClouds: false, cityLightsTexture: false },
  },
  equilibrado: {
    tileCacheBlocks: TILE_CACHE_BLOCKS,
    maxConcurrentLoads: MAX_CONCURRENT_LOADS,
    lodTexelThreshold: LOD_TEXEL_THRESHOLD,
    maxLevel: MAX_LEVEL,
    dprCap: DPR_CAP_BALANCED,
    effects: { clouds: true, animatedClouds: false, cityLightsTexture: false },
  },
  alto: {
    tileCacheBlocks: HIGH_CACHE_BLOCKS,
    maxConcurrentLoads: MAX_CONCURRENT_LOADS,
    lodTexelThreshold: HIGH_LOD_THRESHOLD,
    maxLevel: MAX_LEVEL,
    dprCap: DPR_CAP_BALANCED,
    effects: { clouds: true, animatedClouds: true, cityLightsTexture: true },
  },
};

export function budgetOf(profile: Profile3d): GlobeBudget {
  return GLOBE_BUDGETS[profile];
}

/** Um nível para o lado pedido, sem passar das pontas (o ajuste automático nunca pula perfis). */
export function neighborProfile(profile: Profile3d, direction: 'down' | 'up'): Profile3d {
  const i = PROFILES_3D.indexOf(profile) + (direction === 'up' ? 1 : -1);
  return PROFILES_3D[Math.min(PROFILES_3D.length - 1, Math.max(0, i))];
}
