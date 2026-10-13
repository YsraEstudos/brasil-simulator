import { createRng, type Rng } from './rng';
import type { Contribution, Decision, DecisionRejection, GameState, Indicators, MonthResult } from './types';

/**
 * Etapa do processamento mensal. Recebe o estado já atualizado pelas etapas anteriores do mês (somente leitura)
 * e o sorteador, e devolve as variações que causa, cada uma com sua causa. Nunca altera o estado diretamente.
 */
export type MonthStep = (state: Readonly<GameState>, rng: Rng) => Contribution[];

/**
 * Etapas do mês, na ordem do ECONOMIC_MODEL.md §4. Vazio no esqueleto: o protótipo (Fase 02) adiciona
 * choques, execução de políticas, economia, Banco Central e opinião pública.
 */
const STEPS: readonly MonthStep[] = [];

/**
 * Processa um mês: valida as decisões pelos pontos de agenda, roda as etapas e aplica as contribuições.
 * Função pura: não altera `state` nem `decisions`; mesma entrada → mesma saída.
 */
export function advanceMonth(state: GameState, decisions: readonly Decision[], steps = STEPS): MonthResult {
  const { accepted, rejected } = screenDecisions(decisions, state.resources.agendaPointsPerMonth);

  // Cada etapa vê o resultado das anteriores (ex.: inflação depois do hiato, ECONOMIC_MODEL.md §4).
  const rng = createRng(state.rng);
  const contributions: Contribution[] = [];
  let indicators = state.indicators;
  for (const step of steps) {
    const stepContributions = step({ ...state, indicators }, rng);
    indicators = applyContributions(indicators, stepContributions);
    contributions.push(...stepContributions);
  }

  const next: GameState = {
    ...state,
    rng: rng.state(),
    monthIndex: state.monthIndex + 1,
    indicators: { ...indicators },
    resources: { ...state.resources },
    decisionLog: [
      ...state.decisionLog,
      ...accepted.map((decision) => ({ monthIndex: state.monthIndex, decision: copyDecision(decision) })),
    ],
  };

  return { state: next, report: { monthIndex: state.monthIndex, accepted, rejected, contributions } };
}

/** Aceita decisões na ordem enviada enquanto houver pontos de agenda (GAME_DESIGN.md §4.3). */
function screenDecisions(decisions: readonly Decision[], budget: number) {
  const accepted: Decision[] = [];
  const rejected: { decision: Decision; reason: DecisionRejection }[] = [];
  let left = budget;
  for (const decision of decisions) {
    if (!Number.isFinite(decision.agendaCost) || decision.agendaCost < 0) {
      rejected.push({ decision, reason: 'custo_invalido' });
    } else if (decision.agendaCost > left) {
      rejected.push({ decision, reason: 'sem_pontos_de_agenda' });
    } else {
      left -= decision.agendaCost;
      accepted.push(decision);
    }
  }
  return { accepted, rejected };
}

/** Cópia própria do motor: o histórico não pode mudar se quem chamou alterar o objeto depois. */
function copyDecision(d: Decision): Decision {
  return d.params ? { ...d, params: { ...d.params } } : { ...d };
}

function applyContributions(indicators: Indicators, contributions: readonly Contribution[]): Indicators {
  const next = { ...indicators };
  for (const c of contributions) next[c.indicator] += c.delta;
  return next;
}
