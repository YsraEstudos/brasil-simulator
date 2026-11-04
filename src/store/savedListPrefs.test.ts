import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SAVED_LIST_PREFS,
  resolveSavedListPrefs,
  SAVED_LIST_FILTERS,
  SAVED_LIST_PREFS_KEY,
  SAVED_LIST_SORTS,
} from './savedListPrefs';

describe('ordem e filtro da lista de saves: preferência guardada', () => {
  it('padrão: mais recentes primeiro, todas as campanhas', () => {
    expect(DEFAULT_SAVED_LIST_PREFS).toEqual({ sort: 'recentes', filter: 'todas' });
    expect(resolveSavedListPrefs(null)).toEqual({ sort: 'recentes', filter: 'todas' });
    expect(resolveSavedListPrefs(undefined)).toEqual({ sort: 'recentes', filter: 'todas' });
  });

  it('chave própria em settings', () => {
    expect(SAVED_LIST_PREFS_KEY).toBe('lista_saves_ordem');
  });

  it('valor que não é objeto (texto, número, lista) volta ao padrão', () => {
    for (const bad of ['nome', 42, 0, true, []]) {
      expect(resolveSavedListPrefs(bad)).toEqual(DEFAULT_SAVED_LIST_PREFS);
    }
  });

  it('objeto parcial: o campo ausente volta ao padrão e o presente é mantido', () => {
    expect(resolveSavedListPrefs({ sort: 'nome' })).toEqual({ sort: 'nome', filter: 'todas' });
    expect(resolveSavedListPrefs({ filter: 'encerradas' })).toEqual({ sort: 'recentes', filter: 'encerradas' });
    expect(resolveSavedListPrefs({})).toEqual(DEFAULT_SAVED_LIST_PREFS);
  });

  it('valores desconhecidos (inclusive com outra capitalização ou o singular) caem no padrão', () => {
    expect(resolveSavedListPrefs({ sort: 'aleatoria', filter: 'xpto' })).toEqual(DEFAULT_SAVED_LIST_PREFS);
    expect(resolveSavedListPrefs({ sort: 'RECENTES', filter: 'Ativas' })).toEqual(DEFAULT_SAVED_LIST_PREFS);
    expect(resolveSavedListPrefs({ sort: 'nome', filter: 'ativa' })).toEqual({ sort: 'nome', filter: 'todas' });
    expect(resolveSavedListPrefs({ sort: null, filter: 7 })).toEqual(DEFAULT_SAVED_LIST_PREFS);
  });

  it('campos extras gravados por engano não passam para a preferência', () => {
    expect(resolveSavedListPrefs({ sort: 'nome', filter: 'ativas', extra: 1 })).toEqual({
      sort: 'nome',
      filter: 'ativas',
    });
  });

  it('todas as combinações válidas voltam iguais', () => {
    for (const sort of SAVED_LIST_SORTS) {
      for (const filter of SAVED_LIST_FILTERS) {
        expect(resolveSavedListPrefs({ sort, filter })).toEqual({ sort, filter });
      }
    }
  });
});
