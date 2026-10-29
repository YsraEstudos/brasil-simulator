import { ADJUST_TARIFF_ACTION_ID, NEGOTIATE_AGREEMENT_ACTION_ID, TRADE_MISSION_ACTION_ID } from '../actions';
import { keyedRng } from '../career/draw';
import { cabinetSupport } from '../congress/cabinet';
import { expectedBlocYes, houseTotal, ideologicalSupport, seatsOf, voteWithSupport } from '../congress/congress';
import { blocRelation, RELACAO_ESCALA } from '../congress/relations';
import { researchImportsMillions, technologyExportMillions } from '../research/research';
import { diplomacyProgressBonus } from '../skills/skills';
import { currentNominalGdpMillions } from '../state';
import type { DecisionRejection, GameContent, GameState, House, MonthStep, ScheduledImpulse } from '../types';
import type { Bloc } from '../../types/scenario';
import type { TradeCatalog, TradePartner, TradeSector } from '../../types/trade';
import { tradeParam } from './calibration';
import { initialTrade } from './initial';
import type { TradeAgreement, TradeFlows, TradePartnerState, TradeShock, TradeState } from './types';

/**
 * Comércio exterior e diplomacia (PLANO_EXPANSAO F14, EX-25). Dois instrumentos dentro da competência do Executivo e
 * duas frentes diplomáticas:
 *
 * - **Tarifa média de importação:** o Executivo altera o imposto de importação por ato próprio, dentro da faixa da lei e
 *   das exceções à TEC do Mercosul (CF art. 153 §1º). Mais tarifa = mais arrecadação e menos importação, mas preços
 *   mais altos por um ano e risco de retaliação.
 * - **Missão comercial:** melhora a relação com o parceiro e encurta uma barreira ativa.
 * - **Acordo comercial:** rodadas de negociação, assinatura, ratificação pelo Congresso (decreto legislativo, CF art. 49,
 *   I) e vigência com contrapartidas: mais acesso às exportações, mais importações do parceiro e menos tarifa cobrada.
 * - **Choques externos:** barreira de um parceiro (volume e acesso) e ruptura de cadeias (preços de importação),
 *   sorteados por chave, sem consumir o PRNG compartilhado.
 *
 * Canais únicos (plano §2.2): saldo externo → hiato (`choque.hiato`, como nível) e câmbio (`choque.cambio`, só na
 * variação); arrecadação do imposto de importação → `receita.tributaria`; preço de importação → `choque.inflacao` por
 * um ano. O preço das exportações continua sendo dos termos de troca da economia, sem segundo canal.
 */

const MONTHS_PER_YEAR = 12;
const EPSILON = 1e-9;
export const TRADE_IMPULSE_PREFIX = 'comercio:';
const SECTORS: readonly TradeSector[] = ['agropecuaria', 'extrativa', 'industria', 'servicos'];

export function tradeOf(state: Pick<GameState, 'trade'>): TradeState {
  return state.trade ?? initialTrade(undefined);
}

function partnerSpec(content: Pick<GameContent, 'trade'>, id: unknown): TradePartner | undefined {
  return content.trade?.partners.find((p) => p.id === id);
}

function partnerState(state: Pick<GameState, 'trade'>, id: unknown): TradePartnerState | undefined {
  return tradeOf(state).partners.find((p) => p.id === id);
}

export function agreementInForce(agreement: TradeAgreement | undefined, month: number): boolean {
  return (
    agreement?.stage === 'vigente' &&
    (agreement.inForceFrom ?? 0) <= month &&
    (agreement.endMonth === undefined || month <= agreement.endMonth)
  );
}

function activeShocks(trade: TradeState, month: number): TradeShock[] {
  return trade.shocks.filter((s) => s.startMonth <= month && month <= s.endMonth);
}

/** Validação de `ajustar_tarifa` (`direction`: `elevar` ou `reduzir`), dentro da faixa do decreto. */
export function validateAdjustTariff(
  params: Readonly<Record<string, unknown>>,
  state: Readonly<GameState>,
  content: GameContent,
): DecisionRejection | null {
  const catalog = content.trade;
  if (!catalog) return 'alvo_invalido';
  const tariff = tradeOf(state).tariff;
  if (params.direction === 'elevar')
    return tariff + catalog.tariff.step <= catalog.tariff.max + EPSILON ? null : 'alvo_invalido';
  if (params.direction === 'reduzir')
    return tariff - catalog.tariff.step >= catalog.tariff.min - EPSILON ? null : 'alvo_invalido';
  return 'alvo_invalido';
}

export function validateTradeMission(
  params: Readonly<Record<string, unknown>>,
  state: Readonly<GameState>,
  content: GameContent,
): DecisionRejection | null {
  return partnerSpec(content, params.partnerId) && partnerState(state, params.partnerId) ? null : 'alvo_invalido';
}

/** O parceiro aceita abrir ou continuar uma rodada de negociação neste mês. */
export function canNegotiate(state: Readonly<GameState>, content: GameContent, partnerId: string): boolean {
  const spec = partnerSpec(content, partnerId);
  const partner = partnerState(state, partnerId);
  if (!spec?.agreementAvailable || !partner || partner.relation < tradeParam('relacao_minima_acordo')) return false;
  const agreement = partner.agreement;
  if (!agreement || agreement.stage === 'negociacao') return true;
  if (agreement.stage === 'rejeitado' || agreement.stage === 'encerrado')
    return state.monthIndex - (agreement.closedMonth ?? 0) >= tradeParam('reabrir_meses');
  return false;
}

export function validateNegotiateAgreement(
  params: Readonly<Record<string, unknown>>,
  state: Readonly<GameState>,
  content: GameContent,
): DecisionRejection | null {
  return typeof params.partnerId === 'string' && canNegotiate(state, content, params.partnerId)
    ? null
    : 'alvo_invalido';
}

/** Apoio do bloco à ratificação (sem sorteio): ideologia diante de um acordo de liberalização, relação, opinião e gabinete. */
export function agreementSupport(state: Readonly<GameState>, bloc: Bloc, content: GameContent): number {
  const c = content.calibration;
  return (
    ideologicalSupport({ position: { economic: tradeParam('posicao_acordo'), social: 0 } }, bloc, c) +
    c.w_rel * (blocRelation(state, bloc) / RELACAO_ESCALA) +
    c.w_opiniao * (state.indicators.approval - 0.5) +
    cabinetSupport(state, bloc.id, content)
  );
}

/** Votos exigidos: maioria simples com quórum de maioria absoluta, aproximada como maioria das cadeiras (CF art. 47). */
function ratificationStage(house: House) {
  return { house, round: 1, required: Math.floor(houseTotal(house) / 2) + 1 };
}

/** Previsão sem sorteio da ratificação, por Casa. */
export function ratificationForecast(state: Readonly<GameState>, content: GameContent) {
  return (['camara', 'senado'] as const).map((house) => ({
    house,
    required: ratificationStage(house).required,
    total: houseTotal(house),
    expectedYes: content.scenario.blocs.reduce(
      (n, bloc) =>
        n +
        expectedBlocYes(
          agreementSupport(state, bloc, content),
          seatsOf(bloc, house),
          bloc.cohesion,
          content.calibration,
        ),
      0,
    ),
  }));
}

function clampRelation(value: number): number {
  return Math.max(-100, Math.min(100, value));
}

/** Etapa do mês: decisões, votações de ratificação, choques, relações, fluxos e impulsos. */
export const tradeStep: MonthStep = (state, ctx) => {
  const catalog = ctx.content.trade;
  if (!catalog) return { state, contributions: [] };
  const t = state.monthIndex;
  const notes = ctx.draft.notes;
  const before = tradeOf(state);
  let tariff = before.tariff;
  const partners = before.partners.map((p) => ({ ...p, ...(p.agreement ? { agreement: { ...p.agreement } } : {}) }));
  let shocks = before.shocks.filter((s) => s.endMonth >= t).map((s) => ({ ...s }));
  const impulses: ScheduledImpulse[] = [];
  const priceShock = (sourceId: string, label: string, delta: number, months: number) => {
    if (Math.abs(delta) <= EPSILON) return;
    impulses.push({ sourceId, label, target: 'choque.inflacao', delta, startMonth: t, endMonth: t + months - 1 });
  };
  const nameOf = (id: string | undefined) => partnerSpec(ctx.content, id)?.name ?? id ?? '';

  // Ratificação e vigência dos acordos (antes das decisões do mês: a votação foi agendada na assinatura).
  for (const partner of partners) {
    const a = partner.agreement;
    if (!a) continue;
    if (a.stage === 'ratificacao' && a.voteMonth === t) {
      const rng = keyedRng(state.seed, ['comercio', 'ratificacao', partner.id, t]);
      const camara = voteWithSupport(
        state,
        ratificationStage('camara'),
        (b) => agreementSupport(state, b, ctx.content),
        ctx.content,
        rng,
      );
      const senado = voteWithSupport(
        state,
        ratificationStage('senado'),
        (b) => agreementSupport(state, b, ctx.content),
        ctx.content,
        rng,
      );
      a.votes = { camara: { yes: camara.yes, no: camara.no }, senado: { yes: senado.yes, no: senado.no } };
      if (camara.approved && senado.approved) {
        a.stage = 'vigente';
        a.inForceFrom = t + 1;
        a.endMonth = t + tradeParam('vigencia_anos') * MONTHS_PER_YEAR;
        notes.push(
          `Acordo comercial com ${nameOf(partner.id)} ratificado (Câmara ${camara.yes}–${camara.no}, Senado ${senado.yes}–${senado.no}); vigora a partir do próximo mês.`,
        );
      } else {
        a.stage = 'rejeitado';
        a.closedMonth = t;
        notes.push(
          `Congresso rejeitou o acordo comercial com ${nameOf(partner.id)} (Câmara ${camara.yes}–${camara.no}, Senado ${senado.yes}–${senado.no}).`,
        );
      }
    } else if (a.stage === 'vigente' && a.endMonth !== undefined && t > a.endMonth) {
      a.stage = 'encerrado';
      a.closedMonth = t;
      notes.push(`Acordo comercial com ${nameOf(partner.id)}: vigência encerrada; renovar exige nova negociação.`);
    }
  }

  for (const decision of ctx.decisions) {
    const params = decision.params ?? {};
    if (
      decision.policyId === ADJUST_TARIFF_ACTION_ID &&
      validateAdjustTariff(params, { ...state, trade: { ...before, tariff } }, ctx.content) === null
    ) {
      const sign = params.direction === 'elevar' ? 1 : -1;
      const step = catalog.tariff.step;
      tariff += sign * step;
      for (const p of partners) p.relation = clampRelation(p.relation - sign * tradeParam('relacao_tarifa'));
      priceShock(
        `${TRADE_IMPULSE_PREFIX}tarifa:${t}`,
        sign > 0 ? 'Alta da tarifa de importação' : 'Redução da tarifa de importação',
        sign * step * catalog.importsGdp * tradeParam('repasse_importacao'),
        tradeParam('meses_repasse'),
      );
      notes.push(
        `Tarifa média de importação ${sign > 0 ? 'elevada' : 'reduzida'} para ${(tariff * 100).toFixed(0)}% por decreto; os parceiros ${sign > 0 ? 'reagem mal' : 'reagem bem'}.`,
      );
    } else if (decision.policyId === TRADE_MISSION_ACTION_ID) {
      const partner = partners.find((p) => p.id === params.partnerId);
      if (!partner) continue;
      partner.relation = clampRelation(partner.relation + tradeParam('ganho_missao'));
      const cut = tradeParam('missao_reduz_barreira');
      let shortened = false;
      shocks = shocks
        .map((s) => {
          if (s.kind !== 'barreira' || s.partnerId !== partner.id) return s;
          shortened = true;
          return { ...s, endMonth: s.endMonth - cut };
        })
        .filter((s) => s.endMonth >= t);
      notes.push(
        `Missão comercial a ${nameOf(partner.id)}: relação melhora${shortened ? ` e a barreira às compras do Brasil é encurtada em ${cut} meses` : ''}.`,
      );
    } else if (decision.policyId === NEGOTIATE_AGREEMENT_ACTION_ID) {
      const partner = partners.find((p) => p.id === params.partnerId);
      if (!partner || !canNegotiate({ ...state, trade: { ...before, partners } }, ctx.content, partner.id)) continue;
      const step = 1 + diplomacyProgressBonus(state);
      const a = partner.agreement;
      const progress = a?.stage === 'negociacao' ? a.progress + step : step;
      partner.relation = clampRelation(partner.relation + tradeParam('ganho_rodada'));
      if (progress + EPSILON >= tradeParam('rodadas_acordo')) {
        const voteMonth = t + tradeParam('meses_ratificacao');
        partner.agreement = {
          stage: 'ratificacao',
          progress,
          startedMonth: a?.stage === 'negociacao' ? a.startedMonth : t,
          signedMonth: t,
          voteMonth,
        };
        notes.push(
          `Acordo comercial com ${nameOf(partner.id)} assinado; o Congresso vota a ratificação em ${tradeParam('meses_ratificacao')} meses.`,
        );
      } else {
        partner.agreement = {
          stage: 'negociacao',
          progress,
          startedMonth: a?.stage === 'negociacao' ? a.startedMonth : t,
        };
        notes.push(
          `Rodada de negociação com ${nameOf(partner.id)}: ${progress.toLocaleString('pt-BR')} de ${tradeParam('rodadas_acordo')} rodadas cumpridas.`,
        );
      }
    }
  }

  // Choques externos, sorteados por chave (semente, tipo, parceiro, mês): independentes da ordem das telas e das ações.
  const steps = (tariff - catalog.tariff.base) / catalog.tariff.step;
  for (const spec of catalog.shocks) {
    if (spec.kind === 'barreira') {
      for (const p of catalog.partners) {
        if (shocks.some((s) => s.kind === 'barreira' && s.partnerId === p.id)) continue;
        const partner = partners.find((x) => x.id === p.id);
        if (!partner) continue;
        const probability = Math.max(
          0,
          Math.min(
            1,
            spec.monthlyProbability *
              (1 - tradeParam('risco_relacao') * (partner.relation / 100)) *
              (1 + tradeParam('retaliacao_tarifa') * Math.max(0, steps)) *
              (agreementInForce(partner.agreement, t) ? 1 - tradeParam('reducao_risco_acordo') : 1),
          ),
        );
        if (!keyedRng(state.seed, ['comercio', spec.id, p.id, t]).chance(probability)) continue;
        shocks.push({
          id: `${spec.id}:${p.id}:${t}`,
          kind: 'barreira',
          partnerId: p.id,
          startMonth: t,
          endMonth: t + spec.months - 1,
          size: spec.size,
        });
        notes.push(
          `${p.name} impõe barreira às compras do Brasil (setor mais exposto: ${p.mainSector}); uma missão comercial pode encurtá-la.`,
        );
      }
    } else if (
      !shocks.some((s) => s.kind === 'cadeia') &&
      keyedRng(state.seed, ['comercio', spec.id, t]).chance(spec.monthlyProbability)
    ) {
      shocks.push({
        id: `${spec.id}:${t}`,
        kind: 'cadeia',
        startMonth: t,
        endMonth: t + spec.months - 1,
        size: spec.size,
      });
      priceShock(
        `${TRADE_IMPULSE_PREFIX}cadeia:${t}`,
        spec.name,
        spec.size * catalog.importsGdp * tradeParam('repasse_importacao'),
        Math.min(spec.months, tradeParam('meses_repasse')),
      );
      notes.push(
        `${spec.name}: importações mais caras por alguns meses; tecnologias importadas ficam mais caras de manter.`,
      );
    }
  }

  // Relações voltam aos poucos à inicial do cenário.
  for (const p of partners) {
    const initial = partnerSpec(ctx.content, p.id)?.initialRelation ?? 0;
    p.relation = clampRelation(p.relation + (initial - p.relation) * tradeParam('retorno_relacao'));
  }

  const next: TradeState = { tariff, partners, shocks, flows: before.flows };
  const flows = tradeFlows(next, catalog, { ...state, trade: next }, ctx.content);
  next.flows = flows;

  const rho = ctx.content.calibration.rho_h;
  const gapDelta = tradeParam('mult_saldo_externo') * (flows.net - rho * before.flows.net);
  if (Math.abs(gapDelta) > EPSILON) {
    impulses.push({
      sourceId: `${TRADE_IMPULSE_PREFIX}saldo:${t}`,
      label: 'Saldo do comércio exterior',
      target: 'choque.hiato',
      delta: gapDelta,
      startMonth: t,
      endMonth: t,
    });
  }
  const fxDelta = -tradeParam('elast_cambio_saldo') * (flows.net - before.flows.net);
  if (Math.abs(fxDelta) > EPSILON) {
    impulses.push({
      sourceId: `${TRADE_IMPULSE_PREFIX}cambio:${t}`,
      label: 'Saldo do comércio exterior',
      target: 'choque.cambio',
      delta: fxDelta,
      startMonth: t,
      endMonth: t,
    });
  }
  if (Math.abs(flows.tariffRevenue) > EPSILON) {
    impulses.push({
      sourceId: `${TRADE_IMPULSE_PREFIX}imposto_importacao:${t}`,
      label: 'Imposto de importação',
      target: 'receita.tributaria',
      delta: flows.tariffRevenue,
      startMonth: t,
      endMonth: t,
    });
  }
  return { state: { ...state, trade: next, impulses: [...state.impulses, ...impulses] }, contributions: [] };
};

/** Fluxos do mês como desvio do início (fração do PIB anualizada). Função pura: a interface pode recalcular. */
export function tradeFlows(
  trade: TradeState,
  catalog: TradeCatalog,
  state: Readonly<GameState>,
  content: GameContent,
): TradeFlows {
  const t = state.monthIndex;
  const shocks = activeShocks(trade, t);
  const sectors: Record<TradeSector, number> = { agropecuaria: 0, extrativa: 0, industria: 0, servicos: 0 };
  let exports = 0;
  let agreementImports = 0;
  let concededImports = 0;
  let weightedAccess = 0;
  let share = 0;
  for (const spec of catalog.partners) {
    const partner = trade.partners.find((p) => p.id === spec.id);
    const inForce = agreementInForce(partner?.agreement, t);
    const barrier = shocks
      .filter((s) => s.kind === 'barreira' && s.partnerId === spec.id)
      .reduce((sum, s) => sum + s.size, 0);
    const access = Math.max(0, 1 - barrier) * (1 + (inForce ? tradeParam('ganho_acesso_acordo') : 0));
    const change = catalog.exportsGdp * spec.exportShare * (access - 1);
    exports += change;
    sectors[spec.mainSector] += change;
    weightedAccess += spec.exportShare * access;
    share += spec.exportShare;
    if (inForce) {
      const fromPartner = catalog.importsGdp * spec.importShare * (1 + tradeParam('ganho_importacao_acordo'));
      agreementImports += catalog.importsGdp * spec.importShare * tradeParam('ganho_importacao_acordo');
      concededImports += fromPartner;
    }
  }
  const averageAccess = weightedAccess + (1 - share);
  const tariffGap = trade.tariff - catalog.tariff.base;
  const tariffImports = -catalog.importsGdp * tradeParam('elast_importacao_tarifa') * tariffGap;
  const imports = tariffImports + agreementImports;
  const nominalGdp = currentNominalGdpMillions(state, content);
  const realGdp = nominalGdp / (state.economy.priceLevel > 0 ? state.economy.priceLevel : 1);
  const techExports = realGdp > 0 ? (technologyExportMillions(state, content) * averageAccess) / realGdp : 0;
  const techImports = nominalGdp > 0 ? (researchImportsMillions(state) * MONTHS_PER_YEAR) / nominalGdp : 0;
  const totalImports = Math.max(0, catalog.importsGdp + imports);
  const tariffRevenue =
    trade.tariff * (totalImports - tradeParam('concessao_tarifa') * Math.min(concededImports, totalImports)) -
    catalog.tariff.base * catalog.importsGdp;
  for (const id of SECTORS) sectors[id] = Math.abs(sectors[id]) > EPSILON ? sectors[id] : 0;
  return {
    exports,
    techExports,
    imports,
    techImports,
    net: exports + techExports - imports - techImports,
    tariffRevenue: Math.abs(tariffRevenue) > EPSILON ? tariffRevenue : 0,
    sectors,
  };
}

/** Acesso atual às exportações para o parceiro (1 = o do início). */
export function partnerAccess(state: Pick<GameState, 'trade' | 'monthIndex'>, spec: TradePartner): number {
  const trade = tradeOf(state);
  const partner = trade.partners.find((p) => p.id === spec.id);
  const barrier = activeShocks(trade, state.monthIndex)
    .filter((s) => s.kind === 'barreira' && s.partnerId === spec.id)
    .reduce((sum, s) => sum + s.size, 0);
  return (
    Math.max(0, 1 - barrier) *
    (1 + (agreementInForce(partner?.agreement, state.monthIndex) ? tradeParam('ganho_acesso_acordo') : 0))
  );
}

/** Invariantes (plano §6.1, "Comércio"): saldo = soma dos fluxos; setores conciliam; faixa da tarifa; relações. */
export function checkTrade(next: Readonly<TradeState>, catalog: TradeCatalog | undefined): string[] {
  if (!catalog) return [];
  const issues: string[] = [];
  const f = next.flows;
  if (Math.abs(f.exports + f.techExports - f.imports - f.techImports - f.net) > 1e-9)
    issues.push('comércio: saldo não reconciliado');
  const sectors = Object.values(f.sectors).reduce((s, v) => s + v, 0);
  if (Math.abs(sectors - f.exports) > 1e-9) issues.push('comércio: setores não somam as exportações');
  if (next.tariff < catalog.tariff.min - EPSILON || next.tariff > catalog.tariff.max + EPSILON)
    issues.push('comércio: tarifa fora da faixa');
  if (f.techImports < -EPSILON || f.techExports < -EPSILON) issues.push('comércio: fluxo de tecnologia negativo');
  if (next.partners.some((p) => p.relation < -100 || p.relation > 100))
    issues.push('comércio: relação fora de −100…100');
  if (next.partners.length !== catalog.partners.length) issues.push('comércio: parceiros alterados');
  return issues;
}
