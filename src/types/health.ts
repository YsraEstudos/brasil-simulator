import { z } from 'zod';

import { contentIdSchema, dataStatusSchema } from './data';

/**
 * Saúde regional, surtos e resposta pública (PLANO_EXPANSAO F08, EX-26 e EX-27), gravada em `src/data/health/`.
 * Capacidade de partida por macrorregião (ordens de grandeza arredondadas de fontes oficiais, `PROVISORIO`), doenças
 * com dinâmicas diferentes e o pequeno conjunto de medidas de resposta. Faixas de parâmetro são **faixas**: o motor
 * sorteia a verdade de cada surto dentro delas, e o governo só vê estimativas.
 */

export const macroRegionSchema = z.enum(['norte', 'nordeste', 'sudeste', 'sul', 'centro_oeste']);
export type MacroRegion = z.infer<typeof macroRegionSchema>;

/** Alavancas de capacidade emitidas pela carteira (`saude.<id>`). */
export const HEALTH_LEVER_IDS = ['atencao_basica', 'vigilancia', 'hospitalar', 'vacinacao', 'prevencao'] as const;
export type HealthLeverId = (typeof HEALTH_LEVER_IDS)[number];

const fraction = z.number().min(0).max(1);
const range = z
  .tuple([z.number().nonnegative(), z.number().nonnegative()])
  .refine(([lo, hi]) => lo <= hi, 'faixa invertida');

export const regionBaselineSchema = z
  .object({
    /** Leitos de internação SUS (clínicos + UTI) por mil habitantes. */
    bedsPerThousand: z.number().positive().max(10),
    /** Ocupação habitual desses leitos, sem surto (fração). */
    routineOccupancy: fraction,
    /** Cobertura populacional da atenção básica (fração). */
    primaryCoverage: fraction,
    /** Índice de vigilância epidemiológica (0–1; hipótese de jogo). */
    surveillance: fraction,
    /** Fração da população que a rede consegue vacinar por mês numa campanha. */
    vaccinationPerMonth: fraction,
  })
  .strict();
export type RegionBaseline = z.infer<typeof regionBaselineSchema>;

export const diseaseSchema = z
  .object({
    id: contentIdSchema,
    name: z.string().min(1),
    /** Como o alerta aparece antes da identificação (nada do agente vaza). */
    alertName: z.string().min(1),
    /** Respiratória: passa de pessoa a pessoa e viaja entre UFs. Vetorial: depende do mosquito e da chuva. */
    transmission: z.enum(['respiratoria', 'vetorial']),
    /** Número básico de reprodução: a verdade de cada surto é sorteada na faixa (abaixo de 1 o surto se apaga). */
    r0: range,
    latentDays: z.number().positive(),
    infectiousDays: z.number().positive(),
    /** Fração das infecções que precisa de internação (faixa; média nacional da composição etária inicial). */
    hospitalRate: range,
    hospitalDays: z.number().positive(),
    /** Letalidade entre internados com leito, sem leito (excedente) e fora do hospital. */
    fatalityHospital: fraction,
    fatalityOverflow: fraction,
    fatalityCommunity: fraction,
    /** Risco relativo de internação e morte por faixa etária. */
    ageRisk: z
      .object({ young: z.number().positive(), working: z.number().positive(), older: z.number().positive() })
      .strict(),
    /** Fração do contato que vem do país inteiro (mobilidade entre UFs); o resto é local. */
    mobility: fraction,
    /** Multiplicador da transmissão por mês do ano (jan…dez). */
    seasonality: z.array(z.number().nonnegative()).length(12),
    /** Ganho de transmissão por desvio de chuva acima do normal (vetorial). */
    rainSensitivity: z.number().nonnegative(),
    /** Probabilidade mensal de um surto começar no país (antes de prevenção e estação). */
    monthlyProbability: z.number().min(0).max(0.5),
    /** Fração da população já imune no início de um surto (infecções anteriores; dengue tem soroprevalência alta). */
    priorImmunity: fraction,
    /** Infectados iniciais na UF de origem (milhares). */
    seedThousands: z.number().positive(),
    /** Fração das infecções que procura atendimento e pode ser notificada com vigilância plena. */
    ascertainment: fraction,
    /** Dias de trabalho perdidos por infecção (afastamento). */
    workDaysLost: z.number().nonnegative(),
    /** Vacina: `existente` (oferta limitada desde o início) ou meses até existir uma (faixa sorteada). */
    vaccine: z
      .object({
        monthsUntilAvailable: range,
        /** Doses disponíveis por mês, fração da população. */
        supplyPerMonth: fraction,
        efficacy: fraction,
      })
      .strict(),
  })
  .strict();
export type Disease = z.infer<typeof diseaseSchema>;

export const MEASURE_IDS = [
  'testagem_rastreamento',
  'controle_vetorial',
  'restricoes_circulacao',
  'leitos_emergencia',
  'vacinacao_em_massa',
  'auxilio_emergencial',
] as const;
export type MeasureId = (typeof MEASURE_IDS)[number];

export const measureSchema = z
  .object({
    id: z.enum(MEASURE_IDS),
    name: z.string().min(1),
    summary: z.string().min(1),
    /** Corte da transmissão em plena execução, por tipo de doença (fração). */
    transmissionCut: z.object({ respiratoria: fraction, vetorial: fraction }).strict(),
    /** Custo mensal fixo em R$ milhões de jan/2027 (crédito extraordinário). */
    monthlyMillions: z.number().nonnegative(),
    /** Meses até o efeito pleno. */
    rampMonths: z.number().int().min(0).max(6),
    /** Perda de atividade em plena adesão (fração do PIB, nível). */
    activityLoss: z.number().min(0).max(0.1),
    /** Desgaste de aprovação por mês ativo (fração), antes de alívios. */
    fatigue: z.number().min(0).max(0.01),
    /** Texto do jogador: quem ganha, quem perde, o que limita. */
    limits: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type Measure = z.infer<typeof measureSchema>;

export const healthCatalogSchema = z
  .object({
    version: z.string().regex(/^\d{4}\.\d{2}\.\d+$/, 'versão no formato AAAA.MM.N'),
    status: dataStatusSchema,
    source: z.string().min(1),
    regions: z.record(macroRegionSchema, regionBaselineSchema),
    diseases: z.array(diseaseSchema).min(2),
    measures: z.array(measureSchema).min(1),
  })
  .strict()
  .superRefine((catalog, ctx) => {
    const ids = new Set<string>();
    catalog.diseases.forEach((d, i) => {
      if (ids.has(d.id)) ctx.addIssue({ code: 'custom', path: ['diseases', i, 'id'], message: `id repetido: ${d.id}` });
      ids.add(d.id);
    });
    const measures = new Set<string>();
    catalog.measures.forEach((m, i) => {
      if (measures.has(m.id))
        ctx.addIssue({ code: 'custom', path: ['measures', i, 'id'], message: `medida repetida: ${m.id}` });
      measures.add(m.id);
    });
    for (const region of macroRegionSchema.options)
      if (!catalog.regions[region]) ctx.addIssue({ code: 'custom', path: ['regions'], message: `sem ${region}` });
  });
export type HealthCatalog = z.infer<typeof healthCatalogSchema>;

export function parseHealthCatalog(
  raw: unknown,
): { ok: true; catalog: HealthCatalog } | { ok: false; errors: string[] } {
  const r = healthCatalogSchema.safeParse(raw);
  if (r.success) return { ok: true, catalog: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
}
