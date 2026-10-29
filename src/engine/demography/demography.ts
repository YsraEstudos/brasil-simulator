import { DEMOGRAPHY_CALIBRATION as p } from './calibration';
import type { MonthStep } from '../types';
import type { CensusAgeData } from '../../types/demography';

/** População e fluxos em milhares de pessoas; faixas 0–19, 20–64 e 65+. */
export interface Demography {
  ufs: {
    id: string;
    ages: { young: number; working: number; older: number };
    /** `deaths` inclui `epidemicDeaths` (mortes dos surtos, contadas pela saúde e retiradas só aqui). */
    flows: { births: number; deaths: number; external: number; internal: number; epidemicDeaths: number };
  }[];
  /** Variação mensal de idosos, além da tendência demográfica implícita na calibração inicial. */
  olderGrowthDeviation: number;
  /** Referências da composição inicial, para não duplicar tendências já calibradas. */
  initialYoung: number;
  baselineOlderGrowth: number;
}
const total = (ages: Demography['ufs'][number]['ages']) => ages.young + ages.working + ages.older;
export function initialDemography(
  ufs: readonly { id: string; population: number }[],
  census?: CensusAgeData,
): Demography {
  const reference = new Map(census?.ufs.map((uf) => [uf.uf, uf]));
  const states = [...ufs]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(({ id, population }) => {
      const observed = reference.get(id);
      const youngShare = observed ? observed.young / observed.total : p.initialYoung;
      const olderShare = observed ? observed.older / observed.total : p.initialOlder;
      return {
        id,
        ages: {
          young: population * youngShare,
          working: population * (1 - youngShare - olderShare),
          older: population * olderShare,
        },
        flows: { births: 0, deaths: 0, external: 0, internal: 0, epidemicDeaths: 0 },
      };
    });
  const initialYoung = states.reduce((sum, uf) => sum + uf.ages.young, 0);
  const initialWorking = states.reduce((sum, uf) => sum + uf.ages.working, 0);
  const initialOlder = states.reduce((sum, uf) => sum + uf.ages.older, 0);
  const baselineOlderGrowth =
    initialOlder > 0
      ? (initialWorking * (1 - p.annualDeathWorking / 12)) / (p.workingYears * 12 * initialOlder) -
        p.annualDeathOlder / 12
      : 0;
  return { olderGrowthDeviation: 0, initialYoung, baselineOlderGrowth, ufs: states };
}
/** Mortes de surto de uma UF por faixa etária (milhares), vindas da saúde. */
export type EpidemicDeaths = readonly { id: string; young: number; working: number; older: number }[];

/**
 * Retira as mortes do surto de cada faixa sem deixar faixa negativa: o que não cabe numa faixa passa para a seguinte
 * (o total retirado é sempre o informado, pois a saúde nunca mata mais do que a população da UF).
 */
function removeEpidemicDeaths(
  ages: { young: number; working: number; older: number },
  deaths: { young: number; working: number; older: number } | undefined,
) {
  if (!deaths) return { ages, removed: 0 };
  const next = { ...ages };
  let removed = 0;
  const order = ['older', 'working', 'young'] as const;
  let pending = 0;
  for (const group of order) {
    const take = Math.min(next[group], Math.max(0, deaths[group]) + pending);
    pending = Math.max(0, deaths[group]) + pending - take;
    next[group] -= take;
    removed += take;
  }
  for (const group of order) {
    if (pending <= 0) break;
    const take = Math.min(next[group], pending);
    next[group] -= take;
    pending -= take;
    removed += take;
  }
  return { ages: next, removed };
}

export function advanceDemography(state: Demography, epidemic: EpidemicDeaths = []): Demography {
  const months = 12;
  // As mortes do surto saem primeiro: a migração do mês é calculada sobre quem sobreviveu (soma zero entre UFs).
  const hits = state.ufs.map((uf) =>
    removeEpidemicDeaths(
      uf.ages,
      epidemic.find((d) => d.id === uf.id),
    ),
  );
  const workingTotal = hits.reduce((sum, hit) => sum + hit.ages.working, 0);
  const migrants = (workingTotal * p.annualInternalMigration) / months;
  const destinationWeights = hits.map((hit) => Math.sqrt(Math.max(0, hit.ages.working)));
  const weightTotal = destinationWeights.reduce((sum, weight) => sum + weight, 0);
  const ufs = state.ufs.map((uf, index) => {
    const hit = hits[index];
    const epidemicDeaths = hit.removed;
    const { young, working, older } = hit.ages;
    const births = (total(uf.ages) * p.annualBirthsPerPerson) / months;
    const deathYoung = (young * p.annualDeathYoung) / months;
    const deathWorking = (working * p.annualDeathWorking) / months;
    const deathOlder = (older * p.annualDeathOlder) / months;
    const toWorking = (young - deathYoung) / (p.youngYears * months);
    const toOlder = (working - deathWorking) / (p.workingYears * months);
    const external = (working * p.annualExternalMigration) / months;
    const internal =
      (weightTotal ? (migrants * destinationWeights[index]) / weightTotal : 0) -
      (working * p.annualInternalMigration) / months;
    return {
      id: uf.id,
      ages: {
        young: young - deathYoung - toWorking + births,
        working: working - deathWorking + toWorking - toOlder + internal + external,
        older: older - deathOlder + toOlder,
      },
      flows: {
        births,
        deaths: deathYoung + deathWorking + deathOlder + epidemicDeaths,
        internal,
        external,
        epidemicDeaths,
      },
    };
  });
  const previousOlder = state.ufs.reduce((sum, uf) => sum + uf.ages.older, 0);
  const nextOlder = ufs.reduce((sum, uf) => sum + uf.ages.older, 0);
  return {
    ...state,
    ufs,
    olderGrowthDeviation: previousOlder > 0 ? nextOlder / previousOlder - 1 - state.baselineOlderGrowth : 0,
  };
}

export const demographyStep: MonthStep = (state) => ({
  state: { ...state, demography: advanceDemography(state.demography, state.health?.monthDeaths ?? []) },
  contributions: [],
});
