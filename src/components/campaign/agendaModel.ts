import type { FiscalFormatOptions } from '@/components/ui/format';
import {
  APPOINT_ACTION_ID,
  DIRECTIVE_ACTION_ID,
  ministriesOf,
  SANCTION_ACTION_ID,
  type Decision,
  type GameContent,
} from '@/engine';
import { legislativeInstrument } from '@/engine/congress/congress';
import { draftCost, hasDecision, type AgendaDraft } from '@/store/agendaDraft';
import type { Policy } from '@/types/policy';

/**
 * Agenda do mês no Gabinete (PLANO_QUICK_WINS.md, Fase Q7): custo total, aviso de defasagem e a lista fechada de
 * decisões irreversíveis (D-Q2). Puro: sem React; a tela só desenha o que sai daqui.
 */

// ---------------------------------------------------------------------------------------------------------------
// Custo total (B31)
// ---------------------------------------------------------------------------------------------------------------

export interface AgendaTotals {
  /** Ações de agenda usadas (decisões e respostas a eventos). */
  actions: number;
  decisions: number;
  eventAnswers: number;
  /** Custo fiscal anual somado, em R$ milhões (negativo = economia). Diretrizes contam o orçamento escolhido. */
  annualMillions: number;
}

/** Custo fiscal anual de uma decisão do rascunho (zero para ações sem custo fiscal). */
export function decisionAnnualMillions(decision: Decision, content: GameContent): number {
  if (decision.policyId === DIRECTIVE_ACTION_ID) {
    const budget = decision.params?.annualMillions;
    return typeof budget === 'number' && Number.isFinite(budget) ? budget : 0;
  }
  return content.policies[decision.policyId]?.cost.annualMillions ?? 0;
}

export function agendaTotals(draft: AgendaDraft, content: GameContent): AgendaTotals {
  return {
    actions: draftCost(draft, content),
    decisions: draft.decisions.length,
    eventAnswers: Object.keys(draft.eventChoices).length,
    annualMillions: draft.decisions.reduce((sum, d) => sum + decisionAnnualMillions(d, content), 0),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Defasagem (D37)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Aviso de efeito com defasagem: "O primeiro efeito chega 1 mês depois…". `null` quando todos os impactos valem no
 * mês seguinte ao envio (`lagMonths` zero).
 */
export function lagNotice(policy: Pick<Policy, 'impacts'>): string | null {
  const lags = policy.impacts.map((impact) => impact.lagMonths);
  const longest = Math.max(0, ...lags);
  if (longest === 0) return null;
  const shortest = Math.min(...lags);
  const months = (n: number) => `${n} ${n === 1 ? 'mês' : 'meses'}`;
  if (shortest === longest) {
    return `Os efeitos chegam ${months(longest)} depois de a decisão começar a valer. Não espere mudança no mês seguinte.`;
  }
  if (shortest === 0) {
    return `Parte do efeito vem logo; o resto chega até ${months(longest)} depois de a decisão começar a valer.`;
  }
  return `O primeiro efeito chega ${months(shortest)} depois de a decisão começar a valer; o último, ${months(longest)} depois.`;
}

// ---------------------------------------------------------------------------------------------------------------
// Decisões irreversíveis (B96, lista fechada D-Q2)
// ---------------------------------------------------------------------------------------------------------------

export interface IrreversibleWarning {
  title: string;
  message: string;
  confirmLabel: string;
}

const AFTER_MONTH = 'Depois de encerrar o mês, não dá para voltar atrás.';

/**
 * Pede confirmação só ao **incluir** uma decisão da lista fechada: veto total, troca de ministro (demite o atual) e
 * PEC. Tirar da agenda, ou marcar algo já marcado, nunca pergunta.
 */
export function irreversibleWarning(
  decision: Decision,
  draft: AgendaDraft,
  content: GameContent,
): IrreversibleWarning | null {
  if (hasDecision(draft, decision)) return null;

  if (decision.policyId === SANCTION_ACTION_ID && decision.params?.choice === 'vetar_total') {
    return {
      title: 'Vetar o projeto inteiro?',
      message: `O projeto não vira lei. Só o Congresso pode derrubar o veto, por maioria absoluta de cada Casa. ${AFTER_MONTH}`,
      confirmLabel: 'VETAR TUDO',
    };
  }

  if (decision.policyId === APPOINT_ACTION_ID) {
    const ministryId = decision.params?.ministryId;
    const ministry = ministriesOf(content).find((m) => m.id === ministryId);
    const where = ministry ? `de ${ministry.name}` : 'da pasta';
    return {
      title: `Trocar o ministro ${where}?`,
      message: `Quem ocupa a pasta hoje é demitido. Se for indicação de um bloco, a demissão custa capital político e a relação com o bloco. ${AFTER_MONTH}`,
      confirmLabel: 'TROCAR MINISTRO',
    };
  }

  const policy = content.policies[decision.policyId];
  if (policy && legislativeInstrument(policy) === 'pec') {
    return {
      title: `Enviar a PEC "${policy.name}"?`,
      message: `Emenda à Constituição precisa de 3/5 nas duas Casas, em dois turnos. Ao encerrar o mês, ela vai ao Congresso e não pode ser enviada de novo enquanto estiver em andamento.`,
      confirmLabel: 'ENVIAR PEC',
    };
  }

  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Limpar e recomeçar (B26, B9)
// ---------------------------------------------------------------------------------------------------------------

/** Texto do "Limpar agenda": diz quantas decisões saem e lembra que as respostas a eventos ficam. */
export function clearAgendaMessage(totals: AgendaTotals): string {
  const what = totals.decisions === 1 ? 'A decisão marcada sai' : `As ${totals.decisions} decisões marcadas saem`;
  const events =
    totals.eventAnswers === 0
      ? ''
      : totals.eventAnswers === 1
        ? ' A resposta ao evento continua marcada.'
        : ` As ${totals.eventAnswers} respostas a eventos continuam marcadas.`;
  return `${what} da agenda.${events} Dá para desfazer até encerrar o mês.`;
}

/** Texto do "Recomeçar o mês": avisa que as respostas a eventos também saem. */
export function restartMonthMessage(totals: AgendaTotals): string {
  const answers = totals.eventAnswers === 1 ? 'a resposta ao evento' : `as ${totals.eventAnswers} respostas a eventos`;
  return `Tudo o que foi marcado neste mês sai, inclusive ${answers}. Dá para desfazer até encerrar o mês.`;
}

// Valor fiscal legível (o rodapé nunca mostra "0,0% do PIB" para um custo que existe)

export type Money = (millions: number, opts?: FiscalFormatOptions) => string;

/**
 * Valor que nunca aparece como zero: em % do PIB, um custo pequeno arredondaria para "0,0% do PIB". Tenta uma casa,
 * depois duas; abaixo disso, "menos de 0,01% do PIB".
 */
export function readableAmount(millions: number, money: Money): string {
  for (const decimals of [1, 2]) {
    const text = money(millions, { decimals });
    if (text !== money(0, { decimals })) return text;
  }
  return `menos de ${money(0, { decimals: 2 }).replace('0,00', '0,01')}`;
}
