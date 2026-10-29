import { z } from 'zod';
import { UF_IDS } from './regions';

/** Contagens históricas oficiais, em pessoas, não projeções da campanha. */
const entry = z
  .object({
    uf: z.string(),
    total: z.number().int().positive(),
    young: z.number().int().nonnegative(),
    working: z.number().int().nonnegative(),
    older: z.number().int().nonnegative(),
  })
  .strict()
  .refine((x) => x.young + x.working + x.older === x.total, 'faixas não fecham com total');

export const censusAgeDataSchema = z
  .object({
    source: z.string().min(1),
    url: z.url(),
    period: z.literal('2022'),
    unit: z.literal('pessoas'),
    status: z.literal('OFICIAL_OBSERVADO'),
    retrievedAt: z.iso.date(),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    method: z.string().min(1),
    ufs: z.array(entry).length(27),
  })
  .strict()
  .refine((data) => {
    const ids = new Set(data.ufs.map((uf) => uf.uf));
    return ids.size === UF_IDS.length && UF_IDS.every((id) => ids.has(id));
  }, 'UFs incompletas ou repetidas');

export type CensusAgeData = z.infer<typeof censusAgeDataSchema>;
