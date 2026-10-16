import type { NewsItem, NewsKind, NewsTone } from '@/engine';
import { monthLabel } from '@/components/campaign/labels';

/** Funções puras da aba Notícias (FASE_07.md, T7): filtro, agrupamento por mês e rótulos. Sem React. */

export const NEWS_KINDS: readonly NewsKind[] = ['economia', 'congresso', 'evento', 'personagem', 'institucional'];

/** Filtro da tela: "todas" ou um tipo. Estado só de interface, não é salvo. */
export type NewsFilter = 'todas' | NewsKind;
export const NEWS_FILTERS: readonly NewsFilter[] = ['todas', ...NEWS_KINDS];

export const NEWS_KIND_LABEL: Record<NewsKind, string> = {
  economia: 'Economia',
  congresso: 'Congresso',
  evento: 'Eventos',
  personagem: 'Personagens',
  institucional: 'Instituições',
};

export const NEWS_FILTER_LABEL: Record<NewsFilter, string> = { todas: 'Todas', ...NEWS_KIND_LABEL };

/** Tom com rótulo textual e marca própria: a cor não é o único sinal (acessibilidade). */
export const NEWS_TONE_LABEL: Record<NewsTone, string> = {
  positiva: 'Positiva',
  negativa: 'Negativa',
  neutra: 'Neutra',
};

export const NEWS_TONE_MARK: Record<NewsTone, string> = {
  positiva: '▲',
  negativa: '▼',
  neutra: '●',
};

/** Notícias do filtro, na mesma ordem recebida. */
export function filterNews(news: readonly NewsItem[], filter: NewsFilter): NewsItem[] {
  return filter === 'todas' ? [...news] : news.filter((item) => item.kind === filter);
}

export interface NewsGroup {
  monthIndex: number;
  label: string;
  items: NewsItem[];
}

/**
 * Agrupa por mês, do mais recente para o mais antigo. Dentro de cada mês, a última notícia gravada vem primeiro.
 * `news` chega da mais antiga para a mais nova (EventsState.news).
 */
export function groupNewsByMonth(news: readonly NewsItem[]): NewsGroup[] {
  const groups = new Map<number, NewsGroup>();
  for (const item of [...news].reverse()) {
    let group = groups.get(item.monthIndex);
    if (!group) {
      group = { monthIndex: item.monthIndex, label: monthLabel(item.monthIndex), items: [] };
      groups.set(item.monthIndex, group);
    }
    group.items.push(item);
  }
  return [...groups.values()];
}

/** Nome do personagem citado pela notícia; `undefined` se não há personagem ou ele não está no elenco. */
export function newsCharacterName(
  item: Pick<NewsItem, 'characterId'>,
  characters: readonly { id: string; name: string }[],
): string | undefined {
  if (item.characterId === undefined) return undefined;
  return characters.find((c) => c.id === item.characterId)?.name;
}
