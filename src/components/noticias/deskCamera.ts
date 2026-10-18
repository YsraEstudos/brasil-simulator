import { Matrix4, Object3D, PerspectiveCamera, Vector3 } from 'three';

/**
 * Geometria e câmera da mesa de notícias. Funções puras (sem React): a cena 3D e as camadas da interface
 * usam as mesmas medidas, então o notebook projetado na tela é exatamente onde fica o botão "Redes".
 * Unidade da cena: 1 = 10 cm. O tampo da mesa fica em y = 0, com a frente voltada para +z.
 */

export type Vec3 = readonly [number, number, number];

export interface CameraPose {
  position: Vec3;
  target: Vec3;
  up: Vec3;
}

export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Campo de visão vertical da câmera da mesa, em graus. */
export const DESK_FOV = 40;

/** Duração da viagem da câmera entre a mesa e o notebook, em segundos. */
export const CAMERA_TRAVEL_S = 1.1;
/** Quanto a câmera sobe no meio da viagem (arco), em unidades da cena. */
const TRAVEL_LIFT = 1.4;

export const DESK = { width: 20, depth: 12, thickness: 0.6 } as const;

/** Notebook: base, tampa articulada na borda de trás e tela (área acesa). */
export const LAPTOP = {
  position: [4.7, 0, -2.6] as Vec3,
  rotationY: -0.38,
  baseWidth: 3.6,
  baseDepth: 2.5,
  baseHeight: 0.14,
  lidHeight: 2.35,
  lidThickness: 0.08,
  /** Inclinação da tampa para trás, em radianos a partir da vertical. */
  lidTilt: 0.32,
  screenWidth: 3.3,
  screenHeight: 2.06,
} as const;

/** Inclinação da câmera na mesa (ângulo abaixo do horizonte), em radianos. */
const DESK_PITCH = (60 * Math.PI) / 180;

/** Matriz do notebook no mundo (posição e giro). */
function laptopMatrix(): Matrix4 {
  const o = new Object3D();
  o.position.set(...LAPTOP.position);
  o.rotation.y = LAPTOP.rotationY;
  o.updateMatrix();
  return o.matrix;
}

/** Matriz da tampa no mundo: articulação na borda de trás da base, inclinada para trás. */
function lidMatrix(): Matrix4 {
  const hinge = new Object3D();
  hinge.position.set(0, LAPTOP.baseHeight, -LAPTOP.baseDepth / 2);
  hinge.rotation.x = -LAPTOP.lidTilt;
  hinge.updateMatrix();
  return laptopMatrix().multiply(hinge.matrix);
}

/** Centro, normal (para fora da tela), vetor "para cima" e tamanho da área acesa da tela. */
export function laptopScreenFrame() {
  const m = lidMatrix();
  const center = new Vector3(0, LAPTOP.lidHeight / 2 + 0.04, 0.006).applyMatrix4(m);
  const normal = new Vector3(0, 0, 1).transformDirection(m);
  const up = new Vector3(0, 1, 0).transformDirection(m);
  return { center, normal, up, width: LAPTOP.screenWidth, height: LAPTOP.screenHeight };
}

/** Os quatro cantos da tela no mundo. */
function screenCorners(): Vector3[] {
  const { center, up, normal, width, height } = laptopScreenFrame();
  const right = new Vector3().crossVectors(up, normal).normalize();
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sy]) =>
    center
      .clone()
      .addScaledVector(right, (sx * width) / 2)
      .addScaledVector(up, (sy * height) / 2),
  );
}

/** Pontos que delimitam o notebook inteiro (base e topo da tampa), para o botão de toque. */
function laptopHull(): Vector3[] {
  const base = laptopMatrix();
  const lid = lidMatrix();
  const w = LAPTOP.baseWidth / 2;
  const d = LAPTOP.baseDepth / 2;
  const pts: Vector3[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) pts.push(new Vector3(sx * w, 0, sz * d).applyMatrix4(base));
    pts.push(new Vector3(sx * w, LAPTOP.lidHeight, 0).applyMatrix4(lid));
  }
  return pts;
}

function makeCamera(pose: CameraPose, aspect: number): PerspectiveCamera {
  const cam = new PerspectiveCamera(DESK_FOV, aspect, 0.1, 200);
  cam.position.set(...pose.position);
  cam.up.set(...pose.up);
  cam.lookAt(...pose.target);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
}

/**
 * Enquadramento da mesa por orientação: a região (pontos no tampo e o notebook) e a faixa vertical da tela
 * (em NDC, −1 embaixo e 1 em cima) onde ela deve caber. Em retrato o notebook vai para a faixa de cima e o
 * jornal ocupa a de baixo; em paisagem a mesa inteira aparece e o jornal fica à esquerda do notebook.
 */
function deskFraming(aspect: number): { region: Vector3[]; bottom: number; top: number } {
  const portrait = aspect < 1;
  const [x0, x1, z0, z1] = portrait ? [-0.6, 8.6, -5.2, -1.2] : [-8.6, 8.8, -5.2, 5.2];
  const region = [
    new Vector3(x0, 0, z0),
    new Vector3(x1, 0, z0),
    new Vector3(x0, 0, z1),
    new Vector3(x1, 0, z1),
    ...laptopHull(),
  ];
  return portrait ? { region, bottom: 0.3, top: 0.94 } : { region, bottom: -0.94, top: 0.94 };
}

/** Limites NDC dos pontos vistos pela câmera. */
function ndcBounds(points: readonly Vector3[], cam: PerspectiveCamera) {
  let maxX = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    const v = p.clone().project(cam);
    maxX = Math.max(maxX, Math.abs(v.x));
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);
  }
  return { maxX, minY, maxY };
}

/**
 * Pose da câmera olhando a mesa de cima, em ângulo. Duas buscas binárias (baratas, só quando a janela muda
 * de tamanho): a distância, para a região caber na faixa; e o deslocamento do alvo ao longo da mesa, para
 * centralizá-la verticalmente na faixa.
 */
export function deskPose(aspect: number): CameraPose {
  const { region, bottom, top } = deskFraming(aspect);
  const center = region
    .slice(0, 4)
    .reduce((acc, p) => acc.add(p), new Vector3())
    .multiplyScalar(0.25);
  const dir = new Vector3(0, Math.sin(DESK_PITCH), Math.cos(DESK_PITCH));
  const mid = (bottom + top) / 2;
  const half = (top - bottom) / 2;
  const poseFor = (d: number, shift: number): CameraPose => {
    const target = center.clone().add(new Vector3(0, 0, shift));
    return {
      position: target.clone().addScaledVector(dir, d).toArray() as unknown as Vec3,
      target: target.toArray() as unknown as Vec3,
      up: [0, 1, 0],
    };
  };
  // Para uma distância, o deslocamento que põe o meio da região no meio da faixa (alvo mais à frente = região sobe).
  const centered = (d: number) => {
    let lo = -40;
    let hi = 40;
    for (let i = 0; i < 22; i++) {
      const s = (lo + hi) / 2;
      const b = ndcBounds(region, makeCamera(poseFor(d, s), aspect));
      if ((b.minY + b.maxY) / 2 < mid) lo = s;
      else hi = s;
    }
    return (lo + hi) / 2;
  };
  let lo = 4;
  let hi = 120;
  for (let i = 0; i < 22; i++) {
    const d = (lo + hi) / 2;
    const b = ndcBounds(region, makeCamera(poseFor(d, centered(d)), aspect));
    if (b.maxX > 0.96 || (b.maxY - b.minY) / 2 > half) lo = d;
    else hi = d;
  }
  return poseFor(hi, centered(hi));
}

/**
 * Pose de frente para a tela do notebook. Em paisagem a tela inteira cabe com folga (vê-se a mesa em volta);
 * em retrato a câmera "entra" na tela até ela cobrir a altura da janela, e as redes ocupam a tela toda.
 */
export function pcPose(aspect: number): CameraPose {
  const { center, normal, up, width, height } = laptopScreenFrame();
  const tan = Math.tan((DESK_FOV * Math.PI) / 360);
  const byHeight = height / 2 / tan;
  const byWidth = width / 2 / (tan * aspect);
  const distance = aspect >= 1 ? Math.max(byHeight, byWidth) / 0.86 : byHeight * 0.98;
  return {
    position: center.clone().addScaledVector(normal, distance).toArray() as unknown as Vec3,
    target: center.toArray() as unknown as Vec3,
    up: up.toArray() as unknown as Vec3,
  };
}

/** Pose inicial da animação de entrada: mais alta e afastada que a da mesa. */
export function introPose(desk: CameraPose): CameraPose {
  const [tx, ty, tz] = desk.target;
  const [px, py, pz] = desk.position;
  return { ...desk, position: [tx + (px - tx) * 1.45, ty + (py - ty) * 1.6, tz + (pz - tz) * 1.2] };
}

export function easeInOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: Vec3, b: Vec3, t: number): [number, number, number] => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

/** Pose no instante `t` (0–1) da viagem: suavizada nas pontas e com um leve arco para cima no meio. */
export function poseAt(from: CameraPose, to: CameraPose, t: number): CameraPose {
  const e = easeInOutCubic(t);
  const position = lerp3(from.position, to.position, e);
  position[1] += Math.sin(Math.PI * e) * TRAVEL_LIFT;
  const up = new Vector3(...lerp3(from.up, to.up, e));
  if (up.lengthSq() < 1e-6) up.set(0, 1, 0);
  up.normalize();
  return { position, target: lerp3(from.target, to.target, e), up: [up.x, up.y, up.z] };
}

/** Retângulo (em pixels) que envolve os pontos projetados, recortado à janela. */
function projectRect(points: readonly Vector3[], pose: CameraPose, width: number, height: number): ScreenRect {
  const cam = makeCamera(pose, width / height);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    const v = p.clone().project(cam);
    const x = ((v.x + 1) / 2) * width;
    const y = ((1 - v.y) / 2) * height;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  minX = Math.max(0, minX);
  minY = Math.max(0, minY);
  maxX = Math.min(width, maxX);
  maxY = Math.min(height, maxY);
  return { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

export interface DeskLayout {
  desk: CameraPose;
  pc: CameraPose;
  /** Notebook visto da mesa: onde fica o botão "Redes". */
  laptop: ScreenRect;
  /** Tela do notebook vista de frente: onde as redes aparecem. */
  screen: ScreenRect;
}

/** Poses e retângulos para uma janela de `width × height` pixels. */
export function deskLayout(width: number, height: number): DeskLayout {
  const aspect = width / Math.max(1, height);
  const desk = deskPose(aspect);
  const pc = pcPose(aspect);
  return {
    desk,
    pc,
    laptop: projectRect(laptopHull(), desk, width, height),
    screen: projectRect(screenCorners(), pc, width, height),
  };
}
