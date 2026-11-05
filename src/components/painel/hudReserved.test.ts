import { describe, expect, it } from 'vitest';

import { CAMERA } from '@/globe/config';
import { globeLabelCandidates } from '@/globe/labelLayout';
import { globeProjector } from '@/globe/labelTestKit';
import {
  LABELS,
  candidateRect,
  labelScale,
  layoutLabels,
  pixelsPerDegreeAtAltitude,
  rectsCollide,
  ufLabelMode,
  type LabelViewport,
} from '@/globe/labels';

import { RIGHT_RAIL, leftRail } from './mesaNav';
import {
  DEMO_BADGE_BAND,
  LEGEND_BAND,
  DOCK_HEIGHT_COMPACT,
  DOCK_HEIGHT_PORTRAIT,
  RAIL_EDGE,
  TOP_INSET,
  bottomBandHeight,
  clockRect,
  clockSize,
  mesaSides,
  painelLabelReserve,
  topBandHeight,
  type PainelReserveInput,
} from './hudReserved';

const SAFE = { top: 24, right: 0, bottom: 0, left: 0 };
const NOTCH = { top: 47, right: 0, bottom: 34, left: 0 };
const NO_SAFE = { top: 0, right: 0, bottom: 0, left: 0 };

function input(width: number, height: number, extra: Partial<PainelReserveInput> = {}): PainelReserveInput {
  return {
    width,
    height,
    insets: SAFE,
    compact: width > height,
    demo: false,
    leftRailCount: leftRail(false).length,
    rightRailCount: RIGHT_RAIL.length,
    ...extra,
  };
}

describe('painelLabelReserve', () => {
  it('retrato 360×740: barras e trilhos nas posições do PainelScreen', () => {
    const r = painelLabelReserve(input(360, 740));
    // barra do topo = 118 + 56 + área segura; doca = 8 + 112
    expect(r.insets).toEqual({ top: TOP_INSET.portrait + 24, right: 0, bottom: 8 + DOCK_HEIGHT_PORTRAIT, left: 0 });
    expect(r.rects).toHaveLength(2);
    const [left, right] = r.rects;
    // 3 botões de 48 + 2 vãos de 10 = 164 (+ margem de 4 de cada lado)
    expect(left).toEqual({ x: RAIL_EDGE - 4, y: 318, w: 56, h: 172 });
    // 5 botões de 48 + 4 vãos de 10 = 280
    expect(right).toEqual({ x: 360 - RAIL_EDGE - 48 - 4, y: 260, w: 56, h: 288 });
  });

  it('os trilhos ficam centrados entre a barra do topo e a doca', () => {
    for (const [w, h] of [
      [320, 640],
      [360, 740],
      [400, 860],
    ]) {
      const r = painelLabelReserve(input(w, h));
      const top = topBandHeight(input(w, h));
      const bottom = h - (bottomBandHeight(input(w, h)) + 10);
      for (const rect of r.rects) {
        expect(rect.y).toBeGreaterThanOrEqual(top - 4);
        expect(rect.y + rect.h).toBeLessThanOrEqual(bottom + 4);
        expect(rect.y + rect.h / 2).toBeCloseTo((top + bottom) / 2, 5);
      }
    }
  });

  it('área segura, selo de demonstração e botão de Eleições mexem nas reservas', () => {
    const base = painelLabelReserve(input(360, 740));
    const notch = painelLabelReserve(input(360, 740, { insets: NOTCH }));
    expect(notch.insets.top).toBe(base.insets.top + (NOTCH.top - SAFE.top));
    expect(notch.insets.bottom).toBe(base.insets.bottom + NOTCH.bottom);
    expect(painelLabelReserve(input(360, 740, { demo: true })).insets.bottom).toBe(
      base.insets.bottom + DEMO_BADGE_BAND,
    );
    const elections = painelLabelReserve(input(360, 740, { leftRailCount: leftRail(true).length }));
    expect(elections.rects[0].h).toBe(base.rects[0].h + 48 + 10);
  });

  it('legenda fixa do mapa (Fase Q11) sobe a faixa de baixo', () => {
    const plain = painelLabelReserve(input(360, 740));
    const legend = painelLabelReserve(input(360, 740, { legend: true }));
    expect(legend.insets.bottom - plain.insets.bottom).toBe(LEGEND_BAND);
  });

  it('paisagem 640×360: faixas baixas e trilhos de botões de 40', () => {
    const r = painelLabelReserve(input(640, 360, { insets: NO_SAFE }));
    expect(r.insets.top).toBe(TOP_INSET.compact);
    expect(r.insets.bottom).toBe(DOCK_HEIGHT_COMPACT);
    expect(r.rects[0].w).toBe(48);
    expect(r.rects[0].h).toBe(3 * 40 + 2 * 6 + 8);
    expect(r.rects[1].x).toBe(640 - RAIL_EDGE - 40 - 4);
  });

  it('sem botões num trilho não reserva nada', () => {
    expect(painelLabelReserve(input(360, 740, { leftRailCount: 0, rightRailCount: 0 })).rects).toEqual([]);
  });

  it('leftHanded: false (ou ausente) dá exatamente as mesmas reservas', () => {
    expect(painelLabelReserve(input(360, 740, { leftHanded: false }))).toEqual(painelLabelReserve(input(360, 740)));
  });

  it('canhoto 360×740: o trilho "o mês" (3 botões) vai para a direita e "o país" (5) para a esquerda', () => {
    const r = painelLabelReserve(input(360, 740, { leftHanded: true }));
    expect(r.insets).toEqual(painelLabelReserve(input(360, 740)).insets);
    expect(r.rects).toHaveLength(2);
    const [month, country] = r.rects;
    // mesmas medidas do destro, só o x muda: 360 - 8 - 48 - 4 (margem) = 300
    expect(month).toEqual({ x: 360 - RAIL_EDGE - 48 - 4, y: 318, w: 56, h: 172 });
    expect(country).toEqual({ x: RAIL_EDGE - 4, y: 260, w: 56, h: 288 });
  });

  it('canhoto é o espelho exato do destro (sem inset lateral): cada trilho mantém y, h e w', () => {
    for (const [w, h] of [
      [320, 640],
      [360, 740],
      [400, 860],
      [640, 360],
    ]) {
      for (const extra of [{}, { demo: true }, { insets: NOTCH }, { leftRailCount: 4 }]) {
        const destro = painelLabelReserve(input(w, h, { insets: NO_SAFE, ...extra }));
        const canhoto = painelLabelReserve(input(w, h, { insets: NO_SAFE, leftHanded: true, ...extra }));
        const mirror = (r: { x: number; y: number; w: number; h: number }) => ({ ...r, x: w - r.x - r.w });
        expect(canhoto.rects[0]).toEqual(mirror(destro.rects[0]));
        expect(canhoto.rects[1]).toEqual(mirror(destro.rects[1]));
        expect(canhoto.insets).toEqual(destro.insets);
      }
    }
  });

  it('canhoto respeita as áreas seguras laterais em cada lado', () => {
    const side = { top: 0, right: 20, bottom: 0, left: 12 };
    const destro = painelLabelReserve(input(360, 740, { insets: side }));
    const canhoto = painelLabelReserve(input(360, 740, { insets: side, leftHanded: true }));
    // o trilho "o mês" no canhoto ocupa o x que "o país" ocupa no destro, e vice-versa
    expect(canhoto.rects[0].x).toBe(destro.rects[1].x);
    expect(canhoto.rects[1].x).toBe(destro.rects[0].x);
    // a área segura da esquerda agora protege o trilho "o país"
    expect(canhoto.rects[1].x).toBe(12 + RAIL_EDGE - 4);
    expect(canhoto.rects[0].x + canhoto.rects[0].w).toBe(360 - 20 - RAIL_EDGE + 4);
    expect(canhoto.insets).toEqual({ top: destro.insets.top, right: 20, bottom: destro.insets.bottom, left: 12 });
  });

  it('mesaSides: destro e canhoto espelham trilhos e o Encerrar o mês', () => {
    expect(mesaSides(false)).toEqual({ monthRail: 'left', countryRail: 'right', endMonth: 'right' });
    expect(mesaSides(true)).toEqual({ monthRail: 'right', countryRail: 'left', endMonth: 'left' });
  });
});

/** Relógio e bateria no HUD (PLANO_SAVES_HISTORICO.md H1, D33): canto reservado que não cobre números nem trilhos. */
describe('canto do relógio', () => {
  const SIZES: [number, number][] = [
    [320, 640],
    [360, 740],
    [400, 860],
    [640, 360],
  ];

  it('sem a preferência não reserva nada e os trilhos não mudam', () => {
    expect(clockRect(input(360, 740))).toBeNull();
    expect(painelLabelReserve(input(360, 740, { clock: false }))).toEqual(painelLabelReserve(input(360, 740)));
  });

  it.each([
    ['destro', false],
    ['canhoto', true],
  ] as const)('fica abaixo da barra do topo, dentro da tela e longe dos trilhos (%s)', (_side, leftHanded) => {
    for (const [w, h] of SIZES)
      for (const insets of [SAFE, NOTCH, NO_SAFE])
        for (const textScale of [1, 1.3]) {
          const where = `${w}x${h} escala ${textScale}`;
          const cfg = input(w, h, { insets, leftHanded, clock: true, textScale });
          const clock = clockRect(cfg)!;
          const reserve = painelLabelReserve(cfg);
          expect(reserve.rects, where).toHaveLength(3);
          expect(reserve.rects[2]).toEqual(clock);
          // Não cobre os números do topo.
          expect(clock.y + 4, where).toBeGreaterThanOrEqual(topBandHeight(cfg));
          expect(clock.x, where).toBeGreaterThanOrEqual(0);
          expect(clock.x + clock.w, where).toBeLessThanOrEqual(w);
          // O trilho "o mês", do lado do relógio, começa abaixo dele (caixas reais, sem a folga de 4 px de cada reserva).
          const month = reserve.rects[0];
          expect(month.y + 4, where).toBeGreaterThanOrEqual(clock.y + clock.h - 4);
          // O trilho "o país" fica do outro lado e não muda.
          expect(reserve.rects[1]).toEqual(painelLabelReserve({ ...cfg, clock: false }).rects[1]);
          expect(rectsCollide(reserve.rects[1], clock, 0), where).toBe(false);
        }
  });

  it('lado do trilho "o mês": destro à esquerda, canhoto à direita, espelhado', () => {
    const destro = clockRect(input(360, 740, { insets: NO_SAFE, clock: true }))!;
    const canhoto = clockRect(input(360, 740, { insets: NO_SAFE, clock: true, leftHanded: true }))!;
    expect(destro.x).toBe(RAIL_EDGE - 4);
    expect(canhoto.x + canhoto.w).toBe(360 - RAIL_EDGE + 4);
    expect(canhoto).toEqual({ ...destro, x: 360 - destro.x - destro.w });
  });

  it('desce com a barra do topo medida e cresce com o texto', () => {
    const base = clockRect(input(360, 740, { clock: true }))!;
    const lower = clockRect(input(360, 740, { clock: true, topBarBottom: base.y + 4 + 30 }))!;
    expect(lower.y).toBe(base.y + 30);
    expect(clockSize(1.3).h).toBeGreaterThan(clockSize(1).h);
    expect(clockRect(input(360, 740, { clock: true, textScale: 1.3 }))!.w).toBeGreaterThan(base.w);
  });

  it('rótulos do mapa não ficam sob o relógio (destro e canhoto)', () => {
    for (const leftHanded of [false, true])
      for (const [w, h] of SIZES) {
        const reserve = painelLabelReserve(input(w, h, { clock: true, leftHanded }));
        const viewport: LabelViewport = { width: w, height: h, insets: reserve.insets };
        const altitude = CAMERA.initial.altitude;
        const { project, fovDeg } = globeProjector(
          { lon: CAMERA.initial.lon, lat: CAMERA.initial.lat, altitude },
          w,
          h,
        );
        const candidates = globeLabelCandidates({
          project,
          altitude,
          fovDeg,
          viewport,
          reserved: reserve.rects,
          scale: labelScale(1),
        });
        const shown = layoutLabels(candidates, viewport, reserve.rects);
        const clock = reserve.rects[2];
        for (const c of candidates.filter((c) => shown.has(c.id)))
          expect(rectsCollide(candidateRect(c), clock, 0), `${c.id} em ${w}x${h}`).toBe(false);
      }
  });
});

/**
 * Layout completo no Painel: câmera real do globo, reservas do HUD, candidatos e colisões. Cobre a regra "nenhum
 * rótulo sob um botão ou barra" nas telas pequenas.
 */
describe('rótulos do globo no Painel (320×640, 360×740, 400×860)', () => {
  const SIZES: [number, number][] = [
    [320, 640],
    [360, 740],
    [400, 860],
  ];
  // Globo inteiro (câmera inicial), meio-termo, "Centralizar no Brasil" (0,75) e de perto (capitais).
  const ALTITUDES = [CAMERA.initial.altitude, 1.1, 0.75, 0.3];

  function run(
    width: number,
    height: number,
    altitude: number,
    extra: Partial<PainelReserveInput> = {},
    textScale = 1,
  ) {
    const reserve = painelLabelReserve(input(width, height, extra));
    const state = { lon: CAMERA.initial.lon, lat: CAMERA.initial.lat, altitude };
    const { project, fovDeg } = globeProjector(state, width, height);
    const viewport: LabelViewport = { width, height, insets: reserve.insets };
    const layoutInput = { project, altitude, fovDeg, viewport, reserved: reserve.rects, scale: labelScale(textScale) };
    const candidates = globeLabelCandidates(layoutInput);
    const shown = layoutLabels(candidates, viewport, reserve.rects);
    const shownRects = candidates.filter((c) => shown.has(c.id)).map((c) => ({ id: c.id, rect: candidateRect(c) }));
    return { reserve, viewport, candidates, shown, shownRects };
  }

  it.each([
    ['destro', {}],
    ['canhoto', { leftHanded: true }],
  ] as const)('nenhum rótulo visível toca um botão do HUD, uma barra ou sai da tela (%s)', (_side, side) => {
    for (const [w, h] of SIZES)
      for (const altitude of ALTITUDES)
        for (const insets of [SAFE, NOTCH])
          for (const textScale of [0.9, 1.3]) {
            const { reserve, viewport, shownRects } = run(w, h, altitude, { insets, ...side }, textScale);
            expect(shownRects.length, `${w}x${h} alt ${altitude}`).toBeGreaterThan(0);
            for (const { id, rect } of shownRects) {
              const where = `${id} em ${w}x${h}, altitude ${altitude}`;
              for (const q of reserve.rects) expect(rectsCollide(rect, q, 0), `${where} sob um trilho`).toBe(false);
              expect(rect.y, `${where} sob a barra do topo`).toBeGreaterThanOrEqual(viewport.insets.top);
              expect(rect.y + rect.h, `${where} sob a doca`).toBeLessThanOrEqual(h - viewport.insets.bottom);
              expect(rect.x, where).toBeGreaterThanOrEqual(0);
              expect(rect.x + rect.w, where).toBeLessThanOrEqual(w);
            }
          }
  });

  it.each([
    ['destro', {}],
    ['canhoto', { leftHanded: true }],
  ] as const)('nenhum par de rótulos visíveis se sobrepõe (%s)', (_side, side) => {
    for (const [w, h] of SIZES)
      for (const altitude of ALTITUDES) {
        const { shownRects } = run(w, h, altitude, side);
        for (let i = 0; i < shownRects.length; i++)
          for (let j = i + 1; j < shownRects.length; j++)
            expect(
              rectsCollide(shownRects[i].rect, shownRects[j].rect, 0),
              `${shownRects[i].id} × ${shownRects[j].id} em ${w}x${h}`,
            ).toBe(false);
      }
  });

  it('SP, BA e AM aparecem como texto no globo inteiro e na visão do Brasil, nos três tamanhos', () => {
    for (const [w, h] of SIZES)
      for (const altitude of [CAMERA.initial.altitude, 1.1]) {
        const { shown } = run(w, h, altitude);
        for (const sigla of ['SP', 'BA', 'AM'])
          expect(shown.has(`${sigla}:sigla`), `${sigla} em ${w}x${h}, altitude ${altitude}`).toBe(true);
      }
  });

  it('DF e SE são pin (nunca texto) no zoom geral (altitude ≥ 1,1), nos três tamanhos', () => {
    for (const [w, h] of SIZES)
      for (const altitude of [CAMERA.initial.altitude, 1.5, 1.1]) {
        const ppd = pixelsPerDegreeAtAltitude(altitude, h, globeProjector(CAMERA.initial, w, h).fovDeg);
        for (const sigla of ['DF', 'SE']) {
          const label = LABELS.find((l) => l.sigla === sigla)!;
          expect(ufLabelMode(label, ppd), `${sigla} em ${w}x${h}, altitude ${altitude}`).toBe('pin');
        }
        const { shown } = run(w, h, altitude);
        expect(shown.has('DF:sigla') || shown.has('SE:sigla')).toBe(false);
      }
  });

  it('com espaço (400×860, altitude 1,1) DF e SE aparecem como pin', () => {
    const { shown } = run(400, 860, 1.1);
    expect(shown.has('DF:pin')).toBe(true);
    expect(shown.has('SE:pin')).toBe(true);
  });

  it('as capitais só entram de perto', () => {
    for (const [w, h] of SIZES) {
      expect(run(w, h, 1.1).candidates.some((c) => c.kind === 'capital')).toBe(false);
      expect(run(w, h, 0.3).candidates.some((c) => c.kind === 'capital')).toBe(true);
    }
  });

  it('em paisagem (640×360) as reservas também valem', () => {
    const { reserve, shownRects } = run(640, 360, 1.1, { insets: NO_SAFE });
    expect(shownRects.length).toBeGreaterThan(0);
    for (const { rect } of shownRects) for (const q of reserve.rects) expect(rectsCollide(rect, q, 0)).toBe(false);
  });
});
