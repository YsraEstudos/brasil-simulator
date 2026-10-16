import { describe, expect, it } from 'vitest';

import type { NewsItem } from '@/engine';

import { filterNews, groupNewsByMonth, NEWS_FILTERS, newsCharacterName } from './newsView';

const item = (id: string, monthIndex: number, extra: Partial<NewsItem> = {}): NewsItem => ({
  id,
  monthIndex,
  kind: 'economia',
  tone: 'neutra',
  headline: `Manchete ${id}`,
  cause: `Causa ${id}`,
  ...extra,
});

describe('filtro por tipo', () => {
  const feed = [
    item('a', 0, { kind: 'economia' }),
    item('b', 0, { kind: 'congresso' }),
    item('c', 1, { kind: 'personagem' }),
  ];

  it('"todas" mantém tudo, na ordem recebida', () => {
    expect(filterNews(feed, 'todas').map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('filtra por tipo sem alterar o feed original', () => {
    expect(filterNews(feed, 'congresso').map((n) => n.id)).toEqual(['b']);
    expect(filterNews(feed, 'institucional')).toEqual([]);
    expect(feed).toHaveLength(3);
  });

  it('oferece "Todas" mais os 5 tipos', () => {
    expect(NEWS_FILTERS).toEqual(['todas', 'economia', 'congresso', 'evento', 'personagem', 'institucional']);
  });
});

describe('agrupamento por mês', () => {
  it('mês mais recente primeiro e, dentro do mês, a notícia mais nova primeiro', () => {
    // Entrada da mais antiga para a mais nova (como EventsState.news).
    const news = [item('0_1', 0), item('0_2', 0), item('2_1', 2), item('3_1', 3), item('3_2', 3)];
    const groups = groupNewsByMonth(news);
    expect(groups.map((g) => g.monthIndex)).toEqual([3, 2, 0]);
    expect(groups[0].items.map((n) => n.id)).toEqual(['3_2', '3_1']);
    expect(groups[2].items.map((n) => n.id)).toEqual(['0_2', '0_1']);
  });

  it('rotula cada grupo com o mês do calendário', () => {
    const groups = groupNewsByMonth([item('0_1', 0), item('12_1', 12)]);
    expect(groups.map((g) => g.label)).toEqual(['Janeiro de 2028', 'Janeiro de 2027']);
  });

  it('feed vazio não gera grupos', () => {
    expect(groupNewsByMonth([])).toEqual([]);
  });
});

describe('nome do personagem', () => {
  const cast = [{ id: 'min_fazenda', name: 'Teodoro Vilar' }];

  it('retorna o nome quando a notícia cita um personagem do elenco', () => {
    expect(newsCharacterName(item('x', 0, { characterId: 'min_fazenda' }), cast)).toBe('Teodoro Vilar');
  });

  it('sem personagem, ou com id fora do elenco, não há nome', () => {
    expect(newsCharacterName(item('x', 0), cast)).toBeUndefined();
    expect(newsCharacterName(item('x', 0, { characterId: 'nao_existe' }), cast)).toBeUndefined();
  });
});
