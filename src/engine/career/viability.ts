import type { Bloc, CareerTurn, ScenarioUf } from '../../types/scenario';
import { populationShares } from '../regions/regions';
import type { CareerCandidateState, Contribution, GameContent, GameState, MonthStep } from '../types';

import { careerParam } from './calibration';

/**
 * Viabilidade antes da posse (PLANO_CAMPANHA.md Fase C2, tarefa C2.1). Grandezas por UF: reconhecimento R ∈ [0, 1];
 * aprovação e rejeição **entre quem conhece**, não complementares (há neutros). A valência é nacional; a variação por
 * UF vem do alinhamento entre a ideologia do bloco do candidato e a inclinação da UF (`lean`).
 */

/** Maior distância possível entre dois pontos do plano ideológico [−1, 1]². */
const MAX_IDEOLOGY_DISTANCE = 2 * Math.SQRT2;

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

/** Alinhamento entre o bloco e a UF, −1 (opostos) … 1 (iguais); 0 sem inclinação conhecida. */
export function alignment(bloc: Pick<Bloc, 'ideology'> | undefined, uf: Pick<ScenarioUf, 'lean'>): number {
  if (!bloc || !uf.lean) return 0;
  const d = Math.hypot(bloc.ideology.economic - uf.lean.economic, bloc.ideology.social - uf.lean.social);
  return 1 - (2 * d) / MAX_IDEOLOGY_DISTANCE;
}

/** Utilidade do candidato na UF: valência nacional e alinhamento, com os pesos da calibração. */
export function utility(valence: number, align: number): number {
  return careerParam('valencia_escala') * valence + careerParam('alinhamento_peso') * align;
}

/** Opinião entre quem conhece: aprovação + rejeição + neutros = 1. */
export function opinion(u: number): { approval: number; rejection: number } {
  const engaged = 1 - careerParam('neutros');
  const p = sigmoid(careerParam('opiniao_escala') * u);
  return { approval: engaged * p, rejection: engaged * (1 - p) };
}

/** Teto de elegibilidade: fração do comparecimento que conhece e não rejeita o candidato. */
export function eligibilityCeiling(recognition: number, u: number): number {
  return recognition * (1 - opinion(u).rejection);
}

/** Peso na distribuição dos votos: w = R · (1 − rejeição) · e^u. */
export function ballotWeight(recognition: number, u: number): number {
  return eligibilityCeiling(recognition, u) * Math.exp(u);
}

/** Reconhecimento combinado de um nível nacional com uma base territorial: 1 − (1 − R)(1 − base). */
export function combineRecognition(national: number, base: number): number {
  return 1 - (1 - national) * (1 - base);
}

/** Reconhecimento por UF a partir do nacional e da base territorial (UF ausente = sem base). */
export function initialRecognition(
  ufs: readonly Pick<ScenarioUf, 'id'>[],
  national: number,
  territorialBase: Readonly<Record<string, number>>,
): Record<string, number> {
  return Object.fromEntries(ufs.map((u) => [u.id, combineRecognition(national, territorialBase[u.id] ?? 0)]));
}

/** Reconhecimento nacional: média das UFs ponderada pela população. */
export function nationalRecognition(recognition: Readonly<Record<string, number>>, ufs: readonly ScenarioUf[]): number {
  const w = populationShares(ufs);
  return ufs.reduce((s, u, i) => s + w[i] * (recognition[u.id] ?? 0), 0);
}

/** Meses do calendário cobertos pelo turno. */
export function monthsInTurn(turn: Pick<CareerTurn, 'from' | 'to'>): number {
  if (!turn.to) return 1;
  const [y1, m1] = turn.from.split('-').map(Number);
  const [y2, m2] = turn.to.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}

/** Taxa de crescimento orgânico por mês no estágio: campanha oficial (corrida e eleição) ou antes dela. */
export function organicRate(stage: CareerTurn['stage']): number {
  return stage === 'corrida' || stage === 'eleicao'
    ? careerParam('organico_campanha')
    : careerParam('organico_pre_campanha');
}

/**
 * Um mês de reconhecimento numa UF (I10): primeiro o esquecimento, proporcional à distância ao piso; depois o
 * crescimento, proporcional à distância ao teto. Fica sempre em [0, 1] e nunca cruza o piso por esquecimento.
 */
export function stepRecognition(r: number, organic: number): { decay: number; growth: number; next: number } {
  const floor = careerParam('ostracismo_piso');
  const decay = r > floor ? -careerParam('ostracismo_taxa') * (r - floor) : 0;
  const afterDecay = r + decay;
  const growth = organic * (1 - afterDecay);
  return { decay, growth, next: afterDecay + growth };
}

/** Evolui o reconhecimento de todas as UFs por `months` meses; devolve as parcelas somadas por UF. */
export function evolveRecognition(
  recognition: Readonly<Record<string, number>>,
  organic: number,
  months: number,
): { next: Record<string, number>; decay: Record<string, number>; growth: Record<string, number> } {
  const next: Record<string, number> = {};
  const decay: Record<string, number> = {};
  const growth: Record<string, number> = {};
  for (const [uf, r0] of Object.entries(recognition)) {
    let r = r0;
    decay[uf] = 0;
    growth[uf] = 0;
    for (let m = 0; m < months; m++) {
      const s = stepRecognition(r, organic);
      decay[uf] += s.decay;
      growth[uf] += s.growth;
      r = s.next;
    }
    next[uf] = r;
  }
  return { next, decay, growth };
}

/** Rótulos das causas da variação do reconhecimento ("Por que mudou?"). */
export const RECOGNITION_CAUSES = {
  ostracismo: 'Esquecimento: semanas longe do noticiário',
  organico: 'Exposição da campanha',
} as const;

/**
 * Etapa de viabilidade do turno pré-posse: o reconhecimento do jogador e dos adversários evolui (sem ações ainda:
 * as ações da campanha entram na Fase C4). Não roda na transição (depois da eleição). Contribuições só de relatório
 * no pseudo-indicador `'careerRecognition'` (nacional do jogador, ponderado pela população). Sem sorteio.
 */
export const viabilityStep: MonthStep = (state: GameState, ctx) => {
  const career = state.career;
  const content: GameContent = ctx.content;
  const ufs = content.scenario.regions?.ufs ?? [];
  const turn = career ? content.scenario.career?.startPoints[career.startPoint]?.turns[career.turnIndex] : undefined;
  if (!career || !turn || turn.stage === 'transicao' || ufs.length === 0) return { state, contributions: [] };

  const organic = organicRate(turn.stage);
  const months = monthsInTurn(turn);
  const player = evolveRecognition(career.recognition, organic, months);
  const opponents: CareerCandidateState[] = career.opponents.map((o) => ({
    ...o,
    recognition: evolveRecognition(o.recognition, organic, months).next,
  }));

  const w = populationShares(ufs);
  const weighted = (byUf: Record<string, number>) => ufs.reduce((s, u, i) => s + w[i] * (byUf[u.id] ?? 0), 0);
  const pieces: Contribution[] = [
    {
      indicator: 'careerRecognition',
      cause: 'ostracismo',
      label: RECOGNITION_CAUSES.ostracismo,
      delta: weighted(player.decay),
    },
    {
      indicator: 'careerRecognition',
      cause: 'organico',
      label: RECOGNITION_CAUSES.organico,
      delta: weighted(player.growth),
    },
  ];
  const contributions = pieces.filter((c) => c.delta !== 0);

  return {
    state: { ...state, career: { ...career, recognition: player.next, opponents } },
    contributions,
  };
};
