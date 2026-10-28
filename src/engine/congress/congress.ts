import { LEGISLATIVE_INSTRUMENTS } from '../../types/policy';
import type { Instrument, Policy } from '../../types/policy';
import { CHAMBER_SEATS, SENATE_SEATS } from '../../types/scenario';
import type { Bloc } from '../../types/scenario';
import { CHALLENGE_CALIBRATION } from '../campaignConfig';
import type { Calibration } from '../economy/calibration';
import { sumActive } from '../impulses';
import type { Rng } from '../rng';
import type { GameContent, GameState, House, MonthStep, Proposal, VetoKind, VoteResult } from '../types';

import { cabinetSupport } from './cabinet';
import { blocRelation, RELACAO_ESCALA, RELACAO_MAX, RELACAO_MIN } from './relations';

export { blocRelation } from './relations';

/**
 * Congresso em blocos (POLITICAL_RULES.md §3, §6). Simplificação: todos presentes, só "sim" e "não".
 * Com todos presentes, a maioria absoluta de cada Casa (257 / 41) é também a maioria dos presentes.
 * A Câmara vota antes do Senado; PLN e vetos são votados em sessão conjunta (contados por Casa).
 */

export interface VoteStage {
  house: House;
  round: number;
  /** Votos "sim" exigidos nesta etapa. */
  required: number;
}

export interface VotePrediction extends VoteStage {
  /** Votos "sim" esperados, sem sorteio. */
  expectedYes: number;
  total: number;
}

/**
 * Sessão de votação: etapas votadas no mesmo mês. `house` é a Casa que controla a pauta; `null` = sessão
 * conjunta do Congresso (PLN pela Comissão Mista de Orçamento, CF art. 166; não ocupa a pauta das Casas).
 */
export interface Session {
  house: House | null;
  /** Índice da primeira etapa da sessão em `votingPlan`. */
  start: number;
  stages: VoteStage[];
}

/**
 * Quóruns constitucionais como fração das cadeiras da Casa (regra legal, não coeficiente do motor).
 * - `mais_da_metade`: mais da metade das cadeiras (maioria absoluta: CF art. 69 para PLP; art. 66 §4º para veto).
 * - `ao_menos`: pelo menos a fração indicada (CF art. 60 §2º: três quintos dos membros, em cada turno de cada Casa).
 */
const QUORUM = {
  maioria_absoluta: { numerador: 1, denominador: 2, tipo: 'mais_da_metade' },
  tres_quintos: { numerador: 3, denominador: 5, tipo: 'ao_menos' },
} as const;

type Quorum = (typeof QUORUM)[keyof typeof QUORUM];

/** Maior distância ideológica possível: 2 em cada eixo (−1 … 1). */
const DISTANCIA_IDEOLOGICA_MAXIMA = 4;
/** Aprovação neutra no cálculo de apoio (fração). */
const APROVACAO_NEUTRA = 0.5;
/** Interesse dos blocos que cobram emendas (cenário: `interests`). */
export const INTERESSE_EMENDAS = 'emendas';

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Maioria absoluta do Senado (CF art. 101: aprovação de ministro do STF). */
export const SENATE_ABSOLUTE_MAJORITY = Math.floor(SENATE_SEATS / 2) + 1;

function requiredVotes(seats: number, quorum: Quorum): number {
  const exact = (seats * quorum.numerador) / quorum.denominador;
  return quorum.tipo === 'ao_menos' ? Math.ceil(exact) : Math.floor(exact) + 1;
}

export function seatsOf(bloc: Bloc, house: House): number {
  return house === 'camara' ? bloc.chamberSeats : bloc.senateSeats;
}

export function houseTotal(house: House): number {
  return house === 'camara' ? CHAMBER_SEATS : SENATE_SEATS;
}

/** Primeiro instrumento legislativo da política, ou `null` se ela é só ato do Executivo. */
export function legislativeInstrument(policy: Policy): Instrument | null {
  return policy.instruments.find((i) => LEGISLATIVE_INSTRUMENTS.includes(i)) ?? null;
}

const bothHouses = (quorum: Quorum): VoteStage[] => [
  { house: 'camara', round: 1, required: requiredVotes(CHAMBER_SEATS, quorum) },
  { house: 'senado', round: 1, required: requiredVotes(SENATE_SEATS, quorum) },
];

/** Etapas de votação do instrumento, na ordem (Câmara antes do Senado). */
export function votingPlan(instrument: Instrument): VoteStage[] {
  switch (instrument) {
    // POLITICAL_RULES.md §3: PL, MP e PLN por maioria. PLN é votado em sessão conjunta, contado por Casa.
    case 'projeto_lei':
    case 'medida_provisoria':
    case 'pln':
      return bothHouses(QUORUM.maioria_absoluta);
    // POLITICAL_RULES.md §3: PLP por maioria absoluta (CF art. 69): 257 / 41.
    case 'projeto_lei_complementar':
      return bothHouses(QUORUM.maioria_absoluta);
    // POLITICAL_RULES.md §3: PEC por 3/5 em dois turnos em cada Casa (CF art. 60 §2º): 308 / 49.
    case 'pec':
      return [
        { house: 'camara', round: 1, required: requiredVotes(CHAMBER_SEATS, QUORUM.tres_quintos) },
        { house: 'camara', round: 2, required: requiredVotes(CHAMBER_SEATS, QUORUM.tres_quintos) },
        { house: 'senado', round: 1, required: requiredVotes(SENATE_SEATS, QUORUM.tres_quintos) },
        { house: 'senado', round: 2, required: requiredVotes(SENATE_SEATS, QUORUM.tres_quintos) },
      ];
    default:
      throw new RangeError(`instrumento sem votação no Congresso: ${instrument}`);
  }
}

/** Etapas de derrubada de veto: maioria absoluta de cada Casa em sessão conjunta (CF art. 66 §4º). */
export function vetoPlan(): VoteStage[] {
  return bothHouses(QUORUM.maioria_absoluta);
}

/**
 * Sessões de votação do instrumento (POLITICAL_RULES.md §6.4): uma por Casa, com os dois turnos da PEC no
 * mesmo mês (o interstício de 5 sessões cabe no turno mensal); PLN numa única sessão conjunta.
 */
export function sessionsOf(instrument: Instrument): Session[] {
  const plan = votingPlan(instrument);
  if (instrument === 'pln') return [{ house: null, start: 0, stages: plan }];
  const sessions: Session[] = [];
  plan.forEach((stage, index) => {
    const last = sessions[sessions.length - 1];
    if (last && last.house === stage.house) last.stages.push(stage);
    else sessions.push({ house: stage.house, start: index, stages: [stage] });
  });
  return sessions;
}

/** Sessão que contém a etapa `stage` (ou `null` se a proposta já passou por todas). */
export function sessionAt(instrument: Instrument, stage: number): Session | null {
  return sessionsOf(instrument).find((s) => stage >= s.start && stage < s.start + s.stages.length) ?? null;
}

/** Bloco que preside a Casa: o do cenário ou, sem ele, o maior bloco da Casa. */
export function housePresident(content: GameContent, house: House): Bloc | null {
  const blocs = content.scenario.blocs;
  const id = content.scenario.institutions?.housePresidents[house];
  const named = id === undefined ? undefined : blocs.find((b) => b.id === id);
  if (named) return named;
  return blocs.reduce<Bloc | null>((a, b) => (a === null || seatsOf(b, house) > seatsOf(a, house) ? b : a), null);
}

function ideologicalAffinity(bloc: Bloc, policy: Policy): number {
  const distance =
    Math.abs(bloc.ideology.economic - policy.position.economic) +
    Math.abs(bloc.ideology.social - policy.position.social);
  return 1 - distance / DISTANCIA_IDEOLOGICA_MAXIMA;
}

/** Parcela ideológica do apoio (−w_ideo … w_ideo): negativa = o bloco é contrário à política. */
export function ideologicalSupport(policy: Policy, bloc: Bloc, c: Calibration): number {
  return c.w_ideo * (2 * ideologicalAffinity(bloc, policy) - 1);
}

/** Apoio extra da negociação e do texto da proposta (POLITICAL_RULES.md §6.2: contrapartidas). */
export function negotiatedSupport(proposal: Proposal | undefined, bloc: Bloc, c: Calibration): number {
  if (!proposal) return 0;
  const n = proposal.negotiation;
  let support = n.blocs[bloc.id] ?? 0;
  if (n.amendments) {
    support += c.apoio_emendas + (bloc.interests.includes(INTERESSE_EMENDAS) ? c.apoio_emendas_interesse : 0);
  }
  if (n.textConceded) support += c.apoio_concessao;
  if (proposal.textAltered) support += c.bonus_texto_alterado;
  return support;
}

/**
 * Apoio do bloco à política, sem sorteio (POLITICAL_RULES.md §6.2). Os pesos vêm de `content.calibration`.
 * Interesses são comparados com a área da política; contrapartidas são as da proposta (se houver) e os
 * ministérios ocupados pelo bloco (§6.3.1).
 */
export function blocSupport(
  state: Readonly<GameState>,
  policy: Policy,
  bloc: Bloc,
  content: GameContent,
  proposal?: Proposal,
): number {
  const c = content.calibration;
  const interest = bloc.interests.includes(policy.area) ? 1 : 0;
  const casualBonus = state.difficulty === 'casual' ? c.bonus_casual : 0;
  return (
    ideologicalSupport(policy, bloc, c) +
    c.w_rel * (blocRelation(state, bloc) / RELACAO_ESCALA) +
    c.w_int * interest +
    c.w_opiniao * (state.indicators.approval - APROVACAO_NEUTRA) +
    negotiatedSupport(proposal, bloc, c) +
    cabinetSupport(state, bloc.id, content) +
    casualBonus
  );
}

/**
 * Apoio do bloco a **derrubar** um veto (POLITICAL_RULES.md §7). Veto total: o bloco quer o projeto pela
 * ideologia e pelo interesse, mas a base fiel ao governo mantém o veto e um presidente popular inibe a
 * derrubada. Veto aos acréscimos: benefício paroquial, que agrada mais a quem cobra emendas.
 */
export function vetoOverrideSupport(
  state: Readonly<GameState>,
  policy: Policy,
  bloc: Bloc,
  kind: VetoKind,
  content: GameContent,
): number {
  const c = content.calibration;
  const loyalty = c.w_rel * (blocRelation(state, bloc) / RELACAO_ESCALA) + cabinetSupport(state, bloc.id, content);
  if (kind === 'acrescimos') {
    const emendas = bloc.interests.includes(INTERESSE_EMENDAS) ? c.w_int : 0;
    return c.apoio_acrescimo_base + emendas - loyalty;
  }
  const interest = bloc.interests.includes(policy.area) ? c.w_int : 0;
  return (
    ideologicalSupport(policy, bloc, c) +
    interest -
    loyalty -
    c.w_opiniao * (state.indicators.approval - APROVACAO_NEUTRA)
  );
}

/** Votos "sim" esperados de um bloco dado o apoio, sem arredondar (parte fiel + parte dissidente). */
export function expectedBlocYes(support: number, seats: number, cohesion: number, c: Calibration): number {
  const loyalYes = support > c.limiar_apoio ? cohesion * seats : 0;
  const dissidentYes = (1 - cohesion) * seats * logistic(c.inclinacao_apoio * (support - c.limiar_apoio));
  return loyalYes + dissidentYes;
}

/**
 * Vota uma etapa com o apoio dado por bloco e sorteio pela semente: exatamente um `rng.normal()` por bloco,
 * na ordem do cenário.
 */
export function voteWithSupport(
  state: Readonly<GameState>,
  stage: VoteStage,
  supportOf: (bloc: Bloc) => number,
  content: GameContent,
  rng: Rng,
): VoteResult {
  const c = content.calibration;
  const blocs = content.scenario.blocs.map((bloc) => {
    const support = supportOf(bloc) + rng.normal() * c.ruido_apoio;
    const seats = seatsOf(bloc, stage.house);
    const yes = Math.round(expectedBlocYes(support, seats, bloc.cohesion, c));
    return { blocId: bloc.id, support, yes, no: seats - yes };
  });
  const yes = blocs.reduce((n, b) => n + b.yes, 0);
  const no = blocs.reduce((n, b) => n + b.no, 0);
  return {
    monthIndex: state.monthIndex,
    house: stage.house,
    round: stage.round,
    yes,
    no,
    required: stage.required,
    approved: yes >= stage.required,
    blocs,
  };
}

/** Vota uma etapa da proposta (apoio de `blocSupport`, com as contrapartidas da proposta, se houver). */
export function voteStage(
  state: Readonly<GameState>,
  policy: Policy,
  stage: VoteStage,
  content: GameContent,
  rng: Rng,
  proposal?: Proposal,
): VoteResult {
  return voteWithSupport(state, stage, (bloc) => blocSupport(state, policy, bloc, content, proposal), content, rng);
}

/** Votos "sim" esperados numa etapa, sem sorteio e sem arredondar. */
export function expectedYes(
  state: Readonly<GameState>,
  policy: Policy,
  stage: VoteStage,
  content: GameContent,
  proposal?: Proposal,
): number {
  const c = content.calibration;
  return content.scenario.blocs.reduce(
    (n, bloc) =>
      n +
      expectedBlocYes(
        blocSupport(state, policy, bloc, content, proposal),
        seatsOf(bloc, stage.house),
        bloc.cohesion,
        c,
      ),
    0,
  );
}

/**
 * Previsão de cada etapa sem sorteio (mesa de despacho, aba Congresso): mesma fórmula de `voteStage`, sem
 * ruído e sem arredondamento. Com proposta, só as etapas que faltam e com as contrapartidas dela. Política
 * não legislativa devolve lista vazia.
 */
export function predictVotes(
  state: Readonly<GameState>,
  policy: Policy,
  content: GameContent,
  proposal?: Proposal,
): VotePrediction[] {
  const instrument = legislativeInstrument(policy);
  if (instrument === null) return [];
  return votingPlan(instrument)
    .slice(proposal?.stage ?? 0)
    .map((stage) => ({
      ...stage,
      expectedYes: expectedYes(state, policy, stage, content, proposal),
      total: houseTotal(stage.house),
    }));
}

/** Etapa mensal: aplica impulsos `relacao_congresso` ativos às relações de todos os blocos. Sem contribuições. */
export const congressStep: MonthStep = (state, ctx) => {
  const impulse = sumActive(state.impulses, state.monthIndex, 'relacao_congresso');
  const stability =
    ((state.initialCampaignConfiguration?.challenge?.coalitionStability ?? 0.5) - 0.5) *
    CHALLENGE_CALIBRATION.coalitionMonthly;
  const blocs = ctx.content.scenario.blocs.map((bloc) => ({
    id: bloc.id,
    governmentRelation: Math.min(RELACAO_MAX, Math.max(RELACAO_MIN, blocRelation(state, bloc) + impulse + stability)),
  }));
  if (stability !== 0)
    ctx.draft.notes.push('As relações no Congresso também variaram conforme a estabilidade da coalizão.');
  return { state: { ...state, congress: { ...state.congress, blocs } }, contributions: [] };
};
