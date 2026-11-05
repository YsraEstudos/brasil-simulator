import { explainIndicator, type IndicatorKey, type MonthReport } from '@/engine';
import { formatNumber } from '@/components/ui/format';

/**
 * Conta aberta de um indicador (PLANO_SAVES_HISTORICO.md, H9/D2): "Aprovação: 50,0% no mês passado + 0,3 −
 * 0,5 … = 48,0%". Montada da mesma decomposição do "Por que mudou?" (`explainIndicator`), com as maiores parcelas
 * e o resto em "outros".
 *
 * Toda a conta é feita em "passos" de exibição (0,1 p.p. com uma casa, 0,01 p.p. com duas), arredondados como a
 * tela arredonda. Assim a soma do que está escrito fecha sempre com o valor do cartão. Quando as parcelas
 * arredondadas não fecham sozinhas, a diferença vira a linha "arredondamento", com a explicação.
 */

/** Quantas causas aparecem antes de "outros" (o "Por que mudou?" mostra 6; a conta, mais curta, 4). */
export const EQUATION_TOP_TERMS = 4;

const PERCENT = 100;
const MINUS = '−';

export interface EquationTerm {
  key: string;
  label: string;
  /** Parcela em passos de exibição (inteiro). */
  steps: number;
  /** "+0,3" ou "−0,5" (p.p., sem a unidade). */
  text: string;
  /** Quantas causas "outros" junta; 0 nas demais linhas. */
  merged: number;
}

export interface IndicatorEquation {
  /** Valor de partida (mês passado), em passos. */
  startSteps: number;
  startText: string;
  /** Valor atual, em passos: o mesmo número do cartão. */
  endSteps: number;
  endText: string;
  /** Maiores causas e, se houver, "outros". */
  terms: EquationTerm[];
  /** Diferença de arredondamento em passos (0 = a conta fecha sem ajuste). */
  roundingSteps: number;
  roundingText: string | null;
  /** Explicação do ajuste, quando há; `null` quando não há. */
  roundingNote: string | null;
  /** A conta em uma linha (para o leitor de tela e para a linha de resumo). */
  line: string;
}

/** Fração → passos de exibição, com o mesmo arredondamento de `formatPercent`/`formatPointsDelta` (toFixed). */
export function toSteps(fraction: number, decimals: number): number {
  const rounded = Number((fraction * PERCENT).toFixed(decimals));
  return Math.round(rounded * 10 ** decimals);
}

function stepsValue(steps: number, decimals: number): number {
  return steps / 10 ** decimals;
}

/** Passos → "48,0%". */
function levelText(steps: number, decimals: number): string {
  return `${formatNumber(stepsValue(steps, decimals), decimals)}%`;
}

/** Passos → "+0,3" / "−0,5" / "0,0". */
export function signedText(steps: number, decimals: number): string {
  const body = formatNumber(Math.abs(stepsValue(steps, decimals)), decimals);
  return steps > 0 ? `+${body}` : steps < 0 ? `${MINUS}${body}` : body;
}

/**
 * Monta a conta de `key` a partir do relatório do mês. `current` é o valor mostrado no cartão; `previous`, o do mês
 * passado (sem ele, sai de `current` menos a soma das causas, que é a mesma coisa pelo invariante §7.3).
 */
export function buildIndicatorEquation(
  report: MonthReport,
  key: IndicatorKey,
  current: number,
  previous: number | undefined,
  decimals: number,
  label: string,
): IndicatorEquation {
  const causes = explainIndicator(report, key);
  const total = causes.reduce((n, c) => n + c.delta, 0);
  const start = previous ?? current - total;
  const startSteps = toSteps(start, decimals);
  const endSteps = toSteps(current, decimals);

  const top = causes.slice(0, EQUATION_TOP_TERMS);
  const rest = causes.slice(EQUATION_TOP_TERMS);
  const terms: EquationTerm[] = top.map((c) => {
    const steps = toSteps(c.delta, decimals);
    return { key: c.cause, label: c.label, steps, text: signedText(steps, decimals), merged: 0 };
  });
  if (rest.length > 0) {
    const steps = toSteps(
      rest.reduce((n, c) => n + c.delta, 0),
      decimals,
    );
    terms.push({ key: 'outros', label: 'outros', steps, text: signedText(steps, decimals), merged: rest.length });
  }

  const roundingSteps = endSteps - startSteps - terms.reduce((n, t) => n + t.steps, 0);
  const roundingText = roundingSteps === 0 ? null : signedText(roundingSteps, decimals);
  const unitStep = signedText(1, decimals).slice(1);
  const roundingNote =
    roundingSteps === 0
      ? null
      : `Cada parcela foi arredondada para ${unitStep} p.p.; a diferença de ${signedText(roundingSteps, decimals)} p.p. vem desse arredondamento.`;

  const startText = levelText(startSteps, decimals);
  const endText = levelText(endSteps, decimals);
  const parts = terms.map((t) => `${spaced(t.text)} ${t.label}`);
  if (roundingText) parts.push(`${spaced(roundingText)} arredondamento`);
  const line =
    parts.length === 0
      ? `${label}: ${startText} no mês passado, sem variação = ${endText}`
      : `${label}: ${startText} no mês passado ${parts.join(' ')} = ${endText}`;

  return { startSteps, startText, endSteps, endText, terms, roundingSteps, roundingText, roundingNote, line };
}

/** "+0,3" → "+ 0,3"; "−0,5" → "− 0,5"; "0,0" → "+ 0,0" (para ler como conta). */
function spaced(text: string): string {
  if (text.startsWith('+') || text.startsWith(MINUS)) return `${text[0]} ${text.slice(1)}`;
  return `+ ${text}`;
}
