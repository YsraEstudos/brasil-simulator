import { describe, expect, it } from 'vitest';

import { CAMERA } from './config';
import { layoutGlobe, layoutGlobeLabels } from './labelLayout';
import { globeProjector } from './labelTestKit';
import { LABELS, MARKER_ATLAS, SIGLA_PRIORITY_BONUS, labelScale, rectsCollide, type LabelViewport } from './labels';
import {
  MARKER_BADGE_SIZE_PX,
  MARKER_COLORS,
  MARKER_CRITICAL_BONUS,
  MARKER_HIT_PADDING_PX,
  MARKER_PRIORITY_BASE,
  MARKER_SIZE_PX,
  buildMarkerCandidates,
  hexToRgb,
  hitTestMarkers,
  markerColor,
  markerCountKey,
  markerPriority,
  type GlobeMarker,
} from './markers';

const marker = (sigla: string, over: Partial<GlobeMarker> = {}): GlobeMarker => ({
  sigla,
  kind: 'event',
  critical: false,
  count: 1,
  pulse: false,
  ...over,
});

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

describe('atlas dos marcadores', () => {
  it('o atlas compartilhado traz o glifo do evento e da notícia e o selo de 2 a 9+, todos do mesmo tamanho', () => {
    const { glyphs, counts } = MARKER_ATLAS;
    expect(glyphs.event.w).toBe(glyphs.news.w);
    expect(glyphs.event.h).toBe(glyphs.news.h);
    expect(Object.keys(counts)).toEqual(['2', '3', '4', '5', '6', '7', '8', '9', '9+']);
    const sizes = new Set(Object.values(counts).map((r) => `${r.w}x${r.h}`));
    expect(sizes.size).toBe(1);
    for (const r of [glyphs.event, glyphs.news, ...Object.values(counts)]) {
      expect(r.u1).toBeGreaterThan(r.u0);
      expect(r.v1).toBeGreaterThan(r.v0);
      expect(r.u1).toBeLessThanOrEqual(1);
      expect(r.v1).toBeLessThanOrEqual(1);
    }
  });

  it('o selo mostra o número até 9 e "9+" daí em diante', () => {
    expect([2, 5, 9, 10, 99].map(markerCountKey)).toEqual(['2', '5', '9', '9+', '9+']);
    for (const n of [2, 9, 10]) expect(MARKER_ATLAS.counts[markerCountKey(n)]).toBeDefined();
  });
});

describe('cores e prioridade', () => {
  it('crítico em vermelho; evento e notícia com cores próprias (a cor não é o único sinal: há glifo e texto)', () => {
    expect(markerColor(marker('CE', { critical: true }))).toBe(MARKER_COLORS.critical);
    expect(markerColor(marker('CE'))).toBe(MARKER_COLORS.event);
    expect(markerColor(marker('CE', { kind: 'news' }))).toBe(MARKER_COLORS.news);
    expect(new Set([MARKER_COLORS.critical, MARKER_COLORS.event, MARKER_COLORS.news]).size).toBe(3);
    expect(hexToRgb('#ff8000')).toEqual([1, 128 / 255, 0]);
  });

  it('o marcador vence qualquer sigla (a maior vale 127) e o crítico vence os demais marcadores', () => {
    const highestLabel = SIGLA_PRIORITY_BONUS + Math.max(...LABELS.map((l) => l.priority));
    const lowestMarker = Math.min(...LABELS.map((l) => markerPriority(marker(l.sigla))));
    expect(lowestMarker).toBeGreaterThan(highestLabel);
    const highestCalm = Math.max(...LABELS.map((l) => markerPriority(marker(l.sigla))));
    const lowestCritical = Math.min(...LABELS.map((l) => markerPriority(marker(l.sigla, { critical: true }))));
    expect(lowestCritical).toBeGreaterThan(highestCalm);
    expect(MARKER_PRIORITY_BASE).toBeGreaterThan(SIGLA_PRIORITY_BONUS + 27);
    expect(MARKER_CRITICAL_BONUS).toBeGreaterThan(27);
  });
});

describe('layout no globo', () => {
  const state = { lon: -52, lat: -14, altitude: 0.75 };
  const viewport: LabelViewport = { width: 360, height: 740, insets: NO_INSETS };
  const { project, fovDeg } = globeProjector(state, 360, 740);
  const base = { project, altitude: state.altitude, fovDeg, viewport, reserved: [], scale: 1 };

  it('o marcador entra na colisão no âncora da UF e vence a sigla (ou o pin) dela', () => {
    const shown = layoutGlobeLabels({ ...base, markers: [marker('BA'), marker('DF')] });
    expect(shown.has('BA:marker')).toBe(true);
    expect(shown.has('BA:sigla')).toBe(false);
    expect(shown.has('DF:marker')).toBe(true);
    expect(shown.has('DF:pin')).toBe(false);
    // sem marcador a sigla volta
    expect(layoutGlobeLabels({ ...base }).has('BA:sigla')).toBe(true);
  });

  it('o selo só vem com grupo de mais de um item e junto do marcador mostrado', () => {
    const { shown } = layoutGlobe({ ...base, markers: [marker('BA', { count: 3 }), marker('SP', { count: 1 })] });
    expect(shown.has('BA:badge')).toBe(true);
    expect(shown.has('SP:marker')).toBe(true);
    expect(shown.has('SP:badge')).toBe(false);
  });

  it('marcador no lado oculto do globo não aparece, nem seu selo', () => {
    const far = globeProjector({ lon: 120, lat: 10, altitude: 0.75 }, 360, 740);
    const { shown, markerPoints } = layoutGlobe({
      ...base,
      project: far.project,
      fovDeg: far.fovDeg,
      markers: [marker('SP', { count: 2 })],
    });
    expect(shown.has('SP:marker')).toBe(false);
    expect(shown.has('SP:badge')).toBe(false);
    expect(markerPoints).toEqual([]);
  });

  it('marcadores em colisão: o crítico fica, nunca dois se tocam, e o resultado é determinístico', () => {
    // Globo inteiro: as UFs do Brasil ficam a poucos px umas das outras, então há colisão de verdade.
    const far = globeProjector({ lon: -45, lat: -15, altitude: CAMERA.maxAltitude }, 360, 740);
    const input = { ...base, project: far.project, fovDeg: far.fovDeg, altitude: CAMERA.maxAltitude };
    const markers = LABELS.map((l) => marker(l.sigla, { critical: l.sigla === 'MG' }));
    const { shown, markerPoints } = layoutGlobe({ ...input, markers });
    expect(shown.has('MG:marker')).toBe(true);
    expect(markerPoints.length).toBeLessThan(27);
    const half = (MARKER_SIZE_PX + 4) / 2;
    for (const a of markerPoints)
      for (const b of markerPoints) {
        if (a === b) continue;
        const ra = { x: a.x - half, y: a.y - half, w: half * 2, h: half * 2 };
        const rb = { x: b.x - half, y: b.y - half, w: half * 2, h: half * 2 };
        expect(rectsCollide(ra, rb, 0), `${a.sigla}×${b.sigla}`).toBe(false);
      }
    expect(layoutGlobe({ ...input, markers }).shown).toEqual(shown);
    expect(layoutGlobe({ ...input, markers: [...markers].reverse() }).shown).toEqual(shown);
  });

  it('as áreas do HUD valem para o marcador', () => {
    const point = project(...LABELS.find((l) => l.sigla === 'BA')!.anchor)!;
    const reserved = [{ x: point.x - 30, y: point.y - 30, w: 60, h: 60 }];
    const shown = layoutGlobeLabels({ ...base, reserved, markers: [marker('BA')] });
    expect(shown.has('BA:marker')).toBe(false);
  });

  it('em 320, 360 e 400 dp com o texto no máximo ainda aparecem marcadores, sem se tocar', () => {
    for (const width of [320, 360, 400]) {
      const view = globeProjector(state, width, 740);
      const scale = labelScale(1.3);
      const { markerPoints } = layoutGlobe({
        ...base,
        project: view.project,
        fovDeg: view.fovDeg,
        viewport: { width, height: 740, insets: NO_INSETS },
        scale,
        markers: LABELS.map((l) => marker(l.sigla)),
      });
      expect(markerPoints.length, `${width} dp`).toBeGreaterThan(5);
      const side = (MARKER_SIZE_PX + 4) * scale;
      for (const a of markerPoints)
        for (const b of markerPoints) {
          if (a === b) continue;
          expect(Math.abs(a.x - b.x) >= side || Math.abs(a.y - b.y) >= side, `${a.sigla}×${b.sigla}`).toBe(true);
        }
    }
  });
});

describe('candidatos e toque', () => {
  it('um candidato por marcador, no âncora da UF, com a caixa do disco mais a folga', () => {
    const out = buildMarkerCandidates([marker('SP'), marker('XX')], {
      project: () => ({ x: 100, y: 200 }),
      scale: 2,
    });
    expect(out).toHaveLength(1); // UF desconhecida cai fora
    expect(out[0]).toMatchObject({ id: 'SP:marker', kind: 'marker', x: 100, y: 200, w: 48, h: 48 });
  });

  it('o toque acerta o marcador mais próximo dentro do disco mais a folga do dedo, antes da UF', () => {
    const points = [
      { sigla: 'CE', x: 100, y: 100 },
      { sigla: 'PI', x: 130, y: 100 },
    ];
    expect(hitTestMarkers(points, 100, 100, 1)).toBe('CE');
    expect(hitTestMarkers(points, 100 - MARKER_SIZE_PX / 2 - MARKER_HIT_PADDING_PX, 100, 1)).toBe('CE');
    expect(hitTestMarkers(points, 100 - MARKER_SIZE_PX / 2 - MARKER_HIT_PADDING_PX - 1, 100, 1)).toBeNull();
    // entre os dois: o mais próximo ganha
    expect(hitTestMarkers(points, 116, 100, 1)).toBe('PI');
    // longe de tudo (o toque vira seleção de UF)
    expect(hitTestMarkers(points, 300, 300, 1)).toBeNull();
    // a escala do texto alarga o alcance
    expect(hitTestMarkers(points, 100 - (MARKER_SIZE_PX / 2 + MARKER_HIT_PADDING_PX) * 1.19, 100, 1.2)).toBe('CE');
  });

  it('o alcance do toque (disco + folga) chega a 44 dp e o selo é menor que o disco', () => {
    expect(MARKER_SIZE_PX + 2 * MARKER_HIT_PADDING_PX).toBeGreaterThanOrEqual(44);
    expect(MARKER_BADGE_SIZE_PX).toBeLessThan(MARKER_SIZE_PX);
  });
});
