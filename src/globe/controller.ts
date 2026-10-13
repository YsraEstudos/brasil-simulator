import { CAMERA } from './config';
import { clampCamera, degreesPerPixel, type CameraState } from './camera';

type Flight = { from: CameraState; to: CameraState; t: number; duration: number };

/**
 * Estado mutável da câmera, compartilhado entre gestos (fora do Canvas) e a cena (dentro).
 * Fica fora do React para não provocar re-renderizações a cada movimento.
 */
export class GlobeController {
  state: CameraState = { ...CAMERA.initial };
  private velocity = { lon: 0, lat: 0 };
  private flight: Flight | null = null;
  private pinchStart = this.state.altitude;
  viewportHeight = 800;
  fovDeg: number = CAMERA.fovDeg;

  /** Definidos pela cena quando o Canvas é criado. */
  invalidate: () => void = () => {};
  pick: (x: number, y: number) => { lon: number; lat: number } | null = () => null;

  panBy(dx: number, dy: number) {
    this.flight = null;
    const k = degreesPerPixel(this.state.altitude, this.viewportHeight, this.fovDeg);
    const cosLat = Math.max(0.2, Math.cos((this.state.lat * Math.PI) / 180));
    this.state = clampCamera({
      ...this.state,
      lon: this.state.lon - (dx * k) / cosLat,
      lat: this.state.lat + dy * k,
    });
    this.invalidate();
  }

  /** Inércia ao soltar o dedo (velocidade em px/s). */
  release(vx: number, vy: number) {
    const k = degreesPerPixel(this.state.altitude, this.viewportHeight, this.fovDeg);
    const cosLat = Math.max(0.2, Math.cos((this.state.lat * Math.PI) / 180));
    this.velocity = { lon: (-vx * k) / cosLat, lat: vy * k };
    this.invalidate();
  }

  stop() {
    this.velocity = { lon: 0, lat: 0 };
  }

  pinchBegin() {
    this.flight = null;
    this.pinchStart = this.state.altitude;
  }

  pinch(scale: number) {
    this.state = clampCamera({ ...this.state, altitude: this.pinchStart / Math.max(scale, 0.01) });
    this.invalidate();
  }

  zoomBy(factor: number) {
    this.flight = null;
    this.state = clampCamera({ ...this.state, altitude: this.state.altitude * factor });
    this.invalidate();
  }

  flyTo(to: Partial<CameraState>, duration = 1.2) {
    this.velocity = { lon: 0, lat: 0 };
    this.flight = { from: { ...this.state }, to: clampCamera({ ...this.state, ...to }), t: 0, duration };
    this.invalidate();
  }

  /** Avança animações; retorna true se ainda há movimento (a cena pede outro quadro). */
  step(dt: number): boolean {
    if (this.flight) {
      const f = this.flight;
      f.t = Math.min(1, f.t + dt / f.duration);
      const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2;
      let dLon = f.to.lon - f.from.lon;
      if (dLon > 180) dLon -= 360;
      if (dLon < -180) dLon += 360;
      // altitude interpolada em escala logarítmica, com leve "salto" no meio do voo
      const logAlt = Math.log(f.from.altitude) * (1 - e) + Math.log(f.to.altitude) * e;
      const hop = Math.sin(Math.PI * e) * Math.min(0.6, Math.abs(dLon) / 120 + Math.abs(f.to.lat - f.from.lat) / 120);
      this.state = clampCamera({
        lon: f.from.lon + dLon * e,
        lat: f.from.lat + (f.to.lat - f.from.lat) * e,
        altitude: Math.exp(logAlt) * (1 + hop),
      });
      if (f.t >= 1) this.flight = null;
      return true;
    }
    const speed = Math.hypot(this.velocity.lon, this.velocity.lat);
    if (speed < 1e-3) return false;
    this.state = clampCamera({
      ...this.state,
      lon: this.state.lon + this.velocity.lon * dt,
      lat: this.state.lat + this.velocity.lat * dt,
    });
    const decay = Math.exp(-4 * dt);
    this.velocity.lon *= decay;
    this.velocity.lat *= decay;
    return true;
  }
}
