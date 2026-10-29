import { initialEducation } from './education/education';
import { initialDemography } from './demography/demography';
import { initialEnergy } from './energy/energy';
import { initialTrade } from './trade/initial';
import type { Scenario } from '../types/scenario';
import { DEFAULT_ENABLED_MODULES, normalizeModules, type ModuleId } from './modules';
import {
  assistanceSchema,
  campaignConfigSchema,
  challengeSchema,
  CHALLENGE_CALIBRATION,
  CHALLENGE_PRESETS,
  DEFAULT_ASSISTANCE,
  DEFAULT_CHALLENGE,
  DEFAULT_INSTITUTIONAL_RULES,
  DEFAULT_START_SITUATION,
  institutionalRulesSchema,
  START_SITUATIONS,
  type AssistanceConfig,
  type ChallengeConfig,
  type InstitutionalRules,
  type StartSituationId,
} from './campaignConfig';

import type { Calibration } from './economy/calibration';
import { initialFiscal, type FiscalValues } from './economy/fiscal';
import { DEFAULT_PROFILE_PRESET, presetProfile, type ProfilePresetId } from './politics/calibration';
import { initialClimate } from './climate/climate';
import { initialRegions } from './regions/regions';
import { seedRng } from './rng';
import { createCareerState } from './career';
import { initialAdministration } from './administration/identity';
import { initialSociety, initialSocietyForGame } from './society/society';
import { initialPublicPolicies } from './publicPolicies/types';
import {
  ENGINE_VERSION,
  MANDATORY_GROUPS,
  REVENUE_GROUPS,
  STATE_SCHEMA_VERSION,
  type Difficulty,
  type EconomyState,
  type GameContent,
  type GameState,
  type Indicators,
  type RevenueGroup,
  type StartPoint,
} from './types';

/** Ações de agenda por mês, por dificuldade (GAME_DESIGN.md §6). */
export const AGENDA_ACTIONS_PER_MONTH: Record<Difficulty, number> = {
  casual: 4,
  estrategica: 3,
  realismo: 3,
};

/** Capital político no início do mandato (alto; GAME_DESIGN.md §5). */
export const INITIAL_POLITICAL_CAPITAL = 70;

/**
 * Estado econômico usado quando o cenário não traz o bloco `economy` (cenários e saves anteriores à Fase 02)
 * ou um campo opcional dele. Valores PROVISORIO, só para o jogo funcionar; ordens de grandeza do Brasil em 2026.
 */
export const FALLBACK_ECONOMY = {
  nominalGdpMillions: 13_000_000,
  outputGap: 0,
  selic: 0.1,
  inflationExpectation: 0.035,
  credibility: 0.75,
  grossDebt: 0.78,
  implicitRate: 0.11,
  revenue: 0.185,
  primarySpending: 0.19,
  exchangeRate: 5.4,
  riskPremium: 0.025,
  externalRate: 0.04,
  gdpGrowthTwoYearsAgo: 0.023,
} as const;

/**
 * Estrutura fiscal usada quando o cenário não traz o bloco `fiscal` (PROVISORIO; ordens de grandeza do RTN
 * 2024–2025). Despesas em fração da despesa primária total; receitas em fração da receita bruta.
 */
export const FALLBACK_FISCAL = {
  revenueShares: { renda: 0.36, folha: 0.23, consumo: 0.2, outras: 0.15, royalties: 0.06 },
  transferShares: { renda: 0.43, folha: 0, consumo: 0, outras: 0, royalties: 0.5 },
  spendingShares: {
    previdencia: 0.435,
    beneficios: 0.1,
    pessoal: 0.162,
    outras: 0.052,
    linked: 0.141,
    discretionary: 0.084,
    exceptions: 0.026,
  },
} as const satisfies {
  revenueShares: Record<RevenueGroup, number>;
  transferShares: Record<RevenueGroup, number>;
  spendingShares: Record<keyof FiscalValues['spending'], number>;
};

export interface NewCampaign {
  content: GameContent;
  difficulty: Difficulty;
  seed: number;
  /** Capital político inicial (padrão: `INITIAL_POLITICAL_CAPITAL`). */
  politicalCapital?: number;
  /**
   * Perfil ideológico inicial escolhido no NOVO JOGO (PLANO_GLOBO.md §5.1, D-G9); padrão Centro (0/0). Não sorteia
   * nem muda regras: só o ponto de partida do perfil do governo.
   */
  profile?: ProfilePresetId;
  /**
   * Ponto de partida (PLANO_CAMPANHA.md Fase C1); padrão `'posse'`, a partida de sempre. Os demais exigem o bloco
   * `career` do cenário; o estado do governo nasce igual ao da posse e fica congelado até ela (D-C12).
   */
  startPoint?: StartPoint;
  /** Perfil de candidato (`Scenario.career.profiles`); padrão: o primeiro. Ignorado na posse. */
  careerProfileId?: string;
  startSituationId?: StartSituationId;
  challenge?: ChallengeConfig;
  institutionalRules?: InstitutionalRules;
  assistance?: AssistanceConfig;
  /** Módulos opcionais ligados; padrão `DEFAULT_ENABLED_MODULES`. O núcleo não é configurável. */
  modules?: readonly ModuleId[];
}

export function createInitialState(c: NewCampaign): GameState {
  if (!Number.isInteger(c.seed)) throw new RangeError(`semente deve ser inteira: ${c.seed}`);
  const { scenario, calibration } = c.content;
  const situation = START_SITUATIONS.find((item) => item.id === (c.startSituationId ?? DEFAULT_START_SITUATION));
  if (!situation) throw new RangeError('situação inicial desconhecida');
  const challenge = challengeSchema.parse(c.challenge ?? DEFAULT_CHALLENGE);
  const institutionalRules = institutionalRulesSchema.parse(c.institutionalRules ?? DEFAULT_INSTITUTIONAL_RULES);
  const assistance = assistanceSchema.parse(c.assistance ?? DEFAULT_ASSISTANCE);
  const economy = initialEconomy(scenario, calibration);
  const initialCareer =
    c.startPoint && c.startPoint !== 'posse'
      ? createCareerState(c.content, c.startPoint, c.careerProfileId, c.difficulty, institutionalRules)
      : undefined;
  const opponents = initialCareer?.opponents.map((opponent) => ({
    ...opponent,
    recognition: Object.fromEntries(
      Object.entries(opponent.recognition).map(([uf, r]) => [
        uf,
        Math.max(
          0,
          Math.min(
            1,
            r + (challenge.oppositionStrength - 0.5) * CHALLENGE_CALIBRATION.oppositionRecognition * r * (1 - r),
          ),
        ),
      ]),
    ),
  }));
  // Identidade da primeira administração (PLANO_EXPANSAO EX-15): só onde há eleições, como o bloco `politics`.
  const administration = scenario.elections ? initialAdministration(c.content, initialCareer?.profileId) : undefined;
  const state: GameState = {
    schemaVersion: STATE_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    scenarioId: scenario.id,
    difficulty: c.difficulty,
    seed: c.seed,
    initialCampaignConfiguration: campaignConfigSchema.parse({
      schemaVersion: 2,
      scenarioId: scenario.id,
      scenarioContentVersion: scenario.version,
      difficulty: c.difficulty,
      presetId: (Object.keys(challenge) as (keyof ChallengeConfig)[]).every(
        (key) => challenge[key] === CHALLENGE_PRESETS[c.difficulty][key],
      )
        ? c.difficulty
        : 'personalizada',
      profileId: c.profile ?? DEFAULT_PROFILE_PRESET,
      startPoint: c.startPoint ?? 'posse',
      startSituationId: situation.id,
      challenge,
      institutionalRules,
      assistance,
      modules: normalizeModules(c.modules ?? DEFAULT_ENABLED_MODULES),
      ...(c.startPoint && c.startPoint !== 'posse'
        ? { careerProfileId: c.careerProfileId ?? scenario.career?.profiles[0]?.id }
        : {}),
      seed: c.seed,
    }),
    rng: seedRng(c.seed),
    monthIndex: 0,
    indicators: indicatorsFromScenario(scenario),
    resources: {
      politicalCapital: c.politicalCapital ?? INITIAL_POLITICAL_CAPITAL,
      agendaActionsPerMonth: AGENDA_ACTIONS_PER_MONTH[c.difficulty],
    },
    economy: {
      ...economy,
      riskPremium: Math.max(
        0,
        economy.riskPremium +
          situation.riskDelta +
          (challenge.economicPressure - 0.5) * CHALLENGE_CALIBRATION.riskSpread,
      ),
      outputGap: economy.outputGap + situation.gapDelta,
    },
    congress: {
      blocs: scenario.blocs.map((b) => ({
        id: b.id,
        governmentRelation: Math.max(
          -100,
          Math.min(
            100,
            b.governmentRelation - (challenge.oppositionStrength - 0.5) * CHALLENGE_CALIBRATION.oppositionRelation,
          ),
        ),
      })),
      cabinet: [],
    },
    proposals: [],
    impulses: [],
    events: { pending: [], lastFired: {}, count: {}, flags: {}, scheduled: [], characters: {}, news: [] },
    decisionLog: [],
    regions: { ufs: [] },
    society: initialSociety(),
    publicPolicies: initialPublicPolicies(),
    government: { profile: presetProfile(c.profile ?? DEFAULT_PROFILE_PRESET) },
    climate: initialClimate(c.seed),
    education: initialEducation(),
    demography: initialDemography(scenario.regions?.ufs ?? [], c.content.censusAgeData),
    energy: initialEnergy(),
    research: { programs: [] },
    trade: initialTrade(c.content.trade),
    ...(administration
      ? {
          administrations: [administration],
          control: { controlledCharacterId: administration.presidentId, careerMode: 'presidencial' as const },
        }
      : {}),
    ...(initialCareer && opponents ? { career: { ...initialCareer, opponents } } : {}),
  };
  return { ...state, society: initialSocietyForGame(state), regions: { ufs: initialRegions(state, c.content).ufs } };
}

/** Indicadores iniciais do cenário (só os valores; status e fonte ficam no cenário). */
export function indicatorsFromScenario(scenario: Scenario): Indicators {
  const i = scenario.indicators;
  return {
    approval: i.approval.value,
    gdpGrowth12m: i.gdpGrowth12m.value,
    inflation12m: i.inflation12m.value,
    unemployment: i.unemployment.value,
    primaryBalance12m: i.primaryBalance12m.value,
  };
}

/** Valores econômicos iniciais do cenário, ou os provisórios quando o cenário não os tem. */
export function scenarioEconomyValues(scenario: Pick<Scenario, 'economy'> | null) {
  const e = scenario?.economy;
  if (!e) return { ...FALLBACK_ECONOMY };
  return {
    nominalGdpMillions: e.nominalGdpMillions.value,
    outputGap: e.outputGap.value,
    selic: e.selic.value,
    inflationExpectation: e.inflationExpectation.value,
    credibility: e.credibility.value,
    grossDebt: e.grossDebt.value,
    implicitRate: e.implicitRate.value,
    revenue: e.revenue.value,
    primarySpending: e.primarySpending.value,
    exchangeRate: e.exchangeRate?.value ?? FALLBACK_ECONOMY.exchangeRate,
    riskPremium: e.riskPremium?.value ?? FALLBACK_ECONOMY.riskPremium,
    externalRate: e.externalRate?.value ?? FALLBACK_ECONOMY.externalRate,
    gdpGrowthTwoYearsAgo: e.gdpGrowthTwoYearsAgo?.value ?? FALLBACK_ECONOMY.gdpGrowthTwoYearsAgo,
  };
}

/** Estrutura fiscal inicial: a do cenário ou a padrão aplicada aos totais de receita e despesa. */
export function fiscalValues(
  scenario: Pick<Scenario, 'fiscal'> | null,
  totals: { revenue: number; primarySpending: number },
): FiscalValues {
  const f = scenario?.fiscal;
  if (f) {
    const values = <K extends string>(r: Record<K, { value: number }>) =>
      Object.fromEntries(Object.entries<{ value: number }>(r).map(([k, v]) => [k, v.value])) as Record<K, number>;
    return {
      ...totals,
      revenueShares: values(f.revenueShares),
      transferShares: values(f.transferShares),
      spending: values(f.spending),
    };
  }
  const spending = Object.fromEntries(
    Object.entries(FALLBACK_FISCAL.spendingShares).map(([k, share]) => [k, share * totals.primarySpending]),
  ) as FiscalValues['spending'];
  return {
    ...totals,
    revenueShares: { ...FALLBACK_FISCAL.revenueShares },
    transferShares: { ...FALLBACK_FISCAL.transferShares },
    spending,
  };
}

export function initialEconomy(
  scenario: (Pick<Scenario, 'economy' | 'indicators'> & Partial<Pick<Scenario, 'fiscal'>>) | null,
  calibration: Calibration,
): EconomyState {
  const v = scenarioEconomyValues(scenario);
  const gdpGrowth = scenario?.indicators.gdpGrowth12m.value ?? calibration.g_pot_base;
  const inflation = scenario?.indicators.inflation12m.value ?? v.inflationExpectation;
  const fiscal = initialFiscal(
    fiscalValues(scenario?.fiscal ? { fiscal: scenario.fiscal } : null, v),
    gdpGrowth,
    v.gdpGrowthTwoYearsAgo,
    calibration,
  );
  const revenue = Object.values(fiscal.revenueByGroup).reduce((s, x) => s + x, 0);
  const primarySpending =
    MANDATORY_GROUPS.reduce((s, g) => s + fiscal.mandatory[g], 0) +
    fiscal.linked +
    fiscal.discretionary +
    fiscal.exceptions;
  return {
    outputGap: v.outputGap,
    potentialGrowth: calibration.g_pot_base,
    potentialIndex: 1,
    priceLevel: 1,
    selic: v.selic,
    effectiveRealRate: v.selic - v.inflationExpectation,
    inflationExpectation: v.inflationExpectation,
    credibility: v.credibility,
    riskPremium: v.riskPremium,
    exchangeRate: v.exchangeRate,
    // Depreciação real nula no início: a nominal acompanha a diferença de inflação.
    depreciation12m: inflation - calibration.inflacao_externa,
    externalRate: v.externalRate,
    termsOfTrade: 0,
    grossDebt: v.grossDebt,
    implicitRate: v.implicitRate,
    revenue,
    primarySpending,
    monthlyPrimary: revenue - primarySpending,
    interest: v.implicitRate * v.grossDebt,
    debtAdjustment: 0,
    fiscal,
    bcPressure: { months: [], pendingCut: 0 },
  };
}

/** PIB nominal anual do cenário em R$ milhões, no início da campanha. */
export function nominalGdpMillions(content: Pick<GameContent, 'scenario'>): number {
  return scenarioEconomyValues(content.scenario).nominalGdpMillions;
}

/**
 * PIB nominal anual corrente em R$ milhões: o do cenário corrigido por preços, potencial e hiato. Converte
 * custos de políticas (R$) em fração do PIB no momento da execução.
 */
export function currentNominalGdpMillions(state: Readonly<GameState>, content: Pick<GameContent, 'scenario'>): number {
  const v = scenarioEconomyValues(content.scenario);
  const e = state.economy;
  return v.nominalGdpMillions * e.priceLevel * e.potentialIndex * Math.exp(e.outputGap - v.outputGap);
}

/** Soma das receitas por grupo (para invariantes e interface). */
export function revenueTotal(byGroup: Readonly<Record<RevenueGroup, number>>): number {
  return REVENUE_GROUPS.reduce((s, g) => s + byGroup[g], 0);
}
