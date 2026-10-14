import { z } from 'zod';

/**
 * Federação no conteúdo (ECONOMIC_MODEL.md §5.12, POLITICAL_RULES.md §2): grandes regiões, UFs, setores e
 * chaves de distribuição de gasto e tributo entre as UFs. Usado por cenário, políticas e eventos.
 */

/** Grandes regiões do IBGE; mesmos ids de `Policy.affected.regions` (sem `nacional`). */
export const REGION_IDS = ['norte', 'nordeste', 'centro_oeste', 'sudeste', 'sul'] as const;
export const regionIdSchema = z.enum(REGION_IDS);
export type RegionId = z.infer<typeof regionIdSchema>;

/** Sigla da UF (ex.: `BA`): é também o id da UF no motor e no globo (`src/globe/data/ufs.json`). */
export const ufIdSchema = z.string().regex(/^[A-Z]{2}$/, 'sigla da UF com duas letras maiúsculas');

/** Escopo regional de um efeito: uma grande região ou uma UF. */
export const regionalScopeSchema = z.union([regionIdSchema, ufIdSchema]);
export type RegionalScope = z.infer<typeof regionalScopeSchema>;

/** Setores da matriz de sensibilidade de cada UF (ECONOMIC_MODEL.md §5.12). */
export const SECTOR_IDS = ['agropecuaria', 'extrativa', 'industria', 'servicos'] as const;
export type SectorId = (typeof SECTOR_IDS)[number];

/**
 * Chave de distribuição entre as UFs (ECONOMIC_MODEL.md §5.15): como um gasto federal se reparte (ou onde um
 * tributo é pago). `populacao`: por habitante. `pobreza`: pela população pobre (transferências focalizadas).
 * `pib`: pela atividade. `renda_alta`: pelo PIB vezes a renda per capita (tributos sobre a renda, concentrados
 * nas UFs mais ricas).
 */
export const REGIONAL_KEYS = ['populacao', 'pobreza', 'pib', 'renda_alta'] as const;
export const regionalKeySchema = z.enum(REGIONAL_KEYS);
export type RegionalKey = z.infer<typeof regionalKeySchema>;

/** Incidência regional de uma política: a chave, o escopo (vazio = todo o país) e pesos extras por UF. */
export const regionalProfileSchema = z
  .object({
    key: regionalKeySchema,
    /** Só estas regiões ou UFs recebem (ou pagam); vazio = todas. */
    scope: z.array(regionalScopeSchema),
    /** Multiplicador da chave para UFs específicas (ex.: a folha federal concentrada no DF). */
    boost: z.record(ufIdSchema, z.number().positive()),
  })
  .strict();
export type RegionalProfile = z.infer<typeof regionalProfileSchema>;
