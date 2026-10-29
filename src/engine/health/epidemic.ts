import type { Disease } from '../../types/health';
import { healthParam } from './calibration';
import type { OutbreakUf } from './types';

/**
 * Modelo compartimental regional (PLANO_EXPANSAO F08, MVP B): suscetíveis → expostos → infecciosos → internados ou
 * recuperados, com mortes saindo dos infecciosos e dos internados. Roda em `passos_mes` passos internos por mês.
 *
 * - **Conservação:** cada fluxo é uma fração `1 − exp(−taxa·dt)` do compartimento de origem, então nenhum
 *   compartimento fica negativo e `s+e+i+h+r + mortes = população do início do mês`, exatamente.
 * - **Mobilidade entre UFs:** a força de infecção mistura o contato local com o do país inteiro
 *   (`disease.mobility`). Ninguém muda de UF aqui: a migração é da demografia.
 * - **Leitos:** os internados acima dos leitos livres morrem com a letalidade sem leito. A capacidade muda o
 *   desfecho, não a transmissão.
 *
 * Função pura, sem sorteio: o acaso do surto está todo na verdade sorteada no início (`OutbreakTruth`).
 */

export interface UfEpidemicInput {
  id: string;
  /** Multiplicador da transmissão no mês (estação, chuva, prevenção, medidas × adesão). */
  transmission: number;
  /** Fração das infecções que interna nesta UF (composição etária e atenção básica). */
  hospitalRate: number;
  /** Leitos livres para o surto (milhares): permanentes + emergência − rotina. */
  freeBeds: number;
  /** Doses aplicadas no mês (milhares). */
  doses: number;
  efficacy: number;
}

export interface UfEpidemicResult {
  uf: OutbreakUf;
  /** Internados em média no mês (milhares): a demanda do surto por leitos. */
  averageHospital: number;
  /** Mortes do mês por falta de leito (milhares), para o balanço e a explicação. */
  overflowDeaths: number;
}

const total = (u: OutbreakUf) => u.c.s + u.c.e + u.c.i + u.c.h + u.c.r;
const flow = (stock: number, rate: number, dt: number) =>
  stock > 0 && rate > 0 ? stock * (1 - Math.exp(-rate * dt)) : 0;

/**
 * Avança um mês. `ufs` chegam com `population` e `s` já ajustados à demografia do mês; os fluxos do mês são zerados
 * aqui e preenchidos de novo.
 */
export function advanceEpidemic(
  ufs: readonly OutbreakUf[],
  inputs: ReadonlyMap<string, UfEpidemicInput>,
  disease: Disease,
  r0: number,
): UfEpidemicResult[] {
  const steps = healthParam('passos_mes');
  const dt = healthParam('dias_mes') / steps;
  const beta = r0 / disease.infectiousDays;
  const state = ufs.map((u) => ({
    ...u,
    c: { ...u.c },
    monthInfections: 0,
    monthHospital: 0,
    monthDeaths: 0,
    monthVaccinated: 0,
  }));
  const hospitalSum = state.map(() => 0);
  const overflow = state.map(() => 0);

  for (let step = 0; step < steps; step++) {
    let infectious = 0;
    let alive = 0;
    for (const u of state) {
      infectious += u.c.i;
      alive += total(u);
    }
    const national = alive > 0 ? infectious / alive : 0;
    state.forEach((u, index) => {
      const input = inputs.get(u.id);
      const n = total(u);
      if (!input || n <= 0) return;
      const c = u.c;
      const local = c.i / n;
      const lambda =
        beta * Math.max(0, input.transmission) * ((1 - disease.mobility) * local + disease.mobility * national);

      const infected = flow(c.s, lambda, dt);
      // Vacina: doses distribuídas ao longo do mês, a parte que cai em suscetíveis protege com a eficácia.
      const doses = Math.max(0, input.doses) / steps;
      const reachingSusceptible = n > 0 ? doses * ((c.s - infected) / n) : 0;
      const protectedNow = Math.min(Math.max(0, c.s - infected), reachingSusceptible * input.efficacy);
      const incubated = flow(c.e, 1 / disease.latentDays, dt);
      const leaving = flow(c.i, 1 / disease.infectiousDays, dt);
      const hospitalized = leaving * Math.min(1, Math.max(0, input.hospitalRate));
      const communityDeaths = (leaving - hospitalized) * disease.fatalityCommunity;
      const discharged = flow(c.h, 1 / disease.hospitalDays, dt);
      const withoutBed = c.h > 0 ? Math.max(0, c.h - Math.max(0, input.freeBeds)) / c.h : 0;
      const hospitalDeathShare = (1 - withoutBed) * disease.fatalityHospital + withoutBed * disease.fatalityOverflow;
      const hospitalDeaths = discharged * hospitalDeathShare;

      c.s -= infected + protectedNow;
      c.e += infected - incubated;
      c.i += incubated - leaving;
      c.h += hospitalized - discharged;
      c.r += leaving - hospitalized - communityDeaths + discharged - hospitalDeaths + protectedNow;
      u.monthInfections += infected;
      u.monthHospital += hospitalized;
      u.monthDeaths += communityDeaths + hospitalDeaths;
      u.monthVaccinated += Math.min(doses, Math.max(0, n - c.h));
      hospitalSum[index] += c.h;
      overflow[index] += discharged * withoutBed * (disease.fatalityOverflow - disease.fatalityHospital);
    });
  }

  return state.map((u, index) => {
    // Resíduos de arredondamento não podem deixar compartimento negativo.
    for (const key of ['s', 'e', 'i', 'h', 'r'] as const) if (u.c[key] < 0) u.c[key] = 0;
    return {
      uf: {
        ...u,
        vaccinated: u.vaccinated + u.monthVaccinated,
        infections: u.infections + u.monthInfections,
        deaths: u.deaths + u.monthDeaths,
      },
      averageHospital: hospitalSum[index] / steps,
      overflowDeaths: Math.max(0, overflow[index]),
    };
  });
}

/** Número de reprodução efetivo de uma UF agora: R0 × transmissão do mês × fração suscetível. */
export function effectiveR(u: OutbreakUf, input: UfEpidemicInput | undefined, r0: number): number {
  const n = total(u);
  return n > 0 && input ? r0 * Math.max(0, input.transmission) * (u.c.s / n) : 0;
}

export function aliveOf(u: OutbreakUf): number {
  return total(u);
}
