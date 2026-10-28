import type { ScenarioElections } from '../../types/scenario';
import { canRunForReelection, currentAdministration, successorId } from '../administration/identity';
import { DECLARE_CANDIDACY_ACTION_ID, SUPPORT_CANDIDATE_ACTION_ID } from '../actions';
import { monthOfTerm, termOf } from '../calendar';
import { allRelations, blocRelation, RELACAO_ESCALA, shiftRelation } from '../congress/relations';
import type { Calibration } from '../economy/calibration';
import { activeImpulses } from '../impulses';
import { currentUfs, regionsOf } from '../regions/regions';
import type {
  Contribution,
  GameContent,
  GameState,
  Indicators,
  MonthStep,
  PoliticsState,
  ScheduledImpulse,
  StepContext,
} from '../types';

/**
 * Eleições (POLITICAL_RULES.md §11.2–11.3; FASE_08.md). `electionsStep` roda depois da opinião pública e antes
 * das regiões: a intenção de voto acompanha a aprovação e o clima do mês, o clima é a memória do eleitor (até
 * 12 meses), os meses de pleito saem no resultado (municipais e geral) e a contribuição de aprovação precisa
 * entrar antes da distribuição às UFs. A posse dos governadores eleitos sai em `governorTurnoverStep`, DEPOIS
 * das regiões — a evolução regional do próprio mês não pode puxar a relação recém-eleita (revisão do PR #9).
 * Sem o bloco `elections` do cenário as etapas são no-ops que não consomem sorteio algum: campanhas e saves
 * antigos continuam determinísticos.
 */

/** Meses guardados na memória do eleitor (`PoliticsState.memoria` guarda até 12 entradas). */
export const MEMORY_MONTHS = 12;

// As ações de agenda `declarar_reeleicao` e `apoiar_candidato` são registradas em `actions.ts` (dono dos ids);
// aqui vivem os efeitos sobre a intenção de voto e a relação do bloco apoiado. Reexportadas para conveniência.
export { DECLARE_CANDIDACY_ACTION_ID, SUPPORT_CANDIDATE_ACTION_ID };

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Estado eleitoral inicial (FASE_08.md): intenção na base, sem memória, sem declaração e sem apoio. */
function initialPolitics(c: Calibration): PoliticsState {
  return { votingIntention: clamp(c.int_base, c.int_min, c.int_max), memoria: [], declaracao: null, apoio: null };
}

/**
 * Intenção de voto atual na candidatura do governo: a do estado ou, antes do primeiro mês processado (o
 * `electionsStep` ainda não criou `politics`), a inicial. Usada pelo mapa eleitoral (PLANO_GLOBO.md §5.3).
 */
export function votingIntentionOf(state: Readonly<GameState>, c: Calibration): number {
  return (state.politics ?? initialPolitics(c)).votingIntention;
}

/**
 * Clima do eleitor no mês (−`mood_max`…`mood_max`): desvios *em nível*, em p.p., da inflação 12m contra a meta,
 * do desemprego contra o natural e do crescimento contra o potencial. Clima neutro = 0.
 */
export function moodOf(indicators: Indicators, c: Calibration): number {
  const raw =
    100 *
    (c.mood_fator_renda * (indicators.gdpGrowth12m - c.g_pot_base) -
      c.mood_fator_inflacao * (indicators.inflation12m - c.meta_inflacao) -
      c.mood_fator_desemprego * (indicators.unemployment - c.nairu));
  return clamp(raw, -c.mood_max, c.mood_max);
}

/** Média ponderada da memória (antigo→novo): os `janela_memoria` meses mais recentes pesam `peso_memoria_recente`. */
export function weightedMemory(memory: readonly number[], c: Calibration): number {
  if (memory.length === 0) return 0;
  let weighted = 0;
  let total = 0;
  memory.forEach((mood, i) => {
    const weight = memory.length - i <= c.janela_memoria ? c.peso_memoria_recente : 1;
    weighted += weight * mood;
    total += weight;
  });
  return weighted / total;
}

/** A declaração da candidatura pertence à janela do mandato corrente? (a janela é em meses do mandato). */
export function declarationInTermWindow(
  declaration: number,
  monthIndex: number,
  elections: ScenarioElections,
): boolean {
  const month = monthOfTerm(declaration);
  return (
    termOf(declaration) === termOf(monthIndex) &&
    month >= elections.janelaDeclaracao.inicio &&
    month <= elections.janelaDeclaracao.fim
  );
}

/** Fração das cadeiras da Câmara em blocos de oposição (relação < `limiar_alianca`). */
function oppositionSeatShare(state: Readonly<GameState>, content: GameContent): number {
  const total = content.scenario.blocs.reduce((s, b) => s + b.chamberSeats, 0);
  if (total <= 0) return content.calibration.eleicao_opo_base_seats;
  const seats = content.scenario.blocs.reduce(
    (s, b) => (blocRelation(state, b) < content.calibration.limiar_alianca ? s + b.chamberSeats : s),
    0,
  );
  return seats / total;
}

/** Relação média com o Congresso, ponderada pelas cadeiras da Câmara (recuperação no 2º turno). */
function meanCongressRelation(state: Readonly<GameState>, content: GameContent): number {
  const total = content.scenario.blocs.reduce((s, b) => s + b.chamberSeats, 0);
  if (total <= 0) return 0;
  return content.scenario.blocs.reduce((s, b) => s + blocRelation(state, b) * b.chamberSeats, 0) / total;
}

/** Chance de troca de dono do governo estadual na eleição geral: o aliado se protege, o hostil cai. */
function governorTurnoverChance(relation: number, c: Calibration): number {
  const chance = c.governador_turnover_base - c.governador_peso_relacao * relation;
  return clamp(chance, c.governador_turnover_min, c.governador_turnover_max);
}

/** Impulso único da declaração de candidatura (FASE_08.md: +`declaracao_intencao` no mês da declaração). */
function declarationImpulse(monthIndex: number, c: Calibration): ScheduledImpulse {
  return {
    sourceId: `acao:${DECLARE_CANDIDACY_ACTION_ID}_${monthIndex}`,
    label: 'Declaração de candidatura',
    target: 'intencao',
    delta: c.declaracao_intencao,
    startMonth: monthIndex,
    endMonth: monthIndex,
  };
}

/**
 * Eleição geral do mês (FASE_08.md): candidata quem declarou na janela do mandato, se a reeleição é permitida e
 * o mandato é o primeiro; sem candidatura, o sucessor apoiado herda `fator_sucessao` × intenção do governo.
 * Vitória no 1º turno se a votação (+ ruído) passa de 0,5; senão um 2º turno no mesmo passo contra a oposição,
 * com recuperação proporcional à relação média com o Congresso. Depois, renova o Congresso (deslocamento
 * sorteado das relações por bloco); a troca de governos estaduais sai em `governorTurnoverStep`, depois das
 * regiões (contrato de ordem em `DEFAULT_STEPS`, revisão do PR #9).
 */
function generalElectionMonth(
  state: GameState,
  elections: ScenarioElections,
  ctx: StepContext,
  memory: number,
): GameState {
  const c = ctx.content.calibration;
  const t = state.monthIndex;
  const politics = state.politics ?? initialPolitics(c);
  const declared = politics.declaracao !== null && declarationInTermWindow(politics.declaracao, t, elections);
  const candidatura = declared && elections.reeleicaoPermitida && canRunForReelection(state);
  const governmentVote = candidatura ? politics.votingIntention : c.fator_sucessao * politics.votingIntention;

  const vote1 = governmentVote + c.eleicao_ruido_primeiro_turno * ctx.rng.normal();
  let turno2 = false;
  let venceu = vote1 > c.eleicao_vitoria_primeiro_turno;
  let secondRound: { vote2: number; opponent: number } | null = null;
  if (!venceu) {
    turno2 = true;
    const opponent = clamp(
      c.eleicao_opo_base +
        c.eleicao_opo_peso_seats * (oppositionSeatShare(state, ctx.content) - c.eleicao_opo_base_seats) -
        c.eleicao_opo_peso_memoria * memory,
      c.eleicao_opo_min,
      c.eleicao_opo_max,
    );
    const vote2 =
      governmentVote +
      c.turno2_peso_relacao * (meanCongressRelation(state, ctx.content) / RELACAO_ESCALA) +
      c.turno2_ruido * ctx.rng.normal();
    venceu = vote2 > opponent;
    secondRound = { vote2, opponent };
  }
  // A votação sorteada vai para o relatório: é a entrada do resultado simulado por UF (`electionResultStep`).
  ctx.draft.electionVote = { vote1, ...secondRound, venceu };

  // Renovação do Congresso: relações deslocadas por bloco (as cadeiras por bloco continuam as do cenário).
  let blocs = allRelations(state, ctx.content);
  for (const bloc of ctx.content.scenario.blocs) {
    blocs = shiftRelation(blocs, bloc.id, c.renovacao_amplitude * (2 * ctx.rng.float() - 1));
  }

  // Identidade de quem venceu (EX-15/EX-16): o apoio é consumido agora, então o vencedor é gravado na eleição.
  const current = currentAdministration(state, ctx.content);
  const winnerId = venceu
    ? candidatura
      ? current.presidentId
      : successorId(politics.apoio ?? current.blocId)
    : undefined;
  const winnerBlocId = venceu ? (candidatura ? current.blocId : (politics.apoio ?? current.blocId)) : undefined;

  return {
    ...state,
    congress: { ...state.congress, blocs },
    // A campanha terminou: o apoio à sucessão é consumido pela eleição (um novo apoio por campanha).
    politics: {
      ...politics,
      apoio: null,
      eleicao_geral: {
        monthIndex: t,
        candidatura,
        venceu,
        turno2,
        ...(winnerId ? { winnerId, winnerBlocId } : {}),
      },
    },
  };
}

/**
 * Etapa eleitoral do mês (FASE_08.md). As contribuições de intenção usam o pseudo-indicador
 * `'votingIntention'` (report-only): só a explicação do mês as vê.
 */
export const electionsStep: MonthStep = (state, ctx) => {
  const elections = ctx.content.scenario.elections;
  if (!elections) return { state, contributions: [] };
  const c = ctx.content.calibration;
  const t = state.monthIndex;
  const contributions: Contribution[] = [];

  // 1. Ações aceitas no mês: declaração de candidatura (impulso único) e apoio a um bloco (relação imediata).
  let politics = state.politics ?? initialPolitics(c);
  let impulses = state.impulses;
  let next: GameState = state;
  for (const decision of ctx.decisions) {
    if (decision.policyId === DECLARE_CANDIDACY_ACTION_ID && politics.declaracao === null) {
      politics = { ...politics, declaracao: t };
      impulses = [...impulses, declarationImpulse(t, c)];
    } else if (decision.policyId === SUPPORT_CANDIDATE_ACTION_ID && typeof decision.params?.blocId === 'string') {
      const blocs = allRelations(next, ctx.content);
      next = {
        ...next,
        congress: { ...next.congress, blocs: shiftRelation(blocs, decision.params.blocId, c.apoio_relacao_candidato) },
      };
      politics = { ...politics, apoio: decision.params.blocId };
    }
  }

  // 2. Clima do mês, memória do eleitor e dinâmica da intenção de voto (desliza para o alvo + impulsos).
  const mood = moodOf(state.indicators, c);
  const memoria = [...politics.memoria, mood].slice(-MEMORY_MONTHS);
  const memory = weightedMemory(memoria, c);
  const parts = [
    {
      cause: 'tendencia_intencao',
      label: 'Retorno ao nível habitual',
      delta: c.ajuste_intencao * (c.int_base - politics.votingIntention),
    },
    {
      cause: 'aprovacao',
      label: 'Aprovação do governo',
      delta: c.ajuste_intencao * c.int_peso_aprovacao * (state.indicators.approval - c.aprovacao_base),
    },
    { cause: 'memoria_eleitor', label: 'Memória do eleitor', delta: c.ajuste_intencao * c.int_peso_memoria * memory },
    ...activeImpulses(impulses, t, ['intencao']).map((impulse) => ({
      cause: impulse.sourceId,
      label: impulse.label,
      delta: impulse.delta,
    })),
  ].filter((part) => part.delta !== 0);
  const wanted = politics.votingIntention + parts.reduce((s, part) => s + part.delta, 0);
  const votingIntention = clamp(wanted, c.int_min, c.int_max);
  for (const part of parts) contributions.push({ indicator: 'votingIntention', ...part });
  if (votingIntention !== wanted) {
    contributions.push({
      indicator: 'votingIntention',
      cause: 'saturacao',
      label: 'Limite da intenção de voto',
      delta: votingIntention - wanted,
    });
  }
  politics = { ...politics, memoria, votingIntention };

  // 3. Eleição municipal: o ano eleitoral rende aprovação ao governo, proporcional ao clima do ano.
  if (monthOfTerm(t) === elections.mesEleicaoMunicipal) {
    contributions.push({
      indicator: 'approval',
      cause: 'municipais',
      label: 'Eleições municipais',
      delta: c.municipais_efeito * memory,
    });
    politics = { ...politics, eleicao_municipal: { monthIndex: t } };
  }

  next = { ...next, politics, impulses };

  // 4. Eleição geral: candidatura, 1º/2º turno no mesmo passo e renovação do Congresso.
  if (monthOfTerm(t) === elections.mesEleicaoGeral) next = generalElectionMonth(next, elections, ctx, memory);

  return { state: next, contributions };
};

/**
 * Posse dos governadores eleitos (FASE_08.md): no mês da eleição geral, cada UF sorteia a troca de dono
 * (chance que cai com a relação) e o novo governador parte de `governador_nova_relacao`; os demais mantêm a
 * relação. Roda DEPOIS de `regionsStep` no `DEFAULT_STEPS` para que a evolução regional do próprio mês não
 * puxe a relação recém-eleita (revisão do PR #9).
 */
export const governorTurnoverStep: MonthStep = (state, ctx) => {
  const elections = ctx.content.scenario.elections;
  if (!elections || monthOfTerm(state.monthIndex) !== elections.mesEleicaoGeral) return { state, contributions: [] };
  if (regionsOf(ctx.content).length === 0) return { state, contributions: [] };
  const c = ctx.content.calibration;
  // As UFs que trocaram de dono vão para o relatório (o resultado por UF as mostra à parte do voto presidencial).
  const changed: string[] = [];
  const ufs = currentUfs(state, ctx.content).map((uf) => {
    if (!ctx.rng.chance(governorTurnoverChance(uf.governorRelation, c))) return { ...uf };
    changed.push(uf.id);
    return { ...uf, governorRelation: c.governador_nova_relacao };
  });
  ctx.draft.governorChanges = changed;
  return { state: { ...state, regions: { ufs } }, contributions: [] };
};
