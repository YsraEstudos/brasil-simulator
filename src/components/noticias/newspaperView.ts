import { offsetOfKey, type NewsItem } from '@/engine';
import { careerTurnLabel, monthLabel } from '@/components/campaign/labels';

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
  const byMonth = new Map<string, NewsItem[]>();
  for (const item of news) {
    const key = item.careerPeriod ? `career:${item.careerPeriod}` : `government:${item.monthIndex}`;
    const list = byMonth.get(key);
    if (list) list.push(item);
    else byMonth.set(key, [item]);
  }
  return [...byMonth.entries()]
    .sort((a, b) => {
      const time = (item: NewsItem) => (item.careerPeriod ? offsetOfKey(item.careerPeriod) : item.monthIndex);
      return time(b[1][0]) - time(a[1][0]);
    })
    .map(([, items]) => {
      const item = items[0];
      return {
        monthIndex: item.monthIndex,
        number: item.monthIndex + 1,
        label: item.careerPeriod ? careerTurnLabel({ from: item.careerPeriod }) : monthLabel(item.monthIndex),
        items,
      };
    });
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

/**
 * Mensagem da edição vazia: com o módulo de notícias desligado nesta campanha, o silêncio é explicado e o
 * jogador é apontado para o relatório do mês; com ele ligado, vale a espera pela primeira edição.
 */
export function emptyEditionMessage(newsOff: boolean): string {
  return newsOff
    ? 'As notícias estão desligadas nesta campanha. O relatório do mês continua com os fatos.'
    : 'A redação aguarda o primeiro mês de governo. Encerre um mês para a primeira edição chegar à mesa.';
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
