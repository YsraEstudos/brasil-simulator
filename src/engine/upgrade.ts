import { DEFAULT_CALIBRATION } from './economy/calibration';
import { initialFiscal } from './economy/fiscal';
import { FALLBACK_ECONOMY, fiscalValues, initialEconomy } from './state';
import { STATE_SCHEMA_VERSION, type GameState } from './types';

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
  return state as unknown as GameState;
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
