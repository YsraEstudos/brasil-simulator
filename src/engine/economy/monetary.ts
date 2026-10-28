import { PRESSURE_ACTION_ID } from '../actions';
import { termOf } from '../calendar';
import type { BcPressureState, GameContent, GameState, StepContext } from '../types';

import type { Calibration } from './calibration';
import { clamp } from './pieces';

/**
 * Banco Central (ECONOMIC_MODEL.md §5.4, §5.4.1): regra de Taylor suavizada com juro neutro que sobe com o
 * prêmio de risco, passo maior em crise e pressão pública do governo.
 */

const MONTHS_PER_YEAR = 12;
/** Mandato presidencial de 4 anos; a diretoria do BC é renovada em escada (LC 179/2021). */
const TERM_YEARS = 4;

/** Diretoria colegiada do BC: presidente e 8 diretores (LC 179/2021 art. 2º). */
export const BC_BOARD_SIZE = 9;

/**
 * Fração da diretoria do BC indicada pelo governo no mês (LC 179/2021 art. 4º). No 1º mandato, 2, 4, 7 e 9 de 9 do 1º
 * ao 4º ano. No 2º mandato (o mesmo presidente reeleito), toda a diretoria já foi indicada por ele e cada membro que
 * sai é substituído por nova indicação dele: 9 de 9 o tempo todo (correção da análise da Fase C6f do PLANO_CAMPANHA;
 * antes, o 2º mandato voltava a 2 de 9).
 */
export function boardShare(monthIndex: number, c: Calibration): number {
  if (termOf(monthIndex) > 0) return c.diretoria_ano4;
  const year = Math.floor(monthIndex / MONTHS_PER_YEAR) % TERM_YEARS;
  return [c.diretoria_ano1, c.diretoria_ano2, c.diretoria_ano3, c.diretoria_ano4][year] ?? c.diretoria_ano4;
}

export interface PressureMonth {
  state: BcPressureState;
  /** Houve pressão neste mês. */
  pressed: boolean;
  /** Pressões nos 12 meses anteriores a este (antes de contar a deste mês). */
  previous12m: number;
  /** Pressões nos últimos 12 meses, contando a deste mês (alimenta o prêmio de risco). */
  last12m: number;
  /** Credibilidade perdida neste mês pela pressão. */
  credibilityCost: number;
  /** Submissão do BC (0–1) calculada neste mês. */
  submission: number;
}

/**
 * Registra a pressão do mês (ação de agenda `pressionar_banco_central`): submissão = sub_base × diretoria
 * indicada × (1 − autonomia); o corte vale na próxima reunião do Copom; a credibilidade cai mais a cada
 * repetição em 12 meses (ECONOMIC_MODEL.md §5.4.1).
 */
export function pressureMonth(state: Readonly<GameState>, ctx: StepContext): PressureMonth {
  const c = ctx.content.calibration;
  const t = state.monthIndex;
  const p = state.economy.bcPressure;
  const recent = p.months.filter((m) => m > t - MONTHS_PER_YEAR && m < t);
  const pressed = ctx.decisions.some((d) => d.policyId === PRESSURE_ACTION_ID);
  const submission = c.sub_base * boardShare(t, c) * (1 - c.autonomia_percebida);
  if (!pressed) {
    return {
      state: { months: recent, pendingCut: p.pendingCut },
      pressed,
      previous12m: recent.length,
      last12m: recent.length,
      credibilityCost: 0,
      submission,
    };
  }
  return {
    state: { months: [...recent, t], pendingCut: Math.max(p.pendingCut, c.pressao_max * submission) },
    pressed,
    previous12m: recent.length,
    last12m: recent.length + 1,
    credibilityCost: c.custo_cred_pressao * (1 + recent.length),
    submission,
  };
}

/** Efeito provável de pressionar o BC neste mês, para o jogador (ECONOMIC_MODEL.md §5.4.2). */
export interface PressureForecast {
  /** Membros da diretoria indicados por este governo (de `BC_BOARD_SIZE`). */
  indicated: number;
  /** Mês (`monthIndex`) da próxima reunião do Copom em que o corte valeria, ou `null` sem reunião no cenário. */
  nextCopomMonth: number | null;
  /** Corte extra provável nessa reunião, já arredondado aos passos de 25 bp (0 = o BC resiste). É um teto. */
  cut: number;
  /** Já há pressão valendo para essa reunião: pressionar de novo não aumenta o corte, só o custo. */
  alreadyPending: boolean;
  /** Credibilidade perdida no mês (certa). */
  credibilityCost: number;
  /** Pressões nos 12 meses anteriores (cada uma soma prêmio de risco). */
  previous12m: number;
}

/**
 * Previsão da pressão (análise da Fase C6f): a submissão do BC não tem sorteio, então o corte da próxima reunião é
 * conhecido antes de agir; o Copom ainda pode absorver parte dele pelo limite de movimento e pelo piso, por isso o
 * corte é um teto. Mesma conta de `pressureMonth` e `copomRate`.
 */
export function pressureForecast(state: Readonly<GameState>, content: Pick<GameContent, 'scenario' | 'calibration'>) {
  const c = content.calibration;
  const t = state.monthIndex;
  const months = content.scenario.copomMonths;
  let nextCopomMonth: number | null = null;
  for (let m = t; m < t + MONTHS_PER_YEAR && months.length > 0; m++) {
    if (months.includes((m % MONTHS_PER_YEAR) + 1)) {
      nextCopomMonth = m;
      break;
    }
  }
  const p = state.economy.bcPressure;
  const previous12m = p.months.filter((m) => m > t - MONTHS_PER_YEAR && m < t).length;
  const submission = c.sub_base * boardShare(t, c) * (1 - c.autonomia_percebida);
  const forecast: PressureForecast = {
    indicated: Math.round(boardShare(t, c) * BC_BOARD_SIZE),
    nextCopomMonth,
    cut: Math.round((c.pressao_max * submission) / c.passo_selic) * c.passo_selic,
    alreadyPending: p.pendingCut > 0,
    credibilityCost: c.custo_cred_pressao * (1 + previous12m),
    previous12m,
  };
  return forecast;
}

export interface CopomInputs {
  selicPrev: number;
  expectation: number;
  gap: number;
  riskPremium: number;
  inflation12m: number;
  pendingCut: number;
}

/**
 * Selic decidida pelo Copom: alvo de Taylor com juro neutro + parte do prêmio de risco; suavização, passo
 * máximo (maior em crise) e arredondamento a 25 bp. O corte obtido por pressão é aplicado **depois** da
 * suavização, em passos de 25 bp (corte abaixo de meio passo não muda a decisão), sem passar do passo máximo da
 * reunião; o piso operacional vale sempre (ECONOMIC_MODEL.md §5.4.1).
 */
export function copomRate(x: CopomInputs, c: Calibration): number {
  const neutral = c.juro_neutro + c.repasse_risco_neutro * (x.riskPremium - c.premio_base);
  const target = neutral + x.expectation + c.phi_pi * (x.expectation - c.meta_inflacao) + c.phi_h * x.gap;
  const crisis =
    x.inflation12m > c.meta_inflacao + c.tolerancia_meta + c.limiar_crise_inflacao ||
    x.riskPremium > c.premio_base + c.premio_extra_max / 2;
  const step = crisis ? c.max_passo_crise : c.max_passo;
  const raw = c.suav * x.selicPrev + (1 - c.suav) * target;
  const limited = clamp(raw, x.selicPrev - step, x.selicPrev + step);
  const rounded = Math.round(limited / c.passo_selic) * c.passo_selic;
  const cut = Math.round(x.pendingCut / c.passo_selic) * c.passo_selic;
  return Math.max(c.selic_piso, x.selicPrev - step, rounded - cut);
}
