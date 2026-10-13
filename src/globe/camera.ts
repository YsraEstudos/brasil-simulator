import { CAMERA } from './config';
import { lonLatToVec3, type Vec3 } from './geo';

/** Estado da câmera orbital: ponto-alvo na superfície e altitude acima dele (em raios terrestres). */
export type CameraState = { lon: number; lat: number; altitude: number };

export type CameraPose = { position: Vec3; target: Vec3; up: Vec3; tiltDeg: number };

const DEG = Math.PI / 180;
const MAX_LAT = 85;

export function clampCamera(s: CameraState): CameraState {
  let lon = s.lon;
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return {
    lon,
    lat: Math.max(-MAX_LAT, Math.min(MAX_LAT, s.lat)),
    altitude: Math.max(CAMERA.minAltitude, Math.min(CAMERA.maxAltitude, s.altitude)),
  };
}

/** Inclinação automática: vista de cima de longe, em perspectiva perto do solo. */
export function autoTiltDeg(altitude: number): number {
  const t = (Math.log(0.35) - Math.log(altitude)) / (Math.log(0.35) - Math.log(CAMERA.minAltitude));
  const k = Math.max(0, Math.min(1, t));
  return CAMERA.maxTiltDeg * k * k * (3 - 2 * k);
}

export function cameraPose(s: CameraState): CameraPose {
  const target = lonLatToVec3(s.lon, s.lat);
  const lon = s.lon * DEG;
  const lat = s.lat * DEG;
  // Base local no alvo: normal (up), leste e norte
  const n: Vec3 = target;
  const north: Vec3 = [-Math.sin(lat) * Math.cos(lon), Math.cos(lat), Math.sin(lat) * Math.sin(lon)];
  const tiltDeg = autoTiltDeg(s.altitude);
  const t = tiltDeg * DEG;
  const ct = Math.cos(t);
  const st = Math.sin(t);
  // Câmera recua para o sul e olha para o norte quando inclinada
  const position: Vec3 = [
    target[0] + s.altitude * (n[0] * ct - north[0] * st),
    target[1] + s.altitude * (n[1] * ct - north[1] * st),
    target[2] + s.altitude * (n[2] * ct - north[2] * st),
  ];
  const up: Vec3 = [north[0] * ct + n[0] * st, north[1] * ct + n[1] * st, north[2] * ct + n[2] * st];
  return { position, target, up, tiltDeg };
}

/** Graus de superfície percorridos por pixel de arraste (para o gesto de pan). */
export function degreesPerPixel(altitude: number, viewportHeightPx: number, fovDeg: number = CAMERA.fovDeg): number {
  const visibleRadians = 2 * altitude * Math.tan((fovDeg * DEG) / 2);
  return Math.min(visibleRadians, Math.PI) / DEG / viewportHeightPx;
}

/** FOV vertical efetivo: em telas em retrato, mantém CAMERA.fovDeg na horizontal para o globo caber na largura. */
export function verticalFovDeg(aspect: number): number {
  if (aspect >= 1) return CAMERA.fovDeg;
  return (2 * Math.atan(Math.tan((CAMERA.fovDeg * DEG) / 2) / aspect)) / DEG;
}
