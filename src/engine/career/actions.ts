import type { CareerActionId, CareerTurn, ScenarioUf } from '../../types/scenario';
import { populationShares } from '../regions/regions';
import type {
  CareerActionOutcome,
  CareerCandidateState,
  CareerState,
  Contribution,
  Decision,
  DecisionRejection,
  GameContent,
  GameState,
  PreInaugurationStage,
} from '../types';

import { careerParam } from './calibration';
import { keyedRng } from './draw';
import { alignment } from './viability';

/**
 * Ações de campanha (PLANO_CAMPANHA.md Fase C4, tarefa C4.1): os 5 arquétipos, com uma ação cada no catálogo mínimo.
 * O custo vem de `career.finance.costs` e é reservado pela contabilidade da Fase C3 (na ordem de envio); aqui ficam
 * o estágio em que cada ação existe, o alvo, o limite de ações por turno e o efeito. Efeitos sobre o reconhecimento
 * são fração da distância a 1 (nunca passa de 1); sobre a valência, somas limitadas a [−1, 1]. O único sorteio (o
 * bumerangue do ataque) é por chave (§4.1, contrato 2): depende da ação, do alvo e do turno, não da posição na lista.
 */

export type CareerArchetype =
  'nacional_amplo' | 'regional_direcionado' | 'mobilizacao_partidaria' | 'comunicacao_risco' | 'arrecadacao_negociacao';

export interface CareerActionSpec {
  id: CareerActionId;
  archetype: CareerArchetype;
  name: string;
  summary: string;
  /** Estágios em que a ação existe; fora deles, `fora_do_estagio`. */
  stages: readonly PreInaugurationStage[];
  /** Parâmetro de alvo exigido: `uf` (sigla) ou `alvo` (bloco de um adversário na disputa). */
  target?: 'uf' | 'alvo';
}

const CAMPAIGN: readonly PreInaugurationStage[] = ['corrida', 'eleicao'];
const ANY_CAMPAIGN: readonly PreInaugurationStage[] = ['pre_campanha', 'convencao', 'corrida', 'eleicao'];

export const CAREER_ACTIONS: Readonly<Record<CareerActionId, CareerActionSpec>> = {
  comicio_nacional: {
    id: 'comicio_nacional',
    archetype: 'nacional_amplo',
    name: 'Comício nacional transmitido',
    summary: 'Caro e amplo: aumenta um pouco o reconhecimento em todo o país.',
    // Propaganda eleitoral só depois de 16 de agosto (DATA_SOURCES.md §6): fora da campanha oficial não existe.
    stages: CAMPAIGN,
  },
  caravana_regional: {
    id: 'caravana_regional',
    archetype: 'regional_direcionado',
    name: 'Caravana num estado',
    summary: 'Concentra a agenda numa UF: aumenta bastante o reconhecimento só ali.',
    stages: ANY_CAMPAIGN,
    target: 'uf',
  },
  mobilizar_militancia: {
    id: 'mobilizar_militancia',
    archetype: 'mobilizacao_partidaria',
    name: 'Mobilizar a militância',
    summary: 'Barato: a rede do partido divulga a candidatura, mas só rende onde o eleitorado se parece com o bloco.',
    stages: ANY_CAMPAIGN,
  },
  ataque_adversario: {
    id: 'ataque_adversario',
    archetype: 'comunicacao_risco',
    name: 'Campanha contra um adversário',
    summary: 'Desgasta a imagem de quem é atacado, com risco de bumerangue maior contra quem tem imagem boa.',
    stages: CAMPAIGN,
    target: 'alvo',
  },
  arrecadar_doacoes: {
    id: 'arrecadar_doacoes',
    archetype: 'arrecadacao_negociacao',
    name: 'Arrecadar doações',
    summary: 'Jantares e vaquinha: o dinheiro entra no turno seguinte (finanças da campanha).',
    stages: ANY_CAMPAIGN,
  },
};

export function isCareerAction(id: string): id is CareerActionId {
  return Object.hasOwn(CAREER_ACTIONS, id);
}

/** Ações de campanha por turno: as mesmas da agenda do governo (4 no Casual, 3 nos outros modos). */
export function careerActionsPerTurn(state: Pick<GameState, 'resources'>): number {
  return state.resources.agendaActionsPerMonth;
}

/**
 * Triagem da ação antes da contabilidade: estágio, alvo, repetição e limite do turno. `used` = ações de campanha já
 * aceitas no turno; `done` = ids já aceitos (uma vez por turno cada). A reserva do custo vem depois (Fase C3).
 */
export function screenCareerAction(
  career: CareerState,
  turn: CareerTurn,
  decision: Decision,
  content: Pick<GameContent, 'scenario'>,
  used: number,
  limit: number,
  done: ReadonlySet<string>,
): DecisionRejection | null {
  if (!isCareerAction(decision.policyId)) return 'politica_desconhecida';
  const spec = CAREER_ACTIONS[decision.policyId];
  if (!spec.stages.includes(turn.stage)) return 'fora_do_estagio';
  if (spec.target === 'uf') {
    const uf = decision.params?.uf;
    if (typeof uf !== 'string' || !(content.scenario.regions?.ufs ?? []).some((u) => u.id === uf))
      return 'alvo_invalido';
  }
  if (spec.target === 'alvo') {
    const alvo = decision.params?.alvo;
    if (typeof alvo !== 'string' || !career.opponents.some((o) => o.blocId === alvo)) return 'alvo_invalido';
  }
  if (done.has(spec.id)) return 'acao_repetida';
  if (used >= limit) return 'sem_acoes_de_agenda';
  return null;
}

/** Ganho `rate·(1 − r)` nas UFs escolhidas; devolve o novo mapa e a variação nacional (ponderada pela população). */
export function raiseRecognition(
  recognition: Readonly<Record<string, number>>,
  ufs: readonly ScenarioUf[],
  rateOf: (uf: ScenarioUf) => number,
): { next: Record<string, number>; national: number } {
  const w = populationShares(ufs);
  const next = { ...recognition };
  let national = 0;
  ufs.forEach((u, i) => {
    const r = recognition[u.id] ?? 0;
    const gain = Math.max(0, rateOf(u)) * (1 - r);
    next[u.id] = r + gain;
    national += w[i] * gain;
  });
  return { next, national };
}

const clampValence = (v: number): number => Math.min(1, Math.max(-1, v));

/** Chance de bumerangue ao atacar um adversário com esta valência (informação mostrada ao jogador). */
export function attackRisk(targetValence: number): number {
  return Math.min(
    careerParam('ataque_risco_max'),
    careerParam('ataque_risco_base') + careerParam('ataque_risco_valencia') * Math.max(0, targetValence),
  );
}

/** Resultado de um ataque (ação ou debate), com o sorteio da chave dada. */
export function resolveAttack(
  career: CareerState,
  target: string,
  seed: number,
  key: readonly (string | number)[],
): { career: CareerState; result: 'sucesso' | 'bumerangue'; valenceDelta: number; targetValenceDelta: number } {
  const opponent = career.opponents.find((o) => o.blocId === target);
  if (!opponent) throw new RangeError(`adversário fora da disputa: ${target}`);
  const boomerang = keyedRng(seed, key).float() < attackRisk(opponent.valence);
  if (boomerang) {
    const valence = clampValence(career.valence - careerParam('ataque_bumerangue'));
    return {
      career: { ...career, valence },
      result: 'bumerangue',
      valenceDelta: valence - career.valence,
      targetValenceDelta: 0,
    };
  }
  const hit = clampValence(opponent.valence - careerParam('ataque_dano'));
  const opponents: CareerCandidateState[] = career.opponents.map((o) =>
    o.blocId === target ? { ...o, valence: hit } : o,
  );
  return {
    career: { ...career, opponents },
    result: 'sucesso',
    valenceDelta: 0,
    targetValenceDelta: hit - opponent.valence,
  };
}

/** Chave do sorteio de uma ação aceita: estágio, turno, ação, alvo e ocorrência (a ação vale uma vez por turno). */
export function careerActionKey(career: CareerState, actionId: string, target: string): (string | number)[] {
  return ['career', 'action', career.stage, career.turnIndex, actionId, target, 0];
}

/** Rótulo de cada causa das variações causadas pelas ações ("Por que mudou?"). */
export function actionCause(actionId: string): string {
  return `acao:${actionId}`;
}

/**
 * Aplica uma ação aceita (exceto a arrecadação, que é só contabilidade): novo estado da carreira, o resultado para o
 * relatório e as contribuições de relatório (`careerRecognition`, `careerValence`).
 */
export function applyCareerAction(
  career: CareerState,
  decision: Decision,
  content: Pick<GameContent, 'scenario'>,
  seed: number,
): { career: CareerState; outcome: CareerActionOutcome; contributions: Contribution[] } {
  const id = decision.policyId as CareerActionId;
  const spec = CAREER_ACTIONS[id];
  const ufs = content.scenario.regions?.ufs ?? [];
  let next = career;
  const outcome: CareerActionOutcome = { actionId: id, recognitionDelta: 0, valenceDelta: 0 };
  switch (id) {
    case 'comicio_nacional': {
      const r = raiseRecognition(career.recognition, ufs, () => careerParam('acao_nacional'));
      next = { ...career, recognition: r.next };
      outcome.recognitionDelta = r.national;
      break;
    }
    case 'caravana_regional': {
      const uf = String(decision.params?.uf);
      const r = raiseRecognition(career.recognition, ufs, (u) => (u.id === uf ? careerParam('acao_regional') : 0));
      next = { ...career, recognition: r.next };
      outcome.target = uf;
      outcome.recognitionDelta = r.national;
      break;
    }
    case 'mobilizar_militancia': {
      const blocId = content.scenario.career?.profiles.find((p) => p.id === career.profileId)?.blocId;
      const bloc = content.scenario.blocs.find((b) => b.id === blocId);
      const r = raiseRecognition(
        career.recognition,
        ufs,
        (u) => careerParam('acao_mobilizacao') * Math.max(0, alignment(bloc, u)),
      );
      next = { ...career, recognition: r.next };
      outcome.recognitionDelta = r.national;
      break;
    }
    case 'ataque_adversario': {
      const target = String(decision.params?.alvo);
      const a = resolveAttack(career, target, seed, careerActionKey(career, id, target));
      next = a.career;
      Object.assign(outcome, {
        target,
        result: a.result,
        valenceDelta: a.valenceDelta,
        targetValenceDelta: a.targetValenceDelta,
      });
      break;
    }
    case 'arrecadar_doacoes':
      break;
  }
  const contributions: Contribution[] = [];
  if (outcome.recognitionDelta !== 0) {
    contributions.push({
      indicator: 'careerRecognition',
      cause: actionCause(id),
      label: spec.name,
      delta: outcome.recognitionDelta,
    });
  }
  if (outcome.valenceDelta !== 0) {
    contributions.push({
      indicator: 'careerValence',
      cause: actionCause(id),
      label: `${spec.name} (bumerangue)`,
      delta: outcome.valenceDelta,
    });
  }
  return { career: next, outcome, contributions };
}
