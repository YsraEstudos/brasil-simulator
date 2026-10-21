import { UF_IDS, type RegionId } from '../../types/regions';
import { SEASON_IDS, type Climatology, type SeasonId } from '../../types/climate';
import { deriveSeed, seedRng } from '../rng';
import type { ClimateState, GameState, UfClimate } from '../types';

/**
 * Contrato do clima (PLANO_GLOBO.md §6.1; PR 7): estado inicial neutro, PRNG próprio derivado da semente da
 * campanha e leitores puros das tabelas de climatologia. A evolução (ENSO, anomalias, seca, cheia) e os efeitos
 * ficam para o PR 8; aqui nada altera o estado nem consome sorteios.
 */

/**
 * Sal do PRNG do clima: o texto ASCII "CLIM" como inteiro de 32 bits. **Constante estável: nunca muda** depois de
 * publicada, porque ela define o clima de toda campanha existente. Outros sistemas que ganharem PRNG próprio usam
 * sais distintos.
 */
export const CLIMATE_SEED_SALT = 0x434c494d;

/** Meses por ano: conversão de unidade, não coeficiente de jogo. */
const MONTHS_PER_YEAR = 12;

/**
 * Semente do PRNG do clima de uma campanha: `deriveSeed(semente da campanha, CLIMATE_SEED_SALT)`. Pura; a mesma
 * semente da campanha dá sempre a mesma semente do clima, e o PRNG principal não é tocado.
 */
export function climateSeed(campaignSeed: number): number {
  return deriveSeed(campaignSeed, CLIMATE_SEED_SALT);
}

/** Estado do PRNG do clima de uma campanha (depende só da semente da campanha). */
export function climateRngState(campaignSeed: number): ClimateState['rng'] {
  return seedRng(climateSeed(campaignSeed));
}

/**
 * Clima neutro: ENSO 0, chuva normal e sem seca nas 27 UFs (na ordem de `UF_IDS`), com o PRNG derivado da
 * semente da campanha. É o estado de toda campanha nova e de todo save atualizado para a v11.
 */
export function initialClimate(campaignSeed: number): ClimateState {
  return {
    enso: 0,
    ufs: UF_IDS.map((id): UfClimate => ({ id, rain: 0, dryness: 0 })),
    rng: climateRngState(campaignSeed),
  };
}

/** Clima de uma UF no estado, ou `undefined` se a sigla for desconhecida. */
export function climateOf(state: Pick<GameState, 'climate'>, ufId: string): Readonly<UfClimate> | undefined {
  return state.climate.ufs.find((u) => u.id === ufId);
}

/**
 * Estação do hemisfério sul (meteorológica) de um mês do calendário 1–12: verão = dez–fev, outono = mar–mai,
 * inverno = jun–ago, primavera = set–nov. Ligada ao `monthIndex` do jogo por `toCalendar(monthIndex).month`.
 */
export function seasonOf(month: number): SeasonId {
  if (!Number.isInteger(month) || month < 1 || month > MONTHS_PER_YEAR) {
    throw new RangeError(`mês inválido: ${month}`);
  }
  // dez(12), jan(1), fev(2) -> 0; mar-mai -> 1; jun-ago -> 2; set-nov -> 3.
  return SEASON_IDS[Math.floor((month % MONTHS_PER_YEAR) / 3)];
}

/** Macrorregião de uma UF segundo a climatologia, ou `undefined` se a sigla for desconhecida. */
export function regionOfUf(climatology: Climatology, ufId: string): RegionId | undefined {
  return climatology.rain.ufs.find((u) => u.id === ufId)?.region;
}

/**
 * Normal de chuva de uma UF num mês do calendário (1–12), em mm. Lança erro se a UF não existe na climatologia
 * (dado de conteúdo errado é erro de desenvolvimento, não situação de jogo).
 */
export function rainfallNormal(climatology: Climatology, ufId: string, month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > MONTHS_PER_YEAR) {
    throw new RangeError(`mês inválido: ${month}`);
  }
  const uf = climatology.rain.ufs.find((u) => u.id === ufId);
  if (!uf) throw new RangeError(`UF sem normais de chuva: ${ufId}`);
  return uf.mm[month - 1];
}

/**
 * Coeficiente da teleconexão ENSO de uma macrorregião numa estação: anomalia de chuva (fração da normal) para
 * ENSO = +1 (El Niño). Multiplique pelo índice ENSO (−1…1): La Niña (índice negativo) inverte o sinal.
 */
export function ensoTeleconnection(climatology: Climatology, region: RegionId, season: SeasonId): number {
  return climatology.enso.teleconnection[region][season];
}

/** Coeficiente da teleconexão ENSO para uma UF num mês do calendário (macrorregião da UF × estação do mês). */
export function ensoTeleconnectionOf(climatology: Climatology, ufId: string, month: number): number {
  const region = regionOfUf(climatology, ufId);
  if (!region) throw new RangeError(`UF sem macrorregião na climatologia: ${ufId}`);
  return ensoTeleconnection(climatology, region, seasonOf(month));
}

/**
 * Invariantes do clima (PLANO_GLOBO.md §6.1): ENSO em [−1, 1]; por UF, anomalia de chuva finita e acima de −100% da
 * normal e seca em [0, 1]; as 27 UFs na ordem de `UF_IDS`; estado do PRNG com quatro palavras inteiras (o sfc32 guarda algumas como inteiros de 32 bits com sinal).
 */
export function checkClimate(climate: Readonly<ClimateState>): string[] {
  const errors: string[] = [];
  if (!(Math.abs(climate.enso) <= 1)) errors.push(`ENSO fora de [−1, 1]: ${climate.enso}`);
  if (climate.ufs.length !== UF_IDS.length || climate.ufs.some((u, i) => u.id !== UF_IDS[i])) {
    errors.push('clima precisa das 27 UFs, na ordem de UF_IDS');
  }
  for (const u of climate.ufs) {
    if (!(Number.isFinite(u.rain) && u.rain > -1)) errors.push(`${u.id}: anomalia de chuva inválida: ${u.rain}`);
    if (!(u.dryness >= 0 && u.dryness <= 1)) errors.push(`${u.id}: seca fora de [0, 1]: ${u.dryness}`);
  }
  if (climate.rng.length !== 4 || climate.rng.some((w) => !Number.isInteger(w))) {
    errors.push('estado do PRNG do clima inválido');
  }
  return errors;
}
