import { describe, expect, it } from 'vitest';

import { autoTiltDeg, cameraPose, clampCamera } from './camera';
import { CAMERA, MAX_LEVEL, ROOT } from './config';
import { lonLatToVec3, pointInRing, raySphere, tileBounds, tileChildren, tileId, vec3ToLonLat, type Vec3 } from './geo';
import { blockOf, pickEvictions } from './cache';
import { selectTiles, type LodInput } from './lod';
import { isHole, ufFillGeometries } from './fills';
import { findUf, UFS } from './ufs';

describe('geo', () => {
  it('converte lon/lat ↔ vetor (ida e volta)', () => {
    for (const [lon, lat] of [
      [-47.9, -15.8],
      [0, 0],
      [179, 60],
      [-120, -45],
    ]) {
      const back = vec3ToLonLat(lonLatToVec3(lon, lat));
      expect(back.lon).toBeCloseTo(lon, 9);
      expect(back.lat).toBeCloseTo(lat, 9);
    }
  });

  it('segue a convenção do THREE.SphereGeometry (lon 0 em +x, polo norte em +y)', () => {
    expect(lonLatToVec3(0, 0)).toEqual([1, 0, -0]);
    expect(lonLatToVec3(0, 90)[1]).toBeCloseTo(1);
    // lon −90 → +z (u = 0,25 na textura equiretangular)
    expect(lonLatToVec3(-90, 0)[2]).toBeCloseTo(1);
  });

  it('subdivide a caixa do Brasil sem buracos nem sobreposição', () => {
    const root = tileBounds({ z: 0, x: 0, y: 0 });
    expect(root).toEqual({ west: ROOT.west, south: ROOT.south, east: ROOT.east, north: ROOT.north });
    const kids = tileChildren({ z: 0, x: 0, y: 0 }).map(tileBounds);
    const area = kids.reduce((s, b) => s + (b.east - b.west) * (b.north - b.south), 0);
    expect(area).toBeCloseTo((ROOT.east - ROOT.west) * (ROOT.north - ROOT.south));
    expect(tileBounds({ z: MAX_LEVEL, x: 0, y: 0 }).east - ROOT.west).toBeCloseTo(1.5);
  });

  it('intersecta raio com a esfera unitária', () => {
    const hit = raySphere([0, 0, 3], [0, 0, -1])!;
    expect(hit[2]).toBeCloseTo(1);
    expect(raySphere([0, 2, 3], [0, 0, -1])).toBeNull();
  });

  it('testa ponto em polígono', () => {
    const square = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    expect(pointInRing(0.5, 0.5, square)).toBe(true);
    expect(pointInRing(1.5, 0.5, square)).toBe(false);
  });
});

describe('camera', () => {
  it('limita altitude e latitude e normaliza longitude', () => {
    const c = clampCamera({ lon: 200, lat: 95, altitude: 100 });
    expect(c.lon).toBe(-160);
    expect(c.lat).toBe(85);
    expect(c.altitude).toBe(CAMERA.maxAltitude);
  });

  it('olha de cima quando longe e inclina perto do solo', () => {
    expect(autoTiltDeg(2)).toBe(0);
    expect(autoTiltDeg(CAMERA.minAltitude)).toBeCloseTo(CAMERA.maxTiltDeg);
  });

  it('posiciona a câmera à distância pedida do alvo', () => {
    for (const altitude of [2, 0.3, CAMERA.minAltitude]) {
      const p = cameraPose({ lon: -50, lat: -15, altitude });
      const d = Math.hypot(...p.position.map((v, i) => v - p.target[i]));
      expect(d).toBeCloseTo(altitude, 9);
      // a câmera fica sempre acima da superfície
      expect(Math.hypot(...p.position)).toBeGreaterThan(1);
    }
  });
});

describe('lod', () => {
  const all = new Set<string>();
  const add = (z: number, x: number, y: number) => {
    all.add(tileId({ z, x, y }));
    if (z < MAX_LEVEL) for (const c of tileChildren({ z, x, y })) add(c.z, c.x, c.y);
  };
  add(0, 0, 0);

  const input = (altitude: number, loaded: (id: string) => boolean): LodInput => {
    const pose = cameraPose({ lon: -50, lat: -15, altitude });
    return {
      cameraPosition: pose.position as Vec3,
      pixelsPerRadian: 1000,
      isSphereVisible: () => true,
      exists: (id) => all.has(id),
      isLoaded: loaded,
      maxHeight: () => 0,
    };
  };

  it('pede o tile raiz quando nada está carregado', () => {
    const r = selectTiles(input(2, () => false));
    expect(r.draw).toEqual([]);
    expect(r.request).toEqual(['0/0/0']);
  });

  it('usa mais detalhe perto do solo que de longe', () => {
    const far = selectTiles(input(2, () => true));
    const near = selectTiles(input(CAMERA.minAltitude, () => true));
    const maxZ = (ids: string[]) => Math.max(...ids.map((id) => Number(id.split('/')[0])));
    expect(maxZ(far.draw)).toBeLessThan(maxZ(near.draw));
    expect(maxZ(near.draw)).toBe(MAX_LEVEL);
  });

  it('marca como usados os ancestrais dos tiles desenhados (o cache não pode descartá-los)', () => {
    const r = selectTiles(input(CAMERA.minAltitude, () => true));
    const used = new Set(r.used);
    for (const id of r.draw) {
      let [z, x, y] = id.split('/').map(Number);
      while (z >= 0) {
        expect(used.has(`${z}/${x}/${y}`)).toBe(true);
        z--;
        x = Math.floor(x / 2);
        y = Math.floor(y / 2);
      }
    }
  });

  it('desenha o pai enquanto os filhos carregam', () => {
    const r = selectTiles(input(CAMERA.minAltitude, (id) => id === '0/0/0'));
    expect(r.draw).toEqual(['0/0/0']);
    expect(r.request).toHaveLength(4);
  });
});

describe('cache + lod durante zoom contínuo', () => {
  const all = new Set<string>();
  const add = (z: number, x: number, y: number) => {
    all.add(tileId({ z, x, y }));
    if (z < MAX_LEVEL) for (const c of tileChildren({ z, x, y })) add(c.z, c.x, c.y);
  };
  add(0, 0, 0);

  /**
   * Simula quadros: seleção → marca uso → carrega até 2 blocos → descarte LRU.
   * Conta recargas de blocos já descartados (cada uma é um "pisca": o detalhe cai e volta).
   */
  function simulate(touchAncestors: boolean, cap: number) {
    const lastUsed = new Map<string, number>();
    const evicted = new Set<string>();
    let frame = 0;
    let reloads = 0;
    let reloadsWhileStill = 0;
    const loaded = (id: string) => lastUsed.has(blockOf(id).key);
    const path: { lon: number; lat: number; altitude: number }[] = [];
    for (let i = 0; i <= 120; i++)
      path.push({ lon: -45 + i * 0.02, lat: -20, altitude: 2 * Math.pow(CAMERA.minAltitude / 2, i / 120) });
    for (let i = 0; i <= 120; i++)
      path.push({ lon: -42.6 - i * 0.05, lat: -20 - i * 0.02, altitude: CAMERA.minAltitude * (1 + i / 60) });
    const moving = path.length;
    for (let i = 0; i < 200; i++) path.push(path[path.length - 1]); // câmera parada
    for (const [i, cam] of path.entries()) {
      frame++;
      const r = selectTiles({
        cameraPosition: cameraPose(cam).position,
        pixelsPerRadian: 520,
        isSphereVisible: () => true,
        exists: (id) => all.has(id),
        isLoaded: loaded,
        maxHeight: () => 0,
      });
      for (const id of touchAncestors ? r.used : r.draw) lastUsed.set(blockOf(id).key, frame);
      const pending = [...new Set(r.request.map((id) => blockOf(id).key))].filter((k) => !lastUsed.has(k));
      for (const key of pending.slice(0, 2)) {
        if (evicted.has(key)) {
          reloads++;
          if (i > moving + 50) reloadsWhileStill++;
        }
        lastUsed.set(key, frame);
        for (const victim of pickEvictions(lastUsed, frame, cap)) {
          lastUsed.delete(victim);
          evicted.add(victim);
        }
      }
    }
    return { reloads, reloadsWhileStill };
  }

  it('reproduz o pisca-pisca quando só os tiles desenhados são protegidos', () => {
    // ancestrais descartados → nível cai → recarrega → descarta outro ancestral → … mesmo parado
    expect(simulate(false, 14).reloadsWhileStill).toBeGreaterThan(0);
  });

  it('estabiliza com a câmera parada quando os ancestrais são protegidos', () => {
    for (const cap of [14, 20]) {
      expect(simulate(true, cap).reloadsWhileStill).toBe(0);
    }
  });
});

describe('UFs no globo (Fase 05)', () => {
  it('toque no DF acha o DF, não GO (o contorno de GO envolve o DF)', () => {
    expect(findUf(-47.88, -15.79)?.sigla).toBe('DF');
    expect(findUf(-49.25, -16.68)?.sigla).toBe('GO');
  });

  it('preenchimento: uma geometria triangulada por UF, sem vizinha de fronteira virando buraco', () => {
    const fills = ufFillGeometries();
    expect(fills.size).toBe(27);
    for (const g of fills.values()) expect(g.getIndex()?.count ?? 0).toBeGreaterThan(0);
    // Sem enclaves nos contornos atuais: cada UF usa só os próprios anéis (sem o ponto de fechamento repetido).
    for (const uf of UFS) {
      const own = uf.polygons.reduce((n, ring) => {
        const closed =
          ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
        return n + ring.length - (closed ? 1 : 0);
      }, 0);
      expect(fills.get(uf.sigla)?.getAttribute('position').count, uf.sigla).toBe(own);
    }
  });

  it('isHole: enclave vira buraco; vizinha que só divide a fronteira não', () => {
    const outer = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const enclave = [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
    ];
    const neighbor = [
      [10, 0],
      [20, 0],
      [20, 10],
      [10, 10],
    ];
    expect(isHole(enclave, outer)).toBe(true);
    expect(isHole(neighbor, outer)).toBe(false);
  });

  it('o centroide de cada uma das 27 UFs cai dentro da própria UF', () => {
    for (const uf of UFS) {
      expect(findUf(uf.centroid[0], uf.centroid[1])?.sigla).toBe(uf.sigla);
    }
  });
});
