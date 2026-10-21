import { lonLatToVec3, type Vec3 } from './geo';

/**
 * Relógio visual do globo (PLANO_GLOBO.md §4.1, D-G7): onde está o Sol. Módulo puro (sem three/React/`Date`): quem
 * chama passa a hora UTC como número. É só visual: nada aqui chega ao motor de simulação.
 *
 * Convenção: a direção do Sol é um vetor unitário no mesmo referencial do globo (`lonLatToVec3`: lon 0 em +x, polo
 * norte em +y, lon −90° em +z), apontando para o ponto subsolar. Um ponto da superfície com normal `n` está de dia
 * quando `dot(n, sol) > 0`. O ponto subsolar tem latitude = declinação solar (pelo mês do jogo) e longitude pela hora
 * UTC (15° por hora; ao meio-dia UTC o Sol está sobre o meridiano 0°). Equação do tempo ignorada (≤ 16 min).
 */

/** Como a hora do dia é escolhida (Configurações → Hora do dia). */
export type DayMode = 'fixa' | 'sempre-dia' | 'real';

export const DAY_MODES: readonly DayMode[] = ['fixa', 'sempre-dia', 'real'];

/** Horas fictícias oferecidas no modo `fixa`, em horário de Brasília (UTC−3). */
export type FixedHour = 'manha' | 'tarde' | 'entardecer' | 'noite';

export const FIXED_HOURS: readonly FixedHour[] = ['manha', 'tarde', 'entardecer', 'noite'];

/** Hora de Brasília (decimal) de cada hora fixa. */
export const FIXED_HOUR_BRASILIA: Readonly<Record<FixedHour, number>> = {
  manha: 9,
  tarde: 15,
  entardecer: 18,
  noite: 22,
};

/** Fuso de Brasília em relação ao UTC (horas). */
export const BRASILIA_UTC_OFFSET = -3;

/** Escolha do jogador (guardada em `settings`, fora do `GameState`). */
export interface DayTimeSetting {
  mode: DayMode;
  /** Vale no modo `fixa`. */
  hour: FixedHour;
}

/** Padrão: hora fixa, de tarde (o Brasil inteiro iluminado, relevo legível pelo lado oeste). */
export const DEFAULT_DAY_TIME: DayTimeSetting = { mode: 'fixa', hour: 'tarde' };

/** Hora UTC (0–24) e minuto, vindos do relógio do aparelho (modo `real`). */
export interface UtcClock {
  hour: number;
  minute: number;
}

/** Entrada completa do relógio visual: a escolha, o mês do calendário do jogo (1–12) e, se `real`, o relógio. */
export interface SkyInput {
  setting: DayTimeSetting;
  /** Mês do calendário da campanha (1 = janeiro … 12 = dezembro), de `toCalendar(monthIndex).month`. */
  month: number;
  /** Hora UTC do aparelho; só lida no modo `real` (sem ela o modo `real` cai na hora fixa do ajuste). */
  utc?: UtcClock;
}

export interface SunState {
  /** O Sol ilumina o globo? `false` em "Sempre dia": o sombreamento e as luzes ficam desligados. */
  enabled: boolean;
  /** Direção unitária do Sol (ponto subsolar), no referencial do globo. */
  dir: Vec3;
  /** Ponto subsolar, em graus. */
  subsolar: { lon: number; lat: number };
}

/** Obliquidade da eclíptica (graus): a declinação solar varia entre ±este valor ao longo do ano. */
export const OBLIQUITY_DEG = 23.44;

/** Dia do ano do dia 15 de cada mês (ano comum): o mês do jogo representa a metade dele. */
const MID_MONTH_DAY_OF_YEAR = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349] as const;

/** O solstício de dezembro cai ~10 dias antes do fim do ano: a declinação é mínima no dia 355 (= 365 − 10). */
const SOLSTICE_DAY_OFFSET = 10;
const DAYS_IN_YEAR = 365;

/** Mês do calendário 1–12 → índice 0–11 (valores fora da faixa são ajustados ao ciclo). */
function monthSlot(month: number): number {
  return (((Math.round(month) - 1) % 12) + 12) % 12;
}

/** Declinação solar (graus) no meio do mês: ≈ −23° em dezembro (Sol ao sul), ≈ +23° em junho, ≈ 0 nos equinócios. */
export function solarDeclinationDeg(month: number): number {
  const day = MID_MONTH_DAY_OF_YEAR[monthSlot(month)];
  return -OBLIQUITY_DEG * Math.cos((2 * Math.PI * (day + SOLSTICE_DAY_OFFSET)) / DAYS_IN_YEAR);
}

/** Normaliza uma longitude para (−180, 180]. */
export function wrapLon(lon: number): number {
  const w = (((lon + 180) % 360) + 360) % 360;
  return w === 0 ? 180 : w - 180;
}

/** Longitude do ponto subsolar para a hora UTC decimal: 12:00 UTC → 0°, cada hora a mais anda 15° para oeste. */
export function subsolarLongitudeDeg(utcHours: number): number {
  return wrapLon(-15 * (utcHours - 12));
}

/** Hora de Brasília (decimal) → hora UTC decimal em [0, 24). */
export function brasiliaToUtcHours(brasiliaHours: number): number {
  return (((brasiliaHours - BRASILIA_UTC_OFFSET) % 24) + 24) % 24;
}

function sunAt(utcHours: number, month: number, enabled: boolean): SunState {
  const lon = subsolarLongitudeDeg(utcHours);
  const lat = solarDeclinationDeg(month);
  return { enabled, dir: lonLatToVec3(lon, lat), subsolar: { lon, lat } };
}

/** Meio-dia em Brasília (Sol sobre o Brasil): usado como direção do modo "Sempre dia". */
const NOON_BRASILIA_UTC = brasiliaToUtcHours(12);

/** O Sol para a escolha do jogador, o mês do jogo e (modo `real`) o relógio do aparelho. */
export function computeSun(input: SkyInput): SunState {
  const { setting, month } = input;
  if (setting.mode === 'sempre-dia') return sunAt(NOON_BRASILIA_UTC, month, false);
  if (setting.mode === 'real' && input.utc) {
    return sunAt(input.utc.hour + input.utc.minute / 60, month, true);
  }
  return sunAt(brasiliaToUtcHours(FIXED_HOUR_BRASILIA[setting.hour]), month, true);
}

// ---------------------------------------------------------------- iluminação (o GLSL usa as mesmas constantes)

/** Brilho mínimo do lado noturno: o mapa continua legível. */
export const NIGHT_FLOOR = 0.35;
/** Faixa do terminador: `dot(normal, sol)` de `TERMINATOR_FROM` (noite plena) a `TERMINATOR_TO` (dia pleno). */
export const TERMINATOR_FROM = -0.1;
export const TERMINATOR_TO = 0.22;
/** Luzes das cidades: plenas com `dot ≤ LIGHTS_FULL_BELOW`, apagadas com `dot ≥ LIGHTS_OFF_ABOVE`. */
export const LIGHTS_FULL_BELOW = -0.1;
export const LIGHTS_OFF_ABOVE = 0.12;

/** `smoothstep` do GLSL. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Produto escalar entre duas direções. */
export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Fator de luz do terreno para um `dot(normal, sol)`: `NIGHT_FLOOR` (noite) a 1 (dia), suave no terminador. */
export function dayLight(ndl: number): number {
  return NIGHT_FLOOR + (1 - NIGHT_FLOOR) * smoothstep(TERMINATOR_FROM, TERMINATOR_TO, ndl);
}

/** Intensidade das luzes das cidades (0 de dia, 1 de noite) para um `dot(normal, sol)`. */
export function lightsAmount(ndl: number): number {
  return 1 - smoothstep(LIGHTS_FULL_BELOW, LIGHTS_OFF_ABOVE, ndl);
}

/** Fator de luz num ponto lon/lat; sem Sol ligado ("Sempre dia") é sempre 1. */
export function dayLightAt(sun: SunState, lon: number, lat: number): number {
  return sun.enabled ? dayLight(dot(lonLatToVec3(lon, lat), sun.dir)) : 1;
}

/** Luzes das cidades num ponto lon/lat; sem Sol ligado ("Sempre dia") ficam apagadas. */
export function lightsAmountAt(sun: SunState, lon: number, lat: number): number {
  return sun.enabled ? lightsAmount(dot(lonLatToVec3(lon, lat), sun.dir)) : 0;
}

/** Chave estável do Sol (para memoizar e saber se algo mudou): arredonda o ponto subsolar a `digits` casas decimais (graus). */
export function sunKey(sun: SunState, digits = 2): string {
  return `${sun.enabled ? 1 : 0}|${sun.subsolar.lon.toFixed(digits)}|${sun.subsolar.lat.toFixed(digits)}`;
}
