import { describe, expect, it } from 'vitest';

import { CAMERA, EARTH_RADIUS_M, terrainExaggeration } from './config';
import { LABEL_MIN_FACING, labelRadius, layoutGlobeLabels } from './labelLayout';
import { globeProjector } from './labelTestKit';
import { labelScale, type LabelViewport } from './labels';

describe('labelRadius', () => {
  it('flutua acima do relevo exagerado e cresce com a altitude da câmera', () => {
    for (const altitude of [CAMERA.minAltitude, 0.1, 0.75, CAMERA.maxAltitude]) {
      const r = labelRadius(altitude);
      const typicalTerrain = (1000 * terrainExaggeration(altitude)) / EARTH_RADIUS_M;
      expect(r).toBeGreaterThan(1 + typicalTerrain);
      expect(r).toBeLessThan(1.01);
    }
    expect(labelRadius(2)).toBeGreaterThan(labelRadius(0.05));
  });
});

describe('makeGlobeProjector', () => {
  const view = { lon: -52, lat: -14, altitude: 0.75 };
  const { project } = globeProjector(view, 360, 740);

  it('o ponto no alvo da câmera cai no centro da tela', () => {
    const p = project(view.lon, view.lat);
    expect(p).not.toBeNull();
    expect(p!.x).toBeCloseTo(180, 0);
    expect(p!.y).toBeCloseTo(370, 0);
  });

  it('norte fica acima e leste à direita do alvo (origem no canto superior esquerdo)', () => {
    const c = project(view.lon, view.lat)!;
    expect(project(view.lon, view.lat + 3)!.y).toBeLessThan(c.y);
    expect(project(view.lon + 3, view.lat)!.x).toBeGreaterThan(c.x);
  });

  it('o hemisfério oculto não é projetado (nunca atrás da Terra)', () => {
    expect(project(128, 14)).toBeNull(); // antípoda do alvo
    expect(project(-52 + 150, -14)).toBeNull();
  });

  it('perto do limbo (visada rasante) o ponto é descartado', () => {
    const far = globeProjector({ lon: 0, lat: 0, altitude: 3 }, 400, 800);
    // ≈ 70° do alvo: ainda na frente do globo, porém com elevação abaixo do mínimo
    expect(far.project(80, 0)).toBeNull();
    // 10° do alvo: bem de frente
    expect(far.project(10, 0)).not.toBeNull();
    expect(LABEL_MIN_FACING).toBeGreaterThan(0);
  });

  it('pontos fora da tela viram null', () => {
    const close = globeProjector({ lon: -52, lat: -14, altitude: 0.05 }, 360, 740);
    expect(close.project(-40, -14)).toBeNull();
  });
});

describe('layoutGlobeLabels', () => {
  const BRASILIA = { lon: -47.9, lat: -15.8 };
  const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

  function layout(
    altitude: number,
    width: number,
    height: number,
    textScale = 1,
    center: { lon: number; lat: number } = { lon: -52, lat: -14 },
  ) {
    const state = { ...center, altitude };
    const { project, fovDeg } = globeProjector(state, width, height);
    const viewport: LabelViewport = { width, height, insets: NO_INSETS };
    return layoutGlobeLabels({ project, altitude, fovDeg, viewport, reserved: [], scale: labelScale(textScale) });
  }

  it('no globo inteiro (altitude da câmera inicial) só aparecem siglas; capitais só de perto', () => {
    const far = layout(CAMERA.initial.altitude, 400, 800);
    expect([...far].some((id) => id.endsWith(':capital'))).toBe(false);
    const near = layout(0.12, 400, 800, 1, BRASILIA);
    expect([...near].some((id) => id.endsWith(':capital'))).toBe(true);
  });

  it('UFs grandes têm texto e DF e SE são pin na visão do Brasil', () => {
    const shown = layout(0.75, 360, 740);
    expect(shown.has('SP:sigla') || shown.has('SP:pin')).toBe(true);
    expect(shown.has('DF:sigla')).toBe(false);
    expect(shown.has('SE:sigla')).toBe(false);
    for (const sigla of ['AM', 'BA']) expect(shown.has(`${sigla}:sigla`), sigla).toBe(true);
  });
});
