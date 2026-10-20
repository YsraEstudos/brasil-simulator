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

/** Forma de entrega usada pela carteira explícita da Fase 06. Ausente = política legada. */
export const deliverySchema = z.enum(['rotina', 'projeto']);
export type PolicyDelivery = z.infer<typeof deliverySchema>;

const monthsSchema = z.number().int().min(0).max(240);
const probabilitySchema = z.number().min(0).max(1);
const finiteNumberSchema = z.number().refine(Number.isFinite, 'valor precisa ser finito');

/** Metadados da carteira de projetos (planejamento → licenciamento → licitação → obra → operação). */
export const projectSchema = z
  .object({
    licensingMonths: z.number().int().min(0),
    procurementMonths: z.number().int().min(0),
    efficiency: finiteNumberSchema.gt(0).lte(1),
    annualMaintenanceRate: finiteNumberSchema.min(0).max(1),
  })
  .strict();
export type PolicyProject = z.infer<typeof projectSchema>;

const EXECUTIVE_INSTRUMENTS: readonly Instrument[] = [
  'decreto_regulamentar',
  'decreto_aliquota',
  'decreto_programacao',
  'portaria',
  'ato_execucao',
];

const ROUTINE_IMPACT_CHANNELS: readonly string[] = ['custeio', 'aprovacao'];

export const policySchema = z
  .object({
    id: contentIdSchema,
    name: z.string().min(1),
    summary: z.string().min(1),
    area: contentIdSchema,
    competence: competenceSchema,
    /** Instrumentos na ordem em que são usados (ex.: PLN e depois ato de execução). */
    instruments: z.array(instrumentSchema).min(1),
    /** Custo em ações de agenda (GAME_DESIGN.md §4.3). */
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
    /** Entrega opcional da carteira da Fase 06; ausente conserva o fluxo legado. */
    delivery: deliverySchema.optional(),
    /** Metadados de fases de um projeto explícito. */
    project: projectSchema.optional(),
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

    if (p.project && p.delivery !== 'projeto') {
      ctx.addIssue({
        code: 'custom',
        path: ['project'],
        message: 'metadados de projeto exigem delivery projeto',
      });
    }

    if (p.delivery === 'projeto') {
      if (!p.project) {
        ctx.addIssue({
          code: 'custom',
          path: ['project'],
          message: 'delivery projeto exige metadados project',
        });
      }
      if (!(Number.isFinite(p.cost.annualMillions) && p.cost.annualMillions > 0)) {
        ctx.addIssue({
          code: 'custom',
          path: ['cost', 'annualMillions'],
          message: 'projeto exige custo anual positivo e finito',
        });
      }
      if (p.timeline.executionMonths <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['timeline', 'executionMonths'],
          message: 'projeto exige duração de obra positiva',
        });
      } else {
        const expectedProfileYears = Math.ceil(p.timeline.executionMonths / 12);
        if (p.cost.disbursementProfile.length !== expectedProfileYears) {
          ctx.addIssue({
            code: 'custom',
            path: ['cost', 'disbursementProfile'],
            message: `perfil de desembolso do projeto deve ter ${expectedProfileYears} frações anuais`,
          });
        }
      }
      if (!p.impacts.some((impact) => impact.channel === 'investimento_publico' && impact.magnitude > 0)) {
        ctx.addIssue({
          code: 'custom',
          path: ['impacts'],
          message: 'projeto exige impacto investimento_publico positivo',
        });
      }
      if (p.impacts.some((impact) => impact.channel === 'capital_publico')) {
        ctx.addIssue({
          code: 'custom',
          path: ['impacts'],
          message: 'projeto não pode usar canal capital_publico; a oferta é estoque explícito',
        });
      }
    }

    if (p.delivery === 'rotina') {
      if (p.project) {
        ctx.addIssue({
          code: 'custom',
          path: ['project'],
          message: 'rotina não aceita metadados de projeto',
        });
      }
      if (!p.instruments.every((instrument) => EXECUTIVE_INSTRUMENTS.includes(instrument))) {
        ctx.addIssue({
          code: 'custom',
          path: ['instruments'],
          message: 'rotina aceita somente atos executivos',
        });
      }
      if (!(Number.isFinite(p.cost.annualMillions) && p.cost.annualMillions > 0)) {
        ctx.addIssue({
          code: 'custom',
          path: ['cost', 'annualMillions'],
          message: 'rotina exige custo anual positivo e finito',
        });
      }
      if (p.conditions.includes('adesao_estadual')) {
        ctx.addIssue({
          code: 'custom',
          path: ['conditions'],
          message: 'rotina não pode exigir adesao_estadual',
        });
      }
      if (p.impacts.length < 1 || p.impacts.some((impact) => !ROUTINE_IMPACT_CHANNELS.includes(impact.channel))) {
        ctx.addIssue({
          code: 'custom',
          path: ['impacts'],
          message: 'rotina aceita somente impactos custeio e aprovacao',
        });
      }
      const custeio = p.impacts.filter((impact) => impact.channel === 'custeio');
      if (custeio.length !== 1 || !(Number.isFinite(custeio[0]?.magnitude) && custeio[0].magnitude > 0)) {
        ctx.addIssue({
          code: 'custom',
          path: ['impacts'],
          message: 'rotina exige exatamente um impacto custeio positivo',
        });
      }
      if (p.impacts.filter((impact) => impact.channel === 'aprovacao').length > 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['impacts'],
          message: 'rotina aceita no máximo um impacto aprovacao',
        });
      }
    }
  });
export type Policy = z.infer<typeof policySchema>;

/** Valida uma política (JSON) e devolve os erros em texto legível. */
export function parsePolicy(input: unknown): { ok: true; policy: Policy } | { ok: false; errors: string[] } {
  const r = policySchema.safeParse(input);
  if (r.success) return { ok: true, policy: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`) };
}
