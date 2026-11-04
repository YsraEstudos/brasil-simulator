import type { CampaignSummary } from '@/database/campaignRepository';
import type { SavedListFilter, SavedListPrefs, SavedListSort } from '@/store/savedListPrefs';

/**
 * Lista de campanhas salvas da tela CARREGAR JOGO: filtro, ordem, contagens e textos com pluralização.
 * Funções puras (sem React, sem relógio próprio): a tela só monta a interface em cima do que sai daqui.
 */

/** Campos do cartão que a lista usa; `CampaignSummary` atende por inteiro. */
export type SavedListItem = Pick<
  CampaignSummary,
  'id' | 'name' | 'status' | 'createdAt' | 'updatedAt' | 'lastPlayedAt' | 'pinned' | 'locked'
>;

export const SAVED_LIST_SORT_LABEL: Record<SavedListSort, string> = {
  recentes: 'Última jogada',
  criacao: 'Criação',
  nome: 'Nome',
};

export const SAVED_LIST_FILTER_LABEL: Record<SavedListFilter, string> = {
  todas: 'Todas',
  ativas: 'Ativas',
  encerradas: 'Encerradas',
};

function matchesFilter(c: SavedListItem, filter: SavedListFilter): boolean {
  if (filter === 'ativas') return c.status === 'ativa';
  if (filter === 'encerradas') return c.status === 'encerrada';
  return true;
}

/** Data inválida vai para o fim da ordem por data (nunca gera NaN no comparador). */
function timeOf(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/** Mais recente primeiro. */
function newestFirst(a: number, b: number): number {
  if (a === b) return 0;
  return a > b ? -1 : 1;
}

function compareIds(a: SavedListItem, b: SavedListItem): number {
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

function compareBySort(sort: SavedListSort): (a: SavedListItem, b: SavedListItem) => number {
  switch (sort) {
    case 'criacao':
      return (a, b) => newestFirst(timeOf(a.createdAt), timeOf(b.createdAt));
    case 'nome':
      return (a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
    case 'recentes':
    default:
      return (a, b) => newestFirst(timeOf(a.lastPlayedAt ?? a.updatedAt), timeOf(b.lastPlayedAt ?? b.updatedAt));
  }
}

/**
 * Filtra e ordena as campanhas. Fixadas (`pinned`) vêm sempre antes das demais, e dentro de cada grupo vale a
 * ordem escolhida. Empates vão por `id`, para a ordem ser estável entre atualizações. Não altera `list`.
 */
export function sortAndFilterCampaigns<T extends SavedListItem>(list: readonly T[], prefs: SavedListPrefs): T[] {
  const byOrder = compareBySort(prefs.sort);
  return list
    .filter((c) => matchesFilter(c, prefs.filter))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || byOrder(a, b) || compareIds(a, b));
}

/** Quantas campanhas encerradas podem ser apagadas em lote e quantas estão protegidas por cadeado. */
export function finishedDeletionSummary(list: readonly SavedListItem[]): { deletable: number; locked: number } {
  let deletable = 0;
  let locked = 0;
  for (const c of list) {
    if (c.status !== 'encerrada') continue;
    if (c.locked) locked += 1;
    else deletable += 1;
  }
  return { deletable, locked };
}

/** "1 campanha" / "2 campanhas" / "0 campanhas". */
export function campaignCountLabel(n: number): string {
  return `${n} ${n === 1 ? 'campanha' : 'campanhas'}`;
}

/** Contagem do topo da lista: total com o filtro "Todas"; com filtro, "2 de 5 campanhas". */
export function savedListCountLabel(shown: number, total: number, filter: SavedListFilter): string {
  if (filter === 'todas') return total === 1 ? '1 campanha salva' : `${total} campanhas salvas`;
  return `${shown} de ${campaignCountLabel(total)}`;
}

/** Texto quando o filtro não deixa nenhuma campanha à mostra. */
export function emptyFilterLabel(filter: SavedListFilter): string {
  if (filter === 'ativas') return 'Nenhuma campanha ativa.';
  if (filter === 'encerradas') return 'Nenhuma campanha encerrada.';
  return 'Nenhuma campanha salva.';
}

/** Rótulo do botão de apagar em lote: "Apagar 3 campanhas encerradas" / "Apagar 1 campanha encerrada". */
export function deleteFinishedButtonLabel(deletable: number): string {
  return `Apagar ${campaignCountLabel(deletable)} ${deletable === 1 ? 'encerrada' : 'encerradas'}`;
}

function lockedKeptNotice(locked: number): string {
  return locked === 1 ? '1 campanha com cadeado será mantida.' : `${locked} campanhas com cadeado serão mantidas.`;
}

/** Texto da confirmação de apagar em lote. Só menciona os protegidos quando há algum. */
export function deleteFinishedConfirmMessage(deletable: number, locked: number): string {
  const head = `Apagar ${campaignCountLabel(deletable)} ${deletable === 1 ? 'encerrada' : 'encerradas'}? Isso não pode ser desfeito.`;
  return locked > 0 ? `${head} ${lockedKeptNotice(locked)}` : head;
}

/** Aviso depois do lote: "3 campanhas apagadas." (com a nota dos protegidos, quando houver). */
export function deletedResultMessage(deleted: number, keptLocked: number): string {
  if (deleted === 0) return 'Nenhuma campanha apagada.';
  const head = `${campaignCountLabel(deleted)} ${deleted === 1 ? 'apagada' : 'apagadas'}.`;
  if (keptLocked === 0) return head;
  const kept =
    keptLocked === 1 ? '1 campanha com cadeado foi mantida.' : `${keptLocked} campanhas com cadeado foram mantidas.`;
  return `${head} ${kept}`;
}
