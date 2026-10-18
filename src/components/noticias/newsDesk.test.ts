import { describe, expect, it } from 'vitest';

import type { NewsItem } from '@/engine';

import { deskLayout, easeInOutCubic, laptopScreenFrame, pcPose, poseAt } from './deskCamera';
import { newspaperRect, rectStyle, socialScreenRect } from './deskOverlay';
import { keyboardTexture, newspaperTexture, radialTexture, screenTexture, woodTexture } from './deskTextures';
import { buildEditions, editionPage, leadFontSize, mastheadFontSize, newspaperColumns } from './newspaperView';
import { scaleTypography } from './scaledTypography';
import {
  buildSocialFeed,
  characterStance,
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

  it('colunas e manchete crescem com a largura, dentro de limites', () => {
    expect([newspaperColumns(360), newspaperColumns(700), newspaperColumns(1000)]).toEqual([1, 2, 3]);
    expect(leadFontSize(200)).toBe(22);
    expect(leadFontSize(2000)).toBe(40);
    expect(mastheadFontSize(330, false)).toBeLessThan(25);
    expect(mastheadFontSize(1200, false)).toBe(40);
    expect(mastheadFontSize(1200, true)).toBe(26);
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

  for (const [label, w, h] of [
    ['celular em pé', 390, 780],
    ['celular deitado', 800, 360],
    ['tablet em pé', 800, 1180],
    ['tablet deitado', 1280, 760],
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
      expect(social.height).toBeGreaterThan(h * 0.6);
    });
  }
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

  it('notícia mais nova primeiro; personagem citado publica com selo e pelo próprio prestígio', () => {
    const posts = buildSocialFeed(feed, characters, 0.5, 1);
    expect(posts[0].newsId).toBe('1_1');
    const cited = posts.find((p) => p.newsId === '0_0' && p.author.name === 'Cleusa Marante');
    expect(cited?.author.verified).toBe(true);
    expect(cited?.stance).toBe('critica');
    expect(posts.every((p) => p.text.length > 0 && !p.text.includes('{'))).toBe(true);
  });

  it('lado do cidadão segue o tom e a aprovação', () => {
    expect(citizenStance('positiva', 0.5, 0.1)).toBe('apoio');
    expect(citizenStance('negativa', 0.5, 0.5)).toBe('critica');
    expect(citizenStance('negativa', 0.9, 0.3)).toBe('apoio');
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
