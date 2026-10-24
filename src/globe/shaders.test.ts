import { describe, expect, it } from 'vitest';

import { ROOT } from './config';
import {
  cloudFragmentShader,
  cloudVertexShader,
  globeFragmentShader,
  tileFragmentShader,
  tileVertexShader,
} from './shaders';

// PLANO_GLOBO.md §3.2 e §4.2: seca nos tiles (sem leitura de textura com clima neutro) e nuvens com 3 leituras no total.

const reads = (src: string) => src.match(/texture2D\(/g)?.length ?? 0;
const DEG = Math.PI / 180;

describe('sombreadores do clima', () => {
  it('tiles: a seca fica atrás de `uDrought` (duas leituras só com seca) e a cor base segue sendo uma leitura', () => {
    expect(tileFragmentShader).toContain('uniform float uDrought');
    expect(tileFragmentShader).toMatch(/if \(uDrought < 0\.5\) return color;/);
    // 1 da cor do tile + 2 (clima e água) dentro de `droughtTint`
    expect(reads(tileFragmentShader)).toBe(3);
    const body = tileFragmentShader.slice(
      tileFragmentShader.indexOf('vec3 droughtTint'),
      tileFragmentShader.indexOf('void main'),
    );
    expect(reads(body)).toBe(2);
  });

  it('tiles: a máscara de água anula o tom (1 = água) e a seca é o canal G do clima', () => {
    expect(tileFragmentShader).toContain('texture2D(uClimate, vGeo).g * (1.0 - texture2D(uWater, vGeo).r)');
  });

  it('tiles: a posição na caixa vem em highp e usa a mesma caixa da quadtree', () => {
    expect(tileFragmentShader).toContain('varying highp vec2 vGeo');
    expect(tileVertexShader).toContain('vGeo = geoBox(lon, lat);');
    expect(tileVertexShader).toContain(`${(ROOT.west * DEG).toFixed(6)}`);
    expect(tileVertexShader).toContain(`${((ROOT.east - ROOT.west) * DEG).toFixed(6)}`);
    expect(tileVertexShader).toContain(`${(ROOT.south * DEG).toFixed(6)}`);
    expect(tileVertexShader).toContain(`${((ROOT.north - ROOT.south) * DEG).toFixed(6)}`);
  });

  it('o globo base não ganha leitura nova (a seca vive nos tiles que cobrem o Brasil)', () => {
    expect(reads(globeFragmentShader)).toBe(1);
  });

  it('nuvens: 2 leituras do ruído e 1 do clima, sem laços, com a luz do Sol do globo', () => {
    expect(reads(cloudFragmentShader)).toBe(3);
    expect(cloudFragmentShader.match(/texture2D\(uNoise/g)).toHaveLength(2);
    expect(cloudFragmentShader.match(/texture2D\(uClimate/g)).toHaveLength(1);
    expect(cloudFragmentShader).not.toMatch(/\bfor\s*\(|\bwhile\s*\(/);
    expect(cloudFragmentShader).toContain('sunLight(vSun)');
    expect(cloudVertexShader).toContain('sunDot(');
  });

  it('nuvens: chuva forte (canal B) deixa a nuvem mais densa e mais cinza', () => {
    expect(cloudFragmentShader).toMatch(/threshold = mix\(0\.80, 0\.50, climate\.r\) - 0\.20 \* climate\.b/);
    expect(cloudFragmentShader).toMatch(/mix\(vec3\([^)]*\), vec3\([^)]*\), climate\.b/);
  });
});
