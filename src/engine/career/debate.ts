import type { CareerDebate, CareerTurn } from '../../types/scenario';
import type {
  CareerDebateOutcome,
  CareerState,
  Contribution,
  Decision,
  DebatePosture,
  DecisionRejection,
  GameContent,
} from '../types';

import { attackRisk, raiseRecognition, resolveAttack } from './actions';
import { careerParam } from './calibration';
import { nationalRecognition } from './viability';

/**
 * Debate na TV (PLANO_CAMPANHA.md Fase C4, tarefa C4.2): uma decisão por debate, postura × alvo, com **informação
 * observável** antes de escolher (`debateOptions`: efeito esperado, risco de bumerangue, pontos fortes e fracos do
 * adversário pela faixa de imagem). Não gasta ação nem dinheiro. Sem escolha marcada vale a postura padrão
 * (propositiva), registrada como automática. Todo debate dá exposição; o ataque usa as regras do ataque de campanha,
 * com o próprio sorteio por chave.
 */

export const DEBATE_ACTION_ID = 'participar_debate';
export const DEBATE_POSTURES: readonly DebatePosture[] = ['propositiva', 'tecnica', 'ataque'];
/** Postura quando o jogador não marca nada (consequência de não responder, mostrada antes). */
export const DEFAULT_DEBATE_POSTURE: DebatePosture = 'propositiva';

/** Debate do turno, se houver (pelo mês de início do turno). */
export function debateOfTurn(
  content: Pick<GameContent, 'scenario'>,
  turn: Pick<CareerTurn, 'from'>,
): CareerDebate | null {
  return content.scenario.career?.debates?.find((d) => d.from === turn.from) ?? null;
}

/** Triagem da decisão de debate: só no turno do debate, postura conhecida, alvo na disputa para o ataque, uma vez. */
export function screenDebate(
  career: CareerState,
  turn: CareerTurn,
  decision: Decision,
  content: Pick<GameContent, 'scenario'>,
  answered: boolean,
): DecisionRejection | null {
  if (!debateOfTurn(content, turn)) return 'fora_do_estagio';
  const posture = decision.params?.postura;
  if (typeof posture !== 'string' || !(DEBATE_POSTURES as readonly string[]).includes(posture))
    return 'escolha_invalida';
  if (posture === 'ataque') {
    const alvo = decision.params?.alvo;
    if (typeof alvo !== 'string' || !career.opponents.some((o) => o.blocId === alvo)) return 'alvo_invalido';
  }
  return answered ? 'acao_repetida' : null;
}

/** Uma opção do debate como o jogador a vê antes de escolher. */
export interface DebateOption {
  posture: DebatePosture;
  /** Bloco do adversário, só no ataque. */
  target?: string;
  /** Ganho de reconhecimento nacional esperado (igual em todas as posturas). */
  recognitionGain: number;
  /** Variação esperada da sua valência (média sobre o sorteio). */
  expectedValence: number;
  /** Variação esperada da valência do atacado. */
  expectedTargetValence: number;
  /** Chance de bumerangue (só no ataque). */
  risk: number;
}

/** Tabela de vantagens do debate: uma linha por postura (o ataque, uma por adversário). Função pura. */
export function debateOptions(career: CareerState, content: Pick<GameContent, 'scenario'>): DebateOption[] {
  const ufs = content.scenario.regions?.ufs ?? [];
  const exposure = raiseRecognition(career.recognition, ufs, () => careerParam('debate_exposicao')).national;
  const known = nationalRecognition(career.recognition, ufs);
  const base = { recognitionGain: exposure, expectedTargetValence: 0, risk: 0 };
  return [
    { ...base, posture: 'propositiva', expectedValence: careerParam('debate_propositivo') },
    { ...base, posture: 'tecnica', expectedValence: careerParam('debate_tecnico') * known },
    ...career.opponents.map((o) => {
      const risk = attackRisk(o.valence);
      return {
        ...base,
        posture: 'ataque' as const,
        target: o.blocId,
        risk,
        expectedValence: -risk * careerParam('ataque_bumerangue'),
        expectedTargetValence: -(1 - risk) * careerParam('ataque_dano'),
      };
    }),
  ];
}

/** Chave do sorteio do debate: o debate e o turno (uma decisão por debate). */
export function debateKey(debate: CareerDebate, career: CareerState): (string | number)[] {
  return ['career', 'debate', debate.id, career.turnIndex];
}

/** Aplica o debate do turno com a postura escolhida (ou a padrão). */
export function applyDebate(
  career: CareerState,
  debate: CareerDebate,
  decision: Decision | null,
  content: Pick<GameContent, 'scenario'>,
  seed: number,
): { career: CareerState; outcome: CareerDebateOutcome; contributions: Contribution[] } {
  const ufs = content.scenario.regions?.ufs ?? [];
  const posture = (decision?.params?.postura as DebatePosture | undefined) ?? DEFAULT_DEBATE_POSTURE;
  const exposure = raiseRecognition(career.recognition, ufs, () => careerParam('debate_exposicao'));
  let next: CareerState = { ...career, recognition: exposure.next };
  const outcome: CareerDebateOutcome = {
    actionId: DEBATE_ACTION_ID,
    debateId: debate.id,
    posture,
    automatic: decision === null,
    recognitionDelta: exposure.national,
    valenceDelta: 0,
  };
  if (posture === 'ataque') {
    const target = String(decision?.params?.alvo);
    const a = resolveAttack(next, target, seed, debateKey(debate, career));
    next = a.career;
    Object.assign(outcome, {
      target,
      result: a.result,
      valenceDelta: a.valenceDelta,
      targetValenceDelta: a.targetValenceDelta,
    });
  } else {
    const gain =
      posture === 'tecnica'
        ? careerParam('debate_tecnico') * nationalRecognition(career.recognition, ufs)
        : careerParam('debate_propositivo');
    const valence = Math.min(1, next.valence + gain);
    outcome.valenceDelta = valence - next.valence;
    next = { ...next, valence };
  }
  const cause = `debate:${posture}`;
  const contributions: Contribution[] = [
    { indicator: 'careerRecognition', cause: 'debate', label: debate.name, delta: outcome.recognitionDelta },
  ];
  if (outcome.valenceDelta !== 0) {
    contributions.push({ indicator: 'careerValence', cause, label: debate.name, delta: outcome.valenceDelta });
  }
  return { career: next, outcome, contributions };
}
