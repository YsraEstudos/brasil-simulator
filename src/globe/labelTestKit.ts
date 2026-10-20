import * as THREE from 'three';

import { cameraPose, verticalFovDeg, type CameraState } from './camera';
import { labelRadius, makeGlobeProjector } from './labelLayout';

/** Só para testes: câmera e projetor iguais aos da cena (FOV efetivo, near/far, mesma pose). */
export function globeProjector(state: CameraState, width: number, height: number) {
  const camera = new THREE.PerspectiveCamera(verticalFovDeg(width / height), width / height, 0.001, 120);
  const pose = cameraPose(state);
  camera.position.set(...pose.position);
  camera.up.set(...pose.up);
  camera.lookAt(...pose.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const viewProjection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const project = makeGlobeProjector({
    viewProjection: viewProjection.elements,
    cameraPosition: pose.position,
    width,
    height,
    radius: labelRadius(state.altitude),
  });
  return { project, fovDeg: camera.fov };
}
