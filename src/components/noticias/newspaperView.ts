import type { NewsItem } from '@/engine';
import { monthLabel } from '@/components/campaign/labels';

import { filterNews, type NewsFilter } from '@/components/tabs/newsView';

/** Funções puras do jornal da mesa de notícias: edições por mês, manchete principal e colunas. Sem React. */

export const NEWSPAPER_NAME = 'O Arauto Nacional';

export interface Edition {
  monthIndex: number;
  /** Número da edição: o mês de jogo, a partir de 1. */
  number: number;
  label: string;
  /** Notícias na ordem em que o motor gravou (prioridade: institucional primeiro). */
  items: NewsItem[];
}

/**
 * Uma edição por mês com notícias, da mais recente para a mais antiga. `news` chega como em
 * `EventsState.news` (mais antiga primeiro); dentro do mês a ordem gravada é a de prioridade do motor.
 */
export function buildEditions(news: readonly NewsItem[]): Edition[] {
  const byMonth = new Map<number, NewsItem[]>();
  for (const item of news) {
    const list = byMonth.get(item.monthIndex);
    if (list) list.push(item);
    else byMonth.set(item.monthIndex, [item]);
  }
  return [...byMonth.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([monthIndex, items]) => ({ monthIndex, number: monthIndex + 1, label: monthLabel(monthIndex), items }));
}

export interface EditionPage {
  lead: NewsItem | undefined;
  others: NewsItem[];
}

/**
 * Posição (0 = a mais recente) da edição que tem a notícia `newsId`; 0 se ela não está em nenhuma edição. É onde o
 * jornal abre quando o jogador toca o marcador da notícia no mapa (PLANO_GLOBO.md §7, PR 11).
 */
export function editionIndexOf(editions: readonly Edition[], newsId: string | undefined): number {
  if (newsId === undefined) return 0;
  return Math.max(
    0,
    editions.findIndex((e) => e.items.some((n) => n.id === newsId)),
  );
}

/**
 * Página da edição no caderno escolhido: a primeira notícia (a de maior prioridade) vira a manchete. Com `focusId` (a
 * notícia aberta pelo mapa) e ela nesta página, é ela a manchete e as demais seguem na ordem.
 */
export function editionPage(edition: Edition | undefined, filter: NewsFilter, focusId?: string): EditionPage {
  if (!edition) return { lead: undefined, others: [] };
  const items = filterNews(edition.items, filter);
  const focused = items.find((n) => n.id === focusId);
  if (!focused) {
    const [lead, ...others] = items;
    return { lead, others };
  }
  return { lead: focused, others: items.filter((n) => n !== focused) };
}

/** Quantas colunas cabem na largura do jornal (em pixels). */
export function newspaperColumns(width: number): 1 | 2 | 3 {
  if (width < 520) return 1;
  // Bem abaixo da largura máxima do jornal na mesa (820, deskOverlay.ts): um tablet deitado comum chega às 3.
  if (width < 720) return 2;
  return 3;
}

/** Tamanho da fonte da manchete principal: cresce com a largura, dentro de limites legíveis. */
export function leadFontSize(width: number): number {
  return Math.round(Math.min(40, Math.max(22, width * 0.052)));
}

/** Largura dos dois botões de virar edição e do espaço entre eles e o título, em pixels. */
const MASTHEAD_BUTTONS = 2 * 44 + 16;
/** Largura média de um caractere do título em relação ao tamanho da fonte (serifa, negrito). */
const TITLE_CHAR_WIDTH = 0.7;

/** Tamanho do nome do jornal: cabe numa linha entre os botões; menor em telas baixas. */
export function mastheadFontSize(width: number, short: boolean): number {
  const fit = (width - MASTHEAD_BUTTONS) / (NEWSPAPER_NAME.length * TITLE_CHAR_WIDTH);
  return Math.round(Math.min(short ? 26 : 40, Math.max(18, fit)));
}

/**
 * Manchete-bomba: ganha a capa inteira da edição (faixa de edição extra, título gigante e foto, se houver).
 * Toda notícia institucional é bomba (CPI, TCU, impeachment, eleições, candidatura); `extraIds` acrescenta
 * notícias pelo `sourceId` (ver `newsPhotos.ts`).
 */
export function isBombshell(item: NewsItem | undefined, extraIds: ReadonlySet<string> = new Set()): boolean {
  if (!item) return false;
  return item.kind === 'institucional' || (item.sourceId !== undefined && extraIds.has(item.sourceId));
}

/** Uma página do jornal: a capa-bomba de uma edição ou a página comum (manchete, colunas e quadros). */
export type NewspaperPage =
  | { kind: 'bomba'; editionIndex: number; item: NewsItem }
  | { kind: 'comum'; editionIndex: number; skip: string | undefined };

/**
 * As páginas na ordem de folhear, da edição mais recente para a mais antiga: a capa-bomba (quando a notícia de
 * maior prioridade é bomba) e depois a página comum, que não repete a bomba. Sem edições, uma página comum vazia.
 */
export function buildPages(editions: readonly Edition[], extraIds: ReadonlySet<string> = new Set()): NewspaperPage[] {
  if (editions.length === 0) return [{ kind: 'comum', editionIndex: 0, skip: undefined }];
  return editions.flatMap((edition, editionIndex): NewspaperPage[] => {
    const lead = edition.items[0];
    if (!lead || !isBombshell(lead, extraIds)) return [{ kind: 'comum', editionIndex, skip: undefined }];
    return [
      { kind: 'bomba', editionIndex, item: lead },
      { kind: 'comum', editionIndex, skip: lead.id },
    ];
  });
}

/**
 * Página e caderno em que o jornal abre na notícia `newsId`, aberta pelo marcador do mapa: a primeira página da edição
 * dela, no caderno "Todas". Sem a notícia, a página mais recente (como antes).
 */
export function focusedView(
  editions: readonly Edition[],
  pages: readonly NewspaperPage[],
  newsId: string | undefined,
): { page: number; filter: NewsFilter } {
  if (newsId === undefined || !editions.some((edition) => edition.items.some((item) => item.id === newsId))) {
    return { page: 0, filter: 'todas' };
  }
  const editionIndex = editionIndexOf(editions, newsId);
  const page = pages.findIndex(
    (p) => p.editionIndex === editionIndex && (p.kind === 'comum' ? p.skip !== newsId : p.item.id === newsId),
  );
  return { page: Math.max(0, page), filter: 'todas' };
}

/**
 * Página comum de uma edição sem a notícia que já foi capa-bomba. Com `focusId` (notícia aberta pelo mapa) e ela nesta
 * página, é ela a manchete.
 */
export function regularPage(
  edition: Edition | undefined,
  filter: NewsFilter,
  skip: string | undefined,
  focusId?: string,
): EditionPage {
  if (!edition) return { lead: undefined, others: [] };
  return editionPage({ ...edition, items: edition.items.filter((i) => i.id !== skip) }, filter, focusId);
}

/** Tamanho do título da capa-bomba: enorme, mas cabendo em poucas linhas. */
export function bombshellFontSize(width: number): number {
  return Math.round(Math.min(78, Math.max(34, width * 0.1)));
}
