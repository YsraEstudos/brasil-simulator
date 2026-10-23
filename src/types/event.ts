import { z } from 'zod';

import { contentIdSchema, dataStatusSchema } from './data';
import { regionalScopeSchema } from './regions';

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
  'gasto.extraordinario',
  'receita.tributaria',
  'receita.renda',
  'receita.consumo',
  'receita.desoneracao_consumo',
  'receita.desoneracao_renda',
  'demanda.credito',
  'oferta.potencial',
  'choque.hiato',
  'choque.inflacao',
  'choque.risco',
  'choque.cambio',
  'salario_minimo',
  'credibilidade',
  'aprovacao',
  'capital_politico',
  'relacao_congresso',
  'regiao.atividade',
  'regiao.aprovacao',
  'governadores.relacao',
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
  /** Câmbio R$/US$. */
  'exchangeRate',
  /** Prêmio de risco soberano (fração). */
  'riskPremium',
  /** Discricionárias livres executadas no mês (fração do PIB). */
  'discretionarySpending',
  /** Despesa acima do limite do arcabouço no mês (fração do PIB). */
  'limitExcess',
  /** Mês do jogo (0 = jan/2027), para eventos de início de mandato. */
  'monthIndex',
  /** Ministérios ocupados por indicação de bloco (POLITICAL_RULES.md §6.3.1). */
  'partisanMinistries',
  /** Probabilidade mensal (0–1) de escândalo em algum ministério de bloco; cresce com o tempo no cargo. */
  'cabinetScandalRisk',
  /** Média das relações dos governadores com o governo, ponderada pela população (−100…100). */
  'governorRelation',
  /** Pressão de impeachment (0–1): função de aprovação, base, escândalos e crise (POLITICAL_RULES.md §10). */
  'impeachmentPressure',
  /** Prestígio de um personagem com o governo (−100…100); exige `characterId` na condição (FASE_07.md). */
  'characterStanding',
]);
export type ConditionVariable = z.infer<typeof conditionVariableSchema>;

export const eventConditionSchema = z
  .object({
    variable: conditionVariableSchema,
    op: z.enum(['gt', 'lt']),
    value: z.number(),
    /** Obrigatório (e só válido) quando `variable` é `characterStanding`. */
    characterId: contentIdSchema.optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if ((c.variable === 'characterStanding') !== (c.characterId !== undefined)) {
      ctx.addIssue({ code: 'custom', path: ['characterId'], message: 'characterId só com characterStanding' });
    }
  });
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
    /**
     * Regiões ou UFs atingidas (ECONOMIC_MODEL.md §5.15). Nos alvos `regiao.*` e `governadores.relacao`, ausente =
     * todas as UFs; nos demais, concentra o efeito nessas UFs (por população) sem mudar o total nacional.
     */
    regions: z.array(regionalScopeSchema).min(1).optional(),
  })
  .strict();
export type EventEffect = z.infer<typeof eventEffectSchema>;

/** Evento encadeado: agendado quando a escolha é aplicada (FASE_07.md §Contratos). */
export const eventFollowUpSchema = z
  .object({
    eventId: contentIdSchema,
    /** Meses entre a escolha e a chegada à caixa de entrada (mínimo 1). */
    delayMonths: z.number().int().min(1).max(24),
    /** Sorteada com a semente no momento em que a escolha é aplicada. */
    probability: z.number().min(0).max(1),
  })
  .strict();
export type EventFollowUp = z.infer<typeof eventFollowUpSchema>;

/** Mudança no prestígio de um personagem (−100…100 no estado; delta limitado por escolha). */
export const characterEffectSchema = z
  .object({
    characterId: contentIdSchema,
    delta: z.number().min(-30).max(30),
  })
  .strict();
export type CharacterEffect = z.infer<typeof characterEffectSchema>;

export const eventChoiceSchema = z
  .object({
    id: contentIdSchema,
    label: z.string().min(1),
    description: z.string().min(1),
    /** Ações de agenda (GAME_DESIGN.md §4.3: responder evento crítico custa 0 a 2). */
    agendaCost: z.number().int().min(0).max(2),
    effects: z.array(eventEffectSchema),
    /**
     * Demite o ministro de bloco há mais tempo no cargo e põe um técnico no lugar, com o custo de demissão
     * (POLITICAL_RULES.md §6.3.1). Sem ministro de bloco, não faz nada.
     */
    dismissMinister: z.boolean().optional(),
    /** Memória persistente: marcas gravadas no estado (`EventsState.flags`) para eventos futuros lerem. */
    setFlags: z.array(contentIdSchema).optional(),
    clearFlags: z.array(contentIdSchema).optional(),
    /** Consequências posteriores (cadeias de eventos). */
    followUps: z.array(eventFollowUpSchema).optional(),
    characterEffects: z.array(characterEffectSchema).optional(),
    /**
     * Posição da escolha nos eixos do perfil ideológico do governo (PLANO_GLOBO.md §5.1; ex.: "privatizar" =
     * econômico +0,6). Ausente = a escolha não move o perfil. Só escolhas do jogador contam, não a padrão.
     */
    position: z
      .object({ economic: z.number().min(-1).max(1), social: z.number().min(-1).max(1) })
      .strict()
      .optional(),
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
        /** Se presente, a probabilidade é multiplicada pelo valor desta variável, limitado a [0, 1]. */
        probabilityFactor: conditionVariableSchema.optional(),
        /** Meses mínimos entre duas ocorrências. */
        cooldownMonths: z.number().int().min(0).max(120),
        maxOccurrences: z.number().int().min(1).max(100),
        /** Todas as marcas precisam estar gravadas (`EventsState.flags`). */
        requiresFlags: z.array(contentIdSchema).optional(),
        /** Nenhuma destas marcas pode estar gravada. */
        forbidsFlags: z.array(contentIdSchema).optional(),
      })
      .strict(),
    /** Marcas gravadas quando o evento chega à caixa de entrada. */
    onFireFlags: z.array(contentIdSchema).optional(),
    /**
     * Cenários em que o evento existe (ex.: `['brasil_2027_01_v060']`). Ausente = todos. Cenários e saves
     * antigos não recebem eventos novos (AI_INSTRUCTIONS.md §8).
     */
    onlyScenarios: z.array(contentIdSchema).min(1).optional(),
    /** Personagem fictício em destaque (ID de `scenario.characters`); aparece no briefing e nas manchetes. */
    characterId: contentIdSchema.optional(),
    /**
     * Evento que só chega encadeado (via `followUps` de uma escolha): o sorteio mensal ignora o gatilho e ele
     * dispara no mês agendado, uma vez por agendamento.
     */
    chainedOnly: z.boolean().optional(),
    /** Efeitos automáticos no mês em que o evento dispara, antes da escolha (ex.: o choque em si). */
    onFire: z.array(eventEffectSchema),
    choices: z.array(eventChoiceSchema).min(2).max(4),
    /** Escolha aplicada se o jogador não responder até o fim do mês seguinte. Deve custar 0 ações. */
    defaultChoice: contentIdSchema,
    dataStatus: dataStatusSchema,
  })
  .strict()
  .superRefine((e, ctx) => {
    if (e.trigger.probabilityFactor === 'characterStanding') {
      ctx.addIssue({
        code: 'custom',
        path: ['trigger', 'probabilityFactor'],
        message: 'characterStanding exige characterId',
      });
    }
    const ids = e.choices.map((c) => c.id);
    const dup = ids.find((id, i) => ids.indexOf(id) !== i);
    if (dup) ctx.addIssue({ code: 'custom', path: ['choices'], message: `escolha repetida: ${dup}` });
    const def = e.choices.find((c) => c.id === e.defaultChoice);
    if (!def) {
      ctx.addIssue({ code: 'custom', path: ['defaultChoice'], message: 'escolha padrão não existe' });
    } else if (def.agendaCost !== 0) {
      ctx.addIssue({ code: 'custom', path: ['defaultChoice'], message: 'escolha padrão deve custar 0 ações' });
    }
  });
export type GameEvent = z.infer<typeof gameEventSchema>;

export function parseGameEvent(input: unknown): { ok: true; event: GameEvent } | { ok: false; errors: string[] } {
  const r = gameEventSchema.safeParse(input);
  if (r.success) return { ok: true, event: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`) };
}
