import { monthKey } from '../calendar';
import { blocRelation, legislativeInstrument, voteStage, votingPlan } from '../congress/congress';
import type { VoteStage } from '../congress/congress';
import type { Calibration } from '../economy/calibration';
import { nominalGdpMillions } from '../state';
import type { Instrument, Policy } from '../../types/policy';
import type {
  GameContent,
  GameState,
  ImpulseTarget,
  MonthStep,
  Proposal,
  ProposalStatus,
  ProposalTransition,
  ScheduledImpulse,
  StepContext,
  VoteResult,
} from '../types';

/**
 * Ciclo de vida das propostas (GAME_DESIGN.md §9): envio, tramitação, votação, sanção, execução e conclusão.
 * Função pura: copia tudo o que altera e não muta o `state` recebido.
 */

/** Meses em um ano; o mês de índice múltiplo de 12 é janeiro, recesso do Congresso (POLITICAL_RULES.md §3.3). */
const MESES_POR_ANO = 12;
/** Noventena (CF art. 150 III, c): 90 dias, tratados como 3 meses no motor. */
const NOVENTENA_MESES = 3;
/** Uma proposta enviada leva pelo menos um mês até a votação. */
const TRAMITACAO_MINIMA_MESES = 1;
/** A sanção ocorre no mês seguinte à aprovação final (POLITICAL_RULES.md §7). */
const SANCAO_MESES = 1;
/** Escala do capital político (GAME_DESIGN.md §5). */
const CAPITAL_MIN = 0;
const CAPITAL_MAX = 100;
/** Escala da relação dos blocos com o governo (POLITICAL_RULES.md §6.1). */
const RELACAO_MIN = -100;
const RELACAO_MAX = 100;
/** Fração do texto que sobrevive quando a proposta não foi alterada. */
const TEXTO_ORIGINAL = 1;

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
  /** Ocorrências de risco (atraso, sobrecusto, baixa adesão), com causa e texto para o jogador. */
  riskEvents: { cause: string; detail: string }[];
  /** Meses de atraso sorteados; já aplicados aos impulsos devolvidos. */
  delayMonths: number;
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
    relations: new Map(state.congress.blocs.map((b): [string, number] => [b.id, b.governmentRelation])),
  };

  concludeExecutions(run);
  for (const decision of ctx.decisions) sendPolicy(run, decision.policyId);
  releaseParked(run);
  runVotes(run);

  const blocs = ctx.content.scenario.blocs.map((bloc) => ({
    id: bloc.id,
    governmentRelation: run.relations.get(bloc.id) ?? blocRelation(state, bloc),
  }));
  return {
    state: {
      ...state,
      resources: { ...state.resources, politicalCapital: run.capital },
      congress: { blocs },
      proposals: run.proposals,
      impulses: run.impulses,
    },
    contributions: [],
  };
};

/**
 * Agenda os efeitos de uma política executada a partir de `start` (ECONOMIC_MODEL.md §5.11). Condições
 * (POLITICAL_RULES.md §1.1) não se aplicam no Casual; riscos sim. Sorteia exatamente um `chance` por risco.
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
  const gdp = nominalGdpMillions(ctx.content);
  const sourceId = `proposta:${proposalId}`;
  const { executionMonths } = policy.timeline;
  const notes: string[] = [];
  const riskEvents: { cause: string; detail: string }[] = [];
  let impulses: ScheduledImpulse[] = [];

  for (const impact of policy.impacts) {
    const target = IMPULSE_TARGET[impact.channel];
    const startMonth = start + impact.lagMonths;
    const common = { sourceId, label: policy.name, target };
    if (isFiscal(target)) {
      const endMonth = executionMonths > 0 ? startMonth + executionMonths - 1 : null;
      impulses.push({ ...common, delta: (impact.magnitude / gdp) * scale, startMonth, endMonth });
    } else if (target === 'oferta.potencial') {
      impulses.push({ ...common, delta: impact.magnitude * scale, startMonth, endMonth: null });
    } else {
      // aprovacao e credibilidade: efeito de um único mês.
      impulses.push({ ...common, delta: impact.magnitude * scale, startMonth, endMonth: startMonth });
    }
  }

  if (state.difficulty !== 'casual') {
    if (policy.conditions.includes('anterioridade_anual')) {
      const proximoJaneiro = (Math.floor(t / MESES_POR_ANO) + 1) * MESES_POR_ANO;
      impulses = impulses.map((i) => (isRevenue(i.target) ? adiar(i, proximoJaneiro) : i));
    }
    if (policy.conditions.includes('noventena')) {
      impulses = impulses.map((i) => (isRevenue(i.target) ? adiar(i, t + NOVENTENA_MESES) : i));
    }
    if (policy.conditions.includes('espaco_no_limite_de_despesas')) {
      const gastoAdicional = impulses
        .filter((i) => i.target.startsWith('gasto.') && i.delta > 0)
        .reduce((soma, i) => soma + i.delta, 0);
      if (state.economy.primarySpending + gastoAdicional > c.limite_despesa) {
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
  for (const risk of policy.risks) {
    const ocorreu = ctx.rng.chance(risk.probability);
    if (risk.kind === 'atraso' && ocorreu) {
      const atraso = ctx.rng.int(c.atraso_min_meses, c.atraso_max_meses);
      delayMonths += atraso;
      riskEvents.push({ cause: 'atraso_execucao', detail: `Atraso de ${atraso} meses na execução.` });
    } else if (risk.kind === 'sobrecusto' && ocorreu) {
      impulses = impulses.map((i) =>
        i.target.startsWith('gasto.') ? { ...i, delta: i.delta * c.fator_sobrecusto } : i,
      );
      riskEvents.push({ cause: 'sobrecusto', detail: 'Sobrecusto: a execução custa acima do previsto.' });
    } else if (risk.kind === 'baixa_adesao' && ocorreu) {
      impulses = impulses.map((i) =>
        isFiscal(i.target) || i.target === 'oferta.potencial' ? { ...i, delta: i.delta * c.fator_baixa_adesao } : i,
      );
      riskEvents.push({ cause: 'baixa_adesao', detail: 'Baixa adesão: o efeito fica abaixo do previsto.' });
    }
    // 'judicializacao' e 'escandalo' não são modelados nesta etapa. O sorteio acima é feito mesmo assim,
    // para que a sequência do gerador não mude quando esses riscos forem implementados.
  }

  if (delayMonths > 0) {
    impulses = impulses.map((i) => ({
      ...i,
      startMonth: i.startMonth + delayMonths,
      endMonth: i.endMonth === null ? null : i.endMonth + delayMonths,
    }));
  }

  return { impulses, notes, riskEvents, delayMonths };
}

function copyProposal(p: Proposal): Proposal {
  return { ...p, votes: [...p.votes], history: [...p.history] };
}

function policyOf(content: GameContent, policyId: string): Policy {
  const policy = content.policies[policyId];
  if (!policy) throw new RangeError(`política desconhecida: ${policyId}`);
  return policy;
}

function countInProgress(run: Run): number {
  return run.proposals.filter((p) => p.status === 'em_tramitacao').length;
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

/** Janeiro é recesso (fora do Casual): a votação passa para fevereiro (POLITICAL_RULES.md §3.3). */
function voteMonthFrom(state: Readonly<GameState>, m: number): number {
  return state.difficulty !== 'casual' && m % MESES_POR_ANO === 0 ? m + 1 : m;
}

/** A etapa A: execuções que terminaram antes deste mês. */
function concludeExecutions(run: Run): void {
  for (const p of run.proposals) {
    if (p.status === 'em_execucao' && p.executionEnd !== null && p.executionEnd < run.t) {
      pushTransition(run, p, 'concluida', 'execucao_concluida', 'Execução concluída.');
    }
  }
}

/** A etapa B: decisões aceitas neste mês. */
function sendPolicy(run: Run, policyId: string): void {
  const policy = policyOf(run.ctx.content, policyId);
  const p: Proposal = {
    id: `${policyId}_${run.t}`,
    policyId,
    createdMonth: run.t,
    status: 'em_tramitacao', // substituído pela primeira transição, antes de qualquer contagem
    scale: TEXTO_ORIGINAL,
    voteMonth: null,
    executionStart: null,
    executionEnd: null,
    votes: [],
    history: [],
  };

  const instrument = legislativeInstrument(policy);
  if (instrument === null) {
    const start = run.t + policy.timeline.planningMonths;
    run.proposals.push(p);
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

  if (countInProgress(run) >= run.c.capacidade_pauta) {
    run.proposals.push(p);
    pushTransition(run, p, 'parada', 'capacidade_pauta', 'Pauta do Congresso cheia: aguarda vaga.');
    return;
  }

  const voteMonth = voteMonthFrom(
    run.state,
    run.t + Math.max(TRAMITACAO_MINIMA_MESES, policy.timeline.expectedLegislativeMonths),
  );
  p.voteMonth = voteMonth;
  run.proposals.push(p);
  pushTransition(
    run,
    p,
    'em_tramitacao',
    'enviada',
    `Enviada ao Congresso; votação prevista para ${monthKey(voteMonth)}.`,
  );
  // Medida provisória tem força de lei desde a edição (CF art. 62).
  if (instrument === 'medida_provisoria') startExecution(run, p, run.t, TEXTO_ORIGINAL);
}

/** A etapa C: propostas paradas entram na pauta, em ordem de criação, enquanto houver vaga. */
function releaseParked(run: Run): void {
  for (const p of run.proposals) {
    if (p.status !== 'parada') continue;
    if (countInProgress(run) >= run.c.capacidade_pauta) break;
    const policy = policyOf(run.ctx.content, p.policyId);
    const voteMonth = voteMonthFrom(
      run.state,
      run.t + Math.max(TRAMITACAO_MINIMA_MESES, policy.timeline.expectedLegislativeMonths),
    );
    p.voteMonth = voteMonth;
    pushTransition(
      run,
      p,
      'em_tramitacao',
      'pauta_liberada',
      `Vaga na pauta: votação prevista para ${monthKey(voteMonth)}.`,
    );
  }
}

/** A etapa D: votações do mês, em ordem de criação. */
function runVotes(run: Run): void {
  for (const p of run.proposals) {
    if (p.status !== 'em_tramitacao' || p.voteMonth === null || p.voteMonth > run.t) continue;
    const policy = policyOf(run.ctx.content, p.policyId);
    const instrument = legislativeInstrument(policy);
    if (instrument === null) continue;

    const stages = votingPlan(instrument);
    const session = voteSession(run, policy, stages);
    p.votes.push(...session);
    const last = session[session.length - 1];
    const failed = session.find((v) => !v.approved);
    if (failed) {
      reject(run, p, instrument, stages, failed);
    } else {
      approve(run, p, policy, instrument, stages, session);
    }
    adjustRelations(run, last);
  }
}

/** Vota as etapas na ordem; para na primeira etapa reprovada. Relações não mudam no meio da sessão. */
function voteSession(run: Run, policy: Policy, stages: readonly VoteStage[]): VoteResult[] {
  const state = votingState(run);
  const session: VoteResult[] = [];
  for (const stage of stages) {
    const vote = voteStage(state, policy, stage, run.ctx.content, run.ctx.rng);
    session.push(vote);
    if (!vote.approved) break;
  }
  return session;
}

function approve(
  run: Run,
  p: Proposal,
  policy: Policy,
  instrument: Instrument,
  stages: readonly VoteStage[],
  session: readonly VoteResult[],
): void {
  // Aprovado por pouca folga: o relator alterou o texto (POLITICAL_RULES.md §3).
  const alterado = session.some((v) => v.yes - v.required < run.c.margem_alteracao * (v.yes + v.no));
  const scale = alterado ? run.c.escala_alterada : TEXTO_ORIGINAL;
  p.scale = scale;
  const placar = session.map((v) => `${casaLabel(v, stages)} ${v.yes}/${v.no}`).join(', ');
  pushTransition(run, p, 'aprovada', 'votacao', `Aprovada: ${placar}${alterado ? ' com alterações do relator' : ''}.`);
  addCapital(run, run.c.capital_vitoria);

  if (instrument === 'medida_provisoria') {
    pushTransition(run, p, 'em_execucao', 'conversao_mp', 'Medida provisória convertida em lei.');
  } else {
    pushTransition(run, p, 'em_execucao', 'sancao', 'Sancionada.');
    startExecution(run, p, run.t + SANCAO_MESES + policy.timeline.planningMonths, scale);
  }
}

function reject(run: Run, p: Proposal, instrument: Instrument, stages: readonly VoteStage[], failed: VoteResult): void {
  pushTransition(
    run,
    p,
    'rejeitada',
    'votacao',
    `Rejeitada ${casaLabel(failed, stages, true)}: ${failed.yes} votos de ${failed.required} necessários.`,
  );
  addCapital(run, run.c.capital_derrota);
  if (instrument === 'medida_provisoria') {
    // MP rejeitada perde a vigência: os efeitos futuros são cancelados e a execução termina agora.
    const source = `proposta:${p.id}`;
    run.impulses = run.impulses
      .filter((i) => !(i.sourceId === source && i.startMonth > run.t))
      .map((i) =>
        i.sourceId === source && (i.endMonth === null || i.endMonth > run.t) ? { ...i, endMonth: run.t } : i,
      );
    p.executionEnd = run.t;
  }
}

/** Rótulo da Casa e, se houver turnos, do turno (PEC). `withPreposition`: "na Câmara" / "no Senado". */
function casaLabel(v: VoteResult, stages: readonly VoteStage[], withPreposition = false): string {
  const name = v.house === 'camara' ? 'Câmara' : 'Senado';
  const casa = withPreposition ? `${v.house === 'camara' ? 'na' : 'no'} ${name}` : name;
  return stages.some((s) => s.round > 1) ? `${casa} (${v.round}º turno)` : casa;
}

/** Relação dos blocos: quem votou "sim" ganha, quem votou "não" perde (a última etapa votada). */
function adjustRelations(run: Run, vote: VoteResult): void {
  for (const bloc of run.ctx.content.scenario.blocs) {
    const voto = vote.blocs.find((b) => b.blocId === bloc.id);
    const delta = voto !== undefined && voto.yes > voto.no ? run.c.relacao_vitoria : run.c.relacao_derrota;
    const atual = run.relations.get(bloc.id) ?? blocRelation(run.state, bloc);
    run.relations.set(bloc.id, clamp(atual + delta, RELACAO_MIN, RELACAO_MAX));
  }
}

function votingState(run: Run): GameState {
  return {
    ...run.state,
    congress: { blocs: Array.from(run.relations, ([id, governmentRelation]) => ({ id, governmentRelation })) },
  };
}

/** Ativa a execução: datas da proposta, impulsos agendados e riscos (atraso, sobrecusto, baixa adesão). */
function startExecution(run: Run, p: Proposal, start: number, scale: number): void {
  const policy = policyOf(run.ctx.content, p.policyId);
  const schedule = scheduleImpulses(policy, p.id, start, scale, run.state, run.ctx);
  p.executionStart = start + schedule.delayMonths;
  p.executionEnd = policy.timeline.executionMonths > 0 ? p.executionStart + policy.timeline.executionMonths - 1 : null;
  run.impulses.push(...schedule.impulses);
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
        i.channel === 'despesa_obrigatoria'),
  );
  return cria && !policy.impacts.some((i) => i.channel === 'receita_tributaria');
}

function clamp(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}
