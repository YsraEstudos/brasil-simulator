import { monthKey, toCalendar } from '../calendar';
import { usesFormalRules } from '../campaignConfig';
import { budgetDraftOf, isBudgetPolicy } from '../publicPolicies/budgetLaws';
import {
  AMENDMENTS_ACTION_ID,
  CONCEDE_ACTION_ID,
  isAgendaAction,
  NEGOTIATE_ACTION_ID,
  SANCTION_ACTION_ID,
  URGENCY_ACTION_ID,
  type SanctionChoice,
} from '../actions';
import { isPartisan, ministryOccupant, policyMinistry } from '../congress/cabinet';
import { policyCapacity } from '../congress/management';
import {
  blocSupport,
  expectedYes,
  housePresident,
  houseTotal,
  ideologicalSupport,
  INTERESSE_EMENDAS,
  legislativeInstrument,
  sessionAt,
  vetoOverrideSupport,
  vetoPlan,
  voteStage,
  voteWithSupport,
  votingPlan,
  type Session,
} from '../congress/congress';
import { blocRelation, RELACAO_MAX, RELACAO_MIN } from '../congress/relations';
import { isNovoBeneficio, vedacaoAtiva } from '../elections/vedacao';
import type { Calibration } from '../economy/calibration';
import { fiscalRoom } from '../economy/fiscal';
import {
  adhesionProbability,
  populationShares,
  regionsOf,
  regionsView,
  supportsRegionalDistribution,
} from '../regions/regions';
import { currentNominalGdpMillions } from '../state';
import type { Instrument, Policy } from '../../types/policy';
import type { Bloc } from '../../types/scenario';
import type {
  Decision,
  GameContent,
  GameState,
  House,
  ImpulseRegional,
  ImpulseTarget,
  MonthStep,
  Proposal,
  ProposalJudicial,
  ProposalStatus,
  ProposalTransition,
  ScheduledImpulse,
  StepContext,
  VoteResult,
} from '../types';

/**
 * Ciclo de vida das propostas (GAME_DESIGN.md §9; POLITICAL_RULES.md §3, §6–8): envio, tramitação por Casa
 * com relator e pauta, negociação, votação, sanção ou veto, execução, ações no STF e conclusão.
 * Função pura: copia tudo o que altera e não muta o `state` recebido.
 */

/** Meses em um ano; o mês de índice múltiplo de 12 é janeiro, recesso do Congresso (POLITICAL_RULES.md §3.3). */
const MESES_POR_ANO = 12;
/** Noventena (CF art. 150 III, c): 90 dias, tratados como 3 meses no motor. */
const NOVENTENA_MESES = 3;
/** Uma proposta enviada leva pelo menos um mês até a votação em cada Casa. */
const TRAMITACAO_MINIMA_MESES = 1;
/** A sanção ocorre no mês seguinte à aprovação final (15 dias úteis, POLITICAL_RULES.md §7). */
const SANCAO_MESES = 1;
/** O Congresso aprecia o veto em 30 dias (CF art. 66 §4º): sessão no mês seguinte ao veto. */
const VETO_SESSAO_MESES = 1;
/** Urgência constitucional: 45 dias em cada Casa (CF art. 64 §2º), arredondados para 2 meses. */
const URGENCIA_MESES = 2;
/** MP: 60 + 60 dias de vigência (CF art. 62 §§3º, 7º), 4 meses no motor. */
const MP_VIGENCIA_MESES = 4;
/** MP tranca a pauta da Casa depois de 45 dias (CF art. 62 §6º): a partir do 2º mês após a edição. */
const MP_TRANCA_MESES = 2;
/** Escala do capital político (GAME_DESIGN.md §5). */
const CAPITAL_MIN = 0;
const CAPITAL_MAX = 100;
/** Fração do texto que sobrevive quando a proposta não foi alterada. */
const TEXTO_ORIGINAL = 1;
/** Sorteio de prazos: o primeiro mês possível depois do evento. */
const UM_MES = 1;

const HOUSE_NAME: Record<House, string> = { camara: 'Câmara', senado: 'Senado' };

/** Canal de impacto da política → alvo do impulso (ECONOMIC_MODEL.md §5.11). */
const IMPULSE_TARGET: Record<Policy['impacts'][number]['channel'], ImpulseTarget> = {
  investimento_publico: 'gasto.investimento',
  custeio: 'gasto.custeio',
  transferencia_baixa_renda: 'gasto.transferencia_baixa_renda',
  transferencia_alta_renda: 'gasto.transferencia_alta_renda',
  despesa_obrigatoria: 'gasto.obrigatoria',
  desoneracao_consumo: 'receita.desoneracao_consumo',
  desoneracao_renda: 'receita.desoneracao_renda',
  receita_tributaria: 'receita.tributaria',
  receita_renda: 'receita.renda',
  receita_consumo: 'receita.consumo',
  salario_minimo_real: 'salario_minimo',
  credito: 'demanda.credito',
  capital_publico: 'oferta.potencial',
  aprovacao: 'aprovacao',
  credibilidade_fiscal: 'credibilidade',
};

/** Estado de trabalho de uma etapa: cópias próprias de tudo que muda. */
interface Run {
  readonly state: Readonly<GameState>;
  readonly ctx: StepContext;
  readonly t: number;
  readonly c: Calibration;
  readonly proposals: Proposal[];
  impulses: ScheduledImpulse[];
  capital: number;
  /** Relação atual dos blocos; os que não estão no estado vêm do cenário. */
  relations: Map<string, number>;
}

/** Resultado do agendamento de uma execução (`scheduleImpulses`). */
export interface ImpulseSchedule {
  impulses: ScheduledImpulse[];
  notes: string[];
  /** Ocorrências de risco (atraso, sobrecusto, baixa adesão, STF, escândalo), com causa e texto para o jogador. */
  riskEvents: { cause: string; detail: string }[];
  /** Meses de atraso (sorteados e por pasta contrária); já aplicados aos impulsos devolvidos. */
  delayMonths: number;
  /** Ação no STF, se houve; a janela de suspensão já foi retirada dos impulsos. */
  judicial: ProposalJudicial | null;
  /** UFs que aderiram (condição `adesao_estadual`); `null` quando a política não depende de adesão. */
  adherents: string[] | null;
}

export const proposalsStep: MonthStep = (state, ctx) => {
  const run: Run = {
    state,
    ctx,
    t: state.monthIndex,
    c: ctx.content.calibration,
    proposals: state.proposals.map(copyProposal),
    impulses: [...state.impulses],
    capital: state.resources.politicalCapital,
    relations: new Map(
      ctx.content.scenario.blocs.map((bloc): [string, number] => [bloc.id, blocRelation(state, bloc)]),
    ),
  };

  concludeExecutions(run);
  judicialTransitions(run);
  applySanctions(run);
  expireMeasures(run);
  // Paradas têm prioridade sobre as enviadas no mês: a vaga aberta vai para quem já esperava (POLITICAL_RULES.md §6.3).
  releaseParked(run);
  for (const decision of ctx.decisions) if (!isAgendaAction(decision.policyId)) sendPolicy(run, decision);
  applyNegotiations(run);
  runVetoSessions(run);
  runVotes(run);

  const blocs = ctx.content.scenario.blocs.map((bloc) => ({
    id: bloc.id,
    governmentRelation: run.relations.get(bloc.id) ?? blocRelation(state, bloc),
  }));
  return {
    state: {
      ...state,
      resources: { ...state.resources, politicalCapital: run.capital },
      congress: { ...state.congress, blocs },
      proposals: run.proposals,
      impulses: run.impulses,
    },
    contributions: [],
  };
};

/**
 * Agenda os efeitos de uma política executada a partir de `start` (ECONOMIC_MODEL.md §5.11). Condições
 * (POLITICAL_RULES.md §1.1) não se aplicam nas regras simplificadas; riscos sim. Sorteia exatamente um `chance` por risco
 * da política (mais um de STF se houver regra quebrada e a política não tiver esse risco), e prazos só
 * quando o risco ocorre. A capacidade depende do indicado; a pasta de bloco pode atrasar por oposição ideológica.
 */
export function scheduleImpulses(
  policy: Policy,
  proposalId: string,
  start: number,
  scale: number,
  state: Readonly<GameState>,
  ctx: StepContext,
): ImpulseSchedule {
  const c = ctx.content.calibration;
  const t = state.monthIndex;
  const gdp = currentNominalGdpMillions(state, ctx.content);
  const sourceId = `proposta:${proposalId}`;
  const { executionMonths } = policy.timeline;
  const notes: string[] = [];
  const riskEvents: { cause: string; detail: string }[] = [];
  let impulses: ScheduledImpulse[] = [];

  const ministry = policyMinistry(policy, ctx.content);
  const occupant = ministry ? ministryOccupant(state, ministry) : null;
  const partisanBloc =
    occupant !== null && isPartisan(occupant) ? ctx.content.scenario.blocs.find((b) => b.id === occupant) : undefined;
  // Projetos usam capacidade na carteira; aplicá-la aqui outra vez duplicaria a penalidade.
  const resultFactor = policy.delivery === 'projeto' ? 1 : policyCapacity(state, ctx.content, policy.area);

  // POLITICAL_RULES.md §2.1: nas regras brasileiras, convênio depende da adesão de cada estado.
  const adhesion = stateAdhesion(policy, state, ctx);
  if (adhesion) {
    notes.push(
      `${policy.name}: ${adhesion.adherents.length} de ${regionsOf(ctx.content).length} estados aderiram ` +
        `(${Math.round(adhesion.populationShare * 100)}% da população).`,
    );
    riskEvents.push({
      cause: 'adesao_estados',
      detail: `Aderiram ${adhesion.adherents.length} estados, com ${Math.round(adhesion.populationShare * 100)}% da população.`,
    });
  }
  const regional = impulseRegional(policy, adhesion?.adherents ?? null);

  for (const impact of policy.impacts) {
    const target = IMPULSE_TARGET[impact.channel];
    const startMonth = start + impact.lagMonths;
    const common = { sourceId, label: policy.name, target };
    // Só a parte da população que aderiu recebe o programa.
    const reach = adhesion ? adhesion.populationShare : 1;
    const local = regional ? { regional } : {};
    if (isFiscal(target)) {
      const endMonth = executionMonths > 0 ? startMonth + executionMonths - 1 : null;
      impulses.push({ ...common, ...local, delta: (impact.magnitude / gdp) * scale * reach, startMonth, endMonth });
    } else if (target === 'oferta.potencial') {
      impulses.push({
        ...common,
        ...local,
        delta: impact.magnitude * scale * resultFactor * reach,
        startMonth,
        endMonth: null,
      });
    } else if (target === 'salario_minimo') {
      // Ganho real extra entra no reajuste de janeiro (o deste mês, se for janeiro; senão o do ano seguinte).
      // Jan/2027 (mês 0) já vem do cenário: o primeiro reajuste possível é o de jan/2028.
      const january = Math.max(MESES_POR_ANO, Math.ceil(startMonth / MESES_POR_ANO) * MESES_POR_ANO);
      impulses.push({ ...common, delta: impact.magnitude * scale, startMonth: january, endMonth: january });
    } else {
      // aprovacao e credibilidade: efeito de um único mês. Ganho de aprovação rende menos em pasta de bloco.
      const factor = target === 'aprovacao' && impact.magnitude > 0 ? resultFactor : 1;
      impulses.push({ ...common, delta: impact.magnitude * scale * factor, startMonth, endMonth: startMonth });
    }
  }

  // Regras quebradas (POLITICAL_RULES.md §1.1): alimentam a credibilidade e o risco jurídico.
  let ruleFlags = 0;
  if (usesFormalRules(state)) {
    if (policy.conditions.includes('anterioridade_anual')) {
      const proximoJaneiro = (Math.floor(t / MESES_POR_ANO) + 1) * MESES_POR_ANO;
      impulses = impulses.map((i) => (isRevenue(i.target) ? adiar(i, proximoJaneiro) : i));
    }
    if (policy.conditions.includes('noventena')) {
      impulses = impulses.map((i) => (isRevenue(i.target) ? adiar(i, t + NOVENTENA_MESES) : i));
    }
    if (policy.conditions.includes('espaco_no_limite_de_despesas')) {
      // O gasto novo sai das discricionárias livres (ECONOMIC_MODEL.md §5.8); sem espaço até o mínimo, estoura.
      const gastoAdicional = impulses
        .filter((i) => i.target.startsWith('gasto.') && i.delta > 0)
        .reduce((soma, i) => soma + i.delta, 0);
      if (gastoAdicional > fiscalRoom(state.economy.fiscal, c).room) {
        ruleFlags += 1;
        impulses.push({
          sourceId,
          label: 'Gasto acima do limite do arcabouço',
          target: 'credibilidade',
          delta: -c.pena_cred_limite,
          startMonth: start,
          endMonth: start,
        });
        notes.push(
          `${policy.name}: execução acima do limite de despesas do arcabouço fiscal em ${monthKey(start)}; perda de credibilidade.`,
        );
      }
    }
    if (policy.conditions.includes('compensacao_lrf') && semCompensacao(policy)) {
      ruleFlags += 1;
      impulses.push({
        sourceId,
        label: 'Renúncia/despesa sem compensação (LRF)',
        target: 'credibilidade',
        delta: -c.pena_cred_limite,
        startMonth: start,
        endMonth: start,
      });
      notes.push(`${policy.name}: renúncia ou despesa sem compensação na LRF; perda de credibilidade.`);
    }
  }

  let delayMonths = 0;
  let judicialRisk = false;
  let judicialHit = false;
  for (const risk of policy.risks) {
    if (risk.kind === 'atraso') {
      if (ctx.rng.chance(risk.probability)) {
        const atraso = ctx.rng.int(c.atraso_min_meses, c.atraso_max_meses);
        delayMonths += atraso;
        riskEvents.push({ cause: 'atraso_execucao', detail: `Atraso de ${atraso} meses na execução.` });
      }
    } else if (risk.kind === 'sobrecusto') {
      if (ctx.rng.chance(risk.probability)) {
        impulses = impulses.map((i) =>
          i.target.startsWith('gasto.') ? { ...i, delta: i.delta * c.fator_sobrecusto } : i,
        );
        riskEvents.push({ cause: 'sobrecusto', detail: 'Sobrecusto: a execução custa acima do previsto.' });
      }
    } else if (risk.kind === 'baixa_adesao') {
      // Com adesão por estado, o risco genérico já está na adesão de cada governador.
      if (!adhesion && ctx.rng.chance(risk.probability)) {
        impulses = impulses.map((i) =>
          isFiscal(i.target) || i.target === 'oferta.potencial' ? { ...i, delta: i.delta * c.fator_baixa_adesao } : i,
        );
        riskEvents.push({ cause: 'baixa_adesao', detail: 'Baixa adesão: o efeito fica abaixo do previsto.' });
      }
    } else if (risk.kind === 'judicializacao') {
      judicialRisk = true;
      judicialHit = ctx.rng.chance(Math.min(1, risk.probability + ruleFlags * c.risco_juridico_flag));
    } else {
      // escandalo: maior em pasta de bloco (POLITICAL_RULES.md §6.3.1).
      const factor = partisanBloc ? 1 + c.fator_escandalo_partidario : 1;
      if (ctx.rng.chance(Math.min(1, risk.probability * factor))) {
        const lag = ctx.rng.int(UM_MES, c.escandalo_lag_max);
        const startMonth = start + lag;
        impulses.push({
          sourceId,
          label: `Escândalo na execução: ${policy.name}`,
          target: 'aprovacao',
          delta: c.escandalo_aprovacao,
          startMonth,
          endMonth: startMonth + c.escandalo_meses - 1,
        });
        riskEvents.push({
          cause: 'escandalo_execucao',
          detail: `Denúncias de irregularidade na execução em ${monthKey(startMonth)}; desgaste na aprovação.`,
        });
      }
    }
  }
  // Regra quebrada sem risco jurídico previsto na política: os legitimados ainda podem ir ao STF (§8).
  if (!judicialRisk && ruleFlags > 0) judicialHit = ctx.rng.chance(Math.min(1, ruleFlags * c.risco_juridico_flag));

  // Pasta de bloco contrária à política (ideologia do bloco contra a da política) trava a execução.
  if (ministry && partisanBloc && ideologicalSupport(policy, partisanBloc, c) < 0) {
    delayMonths += c.atraso_ministerio_contrario;
    riskEvents.push({
      cause: 'ministerio_contrario',
      detail: `${ministry.name} (indicação do bloco ${partisanBloc.name}) resiste à política: atraso de ${c.atraso_ministerio_contrario} meses.`,
    });
  }

  if (delayMonths > 0) {
    impulses = impulses.map((i) => ({
      ...i,
      startMonth: i.startMonth + delayMonths,
      endMonth: i.endMonth === null ? null : i.endMonth + delayMonths,
    }));
  }

  let judicial: ProposalJudicial | null = null;
  if (judicialHit) {
    const lag = ctx.rng.int(UM_MES, c.liminar_lag_max);
    const length = ctx.rng.int(c.suspensao_min_meses, c.suspensao_max_meses);
    const struckDown = ctx.rng.chance(Math.min(1, c.prob_inconstitucional + ruleFlags * c.prob_inconstitucional_flag));
    const suspendFrom = start + delayMonths + lag;
    judicial = { suspendFrom, suspendTo: suspendFrom + length - 1, struckDown };
    impulses = cutWindow(impulses, suspendFrom, struckDown ? null : judicial.suspendTo);
    riskEvents.push({
      cause: 'acao_stf',
      detail: `Ação de inconstitucionalidade no STF; liminar prevista para ${monthKey(suspendFrom)}.`,
    });
  }

  return { impulses, notes, riskEvents, delayMonths, judicial, adherents: adhesion?.adherents ?? null };
}

/**
 * Adesão dos estados a um programa por convênio (POLITICAL_RULES.md §2.1): cada governador adere com
 * probabilidade `adesao_base + adesao_relacao × relação/100`. Um sorteio por UF, na ordem do cenário.
 * `null` quando a política não depende de adesão, o cenário não tem UFs ou a dificuldade é Casual (todos aderem).
 */
function stateAdhesion(
  policy: Policy,
  state: Readonly<GameState>,
  ctx: StepContext,
): { adherents: string[]; populationShare: number } | null {
  const ufs = regionsOf(ctx.content);
  if (!policy.conditions.includes('adesao_estadual') || ufs.length === 0 || !usesFormalRules(state)) return null;
  const c = ctx.content.calibration;
  const view = regionsView(state, ctx.content);
  const pop = populationShares(ufs);
  const adherents: string[] = [];
  let populationShare = 0;
  ufs.forEach((uf, i) => {
    const relation = view[i]?.governorRelation ?? uf.governor.relation;
    if (ctx.rng.chance(adhesionProbability(c, relation))) {
      adherents.push(uf.id);
      populationShare += pop[i];
    }
  });
  return { adherents, populationShare };
}

/** Incidência regional dos impulsos da política (ECONOMIC_MODEL.md §5.15), restrita às UFs que aderiram. */
function impulseRegional(policy: Policy, adherents: readonly string[] | null): ImpulseRegional | null {
  const profile = policy.regional;
  if (!profile && !adherents) return null;
  const key = profile?.key ?? 'populacao';
  const boost = profile && Object.keys(profile.boost).length > 0 ? { boost: { ...profile.boost } } : {};
  // Sem nenhuma adesão o alcance é zero e os impulsos já não têm efeito (o escopo vazio não importa).
  const scope = adherents ? [...adherents] : [...(profile?.scope ?? [])];
  return { key, scope, ...boost };
}

/** O perfil regional só aparece na prévia se algum impacto usar um alvo distribuído pelo motor. */
export function hasRegionalDistributionChannel(policy: Policy): boolean {
  return policy.impacts.some((impact) => supportsRegionalDistribution(IMPULSE_TARGET[impact.channel]));
}

/**
 * Retira dos impulsos a janela suspensa [from, to] (to `null` = até o fim: medida derrubada). Impulsos que
 * cruzam a janela são divididos em antes e depois.
 */
export function cutWindow(impulses: readonly ScheduledImpulse[], from: number, to: number | null): ScheduledImpulse[] {
  const out: ScheduledImpulse[] = [];
  for (const i of impulses) {
    const endsBefore = i.endMonth !== null && i.endMonth < from;
    const startsAfter = to !== null && i.startMonth > to;
    if (endsBefore || startsAfter) {
      out.push(i);
      continue;
    }
    if (i.startMonth < from) out.push({ ...i, endMonth: from - 1 });
    if (to !== null && (i.endMonth === null || i.endMonth > to)) {
      out.push({ ...i, startMonth: Math.max(i.startMonth, to + 1) });
    }
  }
  return out;
}

function copyProposal(p: Proposal): Proposal {
  return {
    ...p,
    votes: [...p.votes],
    history: [...p.history],
    negotiation: { ...p.negotiation, blocs: { ...p.negotiation.blocs } },
    veto: p.veto ? { ...p.veto } : null,
    judicial: p.judicial ? { ...p.judicial } : null,
  };
}

function policyOf(content: GameContent, policyId: string): Policy {
  const policy = content.policies[policyId];
  if (!policy) throw new RangeError(`política desconhecida: ${policyId}`);
  return policy;
}

function instrumentOf(policy: Policy): Instrument {
  const instrument = legislativeInstrument(policy);
  if (instrument === null) throw new RangeError(`política sem tramitação: ${policy.id}`);
  return instrument;
}

/** Casa em que a proposta está (pela etapa atual), ou `null` (sessão conjunta ou fora do Congresso). */
export function currentHouse(p: Proposal, content: GameContent): House | null {
  const instrument = legislativeInstrument(policyOf(content, p.policyId));
  if (instrument === null) return null;
  return sessionAt(instrument, p.stage)?.house ?? null;
}

/** Vagas de pauta que a proposta ocupa na Casa (POLITICAL_RULES.md §6.3: PEC ocupa mais de uma). */
export function pautaSlots(instrument: Instrument, c: Calibration): number {
  return instrument === 'pec' ? c.vagas_pec : 1;
}

/**
 * Políticas por MP que não podem ser reeditadas agora: rejeitadas ou caducadas na mesma sessão legislativa
 * (CF art. 62 §10; aproximada pelo ano-calendário). Usada na triagem das decisões, nos robôs e na interface.
 */
export function reissueBarredPolicies(state: Readonly<GameState>, content: GameContent): Set<string> {
  const year = toCalendar(state.monthIndex).year;
  const barred = new Set<string>();
  for (const p of state.proposals) {
    const policy = content.policies[p.policyId];
    if (p.status !== 'rejeitada' || !policy || legislativeInstrument(policy) !== 'medida_provisoria') continue;
    const closed = p.history[p.history.length - 1]?.monthIndex ?? p.createdMonth;
    if (toCalendar(closed).year === year) barred.add(p.policyId);
  }
  return barred;
}

/** Vagas ocupadas na pauta da Casa por propostas em tramitação (menos `except`). */
export function pautaOccupancy(
  proposals: readonly Proposal[],
  house: House,
  content: GameContent,
  except?: Proposal,
): number {
  return proposals
    .filter((p) => p !== except && p.status === 'em_tramitacao' && currentHouse(p, content) === house)
    .reduce((n, p) => n + pautaSlots(instrumentOf(policyOf(content, p.policyId)), content.calibration), 0);
}

/** Registra a transição na trilha da proposta e no relatório do mês. */
function pushTransition(run: Run, p: Proposal, status: ProposalStatus, cause: string, detail: string): void {
  const transition: ProposalTransition = { monthIndex: run.t, status, cause, detail };
  p.status = status;
  p.history.push(transition);
  run.ctx.draft.proposalChanges.push({ proposalId: p.id, policyId: p.policyId, transition: { ...transition } });
}

function addCapital(run: Run, delta: number): void {
  run.capital = clamp(run.capital + delta, CAPITAL_MIN, CAPITAL_MAX);
}

function shiftRelation(run: Run, blocId: string, delta: number): void {
  const atual = run.relations.get(blocId) ?? 0;
  run.relations.set(blocId, clamp(atual + delta, RELACAO_MIN, RELACAO_MAX));
}

/** Janeiro é recesso nas regras brasileiras: a votação passa para fevereiro (POLITICAL_RULES.md §3.3). */
function voteMonthFrom(state: Readonly<GameState>, m: number): number {
  return usesFormalRules(state) && m % MESES_POR_ANO === 0 ? m + 1 : m;
}

function blocName(run: Run, id: string | null): string {
  return run.ctx.content.scenario.blocs.find((b) => b.id === id)?.name ?? id ?? '—';
}

/** Execuções que terminaram antes deste mês. */
function concludeExecutions(run: Run): void {
  for (const p of run.proposals) {
    if (p.status === 'em_execucao' && p.executionEnd !== null && p.executionEnd < run.t) {
      pushTransition(run, p, 'concluida', 'execucao_concluida', 'Execução concluída.');
    }
  }
}

/** Liminar do STF suspende; o julgamento retoma a execução ou derruba a medida (POLITICAL_RULES.md §8). */
function judicialTransitions(run: Run): void {
  for (const p of run.proposals) {
    const j = p.judicial;
    if (!j) continue;
    if (p.status === 'em_execucao' && run.t === j.suspendFrom) {
      pushTransition(
        run,
        p,
        'suspensa',
        'liminar_stf',
        'Liminar do STF suspende a execução enquanto a ação de inconstitucionalidade é julgada.',
      );
    } else if (p.status === 'suspensa' && run.t === j.suspendTo + 1) {
      if (j.struckDown) {
        p.executionEnd = j.suspendFrom - 1;
        pushTransition(run, p, 'abandonada', 'inconstitucional', 'O STF declarou a medida inconstitucional.');
      } else {
        pushTransition(
          run,
          p,
          'em_execucao',
          'liminar_revogada',
          'O STF julgou a ação improcedente: execução retomada.',
        );
      }
    }
  }
}

/** Decisões de sanção do mês, por proposta. */
function sanctionDecisions(run: Run): Map<string, SanctionChoice> {
  const choices = new Map<string, SanctionChoice>();
  for (const d of run.ctx.decisions) {
    if (d.policyId !== SANCTION_ACTION_ID) continue;
    const id = d.params?.proposalId;
    const choice = d.params?.choice;
    if (typeof id === 'string' && typeof choice === 'string') choices.set(id, choice as SanctionChoice);
  }
  return choices;
}

/** Sanção ou veto dos projetos aprovados (POLITICAL_RULES.md §7). Sem decisão no prazo: sanção tácita. */
function applySanctions(run: Run): void {
  const choices = sanctionDecisions(run);
  for (const p of run.proposals) {
    if (p.status !== 'aguardando_sancao' || p.voteMonth === null || p.voteMonth > run.t) continue;
    const policy = policyOf(run.ctx.content, p.policyId);
    const choice = choices.get(p.id);
    const start = run.t + policy.timeline.planningMonths;
    if (choice === 'vetar_total') {
      p.veto = { kind: 'total', overridden: null };
      p.voteMonth = voteMonthFrom(run.state, run.t + VETO_SESSAO_MESES);
      pushTransition(
        run,
        p,
        'apreciacao_veto',
        'veto_total',
        `Vetada integralmente; o Congresso aprecia o veto em ${monthKey(p.voteMonth)}.`,
      );
    } else if (choice === 'vetar_acrescimos' && p.rider > 0) {
      p.veto = { kind: 'acrescimos', overridden: null };
      p.voteMonth = voteMonthFrom(run.state, run.t + VETO_SESSAO_MESES);
      pushTransition(
        run,
        p,
        'em_execucao',
        'veto_parcial',
        `Sancionada com veto aos acréscimos do relator; o Congresso aprecia o veto em ${monthKey(p.voteMonth)}.`,
      );
      startExecution(run, p, start, p.scale);
    } else {
      p.voteMonth = null;
      const tacit = choice === undefined;
      pushTransition(
        run,
        p,
        'em_execucao',
        tacit ? 'sancao_tacita' : 'sancao',
        tacit ? 'Sanção tácita.' : 'Sancionada.',
      );
      startExecution(run, p, start, p.scale);
      scheduleRider(run, p, run.t);
    }
  }
}

/**
 * Despesa dos acréscimos do relator, a partir de `start` (fica fora da fonte da proposta: não é cancelada com ela).
 * Os acréscimos são parte da mesma lei: a liminar do STF os suspende na mesma janela e a declaração de
 * inconstitucionalidade os derruba junto (POLITICAL_RULES.md §8).
 */
function scheduleRider(run: Run, p: Proposal, start: number): void {
  if (p.rider <= 0) return;
  const rider: ScheduledImpulse = {
    sourceId: `acrescimo:${p.id}`,
    label: `Acréscimos do relator: ${policyOf(run.ctx.content, p.policyId).name}`,
    target: 'gasto.custeio',
    delta: p.rider,
    startMonth: start,
    endMonth: start + run.c.meses_acrescimo - 1,
  };
  const j = p.judicial;
  run.impulses.push(...(j ? cutWindow([rider], j.suspendFrom, j.struckDown ? null : j.suspendTo) : [rider]));
}

/** Decisões aceitas neste mês: envio de política. */
function sendPolicy(run: Run, decision: Decision): void {
  const policyId = decision.policyId;
  const policy = policyOf(run.ctx.content, policyId);
  const p: Proposal = {
    id: `${policyId}_${run.t}`,
    policyId,
    ...(isBudgetPolicy(policyId) ? { budgetDraft: budgetDraftOf(decision, run.state) ?? undefined } : {}),
    createdMonth: run.t,
    status: 'em_tramitacao', // substituído pela primeira transição, antes de qualquer contagem
    scale: TEXTO_ORIGINAL,
    voteMonth: null,
    stage: 0,
    rapporteur: null,
    textAltered: false,
    postponements: 0,
    negotiation: { blocs: {}, amendments: false, textConceded: false, urgency: false },
    rider: 0,
    veto: null,
    judicial: null,
    executionStart: null,
    executionEnd: null,
    adherents: null,
    votes: [],
    history: [],
  };

  const instrument = legislativeInstrument(policy);
  run.proposals.push(p);
  scheduleVedacaoPenalty(run, p, policy, decision);
  if (instrument === null) {
    const start = run.t + policy.timeline.planningMonths;
    pushTransition(
      run,
      p,
      'em_execucao',
      'ato_executivo',
      `Ato do Executivo assinado; execução a partir de ${monthKey(start)}.`,
    );
    startExecution(run, p, start, TEXTO_ORIGINAL);
    return;
  }

  if (instrument === 'pec') addCapital(run, run.c.capital_envio_pec);
  enterSession(run, p, policy, 0, 'enviada', 'Enviada ao Congresso.');
  // Medida provisória tem força de lei desde a edição (CF art. 62).
  if (instrument === 'medida_provisoria') startExecution(run, p, run.t, TEXTO_ORIGINAL);
}

/**
 * Vedação eleitoral (Fase 08; Lei 9.504/1997 art. 73 §10): benefício novo enviado dentro da janela de vedação
 * com quebra declarada (`params.vedacao_bypass`) paga pena na intenção de voto por `vedacao_abuso_meses` e
 * arrisca multa da Justiça Eleitoral. A regra é reavaliada no envio, porque o `screenInput` aceita qualquer
 * decisão marcada com bypass. Exatamente um `rng.chance()` por envio irregular.
 */
function scheduleVedacaoPenalty(run: Run, p: Proposal, policy: Policy, decision: Decision): void {
  if (!decision.params?.vedacao_bypass || !vedacaoAtiva(run.state, run.ctx.content) || !isNovoBeneficio(policy)) return;
  run.impulses.push({
    sourceId: `vedacao:${p.id}`,
    label: `Quebra da vedação eleitoral: ${policy.name}`,
    target: 'intencao',
    delta: -run.c.pena_intencao_vedacao,
    startMonth: run.t,
    endMonth: run.t + run.c.vedacao_abuso_meses - 1,
  });
  run.ctx.draft.notes.push(
    `${policy.name}: benefício criado em período de vedação eleitoral; pena na intenção de voto.`,
  );
  if (run.ctx.rng.chance(run.c.prob_justica_vedacao)) {
    run.impulses.push({
      sourceId: `vedacao:${p.id}`,
      label: 'Multa da Justiça Eleitoral',
      target: 'aprovacao',
      delta: -run.c.multa_aprovacao_vedacao,
      startMonth: run.t,
      endMonth: run.t,
    });
    run.ctx.draft.notes.push('A Justiça Eleitoral multou o governo pela propaganda eleitoral irregular.');
  }
}

/** Meses de tramitação na sessão (POLITICAL_RULES.md §6.3: prazo esperado repartido entre as Casas). */
function sessionMonths(run: Run, policy: Policy, instrument: Instrument, session: Session, urgency: boolean): number {
  const total = Math.max(TRAMITACAO_MINIMA_MESES, policy.timeline.expectedLegislativeMonths);
  let months = total;
  if (session.house !== null) {
    const camara = Math.max(TRAMITACAO_MINIMA_MESES, Math.round(total * run.c.fracao_tramitacao_camara));
    const houses = new Set(votingPlan(instrument).map((s) => s.house)).size;
    months = session.house === 'camara' || houses === 1 ? camara : Math.max(TRAMITACAO_MINIMA_MESES, total - camara);
  }
  return urgency ? Math.min(months, URGENCIA_MESES) : months;
}

/**
 * Relator da Casa (POLITICAL_RULES.md §6.4): sorteado entre os blocos com peso pelas cadeiras e peso extra
 * para o bloco que preside a Casa. Exatamente um `rng.float()`.
 */
function drawRapporteur(run: Run, house: House): string | null {
  const content = run.ctx.content;
  const president = housePresident(content, house)?.id;
  const weights = content.scenario.blocs.map((b) => {
    const seats = house === 'camara' ? b.chamberSeats : b.senateSeats;
    return seats * (b.id === president ? 1 + run.c.peso_relator_presidente : 1);
  });
  const total = weights.reduce((s, w) => s + w, 0);
  let x = run.ctx.rng.float() * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i] ?? 0;
    if (x < 0) return content.scenario.blocs[i]?.id ?? null;
  }
  return content.scenario.blocs[content.scenario.blocs.length - 1]?.id ?? null;
}

/**
 * Põe a proposta na sessão `stage` (Casa seguinte ou a primeira): entra na pauta se houver vaga, com relator
 * e votação marcada; senão fica parada aguardando vaga. `prefix` abre o texto da transição.
 */
function enterSession(run: Run, p: Proposal, policy: Policy, stage: number, cause: string, prefix: string): void {
  const instrument = instrumentOf(policy);
  const session = sessionAt(instrument, stage);
  if (session === null) throw new RangeError(`etapa inexistente: ${p.id} ${stage}`);
  p.stage = stage;
  p.postponements = 0;
  const content = run.ctx.content;
  if (session.house !== null) {
    const occupied = pautaOccupancy(run.proposals, session.house, content, p);
    const slots = pautaSlots(instrument, run.c);
    // Pauta vazia sempre aceita, para uma PEC não ficar parada para sempre se ocupar mais que a capacidade.
    if (occupied > 0 && occupied + slots > run.c.capacidade_pauta) {
      p.voteMonth = null;
      p.rapporteur = null;
      const pauta = session.house === 'camara' ? 'da Câmara' : 'do Senado';
      pushTransition(run, p, 'parada', 'capacidade_pauta', `${prefix} Pauta ${pauta} cheia: aguarda vaga.`);
      return;
    }
  }
  const houseForRapporteur: House = session.house ?? 'camara';
  p.rapporteur = drawRapporteur(run, houseForRapporteur);
  p.voteMonth = voteMonthFrom(
    run.state,
    run.t + sessionMonths(run, policy, instrument, session, p.negotiation.urgency),
  );
  const where =
    session.house === null
      ? 'em sessão conjunta'
      : `${session.house === 'camara' ? 'na' : 'no'} ${HOUSE_NAME[session.house]}`;
  pushTransition(
    run,
    p,
    'em_tramitacao',
    cause,
    `${prefix} Votação prevista ${where} em ${monthKey(p.voteMonth)}; relator do bloco ${blocName(run, p.rapporteur)}.`,
  );
}

/** Ações de negociação aceitas neste mês (POLITICAL_RULES.md §6.3), na ordem enviada. */
function applyNegotiations(run: Run): void {
  for (const d of run.ctx.decisions) {
    const id = d.params?.proposalId;
    if (typeof id !== 'string') continue;
    const p = run.proposals.find((x) => x.id === id);
    if (!p || (p.status !== 'em_tramitacao' && p.status !== 'parada')) continue;
    negotiate(run, p, d);
  }
}

function negotiate(run: Run, p: Proposal, d: Decision): void {
  const c = run.c;
  const policy = policyOf(run.ctx.content, p.policyId);
  const n = p.negotiation;
  if (d.policyId === NEGOTIATE_ACTION_ID) {
    const blocId = d.params?.blocId;
    if (typeof blocId !== 'string') return;
    n.blocs[blocId] = Math.min(c.negociacao_apoio_max, (n.blocs[blocId] ?? 0) + c.negociacao_apoio);
    addCapital(run, c.capital_negociacao);
    shiftRelation(run, blocId, c.relacao_negociacao);
    pushTransition(run, p, p.status, 'negociacao', `Negociação com o bloco ${blocName(run, blocId)}.`);
  } else if (d.policyId === AMENDMENTS_ACTION_ID && !n.amendments) {
    n.amendments = true;
    run.impulses.push({
      sourceId: `emendas:${p.id}`,
      label: `Emendas liberadas: ${policy.name}`,
      target: 'gasto.custeio',
      delta: c.emendas_pedagio,
      startMonth: run.t,
      endMonth: run.t + c.emendas_meses - 1,
    });
    pushTransition(run, p, p.status, 'emendas_liberadas', 'Emendas parlamentares liberadas para a votação.');
  } else if (d.policyId === CONCEDE_ACTION_ID && !n.textConceded) {
    n.textConceded = true;
    p.scale *= c.escala_concessao;
    rescaleMeasure(run, p, policy, c.escala_concessao);
    pushTransition(run, p, p.status, 'texto_cedido', 'O governo cedeu no texto para ampliar o apoio.');
  } else if (d.policyId === URGENCY_ACTION_ID && !n.urgency) {
    n.urgency = true;
    if (p.status === 'em_tramitacao' && p.voteMonth !== null) {
      p.voteMonth = Math.min(p.voteMonth, voteMonthFrom(run.state, run.t + URGENCIA_MESES));
    }
    const president = housePresident(run.ctx.content, 'camara');
    if (president) shiftRelation(run, president.id, c.relacao_urgencia);
    pushTransition(
      run,
      p,
      p.status,
      'urgencia',
      p.voteMonth === null
        ? 'Urgência constitucional pedida.'
        : `Urgência constitucional pedida; votação até ${monthKey(p.voteMonth)}.`,
    );
  }
}

/** MP já em vigor: o texto reduzido vale a partir do mês seguinte (impulsos futuros reescalados). */
function rescaleMeasure(run: Run, p: Proposal, policy: Policy, factor: number): void {
  if (legislativeInstrument(policy) !== 'medida_provisoria' || factor === 1) return;
  const source = `proposta:${p.id}`;
  const next = run.t + 1;
  run.impulses = run.impulses.flatMap((i) => {
    if (i.sourceId !== source || (i.endMonth !== null && i.endMonth < next)) return [i];
    if (i.startMonth >= next) return [{ ...i, delta: i.delta * factor }];
    return [
      { ...i, endMonth: next - 1 },
      { ...i, startMonth: next, delta: i.delta * factor },
    ];
  });
}

/** MP não votada em 120 dias perde a eficácia (CF art. 62 §3º). */
function expireMeasures(run: Run): void {
  for (const p of run.proposals) {
    if (p.status !== 'em_tramitacao' && p.status !== 'parada') continue;
    const policy = policyOf(run.ctx.content, p.policyId);
    if (legislativeInstrument(policy) !== 'medida_provisoria' || run.t - p.createdMonth < MP_VIGENCIA_MESES) continue;
    pushTransition(
      run,
      p,
      'rejeitada',
      'caducidade',
      'A medida provisória perdeu a eficácia: não foi convertida em lei em 120 dias.',
    );
    addCapital(run, run.c.capital_derrota);
    cancelMeasure(run, p);
  }
}

/** Propostas paradas entram na pauta da Casa em que estão, em ordem de criação, enquanto houver vaga. */
function releaseParked(run: Run): void {
  for (const p of run.proposals) {
    if (p.status !== 'parada') continue;
    const policy = policyOf(run.ctx.content, p.policyId);
    const instrument = instrumentOf(policy);
    const session = sessionAt(instrument, p.stage);
    if (session === null || session.house === null) continue;
    const occupied = pautaOccupancy(run.proposals, session.house, run.ctx.content, p);
    if (occupied > 0 && occupied + pautaSlots(instrument, run.c) > run.c.capacidade_pauta) continue;
    enterSession(run, p, policy, p.stage, 'pauta_liberada', 'Vaga na pauta.');
  }
}

/** Apreciação dos vetos em sessão conjunta: derrubada exige maioria absoluta de cada Casa (CF art. 66 §4º). */
function runVetoSessions(run: Run): void {
  for (const p of run.proposals) {
    if (!p.veto || p.veto.overridden !== null || p.voteMonth === null || p.voteMonth > run.t) continue;
    const policy = policyOf(run.ctx.content, p.policyId);
    const kind = p.veto.kind;
    const state = votingState(run);
    const session: VoteResult[] = [];
    for (const stage of vetoPlan()) {
      const vote = voteWithSupport(
        state,
        stage,
        (bloc) => vetoOverrideSupport(state, policy, bloc, kind, run.ctx.content),
        run.ctx.content,
        run.ctx.rng,
      );
      session.push(vote);
      if (!vote.approved) break;
    }
    p.votes.push(...session);
    const overridden = session.every((v) => v.approved);
    p.veto.overridden = overridden;
    p.voteMonth = null;
    const placar = session.map((v) => `${HOUSE_NAME[v.house]} ${v.yes}/${v.no}`).join(', ');
    const what = kind === 'total' ? 'Veto' : 'Veto aos acréscimos';
    if (overridden) {
      addCapital(run, run.c.capital_veto_derrubado);
      if (kind === 'total') {
        pushTransition(run, p, 'em_execucao', 'veto_derrubado', `${what} derrubado (${placar}): a lei entra em vigor.`);
        startExecution(run, p, run.t + policy.timeline.planningMonths, p.scale);
        scheduleRider(run, p, run.t);
      } else {
        pushTransition(run, p, p.status, 'veto_derrubado', `${what} derrubado (${placar}): os acréscimos valem.`);
        scheduleRider(run, p, run.t);
      }
    } else {
      addCapital(run, run.c.capital_veto_mantido);
      const status = kind === 'total' ? 'vetada' : p.status;
      pushTransition(run, p, status, 'veto_mantido', `${what} mantido (${placar}).`);
    }
  }
}

/** Votações do mês, em ordem de criação (uma sessão por proposta: a Casa atual ou a sessão conjunta). */
function runVotes(run: Run): void {
  for (const p of run.proposals) {
    if (p.status !== 'em_tramitacao' || p.voteMonth === null || p.voteMonth > run.t) continue;
    const policy = policyOf(run.ctx.content, p.policyId);
    const instrument = instrumentOf(policy);
    const session = sessionAt(instrument, p.stage);
    if (session === null) continue;
    if (postponed(run, p, policy, instrument, session)) continue;
    rapporteurReport(run, p, policy, instrument);

    const state = votingState(run);
    const votes: VoteResult[] = [];
    for (const stage of session.stages) {
      const vote = voteStage(state, policy, stage, run.ctx.content, run.ctx.rng, p);
      votes.push(vote);
      if (!vote.approved) break;
    }
    p.votes.push(...votes);
    const last = votes[votes.length - 1];
    const failed = votes.find((v) => !v.approved);
    if (failed) {
      reject(run, p, instrument, failed);
    } else {
      const next = session.start + session.stages.length;
      const placar = votes.map((v) => voteLabel(v, instrument)).join(', ');
      if (next < votingPlan(instrument).length) {
        enterSession(run, p, policy, next, 'votacao', `Aprovada: ${placar}.`);
      } else {
        approve(run, p, policy, instrument, placar);
      }
    }
    if (last) adjustRelations(run, last);
  }
}

/**
 * Adiamentos antes da votação (POLITICAL_RULES.md §6.3): pauta trancada por MP com mais de 45 dias, presidente
 * da Casa com relação ruim e pedágio de emendas em votação difícil. Os dois últimos sorteiam e contam no
 * limite `max_adiamentos`; depois dele, a votação acontece.
 */
function postponed(run: Run, p: Proposal, policy: Policy, instrument: Instrument, session: Session): boolean {
  const c = run.c;
  const content = run.ctx.content;
  const house = session.house;
  const isMeasure = instrument === 'medida_provisoria';

  if (house !== null && !isMeasure) {
    const blocking = run.proposals.find(
      (q) =>
        q !== p &&
        q.status === 'em_tramitacao' &&
        run.t - q.createdMonth >= MP_TRANCA_MESES &&
        legislativeInstrument(policyOf(content, q.policyId)) === 'medida_provisoria' &&
        currentHouse(q, content) === house,
    );
    if (blocking) {
      delay(
        run,
        p,
        'pauta_trancada_mp',
        `Pauta ${house === 'camara' ? 'da Câmara' : 'do Senado'} trancada por medida provisória.`,
        false,
      );
      return true;
    }
  }
  if (p.postponements >= c.max_adiamentos) return false;

  const president = housePresident(content, house ?? 'senado');
  if (
    president &&
    (run.relations.get(president.id) ?? 0) < c.limiar_presidente_casa &&
    run.ctx.rng.chance(c.prob_nao_pautar)
  ) {
    const where = house === null ? 'do Congresso' : house === 'camara' ? 'da Câmara' : 'do Senado';
    delay(
      run,
      p,
      'presidente_nao_pautou',
      `A presidência ${where} (bloco ${president.name}) não pautou a votação.`,
      true,
    );
    return true;
  }

  if (
    !p.negotiation.amendments &&
    hardVote(run, p, policy, instrument, session) &&
    run.ctx.rng.chance(c.prob_adiamento_pedagio)
  ) {
    delay(run, p, 'pedagio_emendas', 'Os líderes adiaram a votação: cobram a liberação de emendas.', true);
    return true;
  }
  return false;
}

/** Votação difícil: quórum qualificado (PEC, PLP) ou "sim" esperado perto do exigido. */
function hardVote(run: Run, p: Proposal, policy: Policy, instrument: Instrument, session: Session): boolean {
  if (instrument === 'pec' || instrument === 'projeto_lei_complementar') return true;
  const state = votingState(run);
  return session.stages.some(
    (s) =>
      expectedYes(state, policy, s, run.ctx.content, p) <
      s.required + run.c.folga_votacao_dificil * houseTotal(s.house),
  );
}

function delay(run: Run, p: Proposal, cause: string, detail: string, counts: boolean): void {
  p.voteMonth = voteMonthFrom(run.state, run.t + UM_MES);
  if (counts) p.postponements += 1;
  pushTransition(run, p, p.status, cause, `${detail} Nova data: ${monthKey(p.voteMonth)}.`);
}

/**
 * Parecer do relator (uma vez por proposta): se o bloco do relator não apoia o texto, ele o altera (escala
 * menor, mais apoio de todos) e pode incluir acréscimos estranhos ao projeto. Na MP o projeto de conversão
 * não passa pela sanção no motor: o relator pode reduzir o texto, mas não inclui acréscimos.
 */
function rapporteurReport(run: Run, p: Proposal, policy: Policy, instrument: Instrument): void {
  if (p.textAltered || p.rapporteur === null) return;
  const bloc = run.ctx.content.scenario.blocs.find((b) => b.id === p.rapporteur);
  if (!bloc) return;
  const support = blocSupport(votingState(run), policy, bloc, run.ctx.content, p);
  if (support >= run.c.limiar_apoio) return;
  p.textAltered = true;
  p.scale *= run.c.escala_alterada;
  rescaleMeasure(run, p, policy, run.c.escala_alterada);
  let detail = `O relator (bloco ${bloc.name}) alterou o texto`;
  if (instrument !== 'medida_provisoria' && p.rider === 0 && run.ctx.rng.chance(riderChance(bloc, run.c))) {
    p.rider = run.c.custo_acrescimo;
    detail += ' e incluiu acréscimos estranhos ao projeto, com despesa extra';
  }
  pushTransition(run, p, p.status, 'parecer_relator', `${detail}.`);
}

function riderChance(bloc: Bloc, c: Calibration): number {
  return bloc.interests.includes(INTERESSE_EMENDAS) ? c.prob_acrescimo_emendas : c.prob_acrescimo;
}

function approve(run: Run, p: Proposal, policy: Policy, instrument: Instrument, placar: string): void {
  const alterado = p.scale < TEXTO_ORIGINAL;
  pushTransition(run, p, 'aprovada', 'votacao', `Aprovada: ${placar}${alterado ? ', com texto alterado' : ''}.`);
  addCapital(run, run.c.capital_vitoria);
  p.stage = votingPlan(instrument).length;
  p.rapporteur = null;

  if (instrument === 'medida_provisoria') {
    p.voteMonth = null;
    pushTransition(run, p, 'em_execucao', 'conversao_mp', 'Medida provisória convertida em lei.');
    return;
  }
  if (instrument === 'pec') {
    // CF art. 60 §3º: a emenda é promulgada pelas Mesas da Câmara e do Senado, sem sanção nem veto.
    p.voteMonth = null;
    pushTransition(run, p, 'em_execucao', 'promulgacao', 'Promulgada pelas Mesas do Congresso.');
    startExecution(run, p, run.t + SANCAO_MESES + policy.timeline.planningMonths, p.scale);
    scheduleRider(run, p, run.t);
    return;
  }
  p.voteMonth = run.t + SANCAO_MESES;
  const riderText = p.rider > 0 ? ' O texto traz acréscimos do relator, que podem ser vetados.' : '';
  pushTransition(
    run,
    p,
    'aguardando_sancao',
    'enviada_a_sancao',
    `Enviada à sanção: decida em ${monthKey(p.voteMonth)} (sem resposta, sanção tácita).${riderText}`,
  );
}

function reject(run: Run, p: Proposal, instrument: Instrument, failed: VoteResult): void {
  const casa = `${failed.house === 'camara' ? 'na' : 'no'} ${HOUSE_NAME[failed.house]}`;
  const turno = instrument === 'pec' ? ` (${failed.round}º turno)` : '';
  p.voteMonth = null;
  p.rapporteur = null;
  pushTransition(
    run,
    p,
    'rejeitada',
    'votacao',
    `Rejeitada ${casa}${turno}: ${failed.yes} votos de ${failed.required} necessários.`,
  );
  addCapital(run, run.c.capital_derrota);
  if (instrument === 'medida_provisoria') cancelMeasure(run, p);
}

/** MP rejeitada ou caducada perde a vigência: os efeitos futuros são cancelados e a execução termina agora. */
function cancelMeasure(run: Run, p: Proposal): void {
  const source = `proposta:${p.id}`;
  run.impulses = run.impulses
    .filter((i) => !(i.sourceId === source && i.startMonth > run.t))
    .map((i) => (i.sourceId === source && (i.endMonth === null || i.endMonth > run.t) ? { ...i, endMonth: run.t } : i));
  p.executionEnd = run.t;
  p.judicial = null;
}

/** "Câmara 320/193"; na PEC, com o turno. */
function voteLabel(v: VoteResult, instrument: Instrument): string {
  const turno = instrument === 'pec' ? ` (${v.round}º turno)` : '';
  return `${HOUSE_NAME[v.house]}${turno} ${v.yes}/${v.no}`;
}

/** Relação dos blocos: quem votou "sim" ganha, quem votou "não" perde (a última etapa votada). */
function adjustRelations(run: Run, vote: VoteResult): void {
  for (const bloc of run.ctx.content.scenario.blocs) {
    const voto = vote.blocs.find((b) => b.blocId === bloc.id);
    const delta = voto !== undefined && voto.yes > voto.no ? run.c.relacao_vitoria : run.c.relacao_derrota;
    shiftRelation(run, bloc.id, delta);
  }
}

function votingState(run: Run): GameState {
  return {
    ...run.state,
    resources: { ...run.state.resources, politicalCapital: run.capital },
    congress: {
      ...run.state.congress,
      blocs: Array.from(run.relations, ([id, governmentRelation]) => ({ id, governmentRelation })),
    },
  };
}

/** Ativa a execução: datas da proposta, impulsos agendados e riscos (atraso, sobrecusto, adesão, STF, escândalo). */
function startExecution(run: Run, p: Proposal, start: number, scale: number): void {
  const policy = policyOf(run.ctx.content, p.policyId);
  const schedule = scheduleImpulses(policy, p.id, start, scale, votingState(run), run.ctx);
  p.executionStart = start + schedule.delayMonths;
  // Fase 06 projects own their lifecycle and monthly disbursement. Keep the single risk/adhesion/STF draw,
  // but leave the proposal open until the explicit physical progress reaches 100%.
  p.executionEnd =
    policy.delivery === 'projeto'
      ? null
      : policy.timeline.executionMonths > 0
        ? p.executionStart + policy.timeline.executionMonths - 1
        : null;
  // Se a medida for derrubada, a data final passa a ser a da liminar no julgamento (`judicialTransitions`).
  p.judicial = schedule.judicial;
  p.adherents = schedule.adherents;
  // The explicit project ledger owns investment disbursement and capital stock. Preserve every other
  // scheduled channel from the single risk draw, including operating cost, approval and credibility effects.
  run.impulses.push(
    ...schedule.impulses.filter(
      (impulse) =>
        policy.delivery !== 'projeto' ||
        (impulse.target !== 'gasto.investimento' && impulse.target !== 'oferta.potencial'),
    ),
  );
  run.ctx.draft.notes.push(...schedule.notes);
  for (const r of schedule.riskEvents) pushTransition(run, p, p.status, r.cause, r.detail);
}

function isFiscal(target: ImpulseTarget): boolean {
  return target.startsWith('gasto.') || target.startsWith('receita.') || target === 'demanda.credito';
}

function isRevenue(target: ImpulseTarget): boolean {
  return target.startsWith('receita.');
}

/** Impulso de receita que começa antes do mínimo passa a começar no mínimo (o fim anda junto). */
function adiar(i: ScheduledImpulse, minimo: number): ScheduledImpulse {
  if (i.startMonth >= minimo) return i;
  const deslocamento = minimo - i.startMonth;
  return { ...i, startMonth: minimo, endMonth: i.endMonth === null ? null : i.endMonth + deslocamento };
}

/** Renúncia ou despesa obrigatória/transferência sem receita tributária compensatória (LRF). */
function semCompensacao(policy: Policy): boolean {
  const cria = policy.impacts.some(
    (i) =>
      i.magnitude > 0 &&
      (i.channel.startsWith('desoneracao_') ||
        i.channel.startsWith('transferencia_') ||
        i.channel === 'despesa_obrigatoria' ||
        i.channel === 'salario_minimo_real'),
  );
  return cria && !policy.impacts.some((i) => i.channel.startsWith('receita_'));
}

function clamp(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}
