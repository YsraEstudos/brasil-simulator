import { z } from 'zod';

import { contentIdSchema, dataValueSchema } from './data';

/**
 * Cenário inicial de campanha, gravado como JSON versionado em `src/data/scenarios/` (DATA_SOURCES.md §1).
 * Um cenário publicado nunca é alterado: atualização de dados = nova `version`.
 */

/** Cadeiras totais (POLITICAL_RULES.md §3: quóruns calculados sobre 513 deputados e 81 senadores). */
export const CHAMBER_SEATS = 513;
export const SENATE_SEATS = 81;

const unitInterval = z.number().min(0).max(1);
const axis = z.number().min(-1).max(1);

/** Bloco parlamentar fictício (decisão D1; POLITICAL_RULES.md §6.1). */
export const blocSchema = z
  .object({
    id: contentIdSchema,
    name: z.string().min(1),
    chamberSeats: z.number().int().min(0),
    senateSeats: z.number().int().min(0),
    /** Econômico: −1 estado … 1 mercado. Social: −1 progressista … 1 conservador. */
    ideology: z.object({ economic: axis, social: axis }).strict(),
    cohesion: unitInterval,
    /** −100 … 100 */
    governmentRelation: z.number().min(-100).max(100),
    interests: z.array(contentIdSchema),
  })
  .strict();
export type Bloc = z.infer<typeof blocSchema>;

/** Indicadores iniciais em fração decimal; mesmas chaves de `Indicators` do motor (testado em schemas.test.ts). */
export const scenarioIndicatorsSchema = z
  .object({
    approval: dataValueSchema,
    gdpGrowth12m: dataValueSchema,
    inflation12m: dataValueSchema,
    unemployment: dataValueSchema,
    primaryBalance12m: dataValueSchema,
  })
  .strict();

/**
 * Estado econômico inicial (ECONOMIC_MODEL.md §3, subconjunto v0.1). Fluxos fiscais em fração do PIB anual.
 * Opcional para cenários antigos: sem ele o motor usa valores padrão provisórios.
 */
export const scenarioEconomySchema = z
  .object({
    /** PIB nominal de 12 meses, R$ milhões (converte custos de políticas em fração do PIB). */
    nominalGdpMillions: dataValueSchema,
    outputGap: dataValueSchema,
    selic: dataValueSchema,
    inflationExpectation: dataValueSchema,
    credibility: dataValueSchema,
    grossDebt: dataValueSchema,
    implicitRate: dataValueSchema,
    /** Receita primária líquida do governo central, fração do PIB. */
    revenue: dataValueSchema,
    /** Despesa primária do governo central, fração do PIB. */
    primarySpending: dataValueSchema,
  })
  .strict();
export type ScenarioEconomy = z.infer<typeof scenarioEconomySchema>;

export const scenarioSchema = z
  .object({
    /** Ex.: `brasil_2027_01` */
    id: contentIdSchema,
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'versão semântica X.Y.Z'),
    name: z.string().min(1),
    /** Mês de posse = monthIndex 0 (jan/2027). */
    startPeriod: z.literal('2027-01'),
    indicators: scenarioIndicatorsSchema,
    economy: scenarioEconomySchema.optional(),
    /** Parâmetros do modelo (ECONOMIC_MODEL.md §6), todos com status — `A_CALIBRAR` = `PROVISORIO`. */
    parameters: z.record(z.string().regex(/^[a-z][a-z0-9_.]*$/), dataValueSchema),
    blocs: z.array(blocSchema).min(2),
    /** Meses (1–12) com reunião do Copom (ECONOMIC_MODEL.md §5.4: 8 por ano). */
    copomMonths: z.array(z.number().int().min(1).max(12)).length(8),
    /** IDs das políticas disponíveis neste cenário. */
    policies: z.array(contentIdSchema).min(1),
  })
  .strict()
  .superRefine((s, ctx) => {
    const sum = (k: 'chamberSeats' | 'senateSeats') => s.blocs.reduce((n, b) => n + b[k], 0);
    if (sum('chamberSeats') !== CHAMBER_SEATS) {
      ctx.addIssue({
        code: 'custom',
        path: ['blocs'],
        message: `Câmara soma ${sum('chamberSeats')}, esperado ${CHAMBER_SEATS}`,
      });
    }
    if (sum('senateSeats') !== SENATE_SEATS) {
      ctx.addIssue({
        code: 'custom',
        path: ['blocs'],
        message: `Senado soma ${sum('senateSeats')}, esperado ${SENATE_SEATS}`,
      });
    }
    const unique = (ids: string[], path: string) => {
      const dup = ids.find((id, i) => ids.indexOf(id) !== i);
      if (dup) ctx.addIssue({ code: 'custom', path: [path], message: `id repetido: ${dup}` });
    };
    unique(
      s.blocs.map((b) => b.id),
      'blocs',
    );
    unique(s.policies, 'policies');
    unique(s.copomMonths.map(String), 'copomMonths');
    const u = s.indicators.unemployment.value;
    if (!(u > 0 && u < 1))
      ctx.addIssue({ code: 'custom', path: ['indicators', 'unemployment'], message: 'desemprego em fração (0, 1)' });
    const a = s.indicators.approval.value;
    if (!(a >= 0 && a <= 1))
      ctx.addIssue({ code: 'custom', path: ['indicators', 'approval'], message: 'aprovação em fração [0, 1]' });
  });
export type Scenario = z.infer<typeof scenarioSchema>;

/** Valida dados desconhecidos (JSON) e devolve o cenário ou os erros em texto legível. */
export function parseScenario(input: unknown): { ok: true; scenario: Scenario } | { ok: false; errors: string[] } {
  const r = scenarioSchema.safeParse(input);
  if (r.success) return { ok: true, scenario: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`) };
}
