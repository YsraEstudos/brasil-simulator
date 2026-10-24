import { describe, expect, it } from 'vitest';

import {
  CAPITAL_DOT_GAP_PX,
  CAPITAL_DOT_PX,
  LABELS,
  PIN_SIZE_PX,
  labelScale,
  rectsCollide,
  type Rect,
} from '@/globe/labels';
import { MARKER_BADGE_SIZE_PX, MARKER_SIZE_PX, type GlobeMarker } from '@/globe/markers';

import { FLAT_CAPITALS_MIN_MAP_WIDTH_PX, flatFit, flatMapWidthPx, layoutFlatLabels } from './flatLabels';
import { flatMap } from './flatProjection';

const items = (width: number, height: number, extra: Partial<Parameters<typeof layoutFlatLabels>[0]> = {}) =>
  layoutFlatLabels({ width, height, scale: 1, ...extra });

describe('flatMap.project', () => {
  it('é a inversa de unproject e fica dentro do viewBox', () => {
    const flat = flatMap();
    for (const l of LABELS) {
      const p = flat.project(l.anchor[0], l.anchor[1]);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(flat.viewBox.width);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(flat.viewBox.height);
      const [lon, lat] = flat.unproject(p);
      expect(lon).toBeCloseTo(l.anchor[0], 6);
      expect(lat).toBeCloseTo(l.anchor[1], 6);
    }
  });

  it('unitsPerDegree é a escala vertical do viewBox (1° de latitude)', () => {
    const flat = flatMap();
    const a = flat.project(-50, -10);
    const b = flat.project(-50, -11);
    expect(b.y - a.y).toBeCloseTo(flat.unitsPerDegree, 6);
  });
});

describe('layoutFlatLabels', () => {
  it('sem área não há rótulos', () => {
    expect(items(0, 0)).toEqual([]);
  });

  it('no celular em retrato (360×640) vêm siglas e pins, sem nomes de capital', () => {
    const out = items(360, 640);
    expect(out.some((i) => i.kind === 'capital')).toBe(false);
    expect(out.some((i) => i.kind === 'sigla')).toBe(true);
    const sigla = (id: string) => out.find((i) => i.id === id);
    for (const s of ['SP', 'BA', 'AM']) expect(sigla(`${s}:sigla`), s).toBeDefined();
    // DF e SE nunca viram texto: ou pin ou nada (colisão)
    expect(sigla('DF:sigla')).toBeUndefined();
    expect(sigla('SE:sigla')).toBeUndefined();
  });

  it('com o mapa largo (≥ limite) entram as capitais, com ponto e nome logo abaixo', () => {
    expect(flatMapWidthPx(900, 900)).toBeGreaterThanOrEqual(FLAT_CAPITALS_MIN_MAP_WIDTH_PX);
    const out = items(900, 900);
    const capital = out.find((i) => i.kind === 'capital');
    expect(capital).toBeDefined();
    if (capital?.kind !== 'capital') throw new Error('sem capital');
    // o ponto é centrado na sede; o nome fica abaixo dele, com a folga, centrado no mesmo x
    expect(capital.dot.w).toBe(CAPITAL_DOT_PX);
    expect(capital.name.y).toBeCloseTo(capital.dot.y + capital.dot.h + CAPITAL_DOT_GAP_PX, 6);
    expect(capital.name.x + capital.name.w / 2).toBeCloseTo(capital.dot.x + capital.dot.w / 2, 6);
  });

  it('o limite é pela largura do mapa desenhado, não da área (mapa alto e estreito não ganha capitais)', () => {
    expect(flatMapWidthPx(400, 2000)).toBeLessThan(FLAT_CAPITALS_MIN_MAP_WIDTH_PX);
    expect(items(400, 2000).some((i) => i.kind === 'capital')).toBe(false);
  });

  it('o pin tem PIN_SIZE_PX × escala e fica centrado na âncora da UF', () => {
    const scale = labelScale(1.3);
    const out = items(360, 640, { scale });
    const pin = out.find((i) => i.kind === 'pin');
    expect(pin).toBeDefined();
    if (pin?.kind !== 'pin') throw new Error('sem pin');
    expect(pin.box.w).toBeCloseTo(PIN_SIZE_PX * scale, 6);
    const fit = flatFit(360, 640);
    const flat = flatMap();
    const sigla = pin.id.split(':')[0];
    const l = LABELS.find((x) => x.sigla === sigla)!;
    const p = flat.project(l.anchor[0], l.anchor[1]);
    expect(pin.box.x + pin.box.w / 2).toBeCloseTo(fit.offsetX + p.x * fit.scale, 6);
    expect(pin.box.y + pin.box.h / 2).toBeCloseTo(fit.offsetY + p.y * fit.scale, 6);
  });

  it('respeita áreas reservadas e faixas (HUD): nada visível por baixo delas', () => {
    const reserved: Rect[] = [
      { x: 0, y: 250, w: 60, h: 160 },
      { x: 300, y: 250, w: 60, h: 220 },
    ];
    const insets = { top: 150, right: 0, bottom: 110, left: 0 };
    const out = items(360, 740, { reserved, insets });
    expect(out.length).toBeGreaterThan(0);
    for (const item of out) {
      const box = item.kind === 'capital' ? item.name : item.box;
      for (const q of reserved) expect(rectsCollide(box, q, 0), item.id).toBe(false);
      expect(box.y).toBeGreaterThanOrEqual(insets.top);
      expect(box.y + box.h).toBeLessThanOrEqual(740 - insets.bottom);
    }
  });

  it('escala maior = caixas maiores (e nunca sobrepõe)', () => {
    const small = items(360, 640, { scale: labelScale(0.9) });
    const large = items(360, 640, { scale: labelScale(1.3) });
    const w = (list: ReturnType<typeof items>, id: string) => list.find((i) => i.id === id && i.kind === 'sigla');
    const a = w(small, 'SP:sigla');
    const b = w(large, 'SP:sigla');
    expect(a && b && b.kind === 'sigla' && a.kind === 'sigla' && b.box.w > a.box.w).toBe(true);
  });

  it('é determinístico e ordenado por id', () => {
    const a = items(360, 640);
    expect(items(360, 640)).toEqual(a);
    expect(a.map((i) => i.id)).toEqual([...a.map((i) => i.id)].sort());
  });
});

describe('layoutFlatLabels com marcadores (PR 11)', () => {
  const marker = (sigla: string, over: Partial<GlobeMarker> = {}): GlobeMarker => ({
    sigla,
    kind: 'event',
    critical: false,
    count: 1,
    pulse: false,
    ...over,
  });
  type Placed = Extract<ReturnType<typeof items>[number], { kind: 'marker' }>;
  const markersOf = (list: ReturnType<typeof items>): Placed[] => list.filter((i): i is Placed => i.kind === 'marker');

  it('sem marcadores não há item de marcador; com marcadores ele fica centrado no âncora, no tamanho × escala', () => {
    expect(markersOf(items(360, 640))).toEqual([]);
    const scale = labelScale(1.15);
    const out = markersOf(items(360, 640, { scale, markers: [marker('SP')] }));
    expect(out).toHaveLength(1);
    const [m] = out;
    expect(m.id).toBe('SP:marker');
    expect(m.box.w).toBeCloseTo(MARKER_SIZE_PX * scale, 6);
    const fit = flatFit(360, 640);
    const sp = LABELS.find((l) => l.sigla === 'SP')!;
    const p = flatMap().project(sp.anchor[0], sp.anchor[1]);
    expect(m.box.x + m.box.w / 2).toBeCloseTo(fit.offsetX + p.x * fit.scale, 6);
    expect(m.box.y + m.box.h / 2).toBeCloseTo(fit.offsetY + p.y * fit.scale, 6);
  });

  it('o marcador vence a sigla da própria UF; o selo só em grupo, no canto superior direito', () => {
    const out = items(360, 640, { markers: [marker('SP', { count: 4 }), marker('BA')] });
    expect(out.some((i) => i.id === 'SP:sigla')).toBe(false);
    expect(out.some((i) => i.id === 'BA:sigla')).toBe(false);
    const [ba, sp] = [markersOf(out).find((m) => m.sigla === 'BA')!, markersOf(out).find((m) => m.sigla === 'SP')!];
    expect(ba.badge).toBeNull();
    expect(sp.badge).not.toBeNull();
    expect(sp.badge!.w).toBeCloseTo(MARKER_BADGE_SIZE_PX, 6);
    expect(sp.badge!.x + sp.badge!.w / 2).toBeGreaterThan(sp.box.x + sp.box.w / 2);
    expect(sp.badge!.y + sp.badge!.h / 2).toBeLessThan(sp.box.y + sp.box.h / 2);
  });

  it('respeita as áreas do HUD e nunca sobrepõe outro marcador', () => {
    const all = LABELS.map((l) => marker(l.sigla));
    const reserved: Rect[] = [{ x: 0, y: 250, w: 60, h: 160 }];
    const out = markersOf(items(360, 740, { markers: all, reserved }));
    expect(out.length).toBeGreaterThan(5);
    for (const a of out) {
      for (const q of reserved) expect(rectsCollide(a.box, q, 0), a.id).toBe(false);
      for (const b of out) if (a !== b) expect(rectsCollide(a.box, b.box, 0), `${a.id}×${b.id}`).toBe(false);
    }
  });

  it('é determinístico e a ordem dos marcadores de entrada não importa', () => {
    const all = ['CE', 'PI', 'MA', 'PA', 'BA'].map((s) => marker(s));
    expect(items(360, 640, { markers: [...all].reverse() })).toEqual(items(360, 640, { markers: all }));
  });
});
