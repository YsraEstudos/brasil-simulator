import { z } from 'zod';

import { contentIdSchema, dataStatusSchema } from './data';

/**
 * Comércio exterior e diplomacia (PLANO_EXPANSAO F14, EX-25), gravado em `src/data/trade/`. Parceiros, faixa da tarifa
 * média de importação e choques externos de **volume e acesso**: o preço das exportações continua sendo dos termos de
 * troca da economia (ECONOMIC_MODEL.md §8), para não haver dois canais para o mesmo choque.
 */

export const tradeSectorSchema = z.enum(['agropecuaria', 'extrativa', 'industria', 'servicos']);
export type TradeSector = z.infer<typeof tradeSectorSchema>;

export const tradePartnerSchema = z
  .object({
    id: contentIdSchema,
    name: z.string().min(1),
    /** Fração das exportações de bens que vai ao parceiro no início. As frações somam no máximo 1 (o resto é "demais"). */
    exportShare: z.number().positive().max(1),
    /** Fração das importações de bens que vem do parceiro. */
    importShare: z.number().positive().max(1),
    /** Setor mais exposto ao parceiro (explicação de quem perde ou ganha). */
    mainSector: tradeSectorSchema,
    /** Relação inicial, −100 a 100. */
    initialRelation: z.number().min(-100).max(100),
    /** Aceita negociar transferência de tecnologia (rota `transferir` da árvore). */
    technologyPartner: z.boolean(),
    /** Acordo comercial possível com o parceiro no cenário (ex.: bloco já em união aduaneira não tem). */
    agreementAvailable: z.boolean(),
  })
  .strict();
export type TradePartner = z.infer<typeof tradePartnerSchema>;

export const tradeShockSchema = z
  .object({
    id: contentIdSchema,
    name: z.string().min(1),
    /** `barreira`: um parceiro restringe as compras do Brasil; `cadeia`: ruptura de cadeias encarece importações. */
    kind: z.enum(['barreira', 'cadeia']),
    /** Probabilidade mensal de começar (por parceiro, na barreira), antes da relação e dos acordos. */
    monthlyProbability: z.number().min(0).max(0.2),
    months: z.number().int().positive(),
    /** Barreira: fração do acesso perdida; cadeia: alta dos preços de importação (fração). */
    size: z.number().positive().max(1),
  })
  .strict();
export type TradeShockSpec = z.infer<typeof tradeShockSchema>;

export const tradeCatalogSchema = z
  .object({
    version: z.string().regex(/^\d{4}\.\d{2}\.\d+$/, 'versão no formato AAAA.MM.N'),
    status: dataStatusSchema,
    source: z.string().min(1),
    /** Tarifa média de importação (fração) e a faixa em que o Executivo pode movê-la por decreto. */
    tariff: z
      .object({
        base: z.number().min(0).max(1),
        min: z.number().min(0).max(1),
        max: z.number().min(0).max(1),
        step: z.number().positive().max(0.1),
      })
      .strict()
      .refine((t) => t.min <= t.base && t.base <= t.max, 'tarifa-base fora da faixa'),
    /** Exportações e importações de bens em fração do PIB no início. */
    exportsGdp: z.number().positive().max(1),
    importsGdp: z.number().positive().max(1),
    partners: z.array(tradePartnerSchema).min(1),
    shocks: z.array(tradeShockSchema),
  })
  .strict()
  .superRefine((catalog, ctx) => {
    const ids = new Set<string>();
    catalog.partners.forEach((p, i) => {
      if (ids.has(p.id)) ctx.addIssue({ code: 'custom', path: ['partners', i, 'id'], message: `id repetido: ${p.id}` });
      ids.add(p.id);
    });
    const sum = (pick: (p: TradePartner) => number) => catalog.partners.reduce((s, p) => s + pick(p), 0);
    if (sum((p) => p.exportShare) > 1 + 1e-9)
      ctx.addIssue({ code: 'custom', path: ['partners'], message: 'frações de exportação somam mais de 1' });
    if (sum((p) => p.importShare) > 1 + 1e-9)
      ctx.addIssue({ code: 'custom', path: ['partners'], message: 'frações de importação somam mais de 1' });
    const kinds = new Set(catalog.shocks.map((s) => s.kind));
    if (catalog.shocks.length !== kinds.size)
      ctx.addIssue({ code: 'custom', path: ['shocks'], message: 'um choque por tipo' });
  });
export type TradeCatalog = z.infer<typeof tradeCatalogSchema>;

export function parseTradeCatalog(raw: unknown): { ok: true; catalog: TradeCatalog } | { ok: false; errors: string[] } {
  const r = tradeCatalogSchema.safeParse(raw);
  if (r.success) return { ok: true, catalog: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
}
