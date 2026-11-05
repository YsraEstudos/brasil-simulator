import data from './data/countries.json';

/**
 * Os países do mundo no globo (PLANO_PAISES.md, Fase P1): nome, situação, capital, âncora do nome e contorno de cada
 * unidade do Natural Earth (ponto de vista do Brasil). A grade do toque fica em `countryGrid.ts`. Gerado por `scripts/data/build_countries.py`
 * (`npm run build:countries`); `src/globe/data/countr*.json` e `assets/globe/countryLabels.png` não se editam à mão.
 *
 * O Brasil não está na lista: o toque nele é das UFs. Dado só de interface: o motor não sabe que os países existem.
 */

/** Retângulo de um nome no atlas de campo de distância: u/v (origem no topo), tamanho lógico (px) e o canal (R, G, B). */
export type CountryAtlasRect = {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  w: number;
  h: number;
  /** 0 = R, 1 = G, 2 = B: cada nome ocupa um canal, e três nomes dividem o mesmo pixel. */
  channel: number;
};

/** País soberano, território de outro país, soberania em disputa ou a Antártida. */
export type CountryStatus = 'pais' | 'territorio' | 'disputa' | 'antartida';

export type CountryCapital = { name: string; lon: number; lat: number; note?: string };

export type Country = {
  /** Código de 3 letras do Natural Earth (`ADM0_A3`): `ARG`, `FRA`… */
  id: string;
  /** Valor do país na grade do toque (1…N). */
  index: number;
  name: string;
  status: CountryStatus;
  /** Nome do país soberano, quando `status` é `territorio`. */
  sovereign?: string;
  continent: string;
  subregion: string;
  /** População estimada do Natural Earth e o ano a que ela se refere. */
  population: number;
  populationYear: number;
  capital: CountryCapital | null;
  /** Onde o nome é desenhado (ponto de rótulo do Natural Earth). */
  anchor: [number, number];
  /** Zoom (escala de mapa da web) a partir do qual o Natural Earth mostra o nome: 1,7 = país grande, 7 = minúsculo. */
  minZoom: number;
  /** Largura × altura da caixa do maior pedaço do país, em graus "equivalentes" (largura × cos da latitude). */
  extent: [number, number];
  /** Quem vence uma colisão entre nomes de país (maior = mais importante). Sempre abaixo das UFs. */
  priority: number;
  bordersBrazil: boolean;
  /** Distância em linha reta de Brasília à capital (ou ao ponto do nome, sem capital), em km. */
  distanceKm: number;
  rect: CountryAtlasRect;
  /** Contorno simplificado (~11 km), anéis `[lon, lat, lon, lat, …]`: só o traço da seleção. */
  outline: number[][];
};

type CountriesFile = {
  atlas: { width: number; height: number; scale: number; spread: number; stroke: number };
  countries: Country[];
};

const FILE = data as unknown as CountriesFile;

/** Tamanho do atlas, escala (2x), alcance do campo de distância e espessura do contorno, em px do atlas. */
export const COUNTRY_ATLAS = FILE.atlas;
/** As 248 unidades (sem o Brasil), em ordem de código. */
export const COUNTRIES: readonly Country[] = FILE.countries;

const BY_ID = new Map(COUNTRIES.map((c) => [c.id, c]));
const BY_INDEX = new Map(COUNTRIES.map((c) => [c.index, c]));

export function countryById(id: string): Country | undefined {
  return BY_ID.get(id);
}

/** País pelo valor da grade do toque (1…N). */
export function countryByIndex(index: number): Country | undefined {
  return BY_INDEX.get(index);
}
