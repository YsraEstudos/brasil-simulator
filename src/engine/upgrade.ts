import { DEFAULT_CALIBRATION } from './economy/calibration';
import { initialFiscal } from './economy/fiscal';
import { FALLBACK_ECONOMY, fiscalValues, initialEconomy } from './state';
import { ENGINE_VERSION, STATE_SCHEMA_VERSION, type GameState } from './types';
import { initialSocietyForGame } from './society/society';
import { initialPublicPolicies } from './publicPolicies/types';

/** O save foi gravado com uma estrutura de estado mais nova que a deste app. */
export class SaveTooNewError extends Error {
  constructor(readonly saveVersion: number) {
    super(`save com estado v${saveVersion}, app conhece até v${STATE_SCHEMA_VERSION}`);
    this.name = 'SaveTooNewError';
  }
}

type Raw = Record<string, unknown>;

/** Etapa de quem já passou pelo Congresso: maior que qualquer plano de votação (PEC tem 4 etapas). */
const FINAL_STAGE = 4;

/**
 * Atualiza um estado salvo para a estrutura atual (AI_INSTRUCTIONS.md §3: saves antigos são atualizados, não
 * recusados). Cada passo converte uma versão na seguinte; só saves **mais novos** que o app são recusados.
 */
export function upgradeGameState(version: number, raw: unknown): GameState {
  if (version > STATE_SCHEMA_VERSION) throw new SaveTooNewError(version);
  let state = raw as Raw;
  if (version < 2) state = v1ToV2(state);
  if (version < 3) state = v2ToV3(state);
  if (version < 4) state = v3ToV4(state);
  if (version < 5) state = v4ToV5(state);
  if (version < 6) state = v5ToV6(state);
  if (version < 7) state = v6ToV7(state);
  if (version < 8) state = v7ToV8(state);
  return state as unknown as GameState;
}

/**
 * v7 (Fase 07) → v8 (Fase 08): entra o estado eleitoral (`politics`). Sem acesso ao cenário, o campo fica
 * ausente: o `electionsStep` o cria no primeiro mês processado de um cenário com eleições, e campanhas sem
 * eleições nunca o ganham. Os campos da Fase 07 são preservados.
 */
function v7ToV8(s: Raw): Raw {
  return { ...s, schemaVersion: 8, engineVersion: ENGINE_VERSION };
}

/**
 * v6 (Fase 06) → v7 (Fase 07): entram marcas, cadeias agendadas, prestígio de personagens e notícias. Todos
 * começam vazios; pendências, eventos já disparados e contadores são preservados. Os passos anteriores que criam
 * `events` (v1→v2 e saves sem o bloco) passam por este, então todo save antigo ganha os campos novos.
 */
function v6ToV7(s: Raw): Raw {
  const events = (s.events ?? {}) as Raw;
  return {
    ...s,
    schemaVersion: 7,
    engineVersion: ENGINE_VERSION,
    events: { ...events, flags: {}, scheduled: [], characters: {}, news: [] },
  };
}

/** Blocos novos partem de referências provisórias; propostas e impulsos legados são preservados. */
function v5ToV6(s: Raw): Raw {
  return {
    ...s,
    schemaVersion: 6,
    engineVersion: ENGINE_VERSION,
    society: initialSocietyForGame({
      economy: s.economy as GameState['economy'],
      indicators: s.indicators as GameState['indicators'],
    }),
    publicPolicies: initialPublicPolicies(),
  };
}

/**
 * v1 (Fase 01) → v2 (Fase 02): entram economia, Congresso, propostas, fila de impulsos e eventos.
 * Os saves v1 são do cenário fictício, que não tem bloco econômico: usa os valores provisórios padrão.
 * `congress.blocs` vazio = relação de cada bloco igual à do cenário (o Congresso cria a entrada ao mudar).
 */
function v1ToV2(s: Raw): Raw {
  return {
    ...s,
    schemaVersion: 2,
    economy: v2EconomyFallback(),
    congress: { blocs: [] },
    proposals: [],
    impulses: [],
    events: { pending: [], lastFired: {}, count: {} },
  };
}

/** Bloco econômico v2 dos saves v1 (os campos novos da v3 entram no passo seguinte). */
function v2EconomyFallback(): Raw {
  const e = initialEconomy(null, DEFAULT_CALIBRATION);
  return {
    outputGap: e.outputGap,
    potentialGrowth: e.potentialGrowth,
    selic: e.selic,
    effectiveRealRate: e.effectiveRealRate,
    inflationExpectation: e.inflationExpectation,
    credibility: e.credibility,
    grossDebt: e.grossDebt,
    implicitRate: e.implicitRate,
    revenue: e.revenue,
    primarySpending: e.primarySpending,
    monthlyPrimary: e.monthlyPrimary,
    interest: e.interest,
    debtAdjustment: e.debtAdjustment,
  };
}

/**
 * v3 (Fase 03) → v4 (Fase 04): entram o gabinete (vazio = ocupantes do cenário) e, nas propostas, etapa,
 * relator, negociação, acréscimos, veto e ação no STF. Propostas em tramitação recomeçam pela Câmara, com a
 * votação no mês que já estava marcado; as demais ficam com a etapa final. Texto com escala < 1 conta como
 * alterado pelo relator.
 */
function v3ToV4(s: Raw): Raw {
  const congress = (s.congress ?? {}) as Raw;
  const proposals = ((s.proposals ?? []) as Raw[]).map((p) => {
    const inCongress = p.status === 'em_tramitacao' || p.status === 'parada';
    return {
      ...p,
      stage: inCongress ? 0 : FINAL_STAGE,
      rapporteur: null,
      textAltered: typeof p.scale === 'number' && p.scale < 1,
      postponements: 0,
      negotiation: { blocs: {}, amendments: false, textConceded: false, urgency: false },
      rider: 0,
      veto: null,
      judicial: null,
    };
  });
  return { ...s, schemaVersion: 4, congress: { ...congress, cabinet: [] }, proposals };
}

/**
 * v4 (Fase 04) → v5 (Fase 05): entram as UFs (vazio = a etapa regional parte do cenário no próximo mês) e, nas
 * propostas, a adesão dos estados (`null`: execuções anteriores não tinham adesão por UF).
 */
function v4ToV5(s: Raw): Raw {
  const proposals = ((s.proposals ?? []) as Raw[]).map((p) => ({ ...p, adherents: null }));
  return { ...s, schemaVersion: 5, proposals, regions: { ufs: [] } };
}

/**
 * v2 (Fase 02) → v3 (Fase 03): entram níveis (potencial e preços, índice 1 no ponto do save), setor externo,
 * pressão sobre o BC e contas por grupo. Sem acesso ao cenário, a estrutura fiscal é a padrão provisória
 * aplicada à receita e à despesa do próprio save, e o câmbio e o prêmio são os provisórios padrão.
 */
function v2ToV3(s: Raw): Raw {
  const e = s.economy as Raw;
  const indicators = s.indicators as Raw;
  const revenue = e.revenue as number;
  const primarySpending = e.primarySpending as number;
  const gdpGrowth = indicators.gdpGrowth12m as number;
  const inflation = indicators.inflation12m as number;
  const fiscal = initialFiscal(
    fiscalValues(null, { revenue, primarySpending }),
    gdpGrowth,
    FALLBACK_ECONOMY.gdpGrowthTwoYearsAgo,
    DEFAULT_CALIBRATION,
  );
  return {
    ...s,
    schemaVersion: 3,
    economy: {
      ...e,
      potentialIndex: 1,
      priceLevel: 1,
      riskPremium: FALLBACK_ECONOMY.riskPremium,
      exchangeRate: FALLBACK_ECONOMY.exchangeRate,
      depreciation12m: inflation - DEFAULT_CALIBRATION.inflacao_externa,
      externalRate: FALLBACK_ECONOMY.externalRate,
      termsOfTrade: 0,
      fiscal,
      bcPressure: { months: [], pendingCut: 0 },
    },
  };
}
