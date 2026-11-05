import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  PREFERENCE_DEFS,
  PREFERENCE_KEYS,
  type Preferences,
} from './preferences';

/** Leitor de um banco vazio: nenhuma chave gravada. */
const emptyReader = async (_key: string): Promise<unknown> => undefined;

/** Leitor a partir de um objeto `chave da tabela → valor gravado`. */
function readerFrom(values: Record<string, unknown>) {
  return async (key: string): Promise<unknown> => values[key];
}

describe('loadPreferences', () => {
  it('com leitor vazio devolve os padrões', async () => {
    expect(await loadPreferences(emptyReader)).toEqual(DEFAULT_PREFERENCES);
  });

  it('padrões esperados (unidade fiscal em R$ e demais escolhas iniciais)', () => {
    expect(DEFAULT_PREFERENCES.fiscalUnit).toBe('pib');
    expect(DEFAULT_PREFERENCES.theme).toBe('sistema');
    expect(DEFAULT_PREFERENCES.globeFps).toBe(60);
    expect(DEFAULT_PREFERENCES.globeRotationSpeed).toBe(1);
    expect(DEFAULT_PREFERENCES.openLastCampaign).toBe(false);
    // PLANO_SAVES_HISTORICO.md H1: tela acesa e relógio do HUD começam desligados.
    expect(DEFAULT_PREFERENCES.keepScreenAwake).toBe(false);
    expect(DEFAULT_PREFERENCES.hudClock).toBe(false);
    expect(PREFERENCE_DEFS.keepScreenAwake.key).toBe('manter_tela_acesa');
    expect(PREFERENCE_DEFS.hudClock.key).toBe('hud_relogio');
  });

  it('aceita valores válidos gravados', async () => {
    const prefs = await loadPreferences(
      readerFrom({
        tema: 'escuro',
        daltonico: true,
        canhoto: true,
        unidade_fiscal: 'reais',
        globo_fps: 30,
        globo_rotacao: 1.5,
        globo_zoom: 0.5,
        pular_abertura_jornal: true,
        abrir_na_campanha: true,
        ocultar_semente: true,
        manter_tela_acesa: true,
        hud_relogio: true,
      }),
    );
    expect(prefs).toEqual<Preferences>({
      theme: 'escuro',
      colorBlind: true,
      leftHanded: true,
      fiscalUnit: 'reais',
      globeFps: 30,
      globeRotationSpeed: 1.5,
      globeZoomSpeed: 0.5,
      skipNewspaperIntro: true,
      openLastCampaign: true,
      hideSeed: true,
      keepScreenAwake: true,
      hudClock: true,
    });
  });

  it('valor inválido volta ao padrão só da própria chave', async () => {
    const prefs = await loadPreferences(
      readerFrom({
        unidade_fiscal: 'euro',
        tema: 'roxo',
        globo_fps: 45,
        globo_rotacao: 3,
        daltonico: 'sim',
        canhoto: 1,
      }),
    );
    expect(prefs.fiscalUnit).toBe('pib');
    expect(prefs.theme).toBe('sistema');
    expect(prefs.globeFps).toBe(60);
    expect(prefs.globeRotationSpeed).toBe(1);
    expect(prefs.colorBlind).toBe(false);
    expect(prefs.leftHanded).toBe(false);
    // A chave válida ao lado de inválidas continua sendo lida.
  });

  it('valor de tipo errado (ex.: texto onde se espera número) volta ao padrão', async () => {
    const prefs = await loadPreferences(readerFrom({ globo_zoom: '2', unidade_fiscal: null }));
    expect(prefs.globeZoomSpeed).toBe(1);
    expect(prefs.fiscalUnit).toBe('pib');
  });

  it('leitor que lança devolve o padrão da chave, sem impedir as demais', async () => {
    const reader = async (key: string): Promise<unknown> => {
      if (key === 'unidade_fiscal') throw new Error('banco indisponível');
      return key === 'tema' ? 'claro' : undefined;
    };
    const prefs = await loadPreferences(reader);
    expect(prefs.fiscalUnit).toBe('pib');
    expect(prefs.theme).toBe('claro');
  });

  it('leitor que lança para todas as chaves devolve todos os padrões', async () => {
    const reader = async (): Promise<unknown> => {
      throw new Error('falha');
    };
    expect(await loadPreferences(reader)).toEqual(DEFAULT_PREFERENCES);
  });

  it('consulta cada chave da tabela settings uma vez, com a chave definida em PREFERENCE_DEFS', async () => {
    const asked: string[] = [];
    await loadPreferences(async (key) => {
      asked.push(key);
      return undefined;
    });
    expect(asked.sort()).toEqual(PREFERENCE_KEYS.map((k) => PREFERENCE_DEFS[k].key).sort());
  });
});

describe('PREFERENCE_DEFS', () => {
  it('tem uma entrada por preferência, sem chaves repetidas na tabela settings', () => {
    const storageKeys = PREFERENCE_KEYS.map((k) => PREFERENCE_DEFS[k].key);
    expect(new Set(storageKeys).size).toBe(storageKeys.length);
    expect(PREFERENCE_KEYS).toHaveLength(Object.keys(DEFAULT_PREFERENCES).length);
  });

  it('cada padrão é aceito pelo próprio leitor', () => {
    for (const k of PREFERENCE_KEYS) {
      const def = PREFERENCE_DEFS[k];
      expect(def.resolve(def.default)).toEqual(def.default);
    }
  });
});
