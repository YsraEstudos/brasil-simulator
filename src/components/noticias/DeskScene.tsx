import { useEffect, useMemo, useRef, useState } from 'react';
import { AdditiveBlending, BufferAttribute, DoubleSide, PlaneGeometry, Vector3, type Texture } from 'three';

import { useFrame, useThree } from '@/globe/r3f';

import { CAMERA_TRAVEL_S, DESK, introPose, LAPTOP, poseAt, type CameraPose } from './deskCamera';
import { keyboardTexture, newspaperTexture, radialTexture, screenTexture, woodTexture } from './deskTextures';

/**
 * Mesa de notícias em 3D (react-three-fiber). Feita para Android modesto: poucas peças de baixa contagem de
 * polígonos, materiais Lambert/Basic, sombras falsas (manchas transparentes) no lugar de mapas de sombra,
 * texturas pequenas geradas em código e `frameloop="demand"` — só desenha enquanto a câmera se move.
 */

export type DeskGoal = 'mesa' | 'pc';

/** Mata de feltro e folha de jornal na mesa (centro x, z e tamanho). */
const MAT = { x: -2.4, z: 0.5 } as const;
const PAPER = { x: -2.4, z: 0.6, w: 6.6, d: 8.6 } as const;

interface DeskSceneProps {
  poses: { desk: CameraPose; pc: CameraPose };
  goal: DeskGoal;
  /** Edições antigas empilhadas ao lado (1 folha por edição, até 6). */
  editions: number;
  onArrive: (goal: DeskGoal) => void;
}

/** Texturas criadas uma vez e liberadas ao desmontar. */
function useTextures() {
  const textures = useMemo(
    () => ({
      wood: woodTexture(),
      shadow: radialTexture([0, 0, 0], 1.6),
      glow: radialTexture([120, 190, 255], 2.4),
      paper: newspaperTexture(),
      screen: screenTexture(),
      keyboard: keyboardTexture(),
    }),
    [],
  );
  useEffect(() => () => Object.values(textures).forEach((t) => t.dispose()), [textures]);
  textures.wood.repeat.set(2, 1);
  return textures;
}

export function DeskScene({ poses, goal, editions, onArrive }: DeskSceneProps) {
  const tex = useTextures();
  return (
    <>
      <color attach="background" args={['#0b0806']} />
      <fog attach="fog" args={['#0b0806', 22, 46]} />
      <hemisphereLight args={['#c9d6ff', '#3a2414', 0.9]} />
      <directionalLight position={[-6, 12, 4]} intensity={1.7} color="#ffe6c4" />
      <directionalLight position={[8, 6, 10]} intensity={0.35} color="#9fb6ff" />

      <CameraRig poses={poses} goal={goal} onArrive={onArrive} />

      {/* Chão do escritório, bem abaixo: só aparece nas bordas em paisagem. */}
      <mesh position={[0, -7, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[80, 80]} />
        <meshBasicMaterial color="#120c08" />
      </mesh>

      <Desk wood={tex.wood} />
      <DeskMat />
      <FoldedNewspaper paper={tex.paper} />
      <Laptop screen={tex.screen} keyboard={tex.keyboard} glow={tex.glow} shadow={tex.shadow} />
      <Lamp shadow={tex.shadow} />
      <Mug shadow={tex.shadow} />
      <PaperStack count={editions} paper={tex.paper} shadow={tex.shadow} />
      <Plant shadow={tex.shadow} />
      <Pen />
      <Glasses shadow={tex.shadow} />
      <Phone shadow={tex.shadow} />
    </>
  );
}

/** Leva a câmera de uma pose a outra; pede quadros só enquanto viaja. */
function CameraRig({ poses, goal, onArrive }: Omit<DeskSceneProps, 'editions'>) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  // Entrada: a câmera desce de mais alto até a mesa.
  const [intro] = useState(() => introPose(poses.desk));
  const travel = useRef({ from: intro, to: poses.desk, t: 0, goal, intro: true });
  const current = useRef<CameraPose>(intro);
  const lookAt = useMemo(() => new Vector3(), []);

  const apply = (pose: CameraPose) => {
    current.current = pose;
    camera.position.set(...pose.position);
    camera.up.set(...pose.up);
    camera.lookAt(lookAt.set(...pose.target));
  };

  // Novo destino: parte de onde a câmera está agora (inclusive no meio de outra viagem).
  useEffect(() => {
    const to = poses[goal === 'mesa' ? 'desk' : 'pc'];
    const t = travel.current;
    if (t.goal !== goal) {
      travel.current = { from: current.current, to, t: 0, goal, intro: false };
    } else if (t.t >= 1) {
      apply(to); // só mudou o tamanho da janela: salta para a nova pose
    } else {
      t.to = to;
    }
    invalidate();
    // apply é estável o bastante: depende só da câmera
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal, poses, invalidate]);

  useFrame((_, delta) => {
    const t = travel.current;
    if (t.t >= 1) return;
    // Com frameloop "demand" o primeiro delta pode carregar o tempo parado: limitado a 1/30 s.
    const step = Math.min(delta, 1 / 30) / (t.intro ? CAMERA_TRAVEL_S * 1.5 : CAMERA_TRAVEL_S);
    t.t = Math.min(1, t.t + step);
    apply(poseAt(t.from, t.to, t.t));
    if (t.t < 1) invalidate();
    else onArrive(t.goal);
  });

  return null;
}

/** Sombra falsa: mancha escura no tampo, logo acima dele. */
function Blob({
  map,
  size,
  at,
  opacity = 0.55,
}: {
  map: Texture;
  size: [number, number];
  at: [number, number];
  opacity?: number;
}) {
  return (
    <mesh position={[at[0], 0.012, at[1]]} rotation-x={-Math.PI / 2} renderOrder={1}>
      <planeGeometry args={size} />
      <meshBasicMaterial map={map} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

/**
 * Luz "assada" no tampo (multiplicador RGB por ponto x, z): ambiente, poça quente da luminária, brilho azul da
 * tela, sombra macia do jornal e vinheta nas bordas. Calculada uma vez nos vértices — o tampo e a mata usam
 * material sem iluminação, o que poupa a GPU justamente nas peças que cobrem a tela inteira.
 */
function deskLight(x: number, z: number): [number, number, number] {
  const gauss = (cx: number, cz: number, sigma: number) =>
    Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * sigma * sigma));
  const lamp = gauss(-3.2, -0.4, 5.2);
  const screen = gauss(3.9, -1.2, 1.5);
  // Sombra do jornal: cai suavemente fora do retângulo da folha (deslocada para a direita e para a frente).
  const dx = Math.max(0, Math.abs(x - PAPER.x - 0.25) - PAPER.w / 2);
  const dz = Math.max(0, Math.abs(z - PAPER.z - 0.3) - PAPER.d / 2);
  const paperShadow = Math.max(0, 1 - Math.hypot(dx, dz) / 0.9);
  const edge = Math.max(Math.abs(x) / (DESK.width / 2), Math.abs(z) / (DESK.depth / 2));
  const vignette = 1 - 0.45 * Math.max(0, (edge - 0.55) / 0.45) ** 2;
  const k = vignette * (1 - 0.45 * paperShadow);
  return [
    (0.5 + lamp * 0.78 + screen * 0.08) * k,
    (0.47 + lamp * 0.6 + screen * 0.16) * k,
    (0.46 + lamp * 0.4 + screen * 0.3) * k,
  ];
}

/** Retângulo do tampo voltado para cima, subdividido, com a luz assada como cor de vértice. */
function useLitPlane(width: number, depth: number, at: [number, number], tint: [number, number, number]) {
  const geometry = useMemo(() => {
    const g = new PlaneGeometry(width, depth, Math.ceil(width * 2), Math.ceil(depth * 2));
    g.rotateX(-Math.PI / 2);
    const pos = g.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const [r, gr, b] = deskLight(pos.getX(i) + at[0], pos.getZ(i) + at[1]);
      colors[i * 3] = r * tint[0];
      colors[i * 3 + 1] = gr * tint[1];
      colors[i * 3 + 2] = b * tint[2];
    }
    g.setAttribute('color', new BufferAttribute(colors, 3));
    return g;
    // medidas fixas de cada peça
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

const WHITE: [number, number, number] = [1, 1, 1];
/** Tons da mata em espaço linear (as cores de vértice não passam pela conversão sRGB): feltro verde e friso dourado. */
const FELT_TINT: [number, number, number] = [0.018, 0.05, 0.028];
const RIM_TINT: [number, number, number] = [0.16, 0.1, 0.018];

function Desk({ wood }: { wood: Texture }) {
  const top = useLitPlane(DESK.width, DESK.depth, [0, 0], WHITE);
  return (
    <group>
      <mesh geometry={top}>
        <meshBasicMaterial map={wood} vertexColors />
      </mesh>
      {/* Laterais do tampo (a face de cima fica invisível: o plano iluminado a substitui). */}
      <mesh position={[0, -DESK.thickness / 2 - 0.002, 0]}>
        <boxGeometry args={[DESK.width, DESK.thickness, DESK.depth]} />
        <meshLambertMaterial attach="material-0" color="#3a2112" />
        <meshLambertMaterial attach="material-1" color="#3a2112" />
        <meshBasicMaterial attach="material-2" visible={false} />
        <meshLambertMaterial attach="material-3" color="#1a0e07" />
        <meshLambertMaterial attach="material-4" color="#4a2a16" />
        <meshLambertMaterial attach="material-5" color="#3a2112" />
      </mesh>
      {/* Friso frontal mais escuro, dá espessura à borda. */}
      <mesh position={[0, -DESK.thickness - 0.15, DESK.depth / 2 - 0.3]}>
        <boxGeometry args={[DESK.width - 0.4, 0.3, 0.6]} />
        <meshLambertMaterial color="#2a170c" />
      </mesh>
    </group>
  );
}

/** Mata de feltro verde com friso dourado, sob o jornal (as cores do Painel). */
function DeskMat() {
  const rim = useLitPlane(10.4, 9.4, [MAT.x, MAT.z], RIM_TINT);
  const felt = useLitPlane(10.1, 9.1, [MAT.x, MAT.z], FELT_TINT);
  return (
    <group position={[MAT.x, 0, MAT.z]}>
      <mesh position={[0, 0.02, 0]} geometry={rim}>
        <meshBasicMaterial vertexColors />
      </mesh>
      <mesh position={[0, 0.035, 0]} geometry={felt}>
        <meshBasicMaterial vertexColors />
      </mesh>
    </group>
  );
}

/** O jornal de papel na mata: aparece quando o jornal da interface sai de cena. */
function FoldedNewspaper({ paper }: { paper: Texture }) {
  // A folha fica sob a luminária: tinta clara e quente, sem cálculo de luz.
  const [r, g, b] = deskLight(PAPER.x, PAPER.z);
  return (
    <mesh position={[PAPER.x, 0.07, PAPER.z]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[PAPER.w, PAPER.d]} />
      <meshBasicMaterial map={paper} color={[r * 0.95, g * 0.95, b * 0.95]} />
    </mesh>
  );
}

function Laptop({
  screen,
  keyboard,
  glow,
  shadow,
}: {
  screen: Texture;
  keyboard: Texture;
  glow: Texture;
  shadow: Texture;
}) {
  const {
    baseWidth: w,
    baseDepth: d,
    baseHeight: h,
    lidHeight,
    lidThickness,
    lidTilt,
    screenWidth,
    screenHeight,
  } = LAPTOP;
  return (
    <group position={LAPTOP.position} rotation-y={LAPTOP.rotationY}>
      <Blob map={shadow} size={[w * 1.5, d * 1.8]} at={[0, -0.2]} opacity={0.6} />
      {/* Luz da tela sobre o tampo. */}
      <mesh position={[0, 0.02, d * 0.4]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[w * 1.6, d * 1.4]} />
        <meshBasicMaterial map={glow} transparent opacity={0.35} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshLambertMaterial color="#3a3f47" />
      </mesh>
      <mesh position={[0, h + 0.002, -d * 0.12]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[w * 0.9, d * 0.5]} />
        <meshLambertMaterial map={keyboard} />
      </mesh>
      <mesh position={[0, h + 0.002, d * 0.32]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[w * 0.32, d * 0.24]} />
        <meshLambertMaterial color="#4a5059" />
      </mesh>
      {/* Tampa: gira na articulação da borda de trás. */}
      <group position={[0, h, -d / 2]} rotation-x={-lidTilt}>
        <mesh position={[0, lidHeight / 2, -lidThickness / 2]}>
          <boxGeometry args={[w, lidHeight, lidThickness]} />
          <meshLambertMaterial color="#2c3036" />
        </mesh>
        <mesh position={[0, lidHeight / 2, 0.002]}>
          <planeGeometry args={[w * 0.97, lidHeight * 0.96]} />
          <meshBasicMaterial color="#07080a" />
        </mesh>
        <mesh position={[0, lidHeight / 2 + 0.04, 0.006]}>
          <planeGeometry args={[screenWidth, screenHeight]} />
          <meshBasicMaterial map={screen} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function Lamp({ shadow }: { shadow: Texture }) {
  // A poça de luz está assada no tampo (deskLight); aqui só a peça.
  return (
    <group>
      <group position={[-8.2, 0, -4.4]}>
        <Blob map={shadow} size={[2.6, 2.6]} at={[0, 0]} />
        <mesh position={[0, 0.1, 0]}>
          <cylinderGeometry args={[0.85, 0.95, 0.2, 20]} />
          <meshLambertMaterial color="#3b3122" />
        </mesh>
        <mesh position={[0.35, 1.9, 0.5]} rotation={[0.35, 0, -0.25]}>
          <cylinderGeometry args={[0.07, 0.07, 3.8, 8]} />
          <meshLambertMaterial color="#b08d4a" />
        </mesh>
        <mesh position={[1.6, 3.65, 1.65]} rotation={[0.9, 0, -0.9]}>
          <cylinderGeometry args={[0.07, 0.07, 2.6, 8]} />
          <meshLambertMaterial color="#b08d4a" />
        </mesh>
        <group position={[2.6, 3.5, 2.6]} rotation={[0.75, 0.6, -0.55]}>
          <mesh>
            <coneGeometry args={[0.9, 1.3, 20, 1, true]} />
            <meshLambertMaterial color="#1f4a35" side={DoubleSide} />
          </mesh>
          <mesh position={[0, -0.35, 0]}>
            <sphereGeometry args={[0.3, 12, 8]} />
            <meshBasicMaterial color="#fff1c8" />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function Mug({ shadow }: { shadow: Texture }) {
  return (
    <group position={[-8.1, 0, 3.7]}>
      <Blob map={shadow} size={[2.6, 2.6]} at={[0.1, 0.1]} />
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[1, 0.9, 0.1, 24]} />
        <meshLambertMaterial color="#e6e0d4" />
      </mesh>
      <mesh position={[0, 0.65, 0]}>
        <cylinderGeometry args={[0.55, 0.48, 1.1, 20]} />
        <meshLambertMaterial color="#efe9de" />
      </mesh>
      <mesh position={[0, 1.18, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.49, 20]} />
        <meshLambertMaterial color="#3a2214" />
      </mesh>
      <mesh position={[0.6, 0.68, 0]} rotation-z={-Math.PI / 2}>
        <torusGeometry args={[0.28, 0.07, 8, 14, Math.PI]} />
        <meshLambertMaterial color="#efe9de" />
      </mesh>
    </group>
  );
}

/** Edições anteriores empilhadas: uma folha por mês já publicado. */
function PaperStack({ count, paper, shadow }: { count: number; paper: Texture; shadow: Texture }) {
  const sheets = Math.min(6, Math.max(0, count - 1));
  return (
    <group position={[7.4, 0, 2.2]} rotation-y={-0.22}>
      {sheets > 0 && <Blob map={shadow} size={[4.6, 5.8]} at={[0, 0]} opacity={0.5} />}
      {Array.from({ length: sheets }, (_, i) => (
        <mesh key={i} position={[(i % 2) * 0.08, 0.05 + i * 0.07, -(i % 3) * 0.05]} rotation-y={(i % 3) * 0.04 - 0.04}>
          <boxGeometry args={[3.3, 0.06, 4.3]} />
          <meshLambertMaterial attach="material-2" map={paper} />
          <meshLambertMaterial attach="material-0" color="#d9d0b8" />
          <meshLambertMaterial attach="material-1" color="#d9d0b8" />
          <meshLambertMaterial attach="material-3" color="#d9d0b8" />
          <meshLambertMaterial attach="material-4" color="#d9d0b8" />
          <meshLambertMaterial attach="material-5" color="#d9d0b8" />
        </mesh>
      ))}
    </group>
  );
}

function Plant({ shadow }: { shadow: Texture }) {
  const leaves = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const a = (i / 7) * Math.PI * 2;
        return { a, tilt: 0.5 + (i % 3) * 0.15, h: 1.3 + (i % 2) * 0.35 };
      }),
    [],
  );
  return (
    <group position={[8.4, 0, -4.4]}>
      <Blob map={shadow} size={[2.6, 2.6]} at={[0.1, 0.1]} />
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.75, 0.55, 1.2, 14]} />
        <meshLambertMaterial color="#a4583a" />
      </mesh>
      <mesh position={[0, 1.18, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.7, 14]} />
        <meshLambertMaterial color="#3b2a1c" />
      </mesh>
      {leaves.map((l, i) => (
        <mesh
          key={i}
          position={[Math.cos(l.a) * 0.35, 1.2 + l.h / 2, Math.sin(l.a) * 0.35]}
          rotation={[Math.sin(l.a) * l.tilt, 0, -Math.cos(l.a) * l.tilt]}>
          <coneGeometry args={[0.28, l.h, 5]} />
          <meshLambertMaterial color={i % 2 ? '#3f7a45' : '#2f6339'} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function Pen() {
  return (
    <group position={[2.4, 0.09, 3.6]} rotation-y={0.6}>
      <mesh rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.08, 0.08, 2.4, 8]} />
        <meshLambertMaterial color="#1c2b4a" />
      </mesh>
      <mesh position={[0.95, 0, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.09, 0.09, 0.6, 8]} />
        <meshLambertMaterial color="#c9a54e" />
      </mesh>
    </group>
  );
}

function Glasses({ shadow }: { shadow: Texture }) {
  return (
    <group position={[2.6, 0.05, 1.4]} rotation-y={-0.5}>
      <Blob map={shadow} size={[2.2, 1.2]} at={[0, 0]} opacity={0.35} />
      {[-0.42, 0.42].map((x) => (
        <mesh key={x} position={[x, 0, 0]} rotation-x={-Math.PI / 2}>
          <torusGeometry args={[0.32, 0.045, 6, 18]} />
          <meshLambertMaterial color="#1a1410" />
        </mesh>
      ))}
      <mesh position={[0, 0.02, -0.06]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.03, 0.03, 0.22, 6]} />
        <meshLambertMaterial color="#1a1410" />
      </mesh>
    </group>
  );
}

function Phone({ shadow }: { shadow: Texture }) {
  return (
    <group position={[6.4, 0, -0.6]} rotation-y={0.35}>
      <Blob map={shadow} size={[1.6, 2.6]} at={[0, 0]} opacity={0.5} />
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[0.85, 0.09, 1.7]} />
        <meshLambertMaterial color="#15171b" />
      </mesh>
      <mesh position={[-0.2, 0.1, -0.6]}>
        <cylinderGeometry args={[0.1, 0.1, 0.02, 10]} />
        <meshLambertMaterial color="#2b2f36" />
      </mesh>
    </group>
  );
}
