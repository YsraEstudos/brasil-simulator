import { describe, expect, it } from 'vitest';
import { censusAgeDataSchema } from '@/types/demography';
import { UF_IDS } from '@/types/regions';
import { CENSUS_2022 } from './demography';

describe('Censo 2022 para demografia inicial', () => {
  it('contém as 27 UFs e cada total é a soma das faixas', () => {
    expect(new Set(CENSUS_2022.ufs.map((uf) => uf.uf))).toEqual(new Set(UF_IDS));
    for (const uf of CENSUS_2022.ufs) expect(uf.young + uf.working + uf.older).toBe(uf.total);
    expect(CENSUS_2022.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('recusa dado incompleto, repetido ou que não fecha', () => {
    const copy = structuredClone(CENSUS_2022);
    copy.ufs[0].young += 1;
    expect(censusAgeDataSchema.safeParse(copy).success).toBe(false);
    const duplicate = structuredClone(CENSUS_2022);
    duplicate.ufs[0] = duplicate.ufs[1];
    expect(censusAgeDataSchema.safeParse(duplicate).success).toBe(false);
    const missing = structuredClone(CENSUS_2022);
    missing.ufs.pop();
    expect(censusAgeDataSchema.safeParse(missing).success).toBe(false);
  });
});
