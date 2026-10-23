import { LOD_TEXEL_THRESHOLD, MAX_LEVEL, ROOT, TILE_PIXELS } from './config';
import { tileBoundingSphere, tileChildren, tileId, type TileKey, type Vec3 } from './geo';

export type LodInput = {
  cameraPosition: Vec3;
  /** Projeção: pixels de tela por radiano de ângulo visual. */
  pixelsPerRadian: number;
  /** Teste de visibilidade da esfera envolvente (frustum). */
  isSphereVisible: (center: Vec3, radius: number) => boolean;
  /** O tile existe no pacote de assets? */
  exists: (id: string) => boolean;
  /** Texturas do tile já estão na GPU? */
  isLoaded: (id: string) => boolean;
  /** Altitude máxima do tile, já em raios terrestres e com exagero aplicado. */
  maxHeight: (id: string) => number;
  /** Px por texel acima do qual o tile se divide. Padrão: `LOD_TEXEL_THRESHOLD` (perfil Equilibrado). */
  texelThreshold?: number;
  /** Nível máximo desenhado, no máximo `MAX_LEVEL` (os assets não vão além). Padrão: `MAX_LEVEL`. */
  maxLevel?: number;
};

export type LodResult = {
  /** Tiles a desenhar (sem sobreposição; cobrem a parte visível da caixa do Brasil). */
  draw: string[];
  /** Tiles a carregar, em ordem de prioridade. */
  request: string[];
  /**
   * Todos os tiles carregados percorridos (desenhados ou ancestrais dos desenhados). O cache não pode
   * descartá-los: sem o ancestral, a travessia não chega aos filhos e a área some por um quadro.
   */
  used: string[];
};

const ROOT_SPAN_RAD = ((ROOT.east - ROOT.west) * Math.PI) / 180;

/**
 * Seleção de nível de detalhe por erro em tela: subdivide enquanto um texel ocupa mais que
 * `texelThreshold` pixels (padrão `LOD_TEXEL_THRESHOLD`; o perfil de qualidade pode mudar o limiar e o nível máximo). Se os filhos não estiverem carregados, desenha o pai e pede os filhos.
 */
export function selectTiles(input: LodInput): LodResult {
  const draw: string[] = [];
  const request: string[] = [];
  const used: string[] = [];
  const texelThreshold = input.texelThreshold ?? LOD_TEXEL_THRESHOLD;
  const maxLevel = Math.min(MAX_LEVEL, input.maxLevel ?? MAX_LEVEL);
  const cam = input.cameraPosition;
  const camDist = Math.hypot(cam[0], cam[1], cam[2]);
  // Ângulo do horizonte visto da câmera (esfera unitária)
  const horizonCos = 1 / camDist;

  const visit = (k: TileKey) => {
    const id = tileId(k);
    const h = input.maxHeight(id);
    const { center, radius } = tileBoundingSphere(k, h);
    if (!input.isSphereVisible(center, radius)) return;
    // Tile inteiramente atrás do horizonte?
    const cLen = Math.hypot(center[0], center[1], center[2]);
    const cosAngle = (center[0] * cam[0] + center[1] * cam[1] + center[2] * cam[2]) / (cLen * camDist);
    const angularRadius = radius; // em radianos de arco, aproximadamente (esfera unitária)
    if (Math.acos(Math.max(-1, Math.min(1, cosAngle))) - angularRadius > Math.acos(horizonCos) + 0.02) return;

    if (!input.isLoaded(id)) {
      request.push(id);
      return; // o pai (se houver) continua desenhado
    }
    used.push(id);

    const dist = Math.max(1e-4, Math.hypot(cam[0] - center[0], cam[1] - center[1], cam[2] - center[2]) - radius);
    const texelRad = ROOT_SPAN_RAD / 2 ** k.z / TILE_PIXELS;
    const texelPx = (texelRad / dist) * input.pixelsPerRadian;

    const children = k.z < maxLevel ? tileChildren(k) : [];
    const canSplit = texelPx > texelThreshold && children.length > 0 && children.every((c) => input.exists(tileId(c)));
    if (!canSplit) {
      draw.push(id);
      return;
    }
    const childIds = children.map(tileId);
    if (childIds.every((c) => input.isLoaded(c))) {
      for (const c of children) visit(c);
    } else {
      draw.push(id);
      for (const c of childIds) if (!input.isLoaded(c)) request.push(c);
    }
  };

  visit({ z: 0, x: 0, y: 0 });
  return { draw, request, used };
}
