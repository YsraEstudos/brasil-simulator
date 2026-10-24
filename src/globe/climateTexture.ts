import { UF_GRID_SIZE, ufIndexGrid } from './climateGrid';

/**
 * Textura de clima do globo (PLANO_GLOBO.md §3.2 e §4.2): um RGBA de `CLIMATE_TEXTURE_SIZE`² sobre a caixa da quadtree,
 * refeito **uma vez por mês** na CPU a partir do índice de UF e dos valores por UF. Módulo puro (sem three/React): quem
 * usa envia os bytes para a GPU.
 *
 *   R = cobertura de nuvem   (normal de chuva do mês × anomalia, 0–1; nunca zero: o céu tem nuvem em clima normal)
 *   G = seca                 (memória hídrica da UF, 0–1; zero em clima neutro)
 *   B = chuva forte          (anomalia de chuva acima de `HEAVY_RAIN_FROM`, 0–1; zero em clima neutro)
 *   A = 255                  (reservado)
 *
 * Ordem das linhas: a linha 0 é o **sul** (v = 0), a convenção de uma `DataTexture` sem `flipY`; o índice de UF vem
 * com a linha 0 no norte e é virado aqui. Só os campos **contínuos** são suavizados; o índice de UF (ID de categoria)
 * é lido pelo vizinho mais próximo e nunca é borrado.
 */

/** Lado da textura de clima. 128² = 64 KiB. Comparar com 256² em zoom próximo no aparelho antes de mudar. */
export const CLIMATE_TEXTURE_SIZE = 128;

/** Desvio-padrão da suavização, em texels (0,375° ≈ 40 km cada): borra a divisa entre UFs sem apagar o contraste. */
export const CLIMATE_BLUR_SIGMA = 1;

/** Normal mensal de chuva (mm) que enche o céu de nuvens (a maior normal mensal do país é ~380 mm). */
export const CLOUD_REF_MM = 300;
/** Cobertura mínima de nuvem, mesmo no mês mais seco (o céu seco do Brasil ainda tem algumas nuvens). */
export const CLOUD_FLOOR = 0.1;
/** Anomalia de chuva (fração da normal) a partir da qual a chuva conta como forte, e a que a satura (teto do motor). */
export const HEAVY_RAIN_FROM = 0.15;
export const HEAVY_RAIN_TO = 0.6;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Valores contínuos de uma UF (todos em 0–1) que vão para os canais R, G e B. */
export interface UfClimateValues {
  cloud: number;
  dryness: number;
  heavyRain: number;
}

/** Cobertura de nuvem da UF: a normal do mês, em mm, vezes `1 + anomalia`, entre `CLOUD_FLOOR` e 1. */
export function cloudCover(normalMm: number, rainAnomaly: number): number {
  return clamp01(CLOUD_FLOOR + (1 - CLOUD_FLOOR) * (normalMm / CLOUD_REF_MM) * (1 + rainAnomaly));
}

/** Intensidade da chuva forte: 0 até `HEAVY_RAIN_FROM`, 1 em `HEAVY_RAIN_TO` (anomalia, fração da normal). */
export function heavyRain(rainAnomaly: number): number {
  return clamp01((rainAnomaly - HEAVY_RAIN_FROM) / (HEAVY_RAIN_TO - HEAVY_RAIN_FROM));
}

/** Há seca a mostrar (qualquer UF acima do piso)? Sem seca o sombreamento dos tiles nem lê as texturas. */
export const DROUGHT_VISIBLE_FROM = 0.02;

export function hasDrought(values: readonly (UfClimateValues | undefined)[]): boolean {
  return values.some((v) => v !== undefined && v.dryness >= DROUGHT_VISIBLE_FROM);
}

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Pesos normalizados de um núcleo gaussiano 1D (raio = ⌈2,5σ⌉). */
function gaussianKernel(sigma: number): Float32Array {
  const radius = Math.max(1, Math.ceil(2.5 * sigma));
  const kernel = new Float32Array(2 * radius + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = w;
    sum += w;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
  return kernel;
}

/** Convolução separável (horizontal e depois vertical) com as bordas fora da grade valendo 0. */
function blur(src: Float32Array, size: number, kernel: Float32Array): Float32Array {
  const radius = (kernel.length - 1) / 2;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < size) s += src[y * size + xx] * kernel[k + radius];
      }
      tmp[y * size + x] = s;
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < size) s += tmp[yy * size + x] * kernel[k + radius];
      }
      out[y * size + x] = s;
    }
  }
  return out;
}

/** Clima do mês para o globo: valores por UF + chave de mudança + semente do desenho das nuvens. */
export interface ClimateMapData {
  /** Muda se, e só se, o mês ou algum valor mudou: o globo refaz a textura só quando a chave muda (uma vez por mês). */
  key: string;
  /** Semente do desenho das nuvens (o mês do jogo): o padrão muda no fim do mês, não antes. */
  seed: number;
  /** Valores por UF na posição do `index` de `ufs.json` (1…27); a posição 0 fica vazia. */
  values: readonly (UfClimateValues | undefined)[];
}

export interface ClimateTexelsInput {
  /** Valores por UF, na posição do `index` de `ufs.json` (1…27); a posição 0 e UFs sem valor ficam vazias. */
  values: readonly (UfClimateValues | undefined)[];
  /** Lado da textura (múltiplo do lado do índice). */
  size?: number;
  /** Suavização dos campos contínuos, em texels; 0 desliga (cada UF fica com o seu valor, divisa nítida). */
  blurSigma?: number;
  /** Índice de UF e o seu lado (linha 0 no norte). Padrão: o índice gerado no build. */
  ufIndex?: Uint8Array;
  ufIndexSize?: number;
}

/**
 * Bytes RGBA da textura de clima (linha 0 no sul). Cada texel pega a UF do centro do bloco correspondente do índice;
 * os três campos são suavizados por convolução **normalizada pela terra** (só entram os texels que têm UF) e, fora do
 * Brasil, esmaecem em ~1–2 texels em vez de cortar seco (nuvens um pouco além do litoral; a seca é mascarada pela
 * máscara de água no sombreador). Clima neutro dá G = B = 0 em toda a textura.
 */
export function buildClimateTexels(input: ClimateTexelsInput): Uint8Array {
  const size = input.size ?? CLIMATE_TEXTURE_SIZE;
  const sigma = input.blurSigma ?? CLIMATE_BLUR_SIGMA;
  const index = input.ufIndex ?? ufIndexGrid();
  const indexSize = input.ufIndexSize ?? UF_GRID_SIZE;
  if (indexSize % size !== 0) throw new RangeError(`lado do índice (${indexSize}) não é múltiplo de ${size}`);
  const factor = indexSize / size;
  const centre = Math.floor(factor / 2);
  const n = size * size;

  // Campos por texel em ordem de imagem (linha 0 no norte), valendo 0 fora da terra.
  const land = new Float32Array(n);
  const fields = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const id = index[(y * factor + centre) * indexSize + x * factor + centre];
      const v = input.values[id];
      if (id === 0 || !v) continue;
      const at = y * size + x;
      land[at] = 1;
      fields[0][at] = v.cloud;
      fields[1][at] = v.dryness;
      fields[2][at] = v.heavyRain;
    }
  }

  const kernel = sigma > 0 ? gaussianKernel(sigma) : null;
  const weight = kernel ? blur(land, size, kernel) : land;
  const smooth = fields.map((f) => (kernel ? blur(f, size, kernel) : f));

  const out = new Uint8Array(n * 4);
  for (let y = 0; y < size; y++) {
    const row = size - 1 - y; // imagem (norte primeiro) → textura (sul primeiro)
    for (let x = 0; x < size; x++) {
      const at = y * size + x;
      const w = weight[at];
      // Terra: valor suavizado (média ponderada pela terra). Mar: o mesmo valor, esmaecido pela fração de terra.
      const fade = land[at] > 0 ? 1 : smoothstep(0, 0.5, w);
      const o = (row * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v = w > 1e-6 ? (smooth[c][at] / w) * fade : 0;
        out[o + c] = Math.round(clamp01(v) * 255);
      }
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Deslocamento (em repetições do ruído) que muda o desenho das nuvens a cada mês, estável para a mesma semente. */
export function cloudOffset(seed: number): [number, number] {
  const h = (k: number) => {
    const s = Math.sin((seed + 1) * 12.9898 + k * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };
  return [h(1), h(2)];
}

/** Altitude da câmera (raios terrestres) acima da qual as nuvens têm a opacidade cheia e abaixo da qual somem. */
export const CLOUD_FULL_ABOVE = 0.35;
export const CLOUD_GONE_BELOW = 0.14;
/** Fração da opacidade com um mapa de calor ligado (PLANO_GLOBO.md §4.2: 30%). */
export const CLOUD_HEATMAP_OPACITY = 0.3;

/**
 * Opacidade das nuvens (0 = sem desenhar a malha): some ao aproximar a câmera e cai a 30% com um mapa de calor
 * ligado. Fora do Brasil inteiro (câmera muito perto) a malha nem é desenhada.
 */
export function cloudOpacity(altitude: number, heatMapOn: boolean): number {
  const near = smoothstep(CLOUD_GONE_BELOW, CLOUD_FULL_ABOVE, altitude);
  return near * (heatMapOn ? CLOUD_HEATMAP_OPACITY : 1);
}
