import type { Policy } from '../../types/policy';
import type { ScenarioElections } from '../../types/scenario';
import { monthOfTerm } from '../calendar';
import type { GameContent, GameState } from '../types';

/**
 * Vedação eleitoral (Lei 9.504/1997 art. 73 §10, simplificada; POLITICAL_RULES.md §11.2; FASE_08.md): nos 3 meses
 * antes de cada pleito, criar "novo benefício" é vedado. O `screenInput` rejeita a política com o motivo
 * `vedacao_eleitoral`; a quebra declarada (`decision.params.vedacao_bypass = true`) passa e paga as penalidades
 * agendadas em `proposals.ts` (pena na intenção por mês e risco de multa de aprovação). A dificuldade `casual`
 * não aplica a vedação.
 */

/** Meses antes de cada pleito em que a vedação vale (18–20 para o pleito no 21; 42–44 para o 45). */
export const VEDACAO_MESES = 3;

/** Canais de impacto que caracterizam "novo benefício" (POLITICAL_RULES.md §11.2). */
const BENEFIT_CHANNELS: ReadonlySet<string> = new Set([
  'transferencia_baixa_renda',
  'transferencia_alta_renda',
  'despesa_obrigatoria',
  'salario_minimo_real',
]);

/** A política cria benefício novo? Só canais positivos contam: revogar ou cortar benefício não é criar. */
export function isNovoBeneficio(policy: Policy): boolean {
  return policy.impacts.some((impact) => BENEFIT_CHANNELS.has(impact.channel) && impact.magnitude > 0);
}

/** O mês do mandato está na janela de vedação de um dos pleitos (os `VEDACAO_MESES` antes dele). */
export function inVedacaoWindow(elections: ScenarioElections, termMonth: number): boolean {
  return [elections.mesEleicaoMunicipal, elections.mesEleicaoGeral].some(
    (pleito) => termMonth >= pleito - VEDACAO_MESES && termMonth <= pleito - 1,
  );
}

/** A vedação vale neste mês: cenário com eleições, fora da dificuldade `casual` e na janela de algum pleito. */
export function vedacaoAtiva(state: Readonly<GameState>, content: GameContent): boolean {
  const elections = content.scenario.elections;
  if (!elections || state.difficulty === 'casual') return false;
  return inVedacaoWindow(elections, monthOfTerm(state.monthIndex));
}
