import { useThree } from './r3f';
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';

import type { CameraState } from './camera';
import { labelRadius, layoutGlobeLabels, makeGlobeProjector } from './labelLayout';
import { buildLabelQuadBuffers, writeVisibility } from './labelQuads';
import type { LabelViewport, Rect } from './labels';
import { labelFragmentShader, labelVertexShader } from './shaders';
import { loadTexture } from './tileStore';

/** Ordem de desenho: acima do mapa de calor (4) e do contorno da UF selecionada (5). */
const LABELS_RENDER_ORDER = 6;

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
 * Siglas, pins, pontos e nomes de capital do globo: **uma** malha e uma chamada de desenho (PLANO_GLOBO.md §7, PR 2).
 * Os quadriláteros apontam para a esfera e são levados para o espaço da tela no vertex shader (tamanho em px
 * independente da distância; some o hemisfério oculto). Qual rótulo aparece é decidido na CPU por `layoutGlobeLabels`
 * (prioridade + colisão + áreas do HUD) e gravado no atributo `aVisible` — só quando algo mudou.
 */
export function GlobeLabels({ updateRef, reservedRects, insets, scale }: Props) {
  'use no memo'; // buffers e materiais three.js são mutados fora do React
  const { size, gl, invalidate } = useThree();
  const quads = useMemo(() => buildLabelQuadBuffers(), []);
  const visibility = useMemo(() => new Float32Array(quads.quadCount * 4), [quads]);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(quads.positions, 3));
    g.setAttribute('aCorner', new THREE.BufferAttribute(quads.corners, 2));
    g.setAttribute('aUv', new THREE.BufferAttribute(quads.uvs, 2));
    g.setAttribute('aKind', new THREE.BufferAttribute(quads.kinds, 1));
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
  const params = useRef({ reservedRects, insets, scale });
  const laidOut = useRef<LaidOut | null>(null);
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

  // Mudou algo que o layout lê (áreas do HUD, escala do texto): pede um quadro; o updater vê que `params` mudou.
  useEffect(() => {
    params.current = { reservedRects, insets, scale };
    invalidate();
  }, [reservedRects, insets, scale, invalidate]);

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
      const u = material.uniforms;
      u.uRadius.value = radius;
      u.uScale.value = p.scale;
      u.uDpr.value = dpr;
      (u.uViewport.value as THREE.Vector2).set(size.width, size.height);

      viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      const project = makeGlobeProjector({
        viewProjection: viewProjection.elements,
        cameraPosition: [camera.position.x, camera.position.y, camera.position.z],
        width: size.width,
        height: size.height,
        radius,
      });
      const shown = layoutGlobeLabels({
        project,
        altitude: state.altitude,
        fovDeg: camera.fov,
        viewport: { width: size.width, height: size.height, insets: p.insets },
        reserved: p.reservedRects,
        scale: p.scale,
      });
      writeVisibility(visibility, quads.groups, shown);
      geometry.getAttribute('aVisible').needsUpdate = true;
    };
    return () => {
      updateRef.current = null;
    };
  }, [updateRef, size.width, size.height, dpr, material, geometry, quads, visibility, viewProjection]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return <primitive object={mesh} />;
}
