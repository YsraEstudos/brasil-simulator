import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { lonLatToVec3, type Vec3 } from './geo';
import { globeFragmentShader, globeVertexShader, tileFragmentShader, tileVertexShader } from './shaders';
import {
  brasiliaToUtcHours,
  computeSun,
  DEFAULT_DAY_TIME,
  dayLight,
  dayLightAt,
  dot,
  FIXED_HOUR_BRASILIA,
  FIXED_HOURS,
  lightsAmount,
  lightsAmountAt,
  NIGHT_FLOOR,
  solarDeclinationDeg,
  subsolarLongitudeDeg,
  sunKey,
  TERMINATOR_FROM,
  TERMINATOR_TO,
  wrapLon,
  type DayTimeSetting,
  type FixedHour,
  type SkyInput,
} from './visualClock';

const BRASILIA: [number, number] = [-47.882, -15.794];
/** Pontos extremos do território: o Brasil inteiro tem de ficar iluminado de tarde e de manhã. */
const BRAZIL_EXTREMES: [number, number][] = [
  [-73.9, -7.5], // Acre
  [-60.0, 5.2], // Roraima
  [-51.6, 4.2], // Amapá
  [-34.8, -7.1], // João Pessoa (ponta leste)
  [-53.4, -33.7], // Chuí
  [-57.6, -30.2], // fronteira sul
];

const fixed = (hour: FixedHour, month = 1): SkyInput => ({ setting: { mode: 'fixa', hour }, month });

// PLANO_GLOBO.md §4.1 e D-G7
describe('relógio visual: Sol', () => {
  it('o padrão é a hora fixa da tarde', () => {
    expect(DEFAULT_DAY_TIME).toEqual({ mode: 'fixa', hour: 'tarde' });
    expect(FIXED_HOURS).toEqual(['manha', 'tarde', 'entardecer', 'noite']);
  });

  it('ao meio-dia de Brasília o ponto subsolar está sobre o meridiano de Brasília', () => {
    const noonUtc = brasiliaToUtcHours(12);
    expect(noonUtc).toBe(15);
    const lon = subsolarLongitudeDeg(noonUtc);
    expect(lon).toBe(-45);
    expect(Math.abs(lon - BRASILIA[0])).toBeLessThan(3.5); // fuso: 15° por hora, Brasília está em −47,9°
    // E o Sol está perto do zênite (a declinação o afasta até ~39° em junho): Brasília totalmente iluminada em todos os meses.
    for (let month = 1; month <= 12; month++) {
      const sun = computeSun({ setting: { mode: 'real', hour: 'tarde' }, month, utc: { hour: noonUtc, minute: 0 } });
      expect(dot(lonLatToVec3(...BRASILIA), sun.dir)).toBeGreaterThan(0.7);
      expect(dayLightAt(sun, ...BRASILIA)).toBe(1);
    }
  });

  it('a hora UTC anda 15° por hora para oeste e dá a volta em 24 h', () => {
    expect(subsolarLongitudeDeg(12)).toBe(0);
    expect(subsolarLongitudeDeg(13)).toBe(-15);
    expect(subsolarLongitudeDeg(0)).toBe(180);
    expect(subsolarLongitudeDeg(1)).toBe(165);
    expect(subsolarLongitudeDeg(24)).toBe(180);
    expect(wrapLon(540)).toBe(180);
    expect(wrapLon(-181)).toBe(179);
  });

  it('converte a hora de Brasília (UTC−3) em UTC', () => {
    expect(brasiliaToUtcHours(15)).toBe(18);
    expect(brasiliaToUtcHours(22)).toBe(1);
    expect(brasiliaToUtcHours(21)).toBe(0);
  });

  it('declinação: dezembro ao sul, junho ao norte, equinócios perto de zero', () => {
    expect(solarDeclinationDeg(12)).toBeLessThan(-22);
    expect(solarDeclinationDeg(1)).toBeLessThan(-18);
    expect(solarDeclinationDeg(6)).toBeGreaterThan(22);
    expect(solarDeclinationDeg(7)).toBeGreaterThan(18);
    expect(Math.abs(solarDeclinationDeg(3))).toBeLessThan(4);
    expect(Math.abs(solarDeclinationDeg(9))).toBeLessThan(4);
    for (let m = 1; m <= 12; m++) expect(Math.abs(solarDeclinationDeg(m))).toBeLessThanOrEqual(23.44);
    // Mês fora de 1–12 dá a volta no ano em vez de quebrar.
    expect(solarDeclinationDeg(13)).toBe(solarDeclinationDeg(1));
    expect(solarDeclinationDeg(0)).toBe(solarDeclinationDeg(12));
  });

  it('a direção do Sol é unitária e tem a latitude da declinação', () => {
    for (const hour of FIXED_HOURS) {
      for (const month of [1, 4, 7, 10]) {
        const sun = computeSun(fixed(hour, month));
        expect(Math.hypot(...sun.dir)).toBeCloseTo(1, 12);
        expect(sun.dir[1]).toBeCloseTo(Math.sin((solarDeclinationDeg(month) * Math.PI) / 180), 12);
        expect(sun.enabled).toBe(true);
      }
    }
  });

  it('"Sempre dia": desliga a iluminação e as luzes, e deixa o Brasil do lado claro', () => {
    const setting: DayTimeSetting = { mode: 'sempre-dia', hour: 'noite' };
    for (const month of [1, 6, 12]) {
      const sun = computeSun({ setting, month });
      expect(sun.enabled).toBe(false);
      expect(dot(lonLatToVec3(...BRASILIA), sun.dir)).toBeGreaterThan(0.7);
      for (const [lon, lat] of BRAZIL_EXTREMES) {
        expect(dayLightAt(sun, lon, lat)).toBe(1);
        expect(lightsAmountAt(sun, lon, lat)).toBe(0);
      }
    }
  });

  it('"Noite": o Brasil inteiro no lado noturno, no piso de brilho, com as luzes acesas', () => {
    for (const month of [1, 6, 12]) {
      const sun = computeSun(fixed('noite', month));
      for (const [lon, lat] of [BRASILIA, ...BRAZIL_EXTREMES]) {
        expect(dot(lonLatToVec3(lon, lat), sun.dir)).toBeLessThan(TERMINATOR_FROM);
        expect(dayLightAt(sun, lon, lat)).toBeCloseTo(NIGHT_FLOOR, 12);
        expect(lightsAmountAt(sun, lon, lat)).toBe(1);
      }
    }
  });

  it('"Tarde" e "Manhã": o Brasil inteiro iluminado, sem luzes, em todos os meses', () => {
    for (const hour of ['tarde', 'manha'] as const) {
      for (let month = 1; month <= 12; month++) {
        const sun = computeSun(fixed(hour, month));
        for (const [lon, lat] of [BRASILIA, ...BRAZIL_EXTREMES.filter(([lon]) => hour === 'tarde' || lon > -70)]) {
          expect(dayLightAt(sun, lon, lat), `${hour} mês ${month} (${lon}, ${lat})`).toBe(1);
          expect(lightsAmountAt(sun, lon, lat)).toBe(0);
        }
      }
    }
  });

  it('"Entardecer": o terminador passa pelo Brasil (Brasília em penumbra)', () => {
    for (const month of [1, 6, 12]) {
      const light = dayLightAt(computeSun(fixed('entardecer', month)), ...BRASILIA);
      expect(light).toBeGreaterThan(NIGHT_FLOOR);
      expect(light).toBeLessThan(1);
    }
  });

  it('"Hora real" usa o relógio passado; sem ele cai na hora fixa do ajuste', () => {
    const setting: DayTimeSetting = { mode: 'real', hour: 'manha' };
    const real = computeSun({ setting, month: 3, utc: { hour: 18, minute: 30 } });
    expect(real.subsolar.lon).toBeCloseTo(-97.5, 10);
    expect(real.enabled).toBe(true);
    const fallback = computeSun({ setting, month: 3 });
    expect(fallback.subsolar.lon).toBe(subsolarLongitudeDeg(brasiliaToUtcHours(FIXED_HOUR_BRASILIA.manha)));
  });

  it('o mês do jogo muda só a estação: o ponto subsolar anda em latitude, não em longitude', () => {
    const jan = computeSun(fixed('tarde', 1));
    const jul = computeSun(fixed('tarde', 7));
    expect(jan.subsolar.lon).toBe(jul.subsolar.lon);
    expect(jan.subsolar.lat).toBeLessThan(0);
    expect(jul.subsolar.lat).toBeGreaterThan(0);
    expect(sunKey(jan)).not.toBe(sunKey(jul));
    expect(sunKey(jan)).toBe(sunKey(computeSun(fixed('tarde', 1))));
  });
});

describe('relógio visual: iluminação', () => {
  it('o terminador é suave: do piso (noite) a 1 (dia), sem saltos', () => {
    expect(dayLight(-1)).toBeCloseTo(NIGHT_FLOOR, 12);
    expect(dayLight(TERMINATOR_FROM)).toBeCloseTo(NIGHT_FLOOR, 12);
    expect(dayLight(TERMINATOR_TO)).toBeCloseTo(1, 12);
    expect(dayLight(1)).toBe(1);
    let previous = dayLight(-1);
    for (let ndl = -1; ndl <= 1; ndl += 0.005) {
      const now = dayLight(ndl);
      expect(now).toBeGreaterThanOrEqual(previous - 1e-12);
      expect(now - previous).toBeLessThan(0.03);
      previous = now;
    }
    expect(NIGHT_FLOOR).toBeGreaterThanOrEqual(0.3);
    expect(NIGHT_FLOOR).toBeLessThanOrEqual(0.4);
  });

  it('as luzes acendem onde o terreno escurece e apagam antes do dia pleno', () => {
    expect(lightsAmount(-0.5)).toBe(1);
    expect(lightsAmount(0.5)).toBe(0);
    for (let ndl = -1; ndl <= 1; ndl += 0.01) {
      const l = lightsAmount(ndl);
      expect(l).toBeGreaterThanOrEqual(0);
      expect(l).toBeLessThanOrEqual(1);
      if (ndl >= TERMINATOR_TO) expect(l).toBe(0);
    }
  });
});

describe('relógio visual: convenção do globo', () => {
  it('lonLatToVec3 é a convenção da esfera do globo (THREE.SphereGeometry equiretangular)', () => {
    const g = new THREE.SphereGeometry(1, 36, 18);
    const pos = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    for (let i = 0; i < pos.count; i += 7) {
      const lon = uv.getX(i) * 360 - 180; // mesmas contas do globeFragmentShader
      const lat = uv.getY(i) * 180 - 90;
      const expected: Vec3 = lonLatToVec3(lon, lat);
      expect(pos.getX(i)).toBeCloseTo(expected[0], 5);
      expect(pos.getY(i)).toBeCloseTo(expected[1], 5);
      expect(pos.getZ(i)).toBeCloseTo(expected[2], 5);
    }
  });

  it('tiles e globo base usam o mesmo cálculo de dia e noite (sem emenda)', () => {
    // O vertex shader dos tiles reconstrói a direção com a mesma convenção de lonLatToVec3.
    expect(tileVertexShader).toContain('vec3 dir = vec3(cl * cos(lon), sin(lat), -cl * sin(lon));');
    const fn = (src: string) => /float sunLight\(float ndl\) \{[^}]*\}/.exec(src)?.[0];
    expect(fn(tileFragmentShader)).toBeDefined();
    expect(fn(tileFragmentShader)).toBe(fn(globeFragmentShader));
    // Mesmos uniforms e mesma função de entrada no vertex shader dos dois.
    const sunDot = (src: string) => /float sunDot\(vec3 normal\) \{[^}]*\}/.exec(src)?.[0];
    expect(sunDot(tileVertexShader)).toBeDefined();
    expect(sunDot(tileVertexShader)).toBe(sunDot(globeVertexShader));
    for (const vs of [tileVertexShader, globeVertexShader]) {
      expect(vs).toContain('uniform vec3 uSunDir;');
      expect(vs).toContain('uniform float uSunOn;');
    }
    // As constantes do GLSL são as do módulo puro.
    expect(fn(tileFragmentShader)).toContain(NIGHT_FLOOR.toFixed(6));
    expect(fn(tileFragmentShader)).toContain(TERMINATOR_FROM.toFixed(6));
    expect(fn(tileFragmentShader)).toContain(TERMINATOR_TO.toFixed(6));
  });
});
