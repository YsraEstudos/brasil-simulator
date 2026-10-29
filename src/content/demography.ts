import raw from '@/data/demography/census2022.json';
import { censusAgeDataSchema } from '@/types/demography';

/** Fonte observada em 2022; usar como composição inicial é aproximação do cenário. */
export const CENSUS_2022 = censusAgeDataSchema.parse(raw);
