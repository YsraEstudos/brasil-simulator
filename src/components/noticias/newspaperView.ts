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

/** Página da edição no caderno escolhido: a primeira notícia (a de maior prioridade) vira a manchete. */
export function editionPage(edition: Edition | undefined, filter: NewsFilter): EditionPage {
  if (!edition) return { lead: undefined, others: [] };
  const [lead, ...others] = filterNews(edition.items, filter);
  return { lead, others };
}

/** Quantas colunas cabem na largura do jornal (em pixels). */
export function newspaperColumns(width: number): 1 | 2 | 3 {
  if (width < 520) return 1;
  if (width < 900) return 2;
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
