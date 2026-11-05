import { describe, expect, it } from 'vitest';

import { CAMERA } from './config';
import { COUNTRIES, countryById } from './countries';
import {
  buildCountryCandidates,
  buildCountryQuadBuffers,
  COUNTRY_PRIORITY_OFFSET,
  countryLabelId,
  countryNameAllowed,
  hitTestCountryLabels,
  webZoomPixelsPerDegree,
} from './countryLabels';
import { layoutGlobe } from './labelLayout';
import { globeProjector } from './labelTestKit';
import { pixelsPerDegreeAtAltitude } from './labels';
import { VERTS_PER_QUAD } from './labelQuads';

// PLANO_PAISES.md §6, P1: todo país tem o nome visível em algum zoom, e o nome nunca vence um rótulo de UF.

const VIEW = { width: 800, height: 800, insets: { top: 0, right: 0, bottom: 0, left: 0 } };

describe('quando o nome pode aparecer', () => {
  it('a escala do zoom da web dobra a cada nível', () => {
    expect(webZoomPixelsPerDegree(3)).toBeCloseTo(2 * webZoomPixelsPerDegree(2));
  });

  it('países grandes desde o globo inteiro; minúsculos só de perto', () => {
    const far = pixelsPerDegreeAtAltitude(CAMERA.maxAltitude, VIEW.height);
    expect(countryNameAllowed(countryById('RUS')!, far)).toBe(true);
    expect(countryNameAllowed(countryById('VAT')!, far)).toBe(false);
    const near = pixelsPerDegreeAtAltitude(CAMERA.minAltitude, VIEW.height);
    expect(countryNameAllowed(countryById('VAT')!, near)).toBe(true);
  });

  it('o nome também aparece quando cabe dentro do país, mesmo antes do zoom do Natural Earth', () => {
    const sah = countryById('SAH')!; // Saara Ocidental: grande, mas com zoom mínimo alto
    const ppd = webZoomPixelsPerDegree(sah.minZoom) * 0.6;
    expect(ppd * sah.extent[0]).toBeGreaterThan(sah.rect.w);
    expect(countryNameAllowed(sah, ppd)).toBe(true);
    expect(countryNameAllowed(countryById('BRT')!, ppd)).toBe(false); // Bir Tawil: zoom mínimo 7 e minúsculo
  });

  it('todo país tem o nome visível em algum zoom: centrado nele, de perto, o nome cabe na tela', () => {
    for (const c of COUNTRIES) {
      const state = { lon: c.anchor[0], lat: c.anchor[1], altitude: CAMERA.minAltitude };
      const { project, fovDeg } = globeProjector(state, VIEW.width, VIEW.height);
      const layout = layoutGlobe({
        project,
        altitude: state.altitude,
        fovDeg,
        viewport: VIEW,
        reserved: [],
        scale: 1,
        countries: true,
      });
      expect(layout.shown.has(countryLabelId(c.id)), c.id).toBe(true);
    }
  });
});

describe('candidatos e colisão', () => {
  it('a prioridade de qualquer país fica abaixo da de qualquer rótulo de UF (a menor é 1)', () => {
    const max = Math.max(...COUNTRIES.map((c) => c.priority));
    expect(max + COUNTRY_PRIORITY_OFFSET).toBeLessThan(1);
  });

  it('o nome do país nunca tira um rótulo de UF: as siglas são as mesmas com e sem países', () => {
    const state = { lon: -55, lat: -20, altitude: 0.75 };
    const { project, fovDeg } = globeProjector(state, VIEW.width, VIEW.height);
    const base = { project, altitude: state.altitude, fovDeg, viewport: VIEW, reserved: [], scale: 1 };
    const without = layoutGlobe(base).shown;
    const withCountries = layoutGlobe({ ...base, countries: true });
    for (const id of without) expect(withCountries.shown.has(id), id).toBe(true);
    expect(withCountries.countryPoints.length).toBeGreaterThan(0);
    // Na vista do Brasil aparecem os vizinhos grandes.
    expect(withCountries.countryPoints.map((p) => p.countryId)).toEqual(expect.arrayContaining(['ARG', 'BOL']));
  });

  it('sem `countries`, o layout fica como antes (nenhum nome de país)', () => {
    const state = { lon: -55, lat: -20, altitude: 0.75 };
    const { project, fovDeg } = globeProjector(state, VIEW.width, VIEW.height);
    const layout = layoutGlobe({ project, altitude: state.altitude, fovDeg, viewport: VIEW, reserved: [], scale: 1 });
    expect(layout.countryPoints).toEqual([]);
    expect([...layout.shown].some((id) => id.endsWith(':country'))).toBe(false);
  });

  it('a caixa da colisão é a do texto, sem a folga do atlas, e cresce com a escala', () => {
    const project = () => ({ x: 100, y: 100 });
    const ppd = pixelsPerDegreeAtAltitude(CAMERA.minAltitude, VIEW.height);
    const [one] = buildCountryCandidates({ project, pixelsPerDegree: ppd, scale: 1 }, [countryById('ARG')!]);
    const [big] = buildCountryCandidates({ project, pixelsPerDegree: ppd, scale: 1.2 }, [countryById('ARG')!]);
    expect(one.w).toBeLessThan(countryById('ARG')!.rect.w);
    expect(big.w).toBeCloseTo(one.w * 1.2);
  });
});

describe('toque no nome', () => {
  const points = [
    { countryId: 'ARG', x: 100, y: 100, w: 60, h: 10 },
    { countryId: 'URY', x: 100, y: 130, w: 50, h: 10 },
  ];

  it('acha o nome sob o dedo, com folga, e nada longe dele', () => {
    expect(hitTestCountryLabels(points, 125, 103)).toBe('ARG');
    expect(hitTestCountryLabels(points, 100, 89)).toBe('ARG'); // 6 px acima da caixa: dentro da folga
    expect(hitTestCountryLabels(points, 100, 300)).toBeNull();
  });

  it('com dois nomes perto, vale o de centro mais próximo', () => {
    const close = [points[0], { ...points[1], y: 118 }];
    expect(hitTestCountryLabels(close, 100, 108)).toBe('ARG');
    expect(hitTestCountryLabels(close, 100, 111)).toBe('URY');
  });
});

describe('malha dos nomes', () => {
  it('um quadrilátero por país, com a máscara do canal certo', () => {
    const b = buildCountryQuadBuffers();
    expect(b.quadCount).toBe(COUNTRIES.length);
    expect(b.groups.map((g) => g.id)).toEqual(COUNTRIES.map((c) => countryLabelId(c.id)));
    COUNTRIES.forEach((c, i) => {
      const mask = Array.from(b.channels.slice(i * VERTS_PER_QUAD * 3, i * VERTS_PER_QUAD * 3 + 3));
      expect(mask[c.rect.channel], c.id).toBe(1);
      expect(
        mask.reduce((s, v) => s + v, 0),
        c.id,
      ).toBe(1);
    });
  });
});
