import { z } from 'zod';

import { contentIdSchema, dataStatusSchema } from './data';
import { macroRegionSchema } from './health';

/**
 * Imprensa interpretativa (PLANO_EXPANSAO F15, EX-28), gravada em `src/data/press/`. Veículos **fictícios** (proibido
 * atribuir texto a veículo real, docs/AI_INSTRUCTIONS.md §8) com viés, confiabilidade de partida, sensacionalismo e
 * alcance; e os modelos de rumor que podem circular numa crise. Rumor é afirmação não verificada: pode ser verdadeira
 * (vazamento) ou falsa (desinformação). O motor guarda a verdade; a interface só a mostra depois da checagem.
 */

export const outletSchema = z
  .object({
    id: contentIdSchema,
    name: z.string().min(1),
    kind: z.enum(['jornal', 'tv', 'portal', 'rede']),
    /** `nacional` ou a macrorregião onde circula. */
    reach: z.union([z.literal('nacional'), macroRegionSchema]),
    /** Viés editorial: −1 crítico ao governo, +1 favorável. Muda a leitura, nunca o fato. */
    bias: z.number().min(-1).max(1),
    /** Confiabilidade de partida (0–1): histórico de acertos; evolui com rumores confirmados ou desmentidos. */
    reliability: z.number().min(0).max(1),
    /** Propensão a publicar rumor antes de checar (0–1). */
    sensationalism: z.number().min(0).max(1),
    /** Audiência relativa (peso na circulação). */
    audience: z.number().positive().max(1),
  })
  .strict();
export type Outlet = z.infer<typeof outletSchema>;

/**
 * Modelos de rumor. `veracidade` diz como o motor decide se é verdadeiro: `ocupacao` (verdadeiro se a UF está acima
 * da capacidade), `subnotificacao` (verdadeiro se o governo não publica os boletins e as mortes notificadas ficam
 * muito abaixo das reais), `falso` (sempre desinformação).
 */
export const rumorSchema = z
  .object({
    id: contentIdSchema,
    /** Manchete com marcadores `{uf}` e `{doenca}`. */
    headline: z.string().min(1),
    veracity: z.enum(['ocupacao', 'subnotificacao', 'falso']),
    /** Queda da adesão às medidas enquanto circula sem desmentido, ponderada pelo alcance (fração). */
    adherenceHit: z.number().min(0).max(0.5),
    /** Queda da procura por vacina enquanto circula (fração). */
    vaccineHit: z.number().min(0).max(0.5),
    /** Só circula se houver vacina disponível. */
    needsVaccine: z.boolean(),
  })
  .strict();
export type RumorSpec = z.infer<typeof rumorSchema>;

export const pressCatalogSchema = z
  .object({
    version: z.string().regex(/^\d{4}\.\d{2}\.\d+$/, 'versão no formato AAAA.MM.N'),
    status: dataStatusSchema,
    source: z.string().min(1),
    outlets: z.array(outletSchema).min(2),
    rumors: z.array(rumorSchema).min(1),
  })
  .strict()
  .superRefine((catalog, ctx) => {
    const ids = new Set<string>();
    catalog.outlets.forEach((o, i) => {
      if (ids.has(o.id)) ctx.addIssue({ code: 'custom', path: ['outlets', i, 'id'], message: `id repetido: ${o.id}` });
      ids.add(o.id);
    });
    const rumors = new Set<string>();
    catalog.rumors.forEach((r, i) => {
      if (rumors.has(r.id))
        ctx.addIssue({ code: 'custom', path: ['rumors', i, 'id'], message: `id repetido: ${r.id}` });
      rumors.add(r.id);
    });
  });
export type PressCatalog = z.infer<typeof pressCatalogSchema>;

export function parsePressCatalog(raw: unknown): { ok: true; catalog: PressCatalog } | { ok: false; errors: string[] } {
  const r = pressCatalogSchema.safeParse(raw);
  if (r.success) return { ok: true, catalog: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
}
