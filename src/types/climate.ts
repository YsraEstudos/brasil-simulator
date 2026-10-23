import { z } from 'zod';

import { dataSeriesSchema } from './data';
import { REGION_IDS, regionIdSchema, UF_IDS, ufIdSchema } from './regions';

/**
 * Climatologia do jogo (PLANO_GLOBO.md §6.1): normais de chuva por UF × mês e teleconexão ENSO por macrorregião ×
 * estação. É conteúdo **compartilhado**, não de um cenário: a climatologia do país não muda de uma versão do
 * cenário para a outra, e duplicar um cenário inteiro só para ela quebraria a regra de não alterar cenários
 * publicados. Gerada por `scripts/data/build_climatology.py`; valores `PROVISORIO` (DATA_SOURCES.md §4.3).
 */

/** Estações do hemisfério sul (meteorológicas): verão dez–fev, outono mar–mai, inverno jun–ago, primavera set–nov. */
export const SEASON_IDS = ['verao', 'outono', 'inverno', 'primavera'] as const;
export const seasonIdSchema = z.enum(SEASON_IDS);
export type SeasonId = z.infer<typeof seasonIdSchema>;

/** Meses por ano: conversão de unidade, não coeficiente de jogo. */
const MONTHS = 12;

/** Teto de sanidade do coeficiente de teleconexão (fração da normal por unidade de ENSO). */
const TELECONNECTION_ABS_MAX = 1;

const rainMmSchema = z.array(z.number().positive().finite()).length(MONTHS, 'doze normais mensais (jan..dez)');

const teleconnectionRowSchema = z
  .object({
    verao: z.number().min(-TELECONNECTION_ABS_MAX).max(TELECONNECTION_ABS_MAX),
    outono: z.number().min(-TELECONNECTION_ABS_MAX).max(TELECONNECTION_ABS_MAX),
    inverno: z.number().min(-TELECONNECTION_ABS_MAX).max(TELECONNECTION_ABS_MAX),
    primavera: z.number().min(-TELECONNECTION_ABS_MAX).max(TELECONNECTION_ABS_MAX),
  })
  .strict();

export const climatologySchema = z
  .object({
    id: z.string().min(1),
    version: z.string().min(1),
    rain: z
      .object({
        /** Origem e status das normais (`PROVISORIO` até a importação do INMET). */
        meta: dataSeriesSchema,
        ufs: z.array(
          z
            .object({
              id: ufIdSchema,
              region: regionIdSchema,
              /** Normal de chuva em mm, janeiro a dezembro. */
              mm: rainMmSchema,
            })
            .strict(),
        ),
      })
      .strict(),
    enso: z
      .object({
        meta: dataSeriesSchema,
        /**
         * Anomalia de chuva (fração da normal) para ENSO = +1 (El Niño); ENSO = −1 (La Niña) inverte o sinal.
         * Negativo = mais seco.
         */
        teleconnection: z.object(
          Object.fromEntries(REGION_IDS.map((r) => [r, teleconnectionRowSchema])) as Record<
            (typeof REGION_IDS)[number],
            typeof teleconnectionRowSchema
          >,
        ),
      })
      .strict(),
  })
  .strict()
  .superRefine((c, ctx) => {
    const ids = c.rain.ufs.map((u) => u.id);
    if (ids.length !== UF_IDS.length || UF_IDS.some((id, i) => ids[i] !== id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['rain', 'ufs'],
        message: `as normais precisam cobrir as ${UF_IDS.length} UFs, na ordem de UF_IDS`,
      });
    }
  });

export type Climatology = z.infer<typeof climatologySchema>;

/** Valida a climatologia carregada; um JSON inválido é erro de desenvolvimento. */
export function parseClimatology(
  raw: unknown,
): { ok: true; climatology: Climatology } | { ok: false; errors: string[] } {
  const r = climatologySchema.safeParse(raw);
  if (r.success) return { ok: true, climatology: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
}
