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
    /** Câmbio R$/US$ (ECONOMIC_MODEL.md §5.5). Opcional: sem ele o motor usa o valor provisório padrão. */
    exchangeRate: dataValueSchema.optional(),
    /** Prêmio de risco soberano anual (fração). */
    riskPremium: dataValueSchema.optional(),
    /** Juro externo anual (fração). */
    externalRate: dataValueSchema.optional(),
    /** Crescimento real do PIB dois anos antes do início (regra do salário mínimo, Lei 15.077/2024). */
    gdpGrowthTwoYearsAgo: dataValueSchema.optional(),
  })
  .strict();
export type ScenarioEconomy = z.infer<typeof scenarioEconomySchema>;

/** Fração por grupo de receita (ECONOMIC_MODEL.md §5.7); mesmas chaves de `RevenueGroup` do motor. */
const revenueGroupsSchema = z
  .object({
    renda: dataValueSchema,
    folha: dataValueSchema,
    consumo: dataValueSchema,
    outras: dataValueSchema,
    royalties: dataValueSchema,
  })
  .strict();

/**
 * Estrutura fiscal inicial (ECONOMIC_MODEL.md §5.7–5.8; POLITICAL_RULES.md §4.2–4.3). Opcional: sem ela o
 * motor reparte os totais de `economy` pelas frações provisórias padrão (`FALLBACK_FISCAL`).
 */
export const scenarioFiscalSchema = z
  .object({
    /** Participação de cada grupo na receita bruta (soma 1). */
    revenueShares: revenueGroupsSchema,
    /** Fração de cada grupo repassada a estados e municípios (FPE, FPM, royalties). */
    transferShares: revenueGroupsSchema,
    /** Despesas em fração do PIB; somam `economy.primarySpending`. O limite inicial é tudo menos as exceções. */
    spending: z
      .object({
        previdencia: dataValueSchema,
        beneficios: dataValueSchema,
        pessoal: dataValueSchema,
        outras: dataValueSchema,
        linked: dataValueSchema,
        discretionary: dataValueSchema,
        exceptions: dataValueSchema,
      })
      .strict(),
  })
  .strict();
export type ScenarioFiscal = z.infer<typeof scenarioFiscalSchema>;

/** Ocupante técnico/aliado de um ministério (POLITICAL_RULES.md §6.3.1); os demais ocupantes são ids de bloco. */
export const TECHNICAL_MINISTER = 'tecnico';

/** Ministério relevante para a coalizão (POLITICAL_RULES.md §6.3.1). */
export const ministrySchema = z
  .object({
    id: contentIdSchema,
    name: z.string().min(1),
    /** Áreas de política (`Policy.area`) executadas pela pasta. */
    areas: z.array(contentIdSchema).min(1),
    /** Peso político da pasta (0–1): apoio do bloco que a ocupa e relação ganha na nomeação. */
    weight: unitInterval,
    /** Ocupante no início: `tecnico` ou id de bloco. */
    occupant: contentIdSchema,
  })
  .strict();
export type Ministry = z.infer<typeof ministrySchema>;

/**
 * Instituições do cenário (POLITICAL_RULES.md §6.3, §13): blocos que presidem a Câmara e o Senado e
 * ministérios. Opcional: sem ele, cada Casa é presidida pelo maior bloco nela e não há ministérios.
 */
export const scenarioInstitutionsSchema = z
  .object({
    housePresidents: z.object({ camara: contentIdSchema, senado: contentIdSchema }).strict(),
    ministries: z.array(ministrySchema),
  })
  .strict();
export type ScenarioInstitutions = z.infer<typeof scenarioInstitutionsSchema>;

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
    fiscal: scenarioFiscalSchema.optional(),
    institutions: scenarioInstitutionsSchema.optional(),
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
    if (s.institutions) {
      const blocIds = new Set(s.blocs.map((b) => b.id));
      for (const house of ['camara', 'senado'] as const) {
        if (!blocIds.has(s.institutions.housePresidents[house])) {
          ctx.addIssue({
            code: 'custom',
            path: ['institutions', 'housePresidents', house],
            message: `bloco inexistente: ${s.institutions.housePresidents[house]}`,
          });
        }
      }
      unique(
        s.institutions.ministries.map((m) => m.id),
        'institutions',
      );
      for (const m of s.institutions.ministries) {
        if (m.occupant !== TECHNICAL_MINISTER && !blocIds.has(m.occupant)) {
          ctx.addIssue({
            code: 'custom',
            path: ['institutions', 'ministries', m.id],
            message: `ocupante deve ser "${TECHNICAL_MINISTER}" ou um bloco: ${m.occupant}`,
          });
        }
      }
    }
    unique(s.copomMonths.map(String), 'copomMonths');
    const u = s.indicators.unemployment.value;
    if (!(u > 0 && u < 1))
      ctx.addIssue({ code: 'custom', path: ['indicators', 'unemployment'], message: 'desemprego em fração (0, 1)' });
    if (s.fiscal) {
      const shares = Object.values(s.fiscal.revenueShares).reduce((n, v) => n + v.value, 0);
      if (Math.abs(shares - 1) > 1e-6) {
        ctx.addIssue({
          code: 'custom',
          path: ['fiscal', 'revenueShares'],
          message: `frações somam ${shares}, esperado 1`,
        });
      }
      if (Object.values(s.fiscal.transferShares).some((v) => !(v.value >= 0 && v.value < 1))) {
        ctx.addIssue({ code: 'custom', path: ['fiscal', 'transferShares'], message: 'repasse em fração [0, 1)' });
      }
      const spending = Object.values(s.fiscal.spending).reduce((n, v) => n + v.value, 0);
      const total = s.economy?.primarySpending.value;
      if (total === undefined || Math.abs(spending - total) > 1e-6) {
        ctx.addIssue({
          code: 'custom',
          path: ['fiscal', 'spending'],
          message: `despesas somam ${spending}, esperado economy.primarySpending (${total})`,
        });
      }
    }
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
