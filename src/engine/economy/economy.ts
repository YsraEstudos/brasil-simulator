import { activeImpulses, sumActive } from '../impulses';
import { fiscalValues, scenarioEconomyValues } from '../state';
import type {
  EconomyState,
  FiscalState,
  GameState,
  ImpulseTarget,
  MonthStep,
  ScheduledImpulse,
  StepContext,
} from '../types';

import type { Calibration, ParamName } from './calibration';
import { externalMonth, NOISE_PARAM, riskDrivers } from './external';
import {
  annualReview,
  DISCRETIONARY_TARGETS,
  EXTRAORDINARY_TARGETS,
  fiscalStructure,
  MANDATORY_TARGETS,
  REVENUE_TARGETS,
  revenueMonth,
  spendingMonth,
  spendingPieces,
} from './fiscal';
import { BC_BOARD_SIZE, boardShare, copomRate, pressureMonth } from './monetary';
import { clamp, impulsePiece, scalePieces, sumOf, toContributions, type Piece } from './pieces';

/**
 * Etapa econômica do mês (ECONOMIC_MODEL.md §4–5; o que a Fase 03 implementa está em §5.14).
 *
 * Ordem: revisão anual (janeiro), pressão sobre o BC, potencial, receitas, despesas e limite, credibilidade,
 * prêmio de risco e câmbio, hiato, inflação, Copom, juro real efetivo, preços, nível do PIB e dívida.
 * Devolve o novo bloco `economy` e as contribuições dos indicadores; os indicadores em si só mudam quando o
 * `advanceMonth` soma as contribuições (ECONOMIC_MODEL.md §7.3).
 */

const MONTHS_PER_YEAR = 12;
const PRESSURE_LABEL = 'Pressão sobre o Banco Central';

/** Multiplicador e sinal de um impulso de demanda sobre o hiato (ECONOMIC_MODEL.md §5.2). */
interface DemandGain {
  mult: ParamName;
  sign: 1 | -1;
}

const DEMAND_GAIN: Partial<Record<ImpulseTarget, DemandGain>> = {
  'gasto.investimento': { mult: 'mult_investimento', sign: 1 },
  'gasto.custeio': { mult: 'mult_custeio', sign: 1 },
  'gasto.transferencia_baixa_renda': { mult: 'mult_transf_baixa_renda', sign: 1 },
  'gasto.transferencia_alta_renda': { mult: 'mult_transf_alta_renda', sign: 1 },
  'gasto.obrigatoria': { mult: 'mult_obrigatoria', sign: 1 },
  'gasto.extraordinario': { mult: 'mult_custeio', sign: 1 },
  'receita.desoneracao_consumo': { mult: 'mult_desoneracao_consumo', sign: 1 },
  'receita.desoneracao_renda': { mult: 'mult_desoneracao_renda', sign: 1 },
  'receita.tributaria': { mult: 'mult_receita', sign: -1 },
  'receita.renda': { mult: 'mult_receita', sign: -1 },
  'receita.consumo': { mult: 'mult_receita', sign: -1 },
  'demanda.credito': { mult: 'mult_credito', sign: 1 },
};

/** Impulsos de demanda que entram no hiato (ECONOMIC_MODEL.md §5.2). */
const DEMAND_TARGETS = Object.keys(DEMAND_GAIN) as ImpulseTarget[];

/**
 * Credibilidade do mês, 0–1 (ECONOMIC_MODEL.md §5.3): volta à base aos poucos e cai com déficit abaixo da
 * banda, inflação acima do teto, dívida acima do limiar e estouro do limite de despesas. Choques de
 * `credibilidade` e a pressão sobre o BC somam por cima. Devolve também o valor sem a pressão (atribuição).
 */
function nextCredibility(state: GameState, c: Calibration, pressureCost: number) {
  const e = state.economy;
  const i = state.indicators;
  const recovery = c.recuperacao_cred * (c.credibilidade_base - e.credibility);
  const fiscalGap = Math.max(0, c.meta_primario - c.banda_meta_primario - i.primaryBalance12m);
  const inflationGap = Math.max(0, i.inflation12m - (c.meta_inflacao + c.tolerancia_meta));
  const debtGap = Math.max(0, e.grossDebt - c.limiar_divida);
  const penalties =
    (c.pena_cred_fiscal * fiscalGap +
      c.pena_cred_inflacao * inflationGap +
      c.pena_cred_divida * debtGap +
      c.pena_cred_estouro * e.fiscal.limitExcess) /
    MONTHS_PER_YEAR;
  const shocks = sumActive(state.impulses, state.monthIndex, 'credibilidade');
  const raw = e.credibility + recovery - penalties + shocks;
  return {
    value: clamp(raw - pressureCost, c.cred_min, c.cred_max),
    withoutPressure: clamp(raw, c.cred_min, c.cred_max),
  };
}

/**
 * Parcelas da variação do hiato no mês (ECONOMIC_MODEL.md §5.2): inércia, juro real, prêmio de risco, termos de
 * troca, impulsos fiscais e de demanda (multiplicador maior na ociosidade e menor com risco fiscal), postura
 * fiscal estrutural, acomodação da economia à postura fiscal, choques e ruído. Devolve também a postura de
 * demanda `F` do mês (para atualizar a referência). Sorteia exatamente uma normal por mês.
 */
function gapPieces(state: GameState, ctx: StepContext, structuralStance: number, riskPremium: number, terms: number) {
  const t = state.monthIndex;
  const e = state.economy;
  const c = ctx.content.calibration;
  const h0 = e.outputGap;
  const damp = 1 - c.rho_h;
  const pieces: Piece[] = [
    { cause: 'inercia_hiato', label: 'Acomodação da atividade', delta: (c.rho_h - 1) * h0 },
    { cause: 'juros_bc', label: 'Juros do Banco Central', delta: -c.beta_r * (e.effectiveRealRate - c.juro_neutro) },
    {
      cause: 'premio_risco',
      label: 'Prêmio de risco e juros de mercado',
      delta: -c.beta_r * c.repasse_risco_neutro * (riskPremium - c.premio_base),
    },
    { cause: 'termos_troca', label: 'Preços das exportações (termos de troca)', delta: c.efeito_termos_troca * terms },
  ];

  const risk = (1 + c.sens_hiato * Math.max(0, -h0)) * (1 - c.sens_risco * (1 - e.credibility));
  let stance = 0;
  for (const impulse of activeImpulses(state.impulses, t, DEMAND_TARGETS)) {
    const gain = DEMAND_GAIN[impulse.target];
    if (!gain) continue;
    const level = c[gain.mult] * risk * gain.sign * impulse.delta;
    stance += level;
    pieces.push(impulsePiece(impulse, damp * level));
  }
  const structural = c.mult_estrutural * risk * structuralStance;
  stance += structural;
  pieces.push({ cause: 'postura_fiscal', label: 'Limite de despesas e obrigatórias', delta: damp * structural });
  pieces.push({
    cause: 'acomodacao_fiscal',
    label: 'Economia se acomoda à política fiscal',
    delta: -damp * e.fiscal.demandRef,
  });
  for (const impulse of activeImpulses(state.impulses, t, ['choque.hiato'])) {
    pieces.push(impulsePiece(impulse, impulse.delta));
  }

  const sigma = c[NOISE_PARAM[state.difficulty]];
  pieces.push({ cause: 'flutuacoes', label: 'Flutuações da economia', delta: ctx.rng.normal() * sigma });
  return { pieces, stance };
}

/** Etapa econômica do pipeline mensal (ECONOMIC_MODEL.md §4–5). */
export const economyStep: MonthStep = (input, ctx) => {
  const t = input.monthIndex;
  const c = ctx.content.calibration;
  const scenario = ctx.content.scenario;
  const anchor = scenarioEconomyValues(scenario);
  const structure = fiscalStructure(fiscalValues(scenario, anchor));

  // Revisão anual em janeiro (não no mês 0: o cenário já traz os valores de jan/2027).
  let state: GameState = input;
  if (t > 0 && t % MONTHS_PER_YEAR === 0) {
    const review = annualReview(state, c);
    state = { ...state, economy: { ...state.economy, fiscal: review.fiscal } };
    ctx.draft.notes.push(review.note);
  }
  const e = state.economy;
  const i = state.indicators;
  const impulses = state.impulses;
  const h0 = e.outputGap;

  // §5.4.1: pressão pública sobre o Banco Central
  const pressure = pressureMonth(state, ctx);
  const extraImpulses: ScheduledImpulse[] = [];
  if (pressure.pressed) {
    extraImpulses.push({
      sourceId: `acao:pressionar_banco_central_${t}`,
      label: PRESSURE_LABEL,
      target: 'aprovacao',
      delta: c.aprovacao_pressao,
      startMonth: t,
      endMonth: t,
    });
    const indicated = Math.round(boardShare(t, c) * BC_BOARD_SIZE);
    ctx.draft.notes.push(
      `Pressão pública sobre o Banco Central: este governo indicou ${indicated} de ${BC_BOARD_SIZE} membros da diretoria; ` +
        'a credibilidade cai e o mercado cobra prêmio maior.',
    );
  }

  // §5.1: potencial
  const gPot = c.g_pot_base + sumActive(impulses, t, 'oferta.potencial');

  // §5.7–5.8: receitas, despesas e limite
  const revenue = revenueMonth(state, structure, h0, c);
  const spending = spendingMonth(state, e.fiscal, structure, revenue.linkedBase, gPot, c);
  const monthlyPrimary = revenue.total - spending.total;
  if (spending.limitExcess > 0 && e.fiscal.limitExcess === 0) {
    ctx.draft.notes.push('Despesa primária acima do limite do arcabouço fiscal: estouro registrado como exceção.');
  }
  if (spending.discretionary < c.piso_custeio && e.fiscal.discretionary >= c.piso_custeio) {
    ctx.draft.notes.push('Discricionárias abaixo do piso de funcionamento: risco de paralisação de serviços.');
  }

  // §5.3: credibilidade e expectativas
  const cred = nextCredibility(state, c, pressure.credibilityCost);
  const cred1 = cred.value;
  const pe1 = cred1 * c.meta_inflacao + (1 - cred1) * i.inflation12m;
  const peWithoutPressure = cred.withoutPressure * c.meta_inflacao + (1 - cred.withoutPressure) * i.inflation12m;

  // §5.5: prêmio de risco e câmbio
  const drivers = riskDrivers(state, cred1, revenue.incomeOverload, pressure.last12m, c);
  const ext = externalMonth(state, ctx, drivers, anchor);

  // §5.2: hiato
  const gap = gapPieces(state, ctx, spending.structuralStance, ext.riskPremium, ext.termsOfTrade);
  const h1 = h0 + sumOf(gap.pieces);

  // §5.2, §5.3, §5.6, §5.9: contribuições de cada indicador (somas exatas, ECONOMIC_MODEL.md §7.3)
  const gdpPieces: Piece[] = [
    { cause: 'tendencia_potencial', label: 'Crescimento potencial', delta: (gPot - i.gdpGrowth12m) / MONTHS_PER_YEAR },
    ...gap.pieces,
  ];
  const unemploymentPieces: Piece[] = [
    {
      cause: 'tendencia_emprego',
      label: 'Ajuste do mercado de trabalho',
      delta: c.ajuste_u * (c.nairu - i.unemployment - c.theta * h0),
    },
    ...scalePieces(gap.pieces, -c.ajuste_u * c.theta),
  ];
  const realDepreciation = ext.depreciation12m - (i.inflation12m - c.inflacao_externa);
  const inflationPieces: Piece[] = [
    {
      cause: 'expectativas',
      label: 'Expectativas de inflação',
      delta: c.ajuste_inflacao * (peWithoutPressure - i.inflation12m),
    },
    { cause: 'pressao_bc', label: PRESSURE_LABEL, delta: c.ajuste_inflacao * (pe1 - peWithoutPressure) },
    { cause: 'atividade', label: 'Aquecimento da economia', delta: c.ajuste_inflacao * c.kappa * h0 },
    ...scalePieces(gap.pieces, c.ajuste_inflacao * c.kappa),
    { cause: 'cambio', label: 'Câmbio', delta: c.ajuste_inflacao * c.repasse_cambial * realDepreciation },
    ...activeImpulses(impulses, t, ['choque.inflacao']).map((s) => impulsePiece(s, c.ajuste_inflacao * s.delta)),
  ];
  const primaryPieces: Piece[] = [
    {
      cause: 'tendencia_fiscal',
      label: 'Receitas e despesas correntes',
      delta: (revenue.base - spending.withoutPolicies - i.primaryBalance12m) / MONTHS_PER_YEAR,
    },
    ...scalePieces(revenue.pieces, 1 / MONTHS_PER_YEAR),
    ...scalePieces(spendingPieces(spending), -1 / MONTHS_PER_YEAR),
  ];

  const contributions = [
    ...toContributions('gdpGrowth12m', gdpPieces),
    ...toContributions('unemployment', unemploymentPieces),
    ...toContributions('inflation12m', inflationPieces),
    ...toContributions('primaryBalance12m', primaryPieces),
  ];
  const pi12n = i.inflation12m + sumOf(inflationPieces);

  // §5.4: Banco Central, só nas reuniões do Copom
  let selic1 = e.selic;
  let pendingCut = pressure.state.pendingCut;
  if (scenario.copomMonths.includes((t % MONTHS_PER_YEAR) + 1)) {
    const inputs = {
      selicPrev: e.selic,
      expectation: pe1,
      gap: h1,
      riskPremium: ext.riskPremium,
      inflation12m: pi12n,
      pendingCut,
    };
    selic1 = copomRate(inputs, c);
    const withoutPressure = pendingCut > 0 ? copomRate({ ...inputs, pendingCut: 0 }, c) : selic1;
    ctx.draft.copom = { previous: e.selic, next: selic1 };
    if (pendingCut > 0) {
      ctx.draft.copom.pressureCut = withoutPressure - selic1;
      pendingCut = 0;
    }
  }

  // §5.2: juro real que chega à economia, com média móvel de lag_r meses
  const rEff1 = e.effectiveRealRate + (selic1 - pe1 - e.effectiveRealRate) / c.lag_r;

  // Níveis: potencial e preços (índices); crescimento nominal do mês para a dívida
  const potentialIndex = e.potentialIndex * (1 + gPot) ** (1 / MONTHS_PER_YEAR);
  const priceLevel = e.priceLevel * (1 + pi12n) ** (1 / MONTHS_PER_YEAR);
  const nominalGrowth = Math.log(potentialIndex / e.potentialIndex) + (h1 - h0) + Math.log(priceLevel / e.priceLevel);

  // §5.9: dívida — a taxa implícita segue a Selic (com parte do prêmio) com defasagem; o ajuste inclui o
  // efeito do crescimento nominal (denominador) e a variação cambial sobre a dívida em moeda estrangeira.
  const implicitTarget = selic1 + c.repasse_risco_divida * (ext.riskPremium - c.premio_base);
  const implicitRate = e.implicitRate + c.transmissao_selic_divida * (implicitTarget - e.implicitRate);
  const interest = implicitRate * e.grossDebt;
  const debtAdjustment = -e.grossDebt * nominalGrowth + c.divida_cambial * e.grossDebt * ext.exchangeChange;
  const grossDebt = e.grossDebt + (interest - monthlyPrimary) / MONTHS_PER_YEAR + debtAdjustment;

  const fiscal: FiscalState = {
    ...e.fiscal,
    mandatory: spending.mandatory,
    linked: spending.linked,
    policyMandatory: spending.policyMandatory,
    discretionary: spending.discretionary,
    policyDiscretionary: spending.policyDiscretionary,
    exceptions: spending.exceptions,
    extraordinary: spending.extraordinary,
    spendingLimit: spending.spendingLimit,
    limitExcess: spending.limitExcess,
    revenueByGroup: revenue.byGroup,
    revenueLoss: revenue.loss,
    revenue12m: e.fiscal.revenue12m + (revenue.total - e.fiscal.revenue12m) / MONTHS_PER_YEAR,
    demandRef: e.fiscal.demandRef + c.adaptacao_fiscal * (gap.stance - e.fiscal.demandRef),
  };

  const economy: EconomyState = {
    outputGap: h1,
    potentialGrowth: gPot,
    potentialIndex,
    priceLevel,
    selic: selic1,
    effectiveRealRate: rEff1,
    inflationExpectation: pe1,
    credibility: cred1,
    riskPremium: ext.riskPremium,
    exchangeRate: ext.exchangeRate,
    depreciation12m: ext.depreciation12m,
    externalRate: ext.externalRate,
    termsOfTrade: ext.termsOfTrade,
    grossDebt,
    implicitRate,
    revenue: revenue.total,
    primarySpending: spending.total,
    monthlyPrimary,
    interest,
    debtAdjustment,
    fiscal,
    bcPressure: { months: pressure.state.months, pendingCut },
  };

  return {
    state: { ...state, economy, impulses: extraImpulses.length > 0 ? [...impulses, ...extraImpulses] : impulses },
    contributions,
  };
};

/** Alvos com efeito direto no resultado primário (para pareceres e testes). */
export const FISCAL_TARGETS: readonly ImpulseTarget[] = [
  ...MANDATORY_TARGETS,
  ...DISCRETIONARY_TARGETS,
  ...EXTRAORDINARY_TARGETS,
  ...(Object.keys(REVENUE_TARGETS) as ImpulseTarget[]),
];
