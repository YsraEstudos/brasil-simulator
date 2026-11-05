import { useThree } from './r3f';
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';

import type { CameraState } from './camera';
import type { GlobeController } from './controller';
import { COUNTRY_ATLAS } from './countries';
import { buildCountryQuadBuffers, hitTestCountryLabels, type CountryLabelPoint } from './countryLabels';
import { labelRadius, layoutGlobe, makeGlobeProjector } from './labelLayout';
import { buildLabelQuadBuffers, writeMarkerAttributes, writeVisibility } from './labelQuads';
import type { LabelViewport, Rect } from './labels';
import { startMarkerPulse } from './markerPulse';
import { hitTestMarkers, type GlobeMarker, type MarkerPoint } from './markers';
import {
  countryLabelFragmentShader,
  countryLabelVertexShader,
  labelFragmentShader,
  labelVertexShader,
} from './shaders';
import { loadTexture } from './tileStore';

/** Ordem de desenho: acima do mapa de calor (4) e do contorno da UF selecionada (5). */
const LABELS_RENDER_ORDER = 6;
/** Os nomes dos países vêm na mesma camada, desenhados antes das siglas (a colisão já impede que se cruzem). */
const COUNTRY_LABELS_RENDER_ORDER = 6;

export type LabelInsets = LabelViewport['insets'];

/**
 * Chamado por `GlobeScene` a cada quadro, **depois** de posicionar a câmera. Só recalcula quando a câmera, a tela ou os
 * parâmetros mudaram desde o último layout; câmera parada = custo zero.
 */
export type LabelsUpdater = (camera: THREE.PerspectiveCamera, state: CameraState) => void;

type Props = {
  /** `GlobeScene` chama `updateRef.current` a cada quadro, logo depois de ajustar a câmera. */
  updateRef: MutableRefObject<LabelsUpdater | null>;
  /** Áreas do HUD (px, origem no canto superior esquerdo da tela) onde nenhum rótulo pode tocar. */
  reservedRects: readonly Rect[];
  /** Faixas (px) onde um rótulo não cabe por inteiro: área segura e barras do HUD. */
  insets: LabelInsets;
  /** `labelScale(textScale)`. */
  scale: number;
  /** Marcadores de eventos e notícias (um por UF): mesma malha e mesmo atlas, colisão com prioridade acima das siglas. */
  markers: readonly GlobeMarker[];
  /** Muda quando há marcadores novos e críticos para pulsar (vazio = nenhum): cada mudança dispara um pulso breve. */
  pulseKey: string;
  /** O globo está desenhando (não pausado): o pulso só corre assim. */
  drawing: boolean;
  /** Recebe `pickMarker` (toque em marcador, antes da seleção de UF). */
  controller: GlobeController;
  /** O anel de `pulseKey` terminou as voltas: as instâncias param de pulsar na sessão. */
  onPulseDone?: (instanceIds: readonly string[]) => void;
};

type LaidOut = {
  lon: number;
  lat: number;
  altitude: number;
  width: number;
  height: number;
  dpr: number;
  params: unknown;
};

/**
 * Siglas, pins, pontos e nomes de capital do globo — e, desde o PR 11, os marcadores de eventos e notícias —: **uma**
 * malha e uma chamada de desenho (PLANO_GLOBO.md §7).
 * Os quadriláteros apontam para a esfera e são levados para o espaço da tela no vertex shader (tamanho em px
 * independente da distância; some o hemisfério oculto). Qual rótulo aparece é decidido na CPU por `layoutGlobeLabels`
 * (prioridade + colisão + áreas do HUD) e gravado no atributo `aVisible` — só quando algo mudou.
 */
export function GlobeLabels({
  updateRef,
  reservedRects,
  insets,
  scale,
  markers,
  pulseKey,
  drawing,
  controller,
  onPulseDone,
}: Props) {
  'use no memo'; // buffers e materiais three.js são mutados fora do React
  const { size, gl, invalidate } = useThree();
  const quads = useMemo(() => buildLabelQuadBuffers(), []);
  const visibility = useMemo(() => new Float32Array(quads.quadCount * 4), [quads]);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(quads.positions, 3));
    g.setAttribute('aCorner', new THREE.BufferAttribute(quads.corners, 2));
    // u/v, cor e pulso mudam com os marcadores (glifo, selo, tipo); o resto é fixo.
    const uv = new THREE.BufferAttribute(quads.uvs, 2);
    uv.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aUv', uv);
    g.setAttribute('aKind', new THREE.BufferAttribute(quads.kinds, 1));
    const tint = new THREE.BufferAttribute(quads.tints, 3);
    tint.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aTint', tint);
    const pulse = new THREE.BufferAttribute(quads.pulses, 1);
    pulse.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPulse', pulse);
    const visible = new THREE.BufferAttribute(visibility, 1);
    visible.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aVisible', visible);
    g.setIndex(new THREE.BufferAttribute(quads.indices, 1));
    return g;
  }, [quads, visibility]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: labelVertexShader,
        fragmentShader: labelFragmentShader,
        uniforms: {
          uAtlas: { value: null },
          uPulse: { value: 1 }, // 1 = anel do pulso invisível
          uViewport: { value: new THREE.Vector2(1, 1) },
          uRadius: { value: 1 },
          uScale: { value: 1 },
          uDpr: { value: 1 },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [],
  );

  const mesh = useMemo(() => {
    const m = new THREE.Mesh(geometry, material);
    m.renderOrder = LABELS_RENDER_ORDER;
    m.frustumCulled = false;
    m.visible = false; // até o atlas carregar
    return m;
  }, [geometry, material]);

  // Parâmetros do layout em ref: o laço de quadros lê daqui sem passar pelo React.
  const params = useRef({ reservedRects, insets, scale, markers });
  const laidOut = useRef<LaidOut | null>(null);

  // Nomes dos países (PLANO_PAISES.md, P1): outra malha, com o atlas de campo de distância, mas a mesma colisão.
  const countryQuads = useMemo(() => buildCountryQuadBuffers(), []);
  const countryVisibility = useMemo(() => new Float32Array(countryQuads.quadCount * 4), [countryQuads]);
  const countryGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(countryQuads.positions, 3));
    g.setAttribute('aCorner', new THREE.BufferAttribute(countryQuads.corners, 2));
    g.setAttribute('aUv', new THREE.BufferAttribute(countryQuads.uvs, 2));
    g.setAttribute('aChannel', new THREE.BufferAttribute(countryQuads.channels, 3));
    const visible = new THREE.BufferAttribute(countryVisibility, 1);
    visible.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aVisible', visible);
    g.setIndex(new THREE.BufferAttribute(countryQuads.indices, 1));
    return g;
  }, [countryQuads, countryVisibility]);
  const countryMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: countryLabelVertexShader,
        fragmentShader: countryLabelFragmentShader(COUNTRY_ATLAS.spread, COUNTRY_ATLAS.stroke),
        uniforms: {
          uAtlas: { value: null },
          uViewport: { value: new THREE.Vector2(1, 1) },
          uRadius: { value: 1 },
          uScale: { value: 1 },
          uDpr: { value: 1 },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [],
  );
  const countryMesh = useMemo(() => {
    const m = new THREE.Mesh(countryGeometry, countryMaterial);
    m.renderOrder = COUNTRY_LABELS_RENDER_ORDER;
    m.frustumCulled = false;
    m.visible = false; // até o atlas carregar
    return m;
  }, [countryGeometry, countryMaterial]);
  // Onde os nomes dos países estão na tela depois do último layout: o toque no nome procura aqui.
  const countryPoints = useRef<readonly CountryLabelPoint[]>([]);

  // Atlas dos nomes: PNG opaco com um campo de distância por canal. Sem mipmaps (o texto é desenhado perto de 1:2 e o
  // campo de distância já suaviza a borda): os 512x1024 cabem na meta de memória nova do globo.
  useEffect(() => {
    let alive = true;
    let tex: THREE.Texture | null = null;
    loadTexture(require('../../assets/globe/countryLabels.png'))
      .then((t) => {
        if (!alive) {
          t.dispose();
          return;
        }
        tex = t;
        t.colorSpace = THREE.NoColorSpace;
        t.generateMipmaps = false;
        t.minFilter = THREE.LinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        t.anisotropy = 1;
        t.needsUpdate = true;
        countryMaterial.uniforms.uAtlas.value = t;
        countryMesh.visible = true;
        laidOut.current = null; // força um layout no próximo quadro
        invalidate();
      })
      .catch((e) => {
        if (__DEV__) console.warn('atlas dos nomes de países falhou', e);
      });
    return () => {
      alive = false;
      tex?.dispose();
    };
  }, [countryMaterial, countryMesh, invalidate]);
  // Onde os marcadores estão na tela depois do último layout: o toque os procura aqui.
  const markerPoints = useRef<readonly MarkerPoint[]>([]);
  const viewProjection = useMemo(() => new THREE.Matrix4(), []);

  // O atlas é PNG com alfa reto: textura comum, com mipmaps (o atlas é 2× o tamanho lógico).
  useEffect(() => {
    let alive = true;
    let tex: THREE.Texture | null = null;
    loadTexture(require('../../assets/globe/labels.png'))
      .then((t) => {
        if (!alive) {
          t.dispose();
          return;
        }
        tex = t;
        t.colorSpace = THREE.NoColorSpace;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        t.anisotropy = 1;
        t.needsUpdate = true;
        material.uniforms.uAtlas.value = t;
        mesh.visible = true;
        laidOut.current = null; // força um layout no próximo quadro
        invalidate();
      })
      .catch((e) => {
        if (__DEV__) console.warn('atlas de rótulos falhou', e);
      });
    return () => {
      alive = false;
      tex?.dispose();
    };
  }, [material, mesh, invalidate]);

  // Mudou algo que o layout lê (áreas do HUD, escala do texto, marcadores): pede um quadro; o updater vê que `params`
  // mudou. Cor, glifo e selo dos marcadores vão para os atributos dinâmicos agora (a visibilidade sai do layout).
  useEffect(() => {
    params.current = { reservedRects, insets, scale, markers };
    writeMarkerAttributes(quads, markers);
    for (const name of ['aUv', 'aTint', 'aPulse']) geometry.getAttribute(name).needsUpdate = true;
    invalidate();
  }, [reservedRects, insets, scale, markers, quads, geometry, invalidate]);

  // Toque num marcador: vale antes da seleção da UF (o `GlobeView` pergunta aqui primeiro). Depois, o nome de um país.
  useEffect(() => {
    controller.pickMarker = (x, y) => hitTestMarkers(markerPoints.current, x, y, params.current.scale);
    controller.pickCountryLabel = (x, y) => hitTestCountryLabels(countryPoints.current, x, y);
    return () => {
      controller.pickMarker = () => null;
      controller.pickCountryLabel = () => null;
    };
  }, [controller]);

  // Pulso breve dos marcadores novos e críticos: um laço limitado no tempo (`markerPulse`) que pede quadros só enquanto
  // corre e **para sozinho**; depois disso o globo parado não pede nenhum. Sem desenhar (pausado), não há pulso, e o
  // fim (`onPulseDone`) só é avisado quando o anel acaba de verdade.
  const pulseDone = useRef(onPulseDone);
  // Um marcador de crítico novo está na tela neste quadro (vem do layout): só então o anel corre.
  const pulseVisible = useRef(false);
  useEffect(() => {
    pulseDone.current = onPulseDone;
  });
  useEffect(() => {
    if (!pulseKey || !drawing) return;
    const instances = pulseKey.split('|');
    // O relógio do anel conta só o tempo com o marcador na tela: com a câmera de costas o pulso espera, e o fim só vem
    // depois de três voltas vistas.
    let shownMs = 0;
    let last = performance.now();
    let counting = pulseVisible.current;
    const shownClock = () => {
      const t = performance.now();
      if (counting) shownMs += t - last;
      last = t;
      counting = pulseVisible.current;
      return shownMs;
    };
    const stop = startMarkerPulse(({ phase, done }) => {
      material.uniforms.uPulse.value = phase;
      if (counting) invalidate();
      if (done) pulseDone.current?.(instances);
    }, shownClock);
    return () => {
      stop();
      material.uniforms.uPulse.value = 1;
    };
  }, [pulseKey, drawing, material, invalidate]);

  const dpr = gl.getPixelRatio();

  useEffect(() => {
    updateRef.current = (camera, state) => {
      const p = params.current;
      const prev = laidOut.current;
      if (
        prev &&
        prev.lon === state.lon &&
        prev.lat === state.lat &&
        prev.altitude === state.altitude &&
        prev.width === size.width &&
        prev.height === size.height &&
        prev.dpr === dpr &&
        prev.params === p
      )
        return;
      laidOut.current = {
        lon: state.lon,
        lat: state.lat,
        altitude: state.altitude,
        width: size.width,
        height: size.height,
        dpr,
        params: p,
      };
      const radius = labelRadius(state.altitude);
      for (const u of [material.uniforms, countryMaterial.uniforms]) {
        u.uRadius.value = radius;
        u.uScale.value = p.scale;
        u.uDpr.value = dpr;
        (u.uViewport.value as THREE.Vector2).set(size.width, size.height);
      }

      viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      const project = makeGlobeProjector({
        viewProjection: viewProjection.elements,
        cameraPosition: [camera.position.x, camera.position.y, camera.position.z],
        width: size.width,
        height: size.height,
        radius,
      });
      const layout = layoutGlobe({
        project,
        altitude: state.altitude,
        fovDeg: camera.fov,
        viewport: { width: size.width, height: size.height, insets: p.insets },
        reserved: p.reservedRects,
        scale: p.scale,
        markers: p.markers,
        countries: true,
      });
      markerPoints.current = layout.markerPoints;
      pulseVisible.current = layout.markerPoints.some((pt) => p.markers.some((m) => m.pulse && m.sigla === pt.sigla));
      writeVisibility(visibility, quads.groups, layout.shown);
      geometry.getAttribute('aVisible').needsUpdate = true;
      countryPoints.current = layout.countryPoints;
      writeVisibility(countryVisibility, countryQuads.groups, layout.shown);
      countryGeometry.getAttribute('aVisible').needsUpdate = true;
    };
    return () => {
      updateRef.current = null;
    };
  }, [
    updateRef,
    size.width,
    size.height,
    dpr,
    material,
    geometry,
    quads,
    visibility,
    viewProjection,
    countryMaterial,
    countryGeometry,
    countryQuads,
    countryVisibility,
  ]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      countryGeometry.dispose();
      countryMaterial.dispose();
    },
    [geometry, material, countryGeometry, countryMaterial],
  );

  return (
    <>
      <primitive object={countryMesh} />
      <primitive object={mesh} />
    </>
  );
}
