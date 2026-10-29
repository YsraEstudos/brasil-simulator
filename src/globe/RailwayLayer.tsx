import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

import { buildRibbon, groupRailLines, type GlobeRailLine } from './railGeometry';
import { useFrame, useThree } from './r3f';
import { railFragmentShader, railVertexShader } from './shaders';

/**
 * Ferrovias no globo (PLANO_EXPANSAO EX-30): uma malha por estilo e por passada — primeiro todos os contornos escuros,
 * depois os miolos coloridos — sem teste de profundidade, como os preenchimentos das UFs. Entre os preenchimentos (4)
 * e o contorno da UF selecionada (5): a ferrovia fica legível sobre qualquer mapa de calor e a seleção continua por
 * cima. Nada anima: o único uniforme por quadro é o ângulo de um px, que muda com o zoom e o tamanho da tela.
 */

/** Raio da camada: o mesmo do contorno da UF selecionada. */
const RAIL_RADIUS = 1.0015;
const CASING_RENDER_ORDER = 4.7;
const CORE_RENDER_ORDER = 4.8;
/** Borda suavizada (fração da meia largura): antisserrilhado barato sem MSAA. */
const CORE_FEATHER = 0.45;
const CASING_FEATHER = 0.3;
/** Contorno: px somados de cada lado do miolo. */
const CASING_PX = 1.5;
const CASING_OPACITY = 0.85;

type RailMesh = THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;

export function RailwayLayer({ lines }: { lines: readonly GlobeRailLine[] }) {
  'use no memo'; // materiais three.js mutados fora do React
  const { camera, size, invalidate } = useThree();
  const pxAngle = useMemo(() => ({ value: 0 }), []);
  const meshes = useMemo(() => {
    const out: RailMesh[] = [];
    const groups = groupRailLines(lines);
    for (const pass of ['casing', 'core'] as const) {
      for (const group of groups) {
        const ribbon = buildRibbon(group.paths);
        if (ribbon.vertexCount === 0) continue;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(ribbon.positions, 3));
        geometry.setAttribute('aOffset', new THREE.BufferAttribute(ribbon.offsets, 3));
        geometry.setAttribute('aSide', new THREE.BufferAttribute(ribbon.sides, 1));
        geometry.setAttribute('aDist', new THREE.BufferAttribute(ribbon.distances, 1));
        geometry.setIndex(new THREE.BufferAttribute(ribbon.indices, 1));
        const { sample } = group;
        const casing = pass === 'casing';
        const material = new THREE.ShaderMaterial({
          vertexShader: railVertexShader,
          fragmentShader: railFragmentShader,
          uniforms: {
            uRadius: { value: RAIL_RADIUS },
            uHalfWidthPx: { value: (sample.widthPx + (casing ? 2 * CASING_PX : 0)) / 2 },
            uPxAngle: pxAngle,
            // O Canvas é `linear`: a cor vai sem conversão (fica igual à da legenda), como nos preenchimentos.
            uColor: {
              value: new THREE.Color().setStyle(casing ? sample.casing : sample.color, THREE.LinearSRGBColorSpace),
            },
            uOpacity: { value: sample.opacity * (casing ? CASING_OPACITY : 1) },
            // O contorno é contínuo: o vão do tracejado mostra o escuro por baixo, não o mapa.
            uDash: { value: new THREE.Vector2(...(!casing && sample.dash ? sample.dash : [1, 0])) },
            uFeather: { value: casing ? CASING_FEATHER : CORE_FEATHER },
          },
          transparent: true,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = casing ? CASING_RENDER_ORDER : CORE_RENDER_ORDER;
        mesh.frustumCulled = false; // a fita cresce no shader; a caixa da geometria não a contém
        out.push(mesh);
      }
    }
    return out;
  }, [lines, pxAngle]);

  useEffect(() => {
    invalidate();
    return () => {
      for (const m of meshes) {
        m.geometry.dispose();
        m.material.dispose();
      }
    };
  }, [meshes, invalidate]);

  useFrame(() => {
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 45;
    pxAngle.value = (fov * Math.PI) / 180 / Math.max(1, size.height);
  });

  return (
    <>
      {meshes.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
    </>
  );
}
