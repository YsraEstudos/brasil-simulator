import { describe, expect, it } from 'vitest';

import { CITIES } from '@/globe/cities';
import { lonLatToVec3, pointInRing } from '@/globe/geo';
import {
  computeSun,
  dot,
  FIXED_HOURS,
  NIGHT_FLOOR,
  TERMINATOR_FROM,
  TERMINATOR_TO,
  type FixedHour,
  type SkyInput,
} from '@/globe/visualClock';

import { flatMap } from './flatProjection';
import {
  BAND_COUNT,
  bandOpacity,
  bandThresholds,
  buildFlatSun,
  flatSunFor,
  nightStrips,
  viewBoxLonLat,
} from './flatSun';

const FLAT = flatMap();
const BOX = viewBoxLonLat(FLAT);
const sky = (hour: FixedHour, month: number): SkyInput => ({ setting: { mode: 'fixa', hour }, month });

// PLANO_GLOBO.md §3.4 e §4.1: o terminador do 2D é o mesmo do globo.
describe('mapa 2D: terminador', () => {
  it('a caixa do viewBox cobre o Brasil', () => {
    expect(BOX.west).toBeLessThan(-73.9);
    expect(BOX.east).toBeGreaterThan(-34.7);
    expect(BOX.south).toBeLessThan(-33.7);
    expect(BOX.north).toBeGreaterThan(5.2);
  });

  it('as faixas da sombra recortam a região com dot(normal, Sol) abaixo do limiar', () => {
    let checked = 0;
    for (const hour of FIXED_HOURS) {
      for (let month = 1; month <= 12; month++) {
        const sun = computeSun(sky(hour, month));
        for (const threshold of bandThresholds()) {
          const strips = nightStrips(sun, threshold, BOX);
          for (let lon = BOX.west + 0.5; lon < BOX.east; lon += 2.5) {
            for (let lat = BOX.south + 0.5; lat < BOX.north; lat += 2.5) {
              const ndl = dot(lonLatToVec3(lon, lat), sun.dir);
              if (Math.abs(ndl - threshold) < 0.03) continue; // a amostragem de 1° perto do traço é aproximada
              const night = pointInRing(lon, lat, strips.left) || pointInRing(lon, lat, strips.right);
              expect(night, `${hour} mês ${month} limiar ${threshold.toFixed(2)} (${lon}, ${lat}) dot ${ndl}`).toBe(
                ndl < threshold,
              );
              checked++;
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(10_000);
  });

  it('os limiares ficam dentro da faixa do terminador, em ordem crescente', () => {
    const t = bandThresholds();
    expect(t).toHaveLength(BAND_COUNT);
    for (let i = 0; i < t.length; i++) {
      expect(t[i]).toBeGreaterThan(TERMINATOR_FROM);
      expect(t[i]).toBeLessThan(TERMINATOR_TO);
      if (i > 0) expect(t[i]).toBeGreaterThan(t[i - 1]);
    }
  });

  it('as faixas empilhadas deixam o brilho do piso da noite no fundo', () => {
    expect(Math.pow(1 - bandOpacity(), BAND_COUNT)).toBeCloseTo(NIGHT_FLOOR, 12);
  });

  it('"Noite" cobre o mapa todo; "Tarde" não sombreia nada', () => {
    const points: [number, number][] = [
      [-60, -10],
      [-40, -20],
      [-70, 2],
    ];
    const deepest = bandThresholds()[BAND_COUNT - 1];
    const night = nightStrips(computeSun(sky('noite', 1)), deepest, BOX);
    const day = nightStrips(computeSun(sky('tarde', 1)), deepest, BOX);
    for (const [lon, lat] of points) {
      expect(pointInRing(lon, lat, night.left) || pointInRing(lon, lat, night.right)).toBe(true);
      expect(pointInRing(lon, lat, day.left) || pointInRing(lon, lat, day.right)).toBe(false);
    }
    expect(buildFlatSun(computeSun(sky('noite', 1)), FLAT)!.bands).toHaveLength(BAND_COUNT);
  });

  it('"Sempre dia" não desenha nada', () => {
    const sun = computeSun({ setting: { mode: 'sempre-dia', hour: 'noite' }, month: 1 });
    expect(buildFlatSun(sun, FLAT)).toBeNull();
    expect(flatSunFor(sun)).toBeNull();
  });
});

describe('mapa 2D: luzes das cidades', () => {
  it('à noite, todas as cidades acesas, dentro do viewBox, as maiores maiores', () => {
    const { lights } = buildFlatSun(computeSun(sky('noite', 6)), FLAT)!;
    expect(lights).toHaveLength(CITIES.length);
    for (const l of lights) {
      expect(l.x).toBeGreaterThan(0);
      expect(l.x).toBeLessThan(FLAT.viewBox.width);
      expect(l.y).toBeGreaterThan(0);
      expect(l.y).toBeLessThan(FLAT.viewBox.height);
      expect(l.opacity).toBeGreaterThan(0);
      expect(l.opacity).toBeLessThanOrEqual(1);
    }
    expect(lights[0].name).toBe('São Paulo');
    expect(lights[0].r).toBeGreaterThan(lights.at(-1)!.r);
  });

  it('de tarde nenhuma cidade acende; no entardecer só as do lado escuro', () => {
    expect(buildFlatSun(computeSun(sky('tarde', 1)), FLAT)!.lights).toHaveLength(0);
    const dusk = buildFlatSun(computeSun(sky('entardecer', 12)), FLAT)!.lights;
    expect(dusk.length).toBeGreaterThan(0);
    expect(dusk.length).toBeLessThan(CITIES.length);
  });

  it('o resultado fica em cache enquanto o Sol é o mesmo', () => {
    const sun = computeSun(sky('entardecer', 3));
    expect(flatSunFor(sun)).toBe(flatSunFor(computeSun(sky('entardecer', 3))));
    expect(flatSunFor(computeSun(sky('noite', 3)))).not.toBe(flatSunFor(sun));
  });
});
