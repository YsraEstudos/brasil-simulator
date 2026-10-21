import { useFrame, useThree } from './r3f';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import { cameraPose, verticalFovDeg } from './camera';
import { EARTH_RADIUS_M, TILE_GRID, terrainExaggeration } from './config';
import type { GlobeController } from './controller';
import { ufFillGeometries } from './fills';
import { lonLatToVec3, raySphere, tileBounds, vec3ToLonLat, type Vec3 } from './geo';
import { GlobeLabels, type LabelInsets, type LabelsUpdater } from './GlobeLabels';
import type { Rect } from './labels';
import { selectTiles } from './lod';
import type { GlobeBudget } from './qualityProfiles';
import {
  atmosphereFragmentShader,
  atmosphereVertexShader,
  fillFragmentShader,
  fillVertexShader,
  globeFragmentShader,
  globeVertexShader,
  tileFragmentShader,
  tileVertexShader,
} from './shaders';
import { loadTexture, TileStore } from './tileStore';

const DEG = Math.PI / 180;

/** Um quadro desenhado, para medir desempenho sem `setState`. */
export type SceneFrame = { atMs: number; moving: boolean; tilesBusy: boolean };

export type SceneStats = { tiles: number; cached: number; maxLevel: number };

/** Malha única compartilhada por todos os tiles: grade (u, v) + saias nas bordas (z = 1). */
function createTileGeometry(n = TILE_GRID): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const v = (i: number, j: number) => j * (n + 1) + i;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) pos.push(i / n, j / n, 0);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = v(i, j),
        b = v(i + 1, j),
        c = v(i, j + 1),
        d = v(i + 1, j + 1);
      idx.push(a, c, b, b, c, d);
    }
  const edge: number[] = [];
  for (let i = 0; i < n; i++) edge.push(v(i, 0));
  for (let j = 0; j < n; j++) edge.push(v(n, j));
  for (let i = n; i > 0; i--) edge.push(v(i, n));
  for (let j = n; j > 0; j--) edge.push(v(0, j));
  const base = pos.length / 3;
  for (const e of edge) pos.push(pos[e * 3], pos[e * 3 + 1], 1);
  for (let k = 0; k < edge.length; k++) {
    const k2 = (k + 1) % edge.length;
    idx.push(edge[k], base + k, edge[k2], edge[k2], base + k, base + k2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function Stars({ material }: { material: THREE.PointsMaterial }) {
  const geometry = useMemo(() => {
    const rand = seededRandom(2027);
    const p: number[] = [];
    for (let i = 0; i < 1400; i++) {
      const u = rand() * 2 - 1;
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u) * 40;
      p.push(r * Math.cos(a), u * 40, r * Math.sin(a));
    }
    return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <points geometry={geometry} material={material} renderOrder={-2} />;
}

function Atmosphere() {
  return (
    <mesh renderOrder={2}>
      <sphereGeometry args={[1.06, 64, 32]} />
      <shaderMaterial
        vertexShader={atmosphereVertexShader}
        fragmentShader={atmosphereFragmentShader}
        side={THREE.BackSide}
        blending={THREE.AdditiveBlending}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

/** Opacidade do mapa de calor: o relevo continua visível por baixo. */
const FILL_OPACITY = 0.8;

/** Sem mapa de calor: objeto estável para manter o UfFills montado e o quadro atualizado ao desligar as cores. */
const NO_FILLS: Readonly<Record<string, string>> = {};

/** Mapa de calor: uma malha por UF, colorida pela sigla; UFs sem cor ficam ocultas. */
function UfFills({ fills, invalidate }: { fills: Readonly<Record<string, string>>; invalidate: () => void }) {
  'use no memo'; // materiais three.js mutados fora do React
  const meshes = useMemo(() => {
    const out = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>>();
    for (const [sigla, geometry] of ufFillGeometries()) {
      const material = new THREE.ShaderMaterial({
        vertexShader: fillVertexShader,
        fragmentShader: fillFragmentShader,
        uniforms: { uColor: { value: new THREE.Color('#000000') }, uOpacity: { value: FILL_OPACITY } },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 4;
      mesh.frustumCulled = false;
      out.set(sigla, mesh);
    }
    return out;
  }, []);
  useEffect(() => () => meshes.forEach((m) => m.material.dispose()), [meshes]);
  useEffect(() => {
    for (const [sigla, mesh] of meshes) {
      const color = fills[sigla];
      mesh.visible = color !== undefined;
      // O Canvas é `linear`: a cor vai para o shader sem conversão de espaço de cor (fica igual à da legenda).
      if (color) (mesh.material.uniforms.uColor.value as THREE.Color).setStyle(color, THREE.LinearSRGBColorSpace);
    }
    invalidate();
  }, [fills, meshes, invalidate]);
  return (
    <>
      {[...meshes.entries()].map(([sigla, mesh]) => (
        <primitive key={sigla} object={mesh} />
      ))}
    </>
  );
}

type Props = {
  controller: GlobeController;
  selectedUf: { polygons: number[][][] } | null;
  /** Cor de cada UF (sigla → hex) no mapa de calor; `null` = sem mapa. */
  fills?: Readonly<Record<string, string>> | null;
  onStats?: (s: SceneStats) => void;
  /** Áreas do HUD onde nenhum rótulo pode tocar (px da tela). */
  reservedRects: readonly Rect[];
  /** Faixas da tela (área segura e barras do HUD) onde um rótulo não cabe por inteiro. */
  labelInsets: LabelInsets;
  /** `labelScale(textScale)`. */
  labelScale: number;
  /** Tetos do perfil de qualidade ativo (cache, downloads, LOD). Pode mudar com a cena montada. */
  budget: GlobeBudget;
  /** Chamado a cada quadro desenhado (amostragem do ajuste automático); `undefined` = ninguém amostra. */
  onFrame?: (frame: SceneFrame) => void;
};

export function GlobeScene({
  controller,
  selectedUf,
  fills,
  onStats,
  reservedRects,
  labelInsets,
  labelScale,
  budget,
  onFrame,
}: Props) {
  'use no memo'; // objetos three.js são mutados a cada quadro; fora do React Compiler
  const { camera, gl, size, invalidate } = useThree();
  const group = useRef<THREE.Group>(null);
  const meshes = useRef(new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>>());
  const geometry = useMemo(() => createTileGeometry(), []);
  const store = useMemo(
    () => new TileStore(() => invalidate(), Math.min(4, gl.capabilities.getMaxAnisotropy())),
    [gl, invalidate],
  );
  const [world, setWorld] = useState<THREE.Texture | null>(null);
  const globeMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: globeVertexShader,
        fragmentShader: globeFragmentShader,
        uniforms: { uWorld: { value: null }, uHideBox: { value: 0 } },
      }),
    [],
  );
  const starMaterial = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: '#cfd8ff',
        size: 1.6,
        sizeAttenuation: false,
        depthWrite: false,
        transparent: true,
      }),
    [],
  );
  const frustum = useMemo(() => new THREE.Frustum(), []);
  const projScreen = useMemo(() => new THREE.Matrix4(), []);
  const sphere = useMemo(() => new THREE.Sphere(), []);
  const last = useRef({ time: 0, stats: '' });
  const labelsUpdate = useRef<LabelsUpdater | null>(null);
  // O quadro lê o orçamento por aqui: mudar de perfil não recria a cena nem reinicia o laço.
  const budgetRef = useRef(budget);
  const frameEvent = useRef<SceneFrame>({ atMs: 0, moving: false, tilesBusy: false });
  const lastCamera = useRef({ lon: NaN, lat: NaN, altitude: NaN });

  useEffect(() => {
    budgetRef.current = budget;
    store.setBudget(budget);
    invalidate(); // o LOD e o cache precisam de um quadro para refletir os novos tetos
  }, [budget, store, invalidate]);

  useEffect(() => {
    let alive = true;
    let tex: THREE.Texture | null = null;
    loadTexture(require('../../assets/globe/world.jpg'))
      .then((t) => {
        if (!alive) {
          t.dispose();
          return;
        }
        tex = t;
        t.colorSpace = THREE.NoColorSpace;
        t.anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy());
        t.needsUpdate = true;
        globeMaterial.uniforms.uWorld.value = t;
        setWorld(t);
        invalidate();
      })
      .catch((e) => {
        if (__DEV__) console.warn('textura do globo falhou', e);
      });
    return () => {
      alive = false;
      tex?.dispose();
    };
  }, [gl, globeMaterial, invalidate]);

  useEffect(() => {
    controller.invalidate = invalidate;
    controller.viewportHeight = size.height;
    controller.fovDeg = verticalFovDeg(size.width / size.height);
    const raycaster = new THREE.Raycaster();
    controller.pick = (x, y) => {
      raycaster.setFromCamera(new THREE.Vector2((x / size.width) * 2 - 1, -(y / size.height) * 2 + 1), camera);
      const o = raycaster.ray.origin;
      const d = raycaster.ray.direction;
      const hit = raySphere([o.x, o.y, o.z], [d.x, d.y, d.z]);
      return hit ? vec3ToLonLat(hit) : null;
    };
    invalidate();
  }, [camera, controller, invalidate, size]);

  useEffect(
    () => () => {
      store.dispose();
      for (const m of meshes.current.values()) m.material.dispose();
      geometry.dispose();
      globeMaterial.dispose();
      starMaterial.dispose();
    },
    [store, geometry, globeMaterial, starMaterial],
  );

  const highlight = useMemo(() => {
    if (!selectedUf) return null;
    const g = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: '#ffe27a', depthTest: false, transparent: true });
    for (const ring of selectedUf.polygons) {
      const pts = ring.map(([lon, lat]) => new THREE.Vector3(...lonLatToVec3(lon, lat, 1.0015)));
      const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat);
      line.renderOrder = 5;
      g.add(line);
    }
    return g;
  }, [selectedUf]);

  useEffect(() => {
    invalidate();
    return () => {
      highlight?.traverse((o) => {
        if (o instanceof THREE.Line) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    };
  }, [highlight, invalidate]);

  useFrame((state) => {
    const now = state.clock.getElapsedTime();
    const dt = Math.min(0.05, Math.max(0, now - last.current.time));
    last.current.time = now;
    const moving = controller.step(dt);

    // Câmera
    const cam = camera as THREE.PerspectiveCamera;
    const s = controller.state;
    const pose = cameraPose(s);
    cam.position.set(...pose.position);
    cam.up.set(...pose.up);
    cam.lookAt(...pose.target);
    const fov = verticalFovDeg(size.width / size.height);
    cam.fov = fov;
    cam.near = Math.max(0.0004, s.altitude * 0.1);
    cam.far = 120;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    labelsUpdate.current?.(cam, s); // rótulos: só refaz o layout se a câmera ou a tela mudaram

    // LOD dos tiles
    projScreen.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreen);
    const exag = terrainExaggeration(s.altitude);
    const heightScale = exag / EARTH_RADIUS_M;
    const pixelsPerRadian = size.height / (2 * Math.tan((fov * DEG) / 2));
    const { draw, request, used } = selectTiles({
      cameraPosition: pose.position,
      pixelsPerRadian,
      isSphereVisible: (c: Vec3, r: number) => frustum.intersectsSphere(sphere.set(new THREE.Vector3(...c), r)),
      exists: store.exists,
      isLoaded: store.isLoaded,
      maxHeight: (id) => store.maxHeightMeters(id) * heightScale,
      texelThreshold: budgetRef.current.lodTexelThreshold,
      maxLevel: budgetRef.current.maxLevel,
    });
    store.request(request);
    store.touch(used);

    const visible = new Set(draw);
    let maxLevel = 0;
    for (const id of draw) {
      const entry = store.get(id)!;
      let mesh = meshes.current.get(id);
      if (!mesh) {
        const [z, x, y] = id.split('/').map(Number);
        const b = tileBounds({ z, x, y });
        const material = new THREE.ShaderMaterial({
          vertexShader: tileVertexShader,
          fragmentShader: tileFragmentShader,
          side: THREE.DoubleSide,
          uniforms: {
            uBounds: { value: new THREE.Vector4(b.west * DEG, b.north * DEG, b.east * DEG, b.south * DEG) },
            uHeight: { value: entry.height },
            uColor: { value: entry.color },
            uCell: { value: new THREE.Vector3(entry.cellX, entry.cellY, entry.side) },
            uHeightScale: { value: heightScale },
            uSkirt: { value: ((b.east - b.west) * DEG) / 40 },
          },
        });
        mesh = new THREE.Mesh(geometry, material);
        mesh.frustumCulled = false;
        meshes.current.set(id, mesh);
        group.current?.add(mesh);
      }
      const u = mesh.material.uniforms;
      u.uHeightScale.value = heightScale;
      u.uColor.value = entry.color; // o bloco pode ter sido descartado e recarregado
      u.uHeight.value = entry.height;
      mesh.visible = true;
      maxLevel = Math.max(maxLevel, Number(id.split('/')[0]));
    }
    for (const [id, mesh] of meshes.current) {
      if (visible.has(id)) continue;
      mesh.visible = false;
      if (!store.isLoaded(id)) {
        // textura descartada pelo cache: liberar o material também
        group.current?.remove(mesh);
        mesh.material.dispose();
        meshes.current.delete(id);
      }
    }
    // Estrelas somem perto do solo, onde a câmera está dentro da atmosfera
    starMaterial.opacity = 0.8 * Math.min(1, Math.max(0, (s.altitude - 0.06) / 0.25));
    globeMaterial.uniforms.uHideBox.value = store.isLoaded('0/0/0') ? 1 : 0;

    if (onStats) {
      const stats = { tiles: draw.length, cached: store.size, maxLevel };
      const key = JSON.stringify(stats);
      if (key !== last.current.stats) {
        last.current.stats = key;
        onStats(stats);
      }
    }
    if (onFrame) {
      // Arrastar com o dedo não passa por `controller.step` (cada gesto pede o próprio quadro): vale também a câmera ter andado.
      const c = lastCamera.current;
      const cameraMoved = s.lon !== c.lon || s.lat !== c.lat || s.altitude !== c.altitude;
      c.lon = s.lon;
      c.lat = s.lat;
      c.altitude = s.altitude;
      const e = frameEvent.current;
      e.atMs = performance.now();
      e.moving = moving || cameraMoved;
      e.tilesBusy = store.busy;
      onFrame(e);
    }
    if (moving) invalidate();
  });

  return (
    <>
      <color attach="background" args={['#05070f']} />
      <Stars material={starMaterial} />
      {world && (
        <mesh material={globeMaterial}>
          <sphereGeometry args={[1, 128, 64]} />
        </mesh>
      )}
      <group ref={group} />
      <UfFills fills={fills ?? NO_FILLS} invalidate={invalidate} />
      {highlight && <primitive object={highlight} />}
      <GlobeLabels updateRef={labelsUpdate} reservedRects={reservedRects} insets={labelInsets} scale={labelScale} />
      <Atmosphere />
    </>
  );
}
