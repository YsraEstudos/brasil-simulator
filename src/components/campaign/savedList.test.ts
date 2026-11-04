import { describe, expect, it } from 'vitest';

import { DEFAULT_SAVED_LIST_PREFS, type SavedListPrefs } from '@/store/savedListPrefs';

import {
  campaignCountLabel,
  deleteFinishedButtonLabel,
  deleteFinishedConfirmMessage,
  deletedResultMessage,
  emptyFilterLabel,
  finishedDeletionSummary,
  savedListCountLabel,
  sortAndFilterCampaigns,
  type SavedListItem,
} from './savedList';

/** Campanha de teste: só os campos que a lista lê. Datas em ISO para a comparação ser a mesma da tela. */
function camp(overrides: Partial<SavedListItem> & { id: string }): SavedListItem {
  return {
    name: 'Campanha',
    status: 'ativa',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastPlayedAt: null,
    pinned: false,
    locked: false,
    ...overrides,
  };
}

const prefs = (sort: SavedListPrefs['sort'], filter: SavedListPrefs['filter'] = 'todas'): SavedListPrefs => ({
  sort,
  filter,
});

const ids = (list: readonly SavedListItem[]) => list.map((c) => c.id);

describe('sortAndFilterCampaigns: filtro', () => {
  const list = [
    camp({ id: 'a', status: 'ativa' }),
    camp({ id: 'b', status: 'encerrada' }),
    camp({ id: 'c', status: 'ativa' }),
    camp({ id: 'd', status: 'encerrada' }),
  ];

  it('"todas" mantém todas as campanhas', () => {
    expect(ids(sortAndFilterCampaigns(list, prefs('nome', 'todas'))).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('"ativas" mostra só status ativa', () => {
    expect(ids(sortAndFilterCampaigns(list, prefs('nome', 'ativas'))).sort()).toEqual(['a', 'c']);
  });

  it('"encerradas" mostra só status encerrada', () => {
    expect(ids(sortAndFilterCampaigns(list, prefs('nome', 'encerradas'))).sort()).toEqual(['b', 'd']);
  });

  it('lista sem nenhuma campanha do filtro devolve lista vazia', () => {
    const onlyActive = [camp({ id: 'x', status: 'ativa' })];
    expect(sortAndFilterCampaigns(onlyActive, prefs('recentes', 'encerradas'))).toEqual([]);
  });
});

describe('sortAndFilterCampaigns: ordem', () => {
  it('recentes usa lastPlayedAt e cai para updatedAt quando não há jogada registrada', () => {
    const list = [
      camp({ id: 'antiga', lastPlayedAt: '2026-01-05T10:00:00.000Z', updatedAt: '2026-01-05T10:00:00.000Z' }),
      // Nunca jogada: vale a atualização, que é mais nova que a jogada da primeira.
      camp({ id: 'sem_jogada', lastPlayedAt: null, updatedAt: '2026-01-10T10:00:00.000Z' }),
      camp({ id: 'recente', lastPlayedAt: '2026-01-20T09:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }),
    ];
    expect(ids(sortAndFilterCampaigns(list, prefs('recentes')))).toEqual(['recente', 'sem_jogada', 'antiga']);
  });

  it('criacao ordena por createdAt, mais nova primeiro, ignorando a última jogada', () => {
    const list = [
      camp({
        id: 'velha_jogada_hoje',
        createdAt: '2026-01-01T00:00:00.000Z',
        lastPlayedAt: '2026-03-01T00:00:00.000Z',
      }),
      camp({ id: 'nova', createdAt: '2026-02-01T00:00:00.000Z' }),
      camp({ id: 'mais_velha', createdAt: '2025-12-01T00:00:00.000Z' }),
    ];
    expect(ids(sortAndFilterCampaigns(list, prefs('criacao')))).toEqual(['nova', 'velha_jogada_hoje', 'mais_velha']);
  });

  it('nome ordena A–Z em pt-BR, sem diferenciar maiúsculas nem acentos', () => {
    const list = [
      camp({ id: '1', name: 'Zeta' }),
      camp({ id: '2', name: 'Bahia' }),
      camp({ id: '3', name: 'Ábaco' }),
      camp({ id: '4', name: 'alfa' }),
    ];
    // "abaco" < "alfa" < "bahia" < "zeta" (ignorando acento e caixa).
    expect(ids(sortAndFilterCampaigns(list, prefs('nome')))).toEqual(['3', '4', '2', '1']);
  });

  it('data inválida não quebra a ordenação', () => {
    const list = [
      camp({ id: 'quebrada', createdAt: 'não é data' }),
      camp({ id: 'ok', createdAt: '2026-01-01T00:00:00.000Z' }),
    ];
    expect(ids(sortAndFilterCampaigns(list, prefs('criacao')))).toEqual(['ok', 'quebrada']);
  });
});

describe('sortAndFilterCampaigns: fixadas e desempate', () => {
  const pinnedOld = camp({
    id: 'fixada_antiga',
    name: 'Zulu',
    createdAt: '2025-01-01T00:00:00.000Z',
    lastPlayedAt: '2025-01-01T00:00:00.000Z',
    pinned: true,
  });
  const recentNew = camp({
    id: 'nova',
    name: 'Alfa',
    createdAt: '2026-06-01T00:00:00.000Z',
    lastPlayedAt: '2026-06-01T00:00:00.000Z',
  });
  const middle = camp({
    id: 'meio',
    name: 'Mike',
    createdAt: '2026-03-01T00:00:00.000Z',
    lastPlayedAt: '2026-03-01T00:00:00.000Z',
  });
  const pinnedNew = camp({
    id: 'fixada_nova',
    name: 'Bravo',
    createdAt: '2026-05-01T00:00:00.000Z',
    lastPlayedAt: '2026-05-01T00:00:00.000Z',
    pinned: true,
  });
  const list = [recentNew, middle, pinnedOld, pinnedNew];

  it('fixadas ficam no topo em qualquer ordem', () => {
    for (const sort of ['recentes', 'criacao', 'nome'] as const) {
      const out = ids(sortAndFilterCampaigns(list, prefs(sort)));
      expect(out.slice(0, 2).sort()).toEqual(['fixada_antiga', 'fixada_nova']);
      expect(out.slice(2).sort()).toEqual(['meio', 'nova']);
    }
  });

  it('dentro do grupo de fixadas e do grupo de não fixadas vale a ordem escolhida', () => {
    // Por "recentes": fixada_nova (mai) antes de fixada_antiga (jan); depois nova (jun) antes de meio (mar).
    expect(ids(sortAndFilterCampaigns(list, prefs('recentes')))).toEqual([
      'fixada_nova',
      'fixada_antiga',
      'nova',
      'meio',
    ]);
    // Por nome: Bravo antes de Zulu entre as fixadas; Alfa antes de Mike entre as demais.
    expect(ids(sortAndFilterCampaigns(list, prefs('nome')))).toEqual(['fixada_nova', 'fixada_antiga', 'nova', 'meio']);
    // Por criação: fixada_nova (mai) antes de fixada_antiga (2025); nova (jun) antes de meio (mar).
    expect(ids(sortAndFilterCampaigns(list, prefs('criacao')))).toEqual([
      'fixada_nova',
      'fixada_antiga',
      'nova',
      'meio',
    ]);
  });

  it('a fixação vale mesmo quando o filtro deixa só parte da lista', () => {
    const encerradas = [
      camp({ id: 'enc_livre', status: 'encerrada', name: 'Alfa' }),
      camp({ id: 'enc_fixa', status: 'encerrada', name: 'Zulu', pinned: true }),
    ];
    expect(ids(sortAndFilterCampaigns(encerradas, prefs('nome', 'encerradas')))).toEqual(['enc_fixa', 'enc_livre']);
  });

  it('empates de data e de nome vão para o id, em ordem estável', () => {
    const iguais = [
      camp({ id: 'c', name: 'Mesmo', createdAt: '2026-01-01T00:00:00.000Z' }),
      camp({ id: 'a', name: 'Mesmo', createdAt: '2026-01-01T00:00:00.000Z' }),
      camp({ id: 'b', name: 'Mesmo', createdAt: '2026-01-01T00:00:00.000Z' }),
    ];
    for (const sort of ['recentes', 'criacao', 'nome'] as const) {
      expect(ids(sortAndFilterCampaigns(iguais, prefs(sort)))).toEqual(['a', 'b', 'c']);
    }
  });
});

describe('sortAndFilterCampaigns: imutabilidade', () => {
  it('não muda a lista de entrada nem os objetos, e devolve um array novo', () => {
    const list = [camp({ id: 'b', name: 'Beta', pinned: false }), camp({ id: 'a', name: 'Alfa', pinned: true })];
    const snapshot = JSON.stringify(list);
    const out = sortAndFilterCampaigns(list, prefs('nome'));
    expect(JSON.stringify(list)).toBe(snapshot);
    expect(out).not.toBe(list);
    expect(ids(out)).toEqual(['a', 'b']);
    expect(list.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('usa os padrões de DEFAULT_SAVED_LIST_PREFS sem alterá-los', () => {
    const before = { ...DEFAULT_SAVED_LIST_PREFS };
    sortAndFilterCampaigns([camp({ id: 'x' })], DEFAULT_SAVED_LIST_PREFS);
    expect(DEFAULT_SAVED_LIST_PREFS).toEqual(before);
  });
});

describe('finishedDeletionSummary', () => {
  it('conta encerradas sem cadeado e encerradas com cadeado; ativas não entram', () => {
    const list = [
      camp({ id: '1', status: 'encerrada' }),
      camp({ id: '2', status: 'encerrada', locked: true }),
      camp({ id: '3', status: 'encerrada' }),
      camp({ id: '4', status: 'ativa' }),
      camp({ id: '5', status: 'ativa', locked: true }),
    ];
    expect(finishedDeletionSummary(list)).toEqual({ deletable: 2, locked: 1 });
  });

  it('lista sem encerradas zera a contagem', () => {
    expect(finishedDeletionSummary([camp({ id: '1' }), camp({ id: '2', locked: true })])).toEqual({
      deletable: 0,
      locked: 0,
    });
    expect(finishedDeletionSummary([])).toEqual({ deletable: 0, locked: 0 });
  });
});

describe('textos com pluralização', () => {
  it('campaignCountLabel: singular só para 1', () => {
    expect(campaignCountLabel(0)).toBe('0 campanhas');
    expect(campaignCountLabel(1)).toBe('1 campanha');
    expect(campaignCountLabel(2)).toBe('2 campanhas');
  });

  it('savedListCountLabel: total com "Todas"; com filtro, "2 de 5 campanhas"', () => {
    expect(savedListCountLabel(1, 1, 'todas')).toBe('1 campanha salva');
    expect(savedListCountLabel(5, 5, 'todas')).toBe('5 campanhas salvas');
    expect(savedListCountLabel(2, 5, 'ativas')).toBe('2 de 5 campanhas');
    expect(savedListCountLabel(1, 1, 'encerradas')).toBe('1 de 1 campanha');
    expect(savedListCountLabel(0, 3, 'encerradas')).toBe('0 de 3 campanhas');
  });

  it('emptyFilterLabel por filtro', () => {
    expect(emptyFilterLabel('encerradas')).toBe('Nenhuma campanha encerrada.');
    expect(emptyFilterLabel('ativas')).toBe('Nenhuma campanha ativa.');
  });

  it('botão e confirmação do lote', () => {
    expect(deleteFinishedButtonLabel(1)).toBe('Apagar 1 campanha encerrada');
    expect(deleteFinishedButtonLabel(3)).toBe('Apagar 3 campanhas encerradas');
    expect(deleteFinishedConfirmMessage(3, 0)).toBe('Apagar 3 campanhas encerradas? Isso não pode ser desfeito.');
    expect(deleteFinishedConfirmMessage(1, 0)).toBe('Apagar 1 campanha encerrada? Isso não pode ser desfeito.');
    expect(deleteFinishedConfirmMessage(3, 1)).toBe(
      'Apagar 3 campanhas encerradas? Isso não pode ser desfeito. 1 campanha com cadeado será mantida.',
    );
    expect(deleteFinishedConfirmMessage(2, 2)).toBe(
      'Apagar 2 campanhas encerradas? Isso não pode ser desfeito. 2 campanhas com cadeado serão mantidas.',
    );
  });

  it('aviso do resultado', () => {
    expect(deletedResultMessage(1, 0)).toBe('1 campanha apagada.');
    expect(deletedResultMessage(3, 0)).toBe('3 campanhas apagadas.');
    expect(deletedResultMessage(3, 1)).toBe('3 campanhas apagadas. 1 campanha com cadeado foi mantida.');
    expect(deletedResultMessage(2, 2)).toBe('2 campanhas apagadas. 2 campanhas com cadeado foram mantidas.');
    expect(deletedResultMessage(0, 0)).toBe('Nenhuma campanha apagada.');
  });
});
