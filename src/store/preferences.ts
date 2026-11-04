/**
 * Registro das preferências do jogador (PLANO_MENU_SAVES_CONFIG.md, Fases M6–M7, base da M9 "Restaurar padrões").
 * Cada preferência tem uma chave na tabela `settings` (fora do save), um valor padrão e uma função que lê o valor
 * gravado: valor ausente, corrompido ou de outra versão volta ao padrão, sem impedir o app de abrir.
 *
 * As preferências antigas (tamanho do texto, qualidade do mapa, hora do dia, nuvens, reduzir movimento) continuam com
 * leitura própria no `gameStore`; a M9 as junta a este registro.
 */

export const THEME_CHOICES = ['sistema', 'claro', 'escuro'] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

/** Exibição dos valores fiscais: em R$ (bilhões) ou como fração do PIB. Só exibição; o motor segue em R$. */
export const FISCAL_UNITS = ['reais', 'pib'] as const;
export type FiscalUnit = (typeof FISCAL_UNITS)[number];

export const GLOBE_FPS_CHOICES = [30, 60] as const;
export type GlobeFps = (typeof GLOBE_FPS_CHOICES)[number];

/** Multiplicadores de velocidade do globo (rotação e zoom): passos discretos para o controle deslizante. */
export const GLOBE_SPEED_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export interface Preferences {
  /** Tema das telas fora do Painel; o HUD do Painel é sempre escuro. */
  theme: ThemeChoice;
  /** Modo para daltônicos: azul/laranja no lugar de verde/vermelho e sinais `+`/`−` sempre visíveis. */
  colorBlind: boolean;
  /** Modo canhoto: espelha os trilhos laterais e a doca do Painel. */
  leftHanded: boolean;
  fiscalUnit: FiscalUnit;
  /** Teto de quadros por segundo das animações contínuas do globo. */
  globeFps: GlobeFps;
  /** Multiplicador da velocidade de rotação do globo (um de `GLOBE_SPEED_STEPS`). */
  globeRotationSpeed: number;
  /** Multiplicador da velocidade de zoom do globo (um de `GLOBE_SPEED_STEPS`). */
  globeZoomSpeed: number;
  /** Pula a abertura do jornal 3D nas Notícias. */
  skipNewspaperIntro: boolean;
  /** Abre o app direto na última campanha ativa, sem passar pelo menu. */
  openLastCampaign: boolean;
}

export type PreferenceKey = keyof Preferences;

interface PreferenceDef<T> {
  /** Chave na tabela `settings`. */
  key: string;
  default: T;
  resolve(raw: unknown): T;
}

const oneOf =
  <T>(choices: readonly T[], fallback: T) =>
  (raw: unknown): T =>
    (choices as readonly unknown[]).includes(raw) ? (raw as T) : fallback;

const bool =
  (fallback: boolean) =>
  (raw: unknown): boolean =>
    typeof raw === 'boolean' ? raw : fallback;

export const PREFERENCE_DEFS: { [K in PreferenceKey]: PreferenceDef<Preferences[K]> } = {
  theme: { key: 'tema', default: 'sistema', resolve: oneOf(THEME_CHOICES, 'sistema') },
  colorBlind: { key: 'daltonico', default: false, resolve: bool(false) },
  leftHanded: { key: 'canhoto', default: false, resolve: bool(false) },
  // Padrão em % do PIB: é como o jogo já mostrava os fluxos fiscais antes desta opção.
  fiscalUnit: { key: 'unidade_fiscal', default: 'pib', resolve: oneOf(FISCAL_UNITS, 'pib') },
  globeFps: { key: 'globo_fps', default: 60, resolve: oneOf(GLOBE_FPS_CHOICES, 60) },
  globeRotationSpeed: { key: 'globo_rotacao', default: 1, resolve: oneOf(GLOBE_SPEED_STEPS, 1) },
  globeZoomSpeed: { key: 'globo_zoom', default: 1, resolve: oneOf(GLOBE_SPEED_STEPS, 1) },
  skipNewspaperIntro: { key: 'pular_abertura_jornal', default: false, resolve: bool(false) },
  openLastCampaign: { key: 'abrir_na_campanha', default: false, resolve: bool(false) },
};

export const PREFERENCE_KEYS = Object.keys(PREFERENCE_DEFS) as PreferenceKey[];

export const DEFAULT_PREFERENCES: Preferences = Object.fromEntries(
  PREFERENCE_KEYS.map((k) => [k, PREFERENCE_DEFS[k].default]),
) as unknown as Preferences;

/** Lê todas as preferências a partir de um leitor de valores gravados (o banco, nos testes um objeto). */
export async function loadPreferences(read: (key: string) => Promise<unknown>): Promise<Preferences> {
  const prefs = { ...DEFAULT_PREFERENCES } as Record<PreferenceKey, unknown>;
  for (const k of PREFERENCE_KEYS) {
    try {
      prefs[k] = PREFERENCE_DEFS[k].resolve(await read(PREFERENCE_DEFS[k].key));
    } catch {
      prefs[k] = PREFERENCE_DEFS[k].default;
    }
  }
  return prefs as unknown as Preferences;
}
