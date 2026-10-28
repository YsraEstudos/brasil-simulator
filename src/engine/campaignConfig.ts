import { z } from 'zod';
import type { GameState } from './types';
import { isProfilePresetId, type ProfilePresetId } from './politics/calibration';

export const institutionalRulesSchema = z.enum(['brasileiras', 'simplificadas']);
export type InstitutionalRules = z.infer<typeof institutionalRulesSchema>;
export const DEFAULT_INSTITUTIONAL_RULES: InstitutionalRules = 'brasileiras';
export const assistanceSchema = z
  .object({
    informationClarity: z.enum(['clara', 'padrao', 'incerta']),
    hints: z.boolean(),
  })
  .strict();
export type AssistanceConfig = z.infer<typeof assistanceSchema>;
export const DEFAULT_ASSISTANCE: AssistanceConfig = { informationClarity: 'padrao', hints: true };
/** Escala provisória do ruído e da margem publicados; não altera o estado real do eleitorado. */
export const INFORMATION_NOISE = { clara: 0.5, padrao: 1, incerta: 1.5 } as const;

/** O modo simplificado é ficção; a escolha de desafio não altera esta regra. */
export function usesFormalRules(state: Readonly<GameState>): boolean {
  return (state.initialCampaignConfiguration?.institutionalRules ?? DEFAULT_INSTITUTIONAL_RULES) === 'brasileiras';
}

/** Situações fictícias de partida; parâmetros provisórios e em fração. */
export const START_SITUATIONS = [
  {
    id: 'normal',
    name: 'Condições do cenário',
    description: 'Economia parte dos valores do cenário escolhido.',
    riskDelta: 0,
    gapDelta: 0,
  },
  {
    id: 'pressao_externa',
    name: 'Pressão externa',
    description: 'Prêmio de risco inicial 0,5 ponto percentual maior, com pressão cambial e financeira.',
    riskDelta: 0.005,
    gapDelta: 0,
  },
  {
    id: 'desaceleracao',
    name: 'Desaceleração',
    description: 'Hiato do produto inicial 1 ponto percentual menor, com demanda mais fraca.',
    riskDelta: 0,
    gapDelta: -0.01,
  },
] as const;

export type StartSituationId = (typeof START_SITUATIONS)[number]['id'];
export const DEFAULT_START_SITUATION: StartSituationId = 'normal';

export function isStartSituationId(value: unknown): value is StartSituationId {
  return typeof value === 'string' && START_SITUATIONS.some((situation) => situation.id === value);
}
/** Valores normalizados de desafio, independentes das opções de assistência. */
export const challengeSchema = z
  .object({
    economicPressure: z.number().finite().min(0).max(1),
    oppositionStrength: z.number().finite().min(0).max(1),
    coalitionStability: z.number().finite().min(0).max(1),
    crisisFrequency: z.number().finite().min(0).max(1),
  })
  .strict();
export type ChallengeConfig = z.infer<typeof challengeSchema>;
export const DEFAULT_CHALLENGE: ChallengeConfig = {
  economicPressure: 0.5,
  oppositionStrength: 0.5,
  coalitionStability: 0.5,
  crisisFrequency: 0.5,
};

/** Presets provisórios de desafio, independentes da assistência. */
export const CHALLENGE_PRESETS: Readonly<Record<'casual' | 'estrategica' | 'realismo', ChallengeConfig>> = {
  casual: { economicPressure: 0.2, oppositionStrength: 0.2, coalitionStability: 0.8, crisisFrequency: 0.2 },
  estrategica: DEFAULT_CHALLENGE,
  realismo: { economicPressure: 0.8, oppositionStrength: 0.8, coalitionStability: 0.2, crisisFrequency: 0.8 },
};

/** Coeficientes provisórios; neutro = 0,5 em todos os controles. */
export const CHALLENGE_CALIBRATION = {
  riskSpread: 0.004,
  oppositionRecognition: 0.2,
  oppositionRelation: 10,
  coalitionMonthly: 0.2,
  climateProbabilitySpread: 1,
} as const;

/** Contrato serializável do experimento inicial, com versão própria. */
export const campaignConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    scenarioId: z.string().min(1),
    scenarioContentVersion: z.string().min(1),
    difficulty: z.enum(['casual', 'estrategica', 'realismo']),
    presetId: z.enum(['casual', 'estrategica', 'realismo', 'personalizada']),
    profileId: z.custom<ProfilePresetId>(isProfilePresetId),
    startPoint: z.enum(['posse', 'corrida', 'pre_campanha']),
    startSituationId: z.custom<StartSituationId>(isStartSituationId),
    challenge: challengeSchema,
    institutionalRules: institutionalRulesSchema,
    assistance: assistanceSchema,
    careerProfileId: z.string().min(1).optional(),
    seed: z.number().int().min(0).max(0xffff_ffff),
  })
  .strict();
export type CampaignConfigV1 = z.infer<typeof campaignConfigSchema>;
