import { useFrame, useThree } from './r3f';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as THREE from 'three';

import { cameraPose, verticalFovDeg } from './camera';
import { cityPointBuffers } from './cities';
import {
  buildClimateTexels,
  CLIMATE_TEXTURE_SIZE,
  cloudOffset,
  cloudOpacity,
  hasDrought,
  type ClimateMapData,
} from './climateTexture';
import { cloudCapBuffers } from './cloudCap';
import { CLOUD_DRIFT_PER_SECOND, shouldAnimateClouds, startCloudLoop } from './cloudLoop';
import { EARTH_RADIUS_M, TILE_GRID, terrainExaggeration } from './config';
import type { GlobeController } from './controller';
import { deviceUtc } from './deviceClock';
import { ufFillGeometries } from './fills';
import { lonLatToVec3, raySphere, tileBounds, vec3ToLonLat, type Vec3 } from './geo';
import { GlobeLabels, type LabelInsets, type LabelsUpdater } from './GlobeLabels';
import type { Rect } from './labels';
import type { GlobeMarker } from './markers';
import { CaravanMarker } from './CaravanMarker';
import type { GlobeRailLine } from './railGeometry';
import { RailwayLayer } from './RailwayLayer';
import { lodPixelsPerRadian, selectTiles } from './lod';
import type { GlobeBudget } from './qualityProfiles';
import {
  atmosphereFragmentShader,
  atmosphereVertexShader,
  cityLightsFragmentShader,
  cityLightsVertexShader,
  cloudFragmentShader,
  cloudVertexShader,
  fillFragmentShader,
  fillVertexShader,
  globeFragmentShader,
  globeVertexShader,
  tileFragmentShader,
  tileVertexShader,
} from './shaders';
import { loadTexture, TileStore } from './tileStore';
import { computeSun, sunKey, type SkyInput } from './visualClock';
import { sunTransition } from './motion';

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

/** Uniforms do Sol compartilhados pelo globo base, por todos os tiles e pelas luzes: um valor só, sem emenda. */
type SunUniforms = { uSunDir: { value: THREE.Vector3 }; uSunOn: { value: number } };

/** Luzes das cidades: diâmetro (px lógicos) do maior município no zoom geral e raio em que os pontos flutuam. */
const CITY_POINT_PX = 16;
const CITY_LIGHTS_RADIUS = 1.001;
/** Acima do mapa de calor (4) e do contorno da UF (5), abaixo dos rótulos (6): as luzes não somem sob a cor da UF. */
const CITY_LIGHTS_RENDER_ORDER = 5.5;

/** Nuvens: acima do mapa de calor (4), abaixo do contorno da UF (5) e das luzes (5,5). */
const CLOUD_RENDER_ORDER = 4.5;
/** Repetições do ruído sobre a caixa do Brasil (48°): cada repetição tem ~9,6°. */
const CLOUD_NOISE_TILES = 5;

/** Textura RGBA de `size`² já alocada (preenchida depois), sem filtro de mipmap: o clima não é minificado. */
function createClimateTexture(size: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(new Uint8Array(size * size * 4), size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** Crescimento das luzes ao aproximar a câmera (altitude em raios terrestres): menores de longe, maiores de perto. */
function cityZoom(altitude: number): number {
  return Math.min(2.4, Math.max(0.7, 0.9 / Math.sqrt(altitude)));
}

/** Grava o Sol nos uniforms compartilhados; `true` se mudou desde a última chamada (`last.key`). */
function writeSun(uniforms: SunUniforms, input: SkyInput, last: { key: string }): boolean {
  const sun = computeSun(input);
  const key = sunKey(sun);
  if (key === last.key) return false;
  last.key = key;
  uniforms.uSunDir.value.set(...sun.dir);
  uniforms.uSunOn.value = sun.enabled ? 1 : 0;
  return true;
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
  /** Dia e noite: a escolha da hora e o mês do jogo. No modo `real` o Sol só anda quando já há um quadro. */
  sky: SkyInput;
  /** Clima do mês (seca nos tiles e nuvens); `null` = sem partida: nada de seca nem de nuvens. */
  climate: ClimateMapData | null;
  /** "Nuvens" de Configurações. O perfil de qualidade ainda manda (`budget.effects.clouds`). */
  clouds: boolean;
  /** O globo está desenhando (não pausado): é a condição do laço das nuvens animadas e do pulso dos marcadores. */
  drawing: boolean;
  /** Marcadores de eventos e notícias (um por UF), desenhados com os rótulos. */
  markers: readonly GlobeMarker[];
  /** Muda quando há marcador novo e crítico para pulsar; vazio = nenhum. */
  pulseKey: string;
  /** Fim do anel de `pulseKey` (repassado aos rótulos). */
  onPulseDone?: (instanceIds: readonly string[]) => void;
  reduceMotion: boolean;
  caravan?: { destination: string; key: string } | null;
  /** Camada Ferrovias; `null` = desligada. */
  railways?: readonly GlobeRailLine[] | null;
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
  sky,
  climate,
  clouds: cloudsSetting,
  drawing,
  markers,
  pulseKey,
  onPulseDone,
  reduceMotion,
  caravan,
  railways = null,
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
  const sunUniforms = useMemo<SunUniforms>(
    () => ({ uSunDir: { value: new THREE.Vector3(0, 0, 1) }, uSunOn: { value: 0 } }),
    [],
  );
  const lights = useMemo(() => {
    const { positions, weights } = cityPointBuffers();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aWeight', new THREE.BufferAttribute(weights, 1));
    const material = new THREE.ShaderMaterial({
      vertexShader: cityLightsVertexShader,
      fragmentShader: cityLightsFragmentShader,
      uniforms: {
        uSunDir: sunUniforms.uSunDir,
        uRadius: { value: CITY_LIGHTS_RADIUS },
        uPointPx: { value: CITY_POINT_PX },
        uZoom: { value: 1 },
      },
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false; // os pontos estão na esfera inteira; o descarte é do shader
    points.renderOrder = CITY_LIGHTS_RENDER_ORDER;
    points.visible = false;
    return points;
  }, [sunUniforms]);
  const globeMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: globeVertexShader,
        fragmentShader: globeFragmentShader,
        uniforms: {
          uWorld: { value: null },
          uHideBox: { value: 0 },
          uSunDir: sunUniforms.uSunDir,
          uSunOn: sunUniforms.uSunOn,
        },
      }),
    [sunUniforms],
  );
  // Clima: a textura 128² (R nuvem, G seca, B chuva forte) é uma só, regravada uma vez por mês, e a máscara de água
  // (R8 256², vem do build) só é carregada quando há seca para mascarar. Os uniforms são compartilhados pelos tiles e
  // pelas nuvens: um valor só, sem emenda.
  const climateTexture = useMemo(() => createClimateTexture(CLIMATE_TEXTURE_SIZE), []);
  const blankTexture = useMemo(() => {
    const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
    t.needsUpdate = true;
    return t;
  }, []);
  const climateUniforms = useMemo(
    () => ({
      uClimate: { value: climateTexture as THREE.Texture },
      uWater: { value: blankTexture as THREE.Texture },
      uDrought: { value: 0 },
    }),
    [climateTexture, blankTexture],
  );
  const cloudMesh = useMemo(() => {
    const { positions, uvs, indices } = cloudCapBuffers();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    const material = new THREE.ShaderMaterial({
      vertexShader: cloudVertexShader,
      fragmentShader: cloudFragmentShader,
      uniforms: {
        uClimate: climateUniforms.uClimate,
        uNoise: { value: blankTexture as THREE.Texture },
        uDrift: { value: new THREE.Vector2() },
        uTiles: { value: CLOUD_NOISE_TILES },
        uOpacity: { value: 0 },
        uSunDir: sunUniforms.uSunDir,
        uSunOn: sunUniforms.uSunOn,
      },
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false; // a calota cobre a tela inteira no zoom geral; o descarte é por opacidade
    mesh.renderOrder = CLOUD_RENDER_ORDER;
    mesh.visible = false; // desligada: nenhuma chamada de desenho
    return mesh;
  }, [climateUniforms, blankTexture, sunUniforms]);
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
  // Sol: o quadro lê a escolha por aqui (como o orçamento). Hora fixa e "Sempre dia" só gravam ao mudar a escolha ou o
  // mês, nunca pedem quadro sozinhos; "Hora real" regrava a cada quadro já desenhado (sem temporizador).
  const skyRef = useRef(sky);
  const lastSun = useRef({ key: '' });
  const sunFlight = useRef<{ from: Vec3; to: Vec3; start: number } | null>(null);
  const previousSky = useRef<SkyInput | null>(null);
  // Nuvens e seca: o quadro lê o estado por aqui (nada de `setState` por quadro).
  const cloudState = useRef({
    on: false, // perfil permite + opção ligada + textura de ruído pronta + clima gravado
    animated: false,
    heatMap: false,
    offset: [0, 0] as [number, number],
    visible: false,
    noise: false, // textura de ruído carregada
  });
  const [waterReady, setWaterReady] = useState(false);
  const waterTexture = useRef<THREE.Texture | null>(null);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const heatMapOn = !!fills && Object.keys(fills).length > 0;
  const droughtVisible = useMemo(() => (climate ? hasDrought(climate.values) : false), [climate]);
  // O perfil de qualidade decide se o aparelho desenha nuvens; a opção do jogador só desliga.
  const cloudsAllowed = cloudsSetting && budget.effects.clouds;
  const cloudsAnimated = cloudsAllowed && budget.effects.animatedClouds && !reduceMotion;

  useEffect(() => {
    skyRef.current = sky;
    const input = sky.setting.mode === 'real' ? { ...sky, utc: deviceUtc() } : sky;
    const previous = previousSky.current;
    const target = computeSun(input);
    if (
      !reduceMotion &&
      previous?.setting.mode === 'fixa' &&
      previous.month !== sky.month &&
      sky.setting.mode === 'fixa' &&
      target.enabled
    ) {
      const dir = sunUniforms.uSunDir.value;
      sunFlight.current = { from: [dir.x, dir.y, dir.z], to: target.dir, start: performance.now() };
    } else {
      sunFlight.current = null;
      writeSun(sunUniforms, input, lastSun.current);
    }
    previousSky.current = sky;
    lights.visible = sunUniforms.uSunOn.value > 0.5;
    invalidate();
  }, [sky, sunUniforms, lights, invalidate, reduceMotion]);

  useEffect(() => {
    budgetRef.current = budget;
    store.setBudget(budget);
    invalidate(); // o LOD e o cache precisam de um quadro para refletir os novos tetos
  }, [budget, store, invalidate]);

  // Primeiro plano do aplicativo: o laço das nuvens animadas para em segundo plano (muda raramente; não é por quadro).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => setAppActive(next === 'active'));
    return () => sub.remove();
  }, []);

  // Máscara de água do build (só terra recebe o tom de seca): carregada na primeira seca visível.
  useEffect(() => {
    if (!droughtVisible || waterTexture.current) return;
    let alive = true;
    loadTexture(require('../../assets/globe/climate/water_mask.png'))
      .then((t) => {
        if (!alive) {
          t.dispose();
          return;
        }
        t.colorSpace = THREE.NoColorSpace;
        waterTexture.current = t;
        climateUniforms.uWater.value = t;
        setWaterReady(true);
      })
      .catch((e) => {
        if (__DEV__) console.warn('máscara de água falhou', e);
      });
    return () => {
      alive = false;
    };
  }, [droughtVisible, climateUniforms]);
  useEffect(
    () => () => {
      waterTexture.current?.dispose();
      waterTexture.current = null;
    },
    [],
  );

  // Ruído das nuvens (R8 256² ladrilhável): só se o perfil permite nuvens e a opção está ligada.
  useEffect(() => {
    if (!cloudsAllowed) return;
    const state = cloudState.current; // objeto estável do componente (o ref nunca é trocado)
    let alive = true;
    let tex: THREE.Texture | null = null;
    loadTexture(require('../../assets/globe/climate/cloud_noise.png'))
      .then((t) => {
        if (!alive) {
          t.dispose();
          return;
        }
        tex = t;
        t.colorSpace = THREE.NoColorSpace;
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        t.needsUpdate = true;
        (cloudMesh.material as THREE.ShaderMaterial).uniforms.uNoise.value = t;
        state.noise = true;
        invalidate();
      })
      .catch((e) => {
        if (__DEV__) console.warn('ruído das nuvens falhou', e);
      });
    return () => {
      alive = false;
      if (tex) {
        state.noise = false;
        (cloudMesh.material as THREE.ShaderMaterial).uniforms.uNoise.value = blankTexture;
        tex.dispose();
      }
    };
  }, [cloudsAllowed, cloudMesh, blankTexture, invalidate]);

  // Textura de clima: refeita só quando o clima do mês muda (ou quando as nuvens são ligadas), nunca por quadro.
  // Sem seca visível e sem nuvens nada é construído e o sombreamento dos tiles nem lê as texturas (`uDrought` = 0).
  useEffect(() => {
    const state = cloudState.current;
    if (!climate || (!cloudsAllowed && !droughtVisible)) {
      climateUniforms.uDrought.value = 0;
      state.on = false;
      invalidate();
      return;
    }
    const texels = buildClimateTexels({ values: climate.values });
    (climateTexture.image.data as Uint8Array).set(texels);
    climateTexture.needsUpdate = true;
    state.offset = cloudOffset(climate.seed);
    state.on = cloudsAllowed;
    climateUniforms.uDrought.value = droughtVisible && waterReady ? 1 : 0;
    invalidate();
  }, [climate, cloudsAllowed, droughtVisible, waterReady, climateTexture, climateUniforms, invalidate]);

  // Laço das nuvens animadas (só no Alto): no máximo 30 pedidos de quadro por segundo, só enquanto as nuvens estão
  // visíveis, o globo desenha e o app está em primeiro plano. Qualquer condição que falte limpa o temporizador.
  const animate = shouldAnimateClouds({
    profileAllows: cloudsAnimated,
    cloudsOn: cloudsAllowed,
    drawing,
    appActive,
  });
  useEffect(() => {
    if (!animate) return;
    return startCloudLoop(() => {
      if (cloudState.current.visible) invalidate();
    });
  }, [animate, invalidate]);
  useEffect(() => {
    cloudState.current.animated = animate;
    cloudState.current.heatMap = heatMapOn;
    invalidate();
  }, [animate, heatMapOn, invalidate]);

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
      lights.geometry.dispose();
      (lights.material as THREE.Material).dispose();
    },
    [store, geometry, globeMaterial, starMaterial, lights],
  );

  useEffect(
    () => () => {
      cloudMesh.geometry.dispose();
      (cloudMesh.material as THREE.Material).dispose();
      climateTexture.dispose();
      blankTexture.dispose();
    },
    [cloudMesh, climateTexture, blankTexture],
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
    const flight = sunFlight.current;
    if (flight) {
      const transition = sunTransition(flight.from, flight.to, performance.now() - flight.start, reduceMotion);
      sunUniforms.uSunDir.value.set(...transition.dir);
      if (transition.active) invalidate();
      else {
        sunFlight.current = null;
        lastSun.current.key = '';
      }
    }

    // Sol em "Hora real": só aqui, num quadro que já vai ser desenhado.
    if (skyRef.current.setting.mode === 'real') {
      writeSun(sunUniforms, { ...skyRef.current, utc: deviceUtc() }, lastSun.current);
    }

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
    const pixelsPerRadian = lodPixelsPerRadian(size.height, fov, gl.getPixelRatio());
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
            uSunDir: sunUniforms.uSunDir,
            uSunOn: sunUniforms.uSunOn,
            uClimate: climateUniforms.uClimate,
            uWater: climateUniforms.uWater,
            uDrought: climateUniforms.uDrought,
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
    if (lights.visible) {
      const u = (lights.material as THREE.ShaderMaterial).uniforms;
      u.uZoom.value = cityZoom(s.altitude);
      u.uPointPx.value = CITY_POINT_PX * gl.getPixelRatio();
    }
    // Nuvens: invisíveis (sem chamada de desenho) quando desligadas, sem textura de ruído, longe demais do zoom
    // geral... ou perto demais. A deriva só anda quando o laço do Alto está ligado; parada, o padrão do mês.
    const cs = cloudState.current;
    const opacity = cs.on && cs.noise ? cloudOpacity(s.altitude, cs.heatMap) : 0;
    cs.visible = opacity > 0.01;
    cloudMesh.visible = cs.visible;
    if (cs.visible) {
      const u = (cloudMesh.material as THREE.ShaderMaterial).uniforms;
      u.uOpacity.value = opacity;
      const drift = cs.animated ? now * CLOUD_DRIFT_PER_SECOND : 0;
      (u.uDrift.value as THREE.Vector2).set(cs.offset[0] + drift, cs.offset[1] + drift * 0.4);
    }

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
      {railways && railways.length > 0 && <RailwayLayer lines={railways} />}
      {caravan && (
        <CaravanMarker
          key={caravan.key}
          destination={caravan.destination}
          reduceMotion={reduceMotion}
          drawing={drawing}
        />
      )}
      <primitive object={cloudMesh} />
      <primitive object={lights} />
      {highlight && <primitive object={highlight} />}
      <GlobeLabels
        updateRef={labelsUpdate}
        reservedRects={reservedRects}
        insets={labelInsets}
        scale={labelScale}
        markers={markers}
        pulseKey={pulseKey}
        drawing={drawing}
        controller={controller}
        onPulseDone={onPulseDone}
      />
      <Atmosphere />
    </>
  );
}
