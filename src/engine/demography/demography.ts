import { DEMOGRAPHY_CALIBRATION as p } from './calibration';
import type { MonthStep } from '../types';
import type { CensusAgeData } from '../../types/demography';

/** População e fluxos em milhares de pessoas; faixas 0–19, 20–64 e 65+. */
export interface Demography {
  ufs: {
    id: string;
    ages: { young: number; working: number; older: number };
    flows: { births: number; deaths: number; external: number; internal: number };
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
        flows: { births: 0, deaths: 0, external: 0, internal: 0 },
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
export function advanceDemography(state: Demography): Demography {
  const months = 12;
  const workingTotal = state.ufs.reduce((sum, uf) => sum + uf.ages.working, 0);
  const migrants = (workingTotal * p.annualInternalMigration) / months;
  const destinationWeights = state.ufs.map((uf) => Math.sqrt(Math.max(0, uf.ages.working)));
  const weightTotal = destinationWeights.reduce((sum, weight) => sum + weight, 0);
  const ufs = state.ufs.map((uf, index) => {
    const { young, working, older } = uf.ages;
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
      flows: { births, deaths: deathYoung + deathWorking + deathOlder, internal, external },
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
  state: { ...state, demography: advanceDemography(state.demography) },
  contributions: [],
});
