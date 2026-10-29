import { z } from 'zod';

import { contentIdSchema, dataStatusSchema } from './data';
import { ufIdSchema } from './regions';

/**
 * Rede ferroviária nacional (PLANO_EXPANSAO F10/EX-30), gravada em `src/data/railways/`. É dado de consulta do mapa:
 * o motor não lê a rede. O traçado é **esquemático** (linha entre cidades de referência), nunca o eixo da via; a
 * interface diz isso ao lado da legenda (DATA_SOURCES.md §2.1: nenhum número sem origem).
 */

/** Situação de um trecho. `parcial`: há tráfego só em parte dele ou de forma irregular. */
export const railwayStatusSchema = z.enum(['ativa', 'parcial', 'em_construcao', 'planejada', 'desativada']);
export type RailwayStatus = z.infer<typeof railwayStatusSchema>;
export const RAILWAY_STATUSES: readonly RailwayStatus[] = railwayStatusSchema.options;

export const railwayUsageSchema = z.enum(['carga', 'passageiros', 'misto']);
export type RailwayUsage = z.infer<typeof railwayUsageSchema>;
export const RAILWAY_USAGES: readonly RailwayUsage[] = railwayUsageSchema.options;

/** Bitola: larga (1,60 m), métrica (1,00 m) ou mista (trilho para as duas). */
export const railwayGaugeSchema = z.enum(['larga', 'metrica', 'mista']);
export type RailwayGauge = z.infer<typeof railwayGaugeSchema>;

/** Quanto a situação do trecho é confiável na data de referência (baixa = verificar antes de usar). */
export const railwayConfidenceSchema = z.enum(['alta', 'media', 'baixa']);
export type RailwayConfidence = z.infer<typeof railwayConfidenceSchema>;

/** [longitude, latitude] em graus, dentro da caixa do Brasil. */
const lonLatSchema = z.tuple([z.number().min(-74.5).max(-28.5), z.number().min(-34.5).max(5.5)]).readonly();

export const railwaySegmentSchema = z
  .object({
    id: contentIdSchema,
    name: z.string().min(1),
    status: railwayStatusSchema,
    confidence: railwayConfidenceSchema,
    /** Pontos do traçado esquemático (cidades de referência), em ordem. */
    path: z.array(lonLatSchema).min(2),
    /** Extensão declarada pela fonte, em km; `null` = sem dado consolidado (a interface diz "sem dado"). */
    lengthKm: z.number().positive().nullable(),
    note: z.string().min(1).optional(),
  })
  .strict();
export type RailwaySegment = z.infer<typeof railwaySegmentSchema>;

export const railwayCorridorSchema = z
  .object({
    id: contentIdSchema,
    name: z.string().min(1),
    /** Sigla curta para a lista e a legenda ("EFC", "FNS"). */
    shortName: z.string().min(1).max(12),
    usage: railwayUsageSchema,
    /** `null` = a fonte não informa a bitola. */
    gauge: railwayGaugeSchema.nullable(),
    /** Operador ou concessionária; `null` = sem operação (planejada, desativada) ou sem dado. */
    operator: z.string().min(1).nullable(),
    ufs: z.array(ufIdSchema).min(1),
    /** Portos e terminais ligados ao corredor. */
    connections: z.array(z.string().min(1)),
    segments: z.array(railwaySegmentSchema).min(1),
    source: z.string().min(1),
  })
  .strict();
export type RailwayCorridor = z.infer<typeof railwayCorridorSchema>;

export const railwayNetworkSchema = z
  .object({
    /** Versão do conteúdo ("2026.10.1"): muda a cada revisão dos dados. */
    version: z.string().regex(/^\d{4}\.\d{2}\.\d+$/, 'versão no formato AAAA.MM.N'),
    status: dataStatusSchema,
    /** Mês a que a situação dos trechos se refere. */
    referenceDate: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'mês no formato AAAA-MM'),
    source: z.string().min(1),
    /** Como o traçado foi desenhado (a interface mostra este aviso). */
    geometry: z.string().min(1),
    corridors: z.array(railwayCorridorSchema).min(1),
  })
  .strict()
  .superRefine((network, ctx) => {
    // Corredores e trechos dividem o mesmo espaço de ids: a lista e o mapa selecionam por id.
    const ids = new Set<string>();
    const claim = (id: string, path: (string | number)[]) => {
      if (ids.has(id)) ctx.addIssue({ code: 'custom', path, message: `id repetido: ${id}` });
      ids.add(id);
    };
    network.corridors.forEach((corridor, c) => {
      claim(corridor.id, ['corridors', c, 'id']);
      corridor.segments.forEach((s, i) => claim(s.id, ['corridors', c, 'segments', i, 'id']));
      if (new Set(corridor.ufs).size !== corridor.ufs.length) {
        ctx.addIssue({ code: 'custom', path: ['corridors', c, 'ufs'], message: 'UF repetida' });
      }
      // Sem operação não há operador: um trecho só planejado ou desativado não tem quem opere.
      const operating = corridor.segments.some((s) => s.status === 'ativa' || s.status === 'parcial');
      if (!operating && corridor.operator !== null && corridor.segments.every((s) => s.status !== 'em_construcao')) {
        ctx.addIssue({
          code: 'custom',
          path: ['corridors', c, 'operator'],
          message: 'corredor sem trecho em operação ou em obra não tem operador',
        });
      }
    });
  });
export type RailwayNetwork = z.infer<typeof railwayNetworkSchema>;

export function parseRailwayNetwork(
  raw: unknown,
): { ok: true; network: RailwayNetwork } | { ok: false; errors: string[] } {
  const r = railwayNetworkSchema.safeParse(raw);
  if (r.success) return { ok: true, network: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
}
