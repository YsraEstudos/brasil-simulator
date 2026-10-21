import { CITIES, cityWeight } from '@/globe/cities';
import {
  lightsAmountAt,
  NIGHT_FLOOR,
  sunKey,
  TERMINATOR_FROM,
  TERMINATOR_TO,
  type SunState,
} from '@/globe/visualClock';

import { flatMap, type FlatMap } from './flatProjection';

/**
 * Dia e noite no mapa 2D (PLANO_GLOBO.md §3.4 e §4.1): a sombra da noite e as luzes das cidades, calculadas do mesmo
 * Sol (`SunState`) e das mesmas constantes do globo. Funções puras; o mapa só recalcula quando o Sol muda (hora fixa ou
 * mês) e, na "Hora real", quando a tela renderiza — nenhum temporizador.
 *
 * A sombra é uma pilha de `BAND_COUNT` faixas translúcidas: cada faixa cobre a região onde `dot(normal, Sol)` está abaixo
 * de um limiar, e os limiares seguem a faixa do terminador do globo (`TERMINATOR_FROM…TERMINATOR_TO`). Empilhadas, o
 * brilho cai de 1 (dia) a `NIGHT_FLOOR` (noite), em degraus, como o `smoothstep` do shader. O SVG do React Native não
 * tem desfoque, então o degradê é feito de faixas.
 */

/** Faixas empilhadas do degradê do terminador. */
export const BAND_COUNT = 5;
/** Passo (graus de latitude) das amostras ao longo do terminador. */
export const ROW_STEP_DEG = 1;
/** Cor da sombra: o fundo do globo (quase preto azulado). */
export const SHADOW_COLOR = '#02040a';
/**
 * Quanto da sombra sobrevive sobre um mapa de calor. No globo o mapa de calor não é iluminado (cobre 80% do relevo,
 * que fica por baixo); aqui a cor da UF é o mapa inteiro, então só uma fração da sombra passa por cima, para a
 * legenda continuar valendo e ainda assim dar para ver onde é noite.
 */
export const SHADOW_OVER_FILL = 0.25;
/** Cor e tamanho das luzes (unidades do `viewBox`; o maior município usa `LIGHT_RADIUS_MAX`). */
export const LIGHT_COLOR = '#ffd27a';
export const LIGHT_RADIUS_MIN = 3.5;
export const LIGHT_RADIUS_MAX = 11;
/** Luzes quase apagadas (fade do terminador) nem entram no desenho. */
const LIGHT_MIN_AMOUNT = 0.03;

const DEG = Math.PI / 180;

export interface LonLatBox {
  west: number;
  east: number;
  south: number;
  north: number;
}

/** Duas faixas verticais de noite dentro da caixa: à esquerda do dia e à direita dele (cada uma um anel lon/lat). */
export interface NightStrips {
  left: [number, number][];
  right: [number, number][];
}

/** Inverso do `smoothstep` (0–1 → 0–1). */
function inverseSmoothstep(y: number): number {
  return 0.5 - Math.sin(Math.asin(1 - 2 * y) / 3);
}

/** Limiares de `dot(normal, Sol)` das faixas, do mais escuro (menor) ao mais claro. */
export function bandThresholds(count = BAND_COUNT): number[] {
  return Array.from({ length: count }, (_, k) => {
    const x = inverseSmoothstep((k + 0.5) / count);
    return TERMINATOR_FROM + (TERMINATOR_TO - TERMINATOR_FROM) * x;
  });
}

/** Opacidade de cada faixa para que `BAND_COUNT` faixas empilhadas deixem `NIGHT_FLOOR` do brilho no fundo da noite. */
export function bandOpacity(count = BAND_COUNT): number {
  return 1 - Math.pow(NIGHT_FLOOR, 1 / count);
}

/**
 * Longitudes (graus) entre as quais `dot(normal, Sol) ≥ threshold` na latitude dada, ou `null` se não há lado claro.
 * Resolve `sin δ sin φ + cos δ cos φ cos(λ − λs) = t` (δ, λs: ponto subsolar) para cada latitude.
 */
function dayInterval(
  sun: SunState,
  threshold: number,
  latDeg: number,
  centerLon: number,
): [number, number] | 'all' | null {
  const sinDec = sun.dir[1];
  const cosDec = Math.hypot(sun.dir[0], sun.dir[2]);
  const phi = latDeg * DEG;
  const c = (threshold - sinDec * Math.sin(phi)) / (cosDec * Math.cos(phi));
  if (c >= 1) return null;
  if (c <= -1) return 'all';
  const half = Math.acos(c) / DEG;
  // O Sol repetido a cada 360°: vale a cópia mais perto do centro da caixa.
  const lon = sun.subsolar.lon + 360 * Math.round((centerLon - sun.subsolar.lon) / 360);
  return [lon - half, lon + half];
}

/**
 * A região onde `dot(normal, Sol) < threshold` (a noite, ou a penumbra até o limiar) dentro da caixa, como duas
 * faixas verticais (esquerda e direita do lado claro). Amostra uma linha a cada `ROW_STEP_DEG` de latitude.
 */
export function nightStrips(sun: SunState, threshold: number, box: LonLatBox): NightStrips {
  const rows = Math.max(1, Math.ceil((box.north - box.south) / ROW_STEP_DEG));
  const center = (box.west + box.east) / 2;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  const westEdge: [number, number][] = [];
  const eastEdge: [number, number][] = [];
  for (let i = 0; i <= rows; i++) {
    const lat = box.north - ((box.north - box.south) * i) / rows;
    const day = dayInterval(sun, threshold, lat, center);
    let from = box.east; // sem lado claro: a linha toda é noite (a faixa esquerda vai até a borda leste)
    let to = box.east;
    if (day === 'all') {
      from = box.west;
      to = box.east;
    } else if (day) {
      from = Math.min(box.east, Math.max(box.west, day[0]));
      to = Math.min(box.east, Math.max(box.west, day[1]));
    }
    left.push([from, lat]);
    right.push([to, lat]);
    westEdge.push([box.west, lat]);
    eastEdge.push([box.east, lat]);
  }
  // Anel esquerdo: borda oeste (de cima para baixo) e volta pela borda do lado claro (de baixo para cima).
  // Anel direito: borda do lado claro (de cima para baixo) e volta pela borda leste.
  return {
    left: [...westEdge, ...left.slice().reverse()],
    right: [...right, ...eastEdge.slice().reverse()],
  };
}

export interface FlatShadowBand {
  /** Path SVG (dois subcaminhos, preenchimento padrão) da região mais escura que o limiar da faixa. */
  d: string;
  opacity: number;
}

export interface FlatCityLight {
  name: string;
  x: number;
  y: number;
  r: number;
  opacity: number;
}

export interface FlatSun {
  bands: FlatShadowBand[];
  lights: FlatCityLight[];
}

function ringPath(ring: readonly (readonly [number, number])[], map: FlatMap): string {
  return (
    ring
      .map(([lon, lat], i) => {
        const p = map.project(lon, lat);
        return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      })
      .join('') + 'Z'
  );
}

/** A caixa lon/lat que o `viewBox` do mapa cobre (a projeção é linear em lon e em lat). */
export function viewBoxLonLat(map: FlatMap): LonLatBox {
  const [west, north] = map.unproject({ x: 0, y: 0 });
  const [east, south] = map.unproject({ x: map.viewBox.width, y: map.viewBox.height });
  return { west, east, south, north };
}

/**
 * Sombra e luzes do mapa 2D para o Sol dado, ou `null` sem Sol ("Sempre dia"): nada para desenhar.
 * `lights`: as cidades no lado noturno, com a mesma intensidade das luzes do globo.
 */
export function buildFlatSun(sun: SunState, map: FlatMap): FlatSun | null {
  if (!sun.enabled) return null;
  const box = viewBoxLonLat(map);
  const opacity = bandOpacity();
  const bands: FlatShadowBand[] = [];
  for (const threshold of bandThresholds()) {
    const strips = nightStrips(sun, threshold, box);
    const d = ringPath(strips.left, map) + ringPath(strips.right, map);
    bands.push({ d, opacity });
  }
  const lights: FlatCityLight[] = [];
  for (const city of CITIES) {
    const amount = lightsAmountAt(sun, city.lon, city.lat);
    if (amount < LIGHT_MIN_AMOUNT) continue;
    const weight = cityWeight(city.pop);
    const p = map.project(city.lon, city.lat);
    lights.push({
      name: city.name,
      x: p.x,
      y: p.y,
      r: LIGHT_RADIUS_MIN + (LIGHT_RADIUS_MAX - LIGHT_RADIUS_MIN) * weight,
      opacity: amount * (0.55 + 0.45 * weight),
    });
  }
  return { bands, lights };
}

/** Precisão da chave do cache: 0,1° do ponto subsolar (~24 s de relógio), mais que suficiente para o desenho. */
const CACHE_KEY_DIGITS = 1;

let cache: { key: string; value: FlatSun | null } | null = null;

/**
 * `buildFlatSun` para o mapa plano do módulo, guardando o último resultado: o mapa pode renderizar à vontade (toque,
 * troca de camada) sem refazer a sombra enquanto a hora e o mês forem os mesmos.
 */
export function flatSunFor(sun: SunState): FlatSun | null {
  const key = sunKey(sun, CACHE_KEY_DIGITS);
  if (cache?.key !== key) cache = { key, value: buildFlatSun(sun, flatMap()) };
  return cache.value;
}
