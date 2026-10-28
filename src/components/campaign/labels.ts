import {
  calendarAt,
  currentCareerTurn,
  offsetOfKey,
  toCalendar,
  type DecisionRejection,
  type Difficulty,
  type GameContent,
  type GameState,
  type IndicatorKey,
  type PreInaugurationStage,
  type ProposalStatus,
} from '@/engine';
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

/** Estágios antes da posse (PLANO_CAMPANHA.md Fase C5), como o jogador os lê. */
export const CAREER_STAGE_LABEL: Record<PreInaugurationStage, string> = {
  pre_campanha: 'Pré-campanha',
  convencao: 'Convenção',
  corrida: 'Corrida eleitoral',
  eleicao: 'Eleição',
  transicao: 'Transição',
};

/** Turno antes da posse: "Agosto de 2026" ou, condensado, "Novembro a dezembro de 2026". */
export function careerTurnLabel(turn: { from: string; to?: string }): string {
  const from = calendarAt(offsetOfKey(turn.from));
  const to = calendarAt(offsetOfKey(turn.to ?? turn.from));
  if (from.month === to.month && from.year === to.year) return `${MONTHS[from.month - 1]} de ${from.year}`;
  const start = from.year === to.year ? MONTHS[from.month - 1] : `${MONTHS[from.month - 1]} de ${from.year}`;
  return `${start} a ${MONTHS[to.month - 1].toLowerCase()} de ${to.year}`;
}

/** Turno antes da posse, curto: "ago/2026" ou "nov–dez/2026". */
export function shortCareerTurnLabel(turn: { from: string; to?: string }): string {
  const from = calendarAt(offsetOfKey(turn.from));
  const to = calendarAt(offsetOfKey(turn.to ?? turn.from));
  const short = (m: number) => MONTHS[m - 1].slice(0, 3).toLowerCase();
  if (from.month === to.month && from.year === to.year) return `${short(from.month)}/${from.year}`;
  if (from.year === to.year) return `${short(from.month)}–${short(to.month)}/${to.year}`;
  return `${short(from.month)}/${from.year}–${short(to.month)}/${to.year}`;
}

/**
 * Rótulo curto do turno em jogo: o do calendário da campanha antes da posse e o mês do mandato depois. Encerrada,
 * a partida mostra o último mês jogado (`monthIndex` já é o seguinte).
 */
export function shortTurnLabel(state: GameState, content: GameContent, finished = false): string {
  const career = currentCareerTurn(state, content);
  if (career) return shortCareerTurnLabel(career);
  return shortMonthLabel(finished ? Math.max(0, state.monthIndex - 1) : state.monthIndex);
}

export const DIFFICULTY: Record<Difficulty, { name: string; description: string }> = {
  casual: { name: 'Casual', description: 'Regras simplificadas, 4 ações por mês, menos imprevistos.' },
  estrategica: { name: 'Estratégica', description: 'Regras completas e 3 ações por mês. O modo padrão.' },
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

/** Intenção de voto (Fase 08): não é indicador de economia, mas tem valor, sentido e "Por que mudou?" próprios. */
export const VOTING_INTENTION_META: { label: string; goodWhen: 'up' | 'down'; decimals: number } = {
  label: 'Intenção de voto',
  goodWhen: 'up',
  decimals: 1,
};

/** 0 → "0 ações", 1 → "1 ação", 2 → "2 ações". */
export function costText(cost: number): string {
  return `${cost} ${cost === 1 ? 'ação' : 'ações'}`;
}

const AREA_LABELS: Record<string, string> = {
  agro: 'Agricultura',
  agropecuaria: 'Agropecuária',
  cidades: 'Cidades',
  educacao: 'Educação',
  economia: 'Economia',
  energia: 'Energia',
  estado: 'Estado',
  fiscal: 'Fiscal',
  habitacao: 'Habitação',
  infraestrutura: 'Infraestrutura',
  previdencia: 'Previdência',
  saude: 'Saúde',
  saneamento: 'Saneamento',
  seguranca: 'Segurança',
  social: 'Social',
  tributacao: 'Tributação',
};

/** Nome legível de uma área do catálogo, sem expor o identificador interno. */
export function areaLabel(area: string): string {
  const known = AREA_LABELS[area];
  if (known) return known;
  const humanized = area.replaceAll('_', ' ').trim();
  return humanized ? humanized.charAt(0).toUpperCase() + humanized.slice(1) : 'Área';
}

export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  bloqueada: 'Bloqueada',
  em_tramitacao: 'Em tramitação',
  parada: 'Parada (sem pauta)',
  rejeitada: 'Rejeitada',
  aprovada: 'Aprovada',
  aguardando_sancao: 'Aguardando sanção',
  apreciacao_veto: 'Veto em apreciação',
  vetada: 'Vetada',
  em_execucao: 'Em execução',
  concluida: 'Concluída',
  suspensa: 'Suspensa',
  abandonada: 'Abandonada',
};

/** Situações em que a política já está em andamento e não pode ser enviada de novo (motor: advanceMonth). */
export { PROPOSAL_IN_PROGRESS } from '@/engine';

export const REJECTION_REASON_LABEL: Record<DecisionRejection, string> = {
  alvo_invalido: 'alvo da ação indisponível',
  sem_acoes_de_agenda: 'sem ações de agenda suficientes',
  custo_invalido: 'custo inválido',
  politica_desconhecida: 'política indisponível neste cenário',
  acao_repetida: 'ação já feita neste mês',
  ja_em_andamento: 'já está em andamento',
  reedicao_vedada: 'medida provisória rejeitada ou caducada não pode ser reeditada no mesmo ano',
  vedacao_eleitoral: 'novo benefício vedado nos meses antes da eleição (inclua com quebra declarada)',
  evento_nao_pendente: 'o evento não está mais pendente',
  escolha_invalida: 'escolha inválida',
  fora_do_estagio: 'ainda não disponível nesta etapa da campanha',
  sem_recursos: 'sem recursos de campanha suficientes',
  teto_legal: 'acima do limite legal da campanha',
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
