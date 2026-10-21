import { describe, expect, it } from 'vitest';

import { cloudCapBuffers, CLOUD_CAP_RADIUS, CLOUD_CAP_SEGMENTS } from './cloudCap';
import { ROOT } from './config';
import { vec3ToLonLat } from './geo';

describe('calota das nuvens (32×32)', () => {
  const { positions, uvs, indices } = cloudCapBuffers();

  it('33² vértices e 32² quadrados (2.048 triângulos): uma malha pequena, uma chamada de desenho', () => {
    const side = CLOUD_CAP_SEGMENTS + 1;
    expect(positions).toHaveLength(side * side * 3);
    expect(uvs).toHaveLength(side * side * 2);
    expect(indices).toHaveLength(CLOUD_CAP_SEGMENTS * CLOUD_CAP_SEGMENTS * 6);
    expect(indices.length / 3).toBe(2048);
    expect(Math.max(...indices)).toBe(side * side - 1);
  });

  it('todos os vértices ficam na esfera do raio da calota, e os cantos são os cantos da caixa da quadtree', () => {
    for (let i = 0; i < positions.length; i += 3) {
      expect(Math.hypot(positions[i], positions[i + 1], positions[i + 2])).toBeCloseTo(CLOUD_CAP_RADIUS, 5);
    }
    const sw = vec3ToLonLat([positions[0], positions[1], positions[2]]);
    expect(sw.lon).toBeCloseTo(ROOT.west, 3);
    expect(sw.lat).toBeCloseTo(ROOT.south, 3);
    const last = positions.length - 3;
    const ne = vec3ToLonLat([positions[last], positions[last + 1], positions[last + 2]]);
    expect(ne.lon).toBeCloseTo(ROOT.east, 3);
    expect(ne.lat).toBeCloseTo(ROOT.north, 3);
    expect([uvs[0], uvs[1], uvs[uvs.length - 2], uvs[uvs.length - 1]]).toEqual([0, 0, 1, 1]);
  });

  it('o sentido dos triângulos é o da face de fora (nenhum é descartado por culling)', () => {
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]].map(
        (k) => [positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2]] as const,
      );
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      expect(n[0] * a[0] + n[1] * a[1] + n[2] * a[2]).toBeGreaterThan(0);
    }
  });
});
