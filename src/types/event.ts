import { z } from 'zod';

import { contentIdSchema, dataStatusSchema } from './data';

/**
 * Evento do jogo (GAME_DESIGN.md §11.3), gravado como JSON em `src/data/events/`.
 * Dispara por **condições verificáveis + probabilidade + sorteio com semente** e pede uma escolha ao jogador.
 */

/** Alvos de efeito: os mesmos `ImpulseTarget` do motor (src/engine/types.ts), com a mesma unidade. */
export const impulseTargetSchema = z.enum([
  'gasto.investimento',
  'gasto.custeio',
  'gasto.transferencia_baixa_renda',
  'gasto.transferencia_alta_renda',
  'gasto.obrigatoria',
  'receita.tributaria',
  'receita.desoneracao_consumo',
  'receita.desoneracao_renda',
  'demanda.credito',
  'oferta.potencial',
  'choque.hiato',
  'choque.inflacao',
  'credibilidade',
  'aprovacao',
  'capital_politico',
  'relacao_congresso',
]);

/** Variáveis que uma condição de gatilho pode ler. */
export const conditionVariableSchema = z.enum([
  'approval',
  'gdpGrowth12m',
  'inflation12m',
  'unemployment',
  'primaryBalance12m',
  'outputGap',
  'selic',
  'credibility',
  'grossDebt',
  'politicalCapital',
  /** Média das relações dos blocos com o governo (−100…100). */
  'congressRelation',
  /** Propostas do governo em tramitação no Congresso. */
  'proposalsInCongress',
]);
export type ConditionVariable = z.infer<typeof conditionVariableSchema>;

export const eventConditionSchema = z
  .object({
    variable: conditionVariableSchema,
    op: z.enum(['gt', 'lt']),
    value: z.number(),
  })
  .strict();
export type EventCondition = z.infer<typeof eventConditionSchema>;

export const eventEffectSchema = z
  .object({
    target: impulseTargetSchema,
    /** Efeito por mês ativo, na unidade do alvo (src/engine/types.ts, `ImpulseTarget`). */
    delta: z.number().refine(Number.isFinite),
    /** Meses entre a escolha e o primeiro mês de efeito (0 = no próprio mês processado). */
    lagMonths: z.number().int().min(0).max(36),
    /** Meses de efeito; `null` = permanente. */
    durationMonths: z.number().int().min(1).max(120).nullable(),
    /** Texto do "Por que mudou?"; se ausente, usa o título do evento. */
    label: z.string().min(1).optional(),
  })
  .strict();
export type EventEffect = z.infer<typeof eventEffectSchema>;

export const eventChoiceSchema = z
  .object({
    id: contentIdSchema,
    label: z.string().min(1),
    description: z.string().min(1),
    /** Pontos de agenda (GAME_DESIGN.md §4.3: responder evento crítico custa 0 a 2). */
    agendaCost: z.number().int().min(0).max(2),
    effects: z.array(eventEffectSchema),
  })
  .strict();
export type EventChoiceDefinition = z.infer<typeof eventChoiceSchema>;

export const gameEventSchema = z
  .object({
    id: contentIdSchema,
    title: z.string().min(1),
    /** Texto do briefing, em português. Fictício; não cita pessoas reais (GAME_DESIGN.md §13). */
    description: z.string().min(1),
    trigger: z
      .object({
        /** Meses do ano (1–12) em que pode disparar; vazio = qualquer mês. */
        monthsOfYear: z.array(z.number().int().min(1).max(12)),
        /** Todas precisam ser verdadeiras. */
        conditions: z.array(eventConditionSchema),
        /** Probabilidade mensal quando as condições valem. */
        probability: z.number().min(0).max(1),
        /** Meses mínimos entre duas ocorrências. */
        cooldownMonths: z.number().int().min(0).max(120),
        maxOccurrences: z.number().int().min(1).max(100),
      })
      .strict(),
    /** Efeitos automáticos no mês em que o evento dispara, antes da escolha (ex.: o choque em si). */
    onFire: z.array(eventEffectSchema),
    choices: z.array(eventChoiceSchema).min(2).max(4),
    /** Escolha aplicada se o jogador não responder até o fim do mês seguinte. Deve custar 0 pontos. */
    defaultChoice: contentIdSchema,
    dataStatus: dataStatusSchema,
  })
  .strict()
  .superRefine((e, ctx) => {
    const ids = e.choices.map((c) => c.id);
    const dup = ids.find((id, i) => ids.indexOf(id) !== i);
    if (dup) ctx.addIssue({ code: 'custom', path: ['choices'], message: `escolha repetida: ${dup}` });
    const def = e.choices.find((c) => c.id === e.defaultChoice);
    if (!def) {
      ctx.addIssue({ code: 'custom', path: ['defaultChoice'], message: 'escolha padrão não existe' });
    } else if (def.agendaCost !== 0) {
      ctx.addIssue({ code: 'custom', path: ['defaultChoice'], message: 'escolha padrão deve custar 0 pontos' });
    }
  });
export type GameEvent = z.infer<typeof gameEventSchema>;

export function parseGameEvent(input: unknown): { ok: true; event: GameEvent } | { ok: false; errors: string[] } {
  const r = gameEventSchema.safeParse(input);
  if (r.success) return { ok: true, event: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`) };
}
