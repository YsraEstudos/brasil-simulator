import { z } from 'zod';

import { contentIdSchema, dataStatusSchema } from './data';
import { regionalProfileSchema } from './regions';

/**
 * Política do catálogo (GAME_DESIGN.md §9.1), gravada como JSON em `src/data/policies/`.
 * Chaves em inglês (código); valores de enumeração e IDs em português (decisão D2).
 */

/** Esfera competente (POLITICAL_RULES.md §2). */
export const competenceSchema = z.enum(['federal', 'estadual', 'municipal', 'comum']);

/** Instrumentos normativos (POLITICAL_RULES.md §3). */
export const instrumentSchema = z.enum([
  'decreto_regulamentar',
  'decreto_aliquota',
  'decreto_programacao',
  'medida_provisoria',
  'projeto_lei',
  'projeto_lei_complementar',
  'pec',
  'pln',
  'portaria',
  'convenio',
  'ato_execucao',
]);
export type Instrument = z.infer<typeof instrumentSchema>;

/** Instrumentos que passam pelo Congresso (GAME_DESIGN.md §9: ENVIADA → EM_TRAMITAÇÃO). */
export const LEGISLATIVE_INSTRUMENTS: readonly Instrument[] = [
  'medida_provisoria',
  'projeto_lei',
  'projeto_lei_complementar',
  'pec',
  'pln',
];

export const fundingSourceSchema = z.enum([
  'dotacao_existente',
  'remanejamento',
  'credito_adicional',
  'credito_extraordinario',
  'operacao_credito',
  'aumento_receita',
  'sem_custo',
]);

/** Canais de impacto do motor (ECONOMIC_MODEL.md §5.2: cada tipo de impulso tem multiplicador próprio). */
export const impactChannelSchema = z.enum([
  'investimento_publico',
  'custeio',
  'transferencia_baixa_renda',
  'transferencia_alta_renda',
  'desoneracao_consumo',
  'desoneracao_renda',
  'receita_tributaria',
  /** Carga sobre a renda (IR): sujeita a repartição com estados e municípios e a saída de capital. */
  'receita_renda',
  /** Carga sobre o consumo (CBS, Imposto Seletivo). */
  'receita_consumo',
  'despesa_obrigatoria',
  /** Ganho real extra do salário mínimo no próximo reajuste de janeiro (fração). */
  'salario_minimo_real',
  'credito',
  'capital_publico',
  'aprovacao',
  'credibilidade_fiscal',
]);

export const riskKindSchema = z.enum(['atraso', 'sobrecusto', 'judicializacao', 'baixa_adesao', 'escandalo']);

const monthsSchema = z.number().int().min(0).max(240);
const probabilitySchema = z.number().min(0).max(1);

export const policySchema = z
  .object({
    id: contentIdSchema,
    name: z.string().min(1),
    summary: z.string().min(1),
    area: contentIdSchema,
    competence: competenceSchema,
    /** Instrumentos na ordem em que são usados (ex.: PLN e depois ato de execução). */
    instruments: z.array(instrumentSchema).min(1),
    /** Custo em pontos de agenda (GAME_DESIGN.md §4.3). */
    agendaCost: z.number().int().min(0).max(3),
    cost: z
      .object({
        /** R$ milhões por ano, nominais (ECONOMIC_MODEL.md §2). Negativo = economia. */
        annualMillions: z.number(),
        /** Fração do custo desembolsada em cada ano a partir do início da execução; soma 1. */
        disbursementProfile: z.array(z.number().min(0).max(1)).min(1),
      })
      .strict()
      .refine((c) => Math.abs(c.disbursementProfile.reduce((s, x) => s + x, 0) - 1) < 1e-6, {
        message: 'perfil de desembolso deve somar 1',
        path: ['disbursementProfile'],
      }),
    fundingSources: z.array(fundingSourceSchema).min(1),
    timeline: z
      .object({
        planningMonths: monthsSchema,
        expectedLegislativeMonths: monthsSchema,
        executionMonths: monthsSchema,
        maturationMonths: monthsSchema,
      })
      .strict(),
    /** IDs de condições verificadas pelo motor (ex.: `espaco_no_limite_de_despesas`). */
    conditions: z.array(contentIdSchema),
    impacts: z
      .array(
        z
          .object({
            channel: impactChannelSchema,
            /** Parâmetro do canal (unidade definida pelo canal no ECONOMIC_MODEL.md). */
            magnitude: z.number(),
            lagMonths: monthsSchema,
          })
          .strict(),
      )
      .min(1),
    risks: z.array(z.object({ kind: riskKindSchema, probability: probabilitySchema }).strict()),
    affected: z
      .object({
        groups: z.array(contentIdSchema),
        sectors: z.array(contentIdSchema),
        regions: z.array(z.enum(['norte', 'nordeste', 'centro_oeste', 'sudeste', 'sul', 'nacional'])),
      })
      .strict(),
    /**
     * Incidência regional (ECONOMIC_MODEL.md §5.15): como o gasto e o tributo da política se repartem entre as
     * UFs. Ausente = proporcional ao PIB de cada UF (sem efeito regional diferente).
     */
    regional: regionalProfileSchema.optional(),
    /**
     * Posição da proposta nos eixos dos blocos (POLITICAL_RULES.md §6.2: afinidade ideológica).
     * Econômico: −1 estado … 1 mercado. Social: −1 progressista … 1 conservador.
     */
    position: z.object({ economic: z.number().min(-1).max(1), social: z.number().min(-1).max(1) }).strict(),
    /** Status dos números desta política (DATA_SOURCES.md §2.1). */
    dataStatus: dataStatusSchema,
  })
  .strict()
  .superRefine((p, ctx) => {
    const legislative = p.instruments.some((i) => LEGISLATIVE_INSTRUMENTS.includes(i));
    if (!legislative && p.timeline.expectedLegislativeMonths > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['timeline', 'expectedLegislativeMonths'],
        message: 'sem instrumento legislativo não há tramitação',
      });
    }
    // POLITICAL_RULES.md §3.1: MP não trata de orçamento, salvo crédito extraordinário
    if (
      p.instruments.includes('medida_provisoria') &&
      p.fundingSources.includes('credito_adicional') &&
      !p.fundingSources.includes('credito_extraordinario')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['instruments'],
        message: 'MP não pode abrir crédito adicional comum (só extraordinário)',
      });
    }
  });
export type Policy = z.infer<typeof policySchema>;

/** Valida uma política (JSON) e devolve os erros em texto legível. */
export function parsePolicy(input: unknown): { ok: true; policy: Policy } | { ok: false; errors: string[] } {
  const r = policySchema.safeParse(input);
  if (r.success) return { ok: true, policy: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`) };
}
