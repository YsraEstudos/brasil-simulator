import { toCalendar, type DecisionRejection, type Difficulty, type IndicatorKey, type ProposalStatus } from '@/engine';
import type { Instrument } from '@/types/policy';

const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

/** 0 → "Janeiro de 2027" */
export function monthLabel(monthIndex: number): string {
  const { year, month } = toCalendar(monthIndex);
  return `${MONTHS[month - 1]} de ${year}`;
}

/** 0 → "jan/2027" */
export function shortMonthLabel(monthIndex: number): string {
  const { year, month } = toCalendar(monthIndex);
  return `${MONTHS[month - 1].slice(0, 3).toLowerCase()}/${year}`;
}

export const DIFFICULTY: Record<Difficulty, { name: string; description: string }> = {
  casual: { name: 'Casual', description: 'Regras simplificadas, 4 pontos de agenda, menos imprevistos.' },
  estrategica: { name: 'Estratégica', description: 'Regras completas e 3 pontos de agenda. O modo padrão.' },
  realismo: { name: 'Realismo Extremo', description: 'Regras detalhadas, dados com atraso e mais incerteza.' },
};

/** Nome, sentido e casas decimais de cada indicador na tela (GAME_DESIGN.md §8.1). */
export const INDICATOR_META: Record<
  IndicatorKey,
  { label: string; goodWhen: 'up' | 'down'; decimals: number; context?: string }
> = {
  approval: { label: 'Aprovação', goodWhen: 'up', decimals: 1 },
  inflation12m: { label: 'Inflação (12 meses)', goodWhen: 'down', decimals: 1, context: 'meta 3,0%' },
  unemployment: { label: 'Desemprego', goodWhen: 'down', decimals: 1 },
  gdpGrowth12m: { label: 'PIB (12 meses)', goodWhen: 'up', decimals: 1 },
  primaryBalance12m: { label: 'Resultado primário (% do PIB)', goodWhen: 'up', decimals: 2 },
};

/** Ordem em que os indicadores aparecem na tela. */
export const INDICATOR_ORDER: readonly IndicatorKey[] = [
  'approval',
  'inflation12m',
  'unemployment',
  'gdpGrowth12m',
  'primaryBalance12m',
];

/** 0 → "0 pontos", 1 → "1 ponto", 2 → "2 pontos". */
export function costText(points: number): string {
  return `${points} ${points === 1 ? 'ponto' : 'pontos'}`;
}

export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  bloqueada: 'Bloqueada',
  em_tramitacao: 'Em tramitação',
  parada: 'Parada (sem pauta)',
  rejeitada: 'Rejeitada',
  aprovada: 'Aprovada',
  em_execucao: 'Em execução',
  concluida: 'Concluída',
  suspensa: 'Suspensa',
  abandonada: 'Abandonada',
};

/** Situações em que a política já está em andamento e não pode ser enviada de novo (motor: advanceMonth). */
export const PROPOSAL_IN_PROGRESS: ReadonlySet<ProposalStatus> = new Set<ProposalStatus>([
  'em_tramitacao',
  'parada',
  'aprovada',
  'em_execucao',
]);

export const REJECTION_REASON_LABEL: Record<DecisionRejection, string> = {
  sem_pontos_de_agenda: 'sem pontos de agenda suficientes',
  custo_invalido: 'custo inválido',
  politica_desconhecida: 'política indisponível neste cenário',
  acao_repetida: 'ação já feita neste mês',
  ja_em_andamento: 'já está em andamento',
  evento_nao_pendente: 'o evento não está mais pendente',
  escolha_invalida: 'escolha inválida',
};

export const INSTRUMENT_LABEL: Record<Instrument, string> = {
  decreto_regulamentar: 'Decreto regulamentar',
  decreto_aliquota: 'Decreto de alíquota',
  decreto_programacao: 'Decreto de programação orçamentária',
  medida_provisoria: 'Medida provisória',
  projeto_lei: 'Projeto de lei',
  projeto_lei_complementar: 'Projeto de lei complementar',
  pec: 'Proposta de emenda à Constituição (PEC)',
  pln: 'Projeto de lei de crédito (PLN)',
  portaria: 'Portaria',
  convenio: 'Convênio',
  ato_execucao: 'Ato do Executivo',
};
