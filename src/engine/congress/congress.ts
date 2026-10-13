import { LEGISLATIVE_INSTRUMENTS } from '../../types/policy';
import type { Instrument, Policy } from '../../types/policy';
import { CHAMBER_SEATS, SENATE_SEATS } from '../../types/scenario';
import type { Bloc } from '../../types/scenario';
import type { Calibration } from '../economy/calibration';
import { sumActive } from '../impulses';
import type { Rng } from '../rng';
import type { GameContent, GameState, House, MonthStep, VoteResult } from '../types';

/**
 * Congresso no protótipo (POLITICAL_RULES.md §3, §6). Simplificação: todos presentes, só "sim" e "não".
 * Com todos presentes, a maioria absoluta de cada Casa (257 / 41) é também a maioria dos presentes.
 * Não há abstenção, obstrução, pedido de vista nem comissões (Fase 04).
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
 * Quóruns constitucionais como fração das cadeiras da Casa (regra legal, não coeficiente do motor).
 * - `mais_da_metade`: mais da metade das cadeiras (maioria absoluta: CF art. 69 para PLP; art. 66 §4º para veto).
 * - `ao_menos`: pelo menos a fração indicada (CF art. 60 §2º: três quintos dos membros, em cada turno de cada Casa).
 */
const QUORUM = {
  maioria_absoluta: { numerador: 1, denominador: 2, tipo: 'mais_da_metade' },
  tres_quintos: { numerador: 3, denominador: 5, tipo: 'ao_menos' },
} as const;

type Quorum = (typeof QUORUM)[keyof typeof QUORUM];

/** Escala da relação com o governo (−100 … 100, POLITICAL_RULES.md §6.1). */
const RELACAO_ESCALA = 100;
const RELACAO_MIN = -RELACAO_ESCALA;
const RELACAO_MAX = RELACAO_ESCALA;
/** Maior distância ideológica possível: 2 em cada eixo (−1 … 1). */
const DISTANCIA_IDEOLOGICA_MAXIMA = 4;
/** Aprovação neutra no cálculo de apoio (fração). */
const APROVACAO_NEUTRA = 0.5;

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function requiredVotes(seats: number, quorum: Quorum): number {
  const exact = (seats * quorum.numerador) / quorum.denominador;
  return quorum.tipo === 'ao_menos' ? Math.ceil(exact) : Math.floor(exact) + 1;
}

function seatsOf(bloc: Bloc, house: House): number {
  return house === 'camara' ? bloc.chamberSeats : bloc.senateSeats;
}

function houseTotal(house: House): number {
  return house === 'camara' ? CHAMBER_SEATS : SENATE_SEATS;
}

/** Primeiro instrumento legislativo da política, ou `null` se ela é só ato do Executivo. */
export function legislativeInstrument(policy: Policy): Instrument | null {
  return policy.instruments.find((i) => LEGISLATIVE_INSTRUMENTS.includes(i)) ?? null;
}

/** Etapas de votação do instrumento, na ordem (Câmara antes do Senado). */
export function votingPlan(instrument: Instrument): VoteStage[] {
  const bothHouses = (quorum: Quorum): VoteStage[] => [
    { house: 'camara', round: 1, required: requiredVotes(CHAMBER_SEATS, quorum) },
    { house: 'senado', round: 1, required: requiredVotes(SENATE_SEATS, quorum) },
  ];
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

/** Relação atual do bloco com o governo (estado; se ausente, a do cenário). */
export function blocRelation(state: Readonly<GameState>, bloc: Bloc): number {
  return state.congress.blocs.find((b) => b.id === bloc.id)?.governmentRelation ?? bloc.governmentRelation;
}

/**
 * Apoio do bloco à política, sem sorteio (POLITICAL_RULES.md §6.2). Os pesos vêm de `content.calibration`.
 * Interesses são comparados com a área da política.
 */
export function blocSupport(state: Readonly<GameState>, policy: Policy, bloc: Bloc, content: GameContent): number {
  const c = content.calibration;
  const distance =
    Math.abs(bloc.ideology.economic - policy.position.economic) +
    Math.abs(bloc.ideology.social - policy.position.social);
  const affinity = 1 - distance / DISTANCIA_IDEOLOGICA_MAXIMA;
  const interest = bloc.interests.includes(policy.area) ? 1 : 0;
  const casualBonus = state.difficulty === 'casual' ? c.bonus_casual : 0;
  return (
    c.w_ideo * (2 * affinity - 1) +
    c.w_rel * (blocRelation(state, bloc) / RELACAO_ESCALA) +
    c.w_int * interest +
    c.w_opiniao * (state.indicators.approval - APROVACAO_NEUTRA) +
    casualBonus
  );
}

/** Votos "sim" esperados de um bloco dado o apoio, sem arredondar (parte fiel + parte dissidente). */
function expectedBlocYes(support: number, seats: number, cohesion: number, c: Calibration): number {
  const loyalYes = support > c.limiar_apoio ? cohesion * seats : 0;
  const dissidentYes = (1 - cohesion) * seats * logistic(c.inclinacao_apoio * (support - c.limiar_apoio));
  return loyalYes + dissidentYes;
}

/** Vota uma etapa com sorteio pela semente: exatamente um `rng.normal()` por bloco, na ordem do cenário. */
export function voteStage(
  state: Readonly<GameState>,
  policy: Policy,
  stage: VoteStage,
  content: GameContent,
  rng: Rng,
): VoteResult {
  const c = content.calibration;
  const blocs = content.scenario.blocs.map((bloc) => {
    const support = blocSupport(state, policy, bloc, content) + rng.normal() * c.ruido_apoio;
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

/**
 * Previsão de cada etapa sem sorteio (mesa de despacho): mesma fórmula de `voteStage`, sem ruído e sem
 * arredondamento. Política não legislativa devolve lista vazia.
 */
export function predictVotes(state: Readonly<GameState>, policy: Policy, content: GameContent): VotePrediction[] {
  const instrument = legislativeInstrument(policy);
  if (instrument === null) return [];
  const c = content.calibration;
  return votingPlan(instrument).map((stage) => {
    const expectedYes = content.scenario.blocs.reduce(
      (n, bloc) =>
        n + expectedBlocYes(blocSupport(state, policy, bloc, content), seatsOf(bloc, stage.house), bloc.cohesion, c),
      0,
    );
    return { ...stage, expectedYes, total: houseTotal(stage.house) };
  });
}

/** Etapa mensal: aplica impulsos `relacao_congresso` ativos às relações de todos os blocos. Sem contribuições. */
export const congressStep: MonthStep = (state, ctx) => {
  const impulse = sumActive(state.impulses, state.monthIndex, 'relacao_congresso');
  const blocs = ctx.content.scenario.blocs.map((bloc) => ({
    id: bloc.id,
    governmentRelation: Math.min(RELACAO_MAX, Math.max(RELACAO_MIN, blocRelation(state, bloc) + impulse)),
  }));
  return { state: { ...state, congress: { ...state.congress, blocs } }, contributions: [] };
};
