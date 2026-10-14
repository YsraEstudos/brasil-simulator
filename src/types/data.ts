import { z } from 'zod';

/** Status de um valor de cenário (DATA_SOURCES.md §2.1). */
export const dataStatusSchema = z.enum(['REAL', 'PROJETADO', 'ESTIMADO', 'FICTICIO', 'PROVISORIO']);
export type DataStatus = z.infer<typeof dataStatusSchema>;

/** "2026-08" ou "2026" */
const periodSchema = z.string().regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/, 'período no formato AAAA ou AAAA-MM');
/** "2026-10-13" */
const isoDateSchema = z.iso.date();

const dataFields = z
  .object({
    value: z.number().refine(Number.isFinite, 'valor precisa ser finito'),
    unit: z.string().min(1),
    status: dataStatusSchema,
    source: z.string().min(1).optional(),
    series: z.string().min(1).optional(),
    referenceDate: periodSchema.optional(),
    retrievedAt: isoDateSchema.optional(),
    method: z.string().min(1).optional(),
    note: z.string().optional(),
  })
  .strict();

/** Fonte e data por status (DATA_SOURCES.md §2.2), comum a valores e a séries. */
function checkOrigin(
  v: { status: DataStatus; source?: string; referenceDate?: string; method?: string },
  ctx: z.RefinementCtx,
) {
  if (v.status === 'REAL' || v.status === 'PROJETADO' || v.status === 'ESTIMADO') {
    if (!v.source) ctx.addIssue({ code: 'custom', path: ['source'], message: `status ${v.status} exige fonte` });
    if (!v.referenceDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['referenceDate'],
        message: `status ${v.status} exige data de referência`,
      });
    }
  }
  if (v.status === 'ESTIMADO' && !v.method) {
    ctx.addIssue({ code: 'custom', path: ['method'], message: 'status ESTIMADO exige método' });
  }
}

/**
 * Número com origem e status (DATA_SOURCES.md §2.2): "nenhum número sem origem".
 * Valores `REAL`, `PROJETADO` e `ESTIMADO` exigem fonte e data de referência; `ESTIMADO` exige também o método.
 */
export const dataValueSchema = dataFields.superRefine(checkOrigin);
export type DataValue = z.infer<typeof dataValueSchema>;

/**
 * Metadados de uma série tabelada (ex.: uma coluna por UF): os de `dataValueSchema` sem o valor, que fica em
 * cada linha da tabela. Valem as mesmas exigências de fonte, data e método por status.
 */
export const dataSeriesSchema = dataFields.omit({ value: true }).superRefine(checkOrigin);
export type DataSeries = z.infer<typeof dataSeriesSchema>;

/** ID de conteúdo: minúsculas, dígitos e sublinhado, em português (AI_INSTRUCTIONS.md §4). */
export const contentIdSchema = z.string().regex(/^[a-z][a-z0-9_]*$/, 'id em snake_case sem acentos');
