import { describe, expect, it } from 'vitest';

import type { NewsItem } from '@/engine';

import { deskLayout, easeInOutCubic, laptopScreenFrame, pcPose, poseAt } from './deskCamera';
import { newspaperRect, PAPER_MAX_WIDTH, rectStyle, socialScreenRect } from './deskOverlay';
import { keyboardTexture, newspaperTexture, radialTexture, screenTexture, woodTexture } from './deskTextures';
import {
  buildEditions,
  editionIndexOf,
  editionPage,
  emptyEditionMessage,
  leadFontSize,
  mastheadFontSize,
  newspaperColumns,
} from './newspaperView';
import { scaleTypography } from './scaledTypography';
import {
  buildSocialFeed,
  characterStance,
  emptySocialMessage,
  fill,
  citizenStance,
  compactCount,
  hashString,
  initialsOf,
  moodOf,
  trendsOf,
} from './socialFeed';

// Mesa de notícias (GAME_DESIGN.md §12–§13): jornal, câmera e redes são só interface; nada vai para o motor.

const item = (id: string, monthIndex: number, extra: Partial<NewsItem> = {}): NewsItem => ({
  id,
  monthIndex,
  kind: 'economia',
  tone: 'neutra',
  headline: `Manchete ${id}`,
  cause: `Causa: motivo ${id}.`,
  ...extra,
});

const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };
const inside = (r: { x: number; y: number; width: number; height: number }, w: number, h: number) =>
  r.x >= 0 && r.y >= 0 && r.x + r.width <= w + 0.5 && r.y + r.height <= h + 0.5;
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('edições do jornal', () => {
  const feed = [item('0_0', 0), item('0_1', 0, { kind: 'congresso' }), item('2_0', 2, { kind: 'institucional' })];

  it('uma edição por mês, a mais recente primeiro, numerada pelo mês de jogo', () => {
    const editions = buildEditions(feed);
    expect(editions.map((e) => e.monthIndex)).toEqual([2, 0]);
    expect(editions.map((e) => e.number)).toEqual([3, 1]);
  });

  it('a manchete principal é a primeira gravada (maior prioridade do motor)', () => {
    const [, first] = buildEditions(feed);
    const page = editionPage(first, 'todas');
    expect(page.lead?.id).toBe('0_0');
    expect(page.others.map((n) => n.id)).toEqual(['0_1']);
  });

  it('o caderno filtra a edição; sem edição, página vazia', () => {
    const [, first] = buildEditions(feed);
    expect(editionPage(first, 'congresso').lead?.id).toBe('0_1');
    expect(editionPage(first, 'evento')).toEqual({ lead: undefined, others: [] });
    expect(editionPage(undefined, 'todas')).toEqual({ lead: undefined, others: [] });
  });

  it('a notícia aberta pelo marcador do mapa abre a edição dela e vira a manchete (PR 11)', () => {
    const editions = buildEditions(feed);
    expect(editionIndexOf(editions, '2_0')).toBe(0);
    expect(editionIndexOf(editions, '0_1')).toBe(1);
    // sem pedido, ou notícia que não está em nenhuma edição: a mais recente
    expect(editionIndexOf(editions, undefined)).toBe(0);
    expect(editionIndexOf(editions, 'inexistente')).toBe(0);
    expect(editionIndexOf([], '0_1')).toBe(0);

    const page = editionPage(editions[1], 'todas', '0_1');
    expect(page.lead?.id).toBe('0_1');
    expect(page.others.map((n) => n.id)).toEqual(['0_0']);
    // fora desta edição, ou fora do caderno escolhido, a página fica como era
    expect(editionPage(editions[0], 'todas', '0_1').lead?.id).toBe('2_0');
    expect(editionPage(editions[1], 'economia', '0_1').lead?.id).toBe('0_0');
  });

  it('colunas e manchete crescem com a largura, dentro de limites', () => {
    expect([newspaperColumns(360), newspaperColumns(700), newspaperColumns(1000)]).toEqual([1, 2, 3]);
    // O jornal da mesa nunca passa de PAPER_MAX_WIDTH: as 3 colunas precisam caber até lá.
    expect(newspaperColumns(PAPER_MAX_WIDTH)).toBe(3);
    expect(leadFontSize(200)).toBe(22);
    expect(leadFontSize(2000)).toBe(40);
    expect(mastheadFontSize(330, false)).toBeLessThan(25);
    expect(mastheadFontSize(1200, false)).toBe(40);
    expect(mastheadFontSize(1200, true)).toBe(26);
  });
});

describe('mensagem do estado vazio com o módulo de notícias', () => {
  it('desligado explica o silêncio e aponta o relatório; ligado, vale a espera pela primeira edição', () => {
    const off = 'As notícias estão desligadas nesta campanha. O relatório do mês continua com os fatos.';
    const on = 'A redação aguarda o primeiro mês de governo. Encerre um mês para a primeira edição chegar à mesa.';
    expect(emptyEditionMessage(true)).toBe(off);
    expect(emptyEditionMessage(false)).toBe(on);
    expect(emptySocialMessage(true)).toBe('As notícias estão desligadas nesta campanha, então esta rede fica vazia.');
    expect(emptySocialMessage(false)).toBe(
      'Ninguém comentando ainda. As reações chegam com as primeiras manchetes do governo.',
    );
  });
});

describe('câmera da mesa', () => {
  it('a viagem começa e termina exatamente nas poses e é suave nas pontas', () => {
    const a = { position: [0, 10, 10] as const, target: [0, 0, 0] as const, up: [0, 1, 0] as const };
    const b = { position: [5, 2, 0] as const, target: [5, 1, -3] as const, up: [0, 0.9, 0.3] as const };
    expect(poseAt(a, b, 0).position).toEqual([0, 10, 10]);
    const end = poseAt(a, b, 1);
    end.position.forEach((v, i) => expect(v).toBeCloseTo(b.position[i]));
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    expect(easeInOutCubic(0.05)).toBeLessThan(0.05);
  });

  it('de frente para a tela: a câmera fica na normal da tela, olhando o centro', () => {
    const { center, normal } = laptopScreenFrame();
    const pose = pcPose(16 / 9);
    const dir = [0, 1, 2].map((i) => pose.position[i] - center.getComponent(i));
    const len = Math.hypot(...dir);
    expect(dir[0] / len).toBeCloseTo(normal.x);
    expect(dir[2] / len).toBeCloseTo(normal.z);
    expect(pose.target[1]).toBeCloseTo(center.y);
  });

  // [rótulo, largura, altura, fração mínima da altura para as redes]
  for (const [label, w, h, socialMin] of [
    ['celular em pé', 390, 780, 0.6],
    ['celular deitado', 800, 360, 0.6],
    ['tablet em pé', 800, 1180, 0.6],
    ['tablet deitado', 1280, 760, 0.6],
    // Quase quadradas (dobráveis, tela dividida): o jornal vai para baixo do notebook em vez de cobri-lo.
    ['quadrada', 1000, 1000, 0.45],
    ['quase quadrada deitada', 1000, 920, 0.45],
    ['quase quadrada em pé', 920, 1000, 0.6],
  ] as const) {
    it(`${label}: notebook visível, jornal sem cobri-lo e redes dentro da tela`, () => {
      const layout = deskLayout(w, h);
      expect(layout.laptop.width).toBeGreaterThan(40);
      expect(inside(layout.laptop, w, h)).toBe(true);
      const paper = newspaperRect({ width: w, height: h }, layout, NO_INSETS);
      expect(inside(paper, w, h)).toBe(true);
      expect(paper.width).toBeGreaterThan(Math.min(300, w * 0.5));
      expect(overlaps(paper, layout.laptop)).toBe(false);
      const social = socialScreenRect({ width: w, height: h }, layout, NO_INSETS);
      expect(inside(social, w, h)).toBe(true);
      expect(social.height).toBeGreaterThan(h * socialMin);
    });
  }

  it('centraliza o jornal dentro da área segura quando ela é assimétrica', () => {
    const [w, h] = [390, 780];
    const insets = { top: 30, bottom: 20, left: 0, right: 40 };
    const paper = newspaperRect({ width: w, height: h }, deskLayout(w, h), insets);
    expect(paper.x - insets.left).toBeCloseTo(w - insets.right - (paper.x + paper.width));
  });
});

describe('redes sociais fictícias', () => {
  const characters = [
    { id: 'jornalista', name: 'Beatriz Camargo', role: 'Colunista de política', standing: 0 },
    { id: 'lider_oposicao', name: 'Cleusa Marante', role: 'Líder da oposição', standing: -40 },
  ];
  const feed = [
    item('0_0', 0, { tone: 'negativa', kind: 'personagem', characterId: 'lider_oposicao' }),
    item('1_0', 1, { tone: 'positiva' }),
    item('1_1', 1, { tone: 'neutra', kind: 'congresso' }),
  ];

  it('determinístico: a mesma entrada gera as mesmas publicações', () => {
    expect(buildSocialFeed(feed, characters, 0.5, 1)).toEqual(buildSocialFeed(feed, characters, 0.5, 1));
    expect(hashString('abc')).toBe(hashString('abc'));
  });

  it('mês mais novo primeiro, na prioridade do motor; personagem citado publica com selo e pelo prestígio', () => {
    const posts = buildSocialFeed(feed, characters, 0.5, 1);
    // GAME_DESIGN.md §11.3.1: dentro do mês o motor grava em ordem de prioridade; a primeira gravada vem antes.
    expect([...new Set(posts.map((p) => p.newsId))]).toEqual(['1_0', '1_1', '0_0']);
    const cited = posts.find((p) => p.newsId === '0_0' && p.author.name === 'Cleusa Marante');
    expect(cited?.author.verified).toBe(true);
    expect(cited?.stance).toBe('critica');
    expect(posts.every((p) => p.text.length > 0 && !p.text.includes('{'))).toBe(true);
  });

  it('lado do cidadão segue o tom e a aprovação', () => {
    expect(citizenStance('positiva', 0.5, 0.1)).toBe('apoio');
    expect(citizenStance('negativa', 0.5, 0.5)).toBe('critica');
    expect(citizenStance('negativa', 0.9, 0.3)).toBe('apoio');
    // Aprovação zero: o apoio zera, mas não encolhe a faixa de crítica (0,62 + 0,25 = 0,87).
    expect(citizenStance('negativa', 0, 0.85)).toBe('critica');
    expect(citizenStance('positiva', 1, 0.95)).toBe('neutra');
    expect([characterStance(30), characterStance(-30), characterStance(0)]).toEqual(['apoio', 'critica', 'neutra']);
  });

  it('em alta, humor e números curtos', () => {
    const posts = buildSocialFeed(feed, characters, 0.5, 1);
    const trends = trendsOf(posts);
    expect(trends.reduce((s, t) => s + t.posts, 0)).toBe(posts.length);
    const mood = moodOf(posts);
    expect(mood.apoio + mood.critica + mood.neutra).toBeCloseTo(1);
    expect(moodOf([])).toEqual({ apoio: 0, critica: 0, neutra: 0 });
    expect([compactCount(950), compactCount(1234), compactCount(15400)]).toEqual(['950', '1,2 mil', '15 mil']);
    expect(initialsOf('Beatriz Camargo')).toBe('BC');
  });

  it('sem notícias, sem publicações', () => {
    expect(buildSocialFeed([], characters, 0.5, 0)).toEqual([]);
  });
});

describe('texturas geradas em código', () => {
  const pixel = (tex: ReturnType<typeof woodTexture>, x: number, y: number) => {
    const { data, width } = tex.image as { data: Uint8Array; width: number };
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };

  it('todas são potência de 2, opacas onde devem e prontas para a GPU', () => {
    for (const tex of [woodTexture(), newspaperTexture(), screenTexture(), keyboardTexture()]) {
      const { width, height } = tex.image as { width: number; height: number };
      expect(Math.log2(width) % 1).toBe(0);
      expect(Math.log2(height) % 1).toBe(0);
      expect(pixel(tex, width >> 1, height >> 1)[3]).toBe(255);
      expect(tex.version).toBeGreaterThan(0);
    }
  });

  it('mancha radial: cheia no centro, transparente na borda, com a cor pedida', () => {
    const tex = radialTexture([10, 20, 30]);
    expect(pixel(tex, 32, 32)[3]).toBeGreaterThan(240);
    expect(pixel(tex, 0, 0)[3]).toBe(0);
    expect(pixel(tex, 32, 32).slice(0, 3)).toEqual([10, 20, 30]);
  });

  it('madeira tem veios (não é cor chapada) e é determinística', () => {
    const a = woodTexture();
    const rows = new Set(Array.from({ length: 32 }, (_, y) => pixel(a, 5, y)[0]));
    expect(rows.size).toBeGreaterThan(4);
    expect(pixel(woodTexture(), 7, 9)).toEqual(pixel(a, 7, 9));
  });
});

describe('escala de texto do jogador', () => {
  it('multiplica tamanho e entrelinha, preserva o resto e não mexe na escala 1', () => {
    const base = { a: { fontSize: 10, lineHeight: 20, color: 'red' }, b: { padding: 4 } };
    expect(scaleTypography(base, 1)).toBe(base);
    const big = scaleTypography(base, 1.3);
    expect(big.a).toEqual({ fontSize: 13, lineHeight: 26, color: 'red' });
    expect(big.b).toEqual({ padding: 4 });
    expect(base.a.fontSize).toBe(10);
  });

  it('retângulo vira estilo absoluto', () => {
    expect(rectStyle({ x: 1, y: 2, width: 3, height: 4 })).toEqual({ left: 1, top: 2, width: 3, height: 4 });
  });
});

describe('modelos de texto das redes', () => {
  it('preenche numa passagem só, sem padrões do replace nem substituição dupla', () => {
    const item = { headline: 'Dólar a R$ 6 e $& e {c}', cause: 'Causa: o câmbio subiu.', kind: 'economia' as const };
    expect(fill('“{h}” — {c} {tag}', item)).toBe('“Dólar a R$ 6 e $& e {c}” — o câmbio subiu #Economia');
  });
});

// PLANO_CAMPANHA.md Fase C3: notícia de campanha mantém o calendário anterior à posse.
it('separa notícias pré-posse da edição de janeiro do governo', () => {
  const editions = buildEditions([
    item('career_0', 0, { careerPeriod: '2026-08' }),
    item('career_1', 0, { careerPeriod: '2026-09' }),
    item('0_0', 0),
  ]);
  expect(editions.map((edition) => edition.label)).toEqual(['Janeiro de 2027', 'Setembro de 2026', 'Agosto de 2026']);
  expect(editions.map((edition) => edition.items.length)).toEqual([1, 1, 1]);
});
