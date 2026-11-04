import { describe, expect, it } from 'vitest';

import { GlobeController } from './controller';

/** Câmera numa altitude do meio da faixa, longe dos limites de `clampCamera`. */
function controllerAt(altitude = 2) {
  const c = new GlobeController();
  c.state = { ...c.state, lon: 0, lat: 0, altitude };
  return c;
}

describe('velocidade de rotação e zoom do globo (prefs.globeRotationSpeed / globeZoomSpeed)', () => {
  it('com 1 (padrão) o arraste é o de antes', () => {
    const base = controllerAt();
    const explicit = controllerAt();
    explicit.setSpeed(1, 1);
    base.panBy(100, 0);
    explicit.panBy(100, 0);
    expect(explicit.state.lon).toBeCloseTo(base.state.lon, 10);
  });

  it('o multiplicador escala o arraste: 2 gira o dobro, 0,5 a metade', () => {
    const base = controllerAt();
    const fast = controllerAt();
    const slow = controllerAt();
    fast.setSpeed(2, 1);
    slow.setSpeed(0.5, 1);
    base.panBy(80, 30);
    fast.panBy(80, 30);
    slow.panBy(80, 30);
    expect(fast.state.lon).toBeCloseTo(base.state.lon * 2, 8);
    expect(fast.state.lat).toBeCloseTo(base.state.lat * 2, 8);
    expect(slow.state.lon).toBeCloseTo(base.state.lon * 0.5, 8);
  });

  it('a inércia do solto também segue o multiplicador (a velocidade inicial acompanha o arraste)', () => {
    const base = controllerAt();
    const fast = controllerAt();
    fast.setSpeed(2, 1);
    base.release(300, 0);
    fast.release(300, 0);
    base.step(0.1);
    fast.step(0.1);
    expect(fast.state.lon).toBeCloseTo(base.state.lon * 2, 8);
  });

  it('pinça: o zoom segue a escala elevada ao ganho (1 = o de antes; 2 = o dobro)', () => {
    const base = controllerAt(2);
    const fast = controllerAt(2);
    fast.setSpeed(1, 2);
    base.pinchBegin();
    fast.pinchBegin();
    base.pinch(2);
    fast.pinch(2);
    expect(base.state.altitude).toBeCloseTo(1, 8); // 2 / 2
    expect(fast.state.altitude).toBeCloseTo(0.5, 8); // 2 / 2²
  });

  it('roda do mouse: o fator de zoom também passa pelo ganho', () => {
    // altitude 1 para ficar longe do teto de `clampCamera` (o zoom máximo corta antes de 2,25)
    const base = controllerAt(1);
    const fast = controllerAt(1);
    fast.setSpeed(1, 2);
    base.zoomBy(1.5);
    fast.zoomBy(1.5);
    expect(base.state.altitude).toBeCloseTo(1.5, 8);
    expect(fast.state.altitude).toBeCloseTo(1 * 1.5 * 1.5, 8);
  });

  it('valores inválidos (zero, negativos, NaN) voltam a 1', () => {
    const base = controllerAt();
    const broken = controllerAt();
    broken.setSpeed(0, Number.NaN);
    base.panBy(50, 0);
    broken.panBy(50, 0);
    expect(broken.state.lon).toBeCloseTo(base.state.lon, 10);
    base.zoomBy(1.2);
    broken.zoomBy(1.2);
    expect(broken.state.altitude).toBeCloseTo(base.state.altitude, 10);
  });
});
