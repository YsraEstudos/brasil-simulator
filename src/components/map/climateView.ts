import { rainfallNormal, toCalendar, type GameContent, type GameState } from '@/engine';
import { cloudCover, heavyRain, type ClimateMapData, type UfClimateValues } from '@/globe/climateTexture';
import { UFS } from '@/globe/ufs';

/**
 * Clima no mapa (PLANO_GLOBO.md §3.4 e §4.2; PR 10). Funções puras que transformam o `GameState.climate` no que os dois
 * renderizadores precisam, sem regra de jogo nova (só leitura):
 *
 *  - `buildClimateMapData`: valores contínuos por UF (nuvem, seca, chuva forte) que o globo grava na textura de clima;
 *  - `buildClimateOverlay`: a escolha por UF do mapa 2D — hachura (seca forte, chuva forte) e ícone de nuvem (chuva
 *    acima do normal) — com os mesmos limiares em um lugar só.
 */

/** Seca a partir da qual o 2D hachura a UF (faixa "forte" da camada Seca). */
export const DROUGHT_HATCH_FROM = 0.5;
/** Anomalia de chuva (fração da normal) a partir da qual o 2D hachura a UF na camada Chuva (chuva forte). */
export const HEAVY_RAIN_HATCH_FROM = 0.3;
/** Anomalia a partir da qual o 2D desenha o ícone de nuvem (chuva acima do normal, faixa "forte" da camada Chuva). */
export const RAIN_CLOUD_ICON_FROM = 0.15;

/** Mês do calendário (1–12) a que o clima do estado se refere: o do último mês jogado (no mês 0, o da posse). */
export function climateCalendarMonth(monthIndex: number): number {
  return toCalendar(Math.max(0, monthIndex - 1)).month;
}

/**
 * Valores contínuos por UF para a textura de clima. `null` sem cenário regional ou sem climatologia (nada a desenhar).
 * A nuvem usa a normal de chuva do mês da UF vezes a anomalia; a seca é o índice do motor; a chuva forte sai da
 * anomalia.
 */
export function buildClimateMapData(
  state: Pick<GameState, 'climate' | 'monthIndex'>,
  content: Pick<GameContent, 'climatology'>,
): ClimateMapData | null {
  const month = climateCalendarMonth(state.monthIndex);
  const values: (UfClimateValues | undefined)[] = new Array(UFS.length + 1).fill(undefined);
  const parts: string[] = [];
  for (const uf of UFS) {
    const c = state.climate.ufs.find((u) => u.id === uf.sigla);
    if (!c) continue;
    let normal: number;
    try {
      normal = rainfallNormal(content.climatology, uf.sigla, month);
    } catch {
      continue; // UF fora da climatologia: sem nuvem, sem seca
    }
    const v: UfClimateValues = {
      cloud: cloudCover(normal, c.rain),
      dryness: Math.min(1, Math.max(0, c.dryness)),
      heavyRain: heavyRain(c.rain),
    };
    values[uf.index] = v;
    parts.push(`${uf.index}:${v.cloud.toFixed(3)},${v.dryness.toFixed(3)},${v.heavyRain.toFixed(3)}`);
  }
  if (parts.length === 0) return null;
  return { key: `${state.monthIndex}|${parts.join(';')}`, seed: state.monthIndex, values };
}

/** O que o mapa 2D completo desenha por cima do preenchimento. */
export interface ClimateOverlay {
  /** UFs hachuradas (siglas): seca forte na camada Seca, chuva forte na camada Chuva. */
  hatched: readonly string[];
  /** UFs com o ícone de nuvem (chuva acima do normal), em qualquer camada. */
  clouds: readonly string[];
}

export const NO_CLIMATE_OVERLAY: ClimateOverlay = Object.freeze({ hatched: [], clouds: [] });

/**
 * Escolha por UF para o 2D. `layer`: a camada do mapa (só 'seca' e 'chuva' hachuram; as outras camadas não). `clouds`:
 * a opção "Nuvens" de Configurações (desligada, nenhum ícone). Quem decide a variante (o 2D leve não mostra nada disto)
 * é o `FlatBrazilMap`.
 */
export function buildClimateOverlay(
  climate: Pick<GameState, 'climate'>['climate'],
  layer: string | null,
  clouds: boolean,
): ClimateOverlay {
  const hatched: string[] = [];
  const icons: string[] = [];
  for (const u of climate.ufs) {
    if (layer === 'seca' && u.dryness >= DROUGHT_HATCH_FROM) hatched.push(u.id);
    if (layer === 'chuva' && u.rain >= HEAVY_RAIN_HATCH_FROM) hatched.push(u.id);
    if (clouds && u.rain >= RAIN_CLOUD_ICON_FROM) icons.push(u.id);
  }
  return hatched.length === 0 && icons.length === 0 ? NO_CLIMATE_OVERLAY : { hatched, clouds: icons };
}
