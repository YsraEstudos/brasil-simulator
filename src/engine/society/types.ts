/** Setores nacionais acompanhados pelo bloco social (ECONOMIC_MODEL.md §3; Fase 06). */
export const SOCIETY_SECTOR_IDS = [
  'agropecuaria',
  'extrativa',
  'industria',
  'construcao',
  'energia',
  'servicos',
] as const;
export type SocietySectorId = (typeof SOCIETY_SECTOR_IDS)[number];

/** Quintis de renda, em ordem crescente. Cada quintil representa 20% da população. */
export const SOCIETY_QUINTILE_IDS = ['q1', 'q2', 'q3', 'q4', 'q5'] as const;
export type SocietyQuintileId = (typeof SOCIETY_QUINTILE_IDS)[number];

export interface SocietySectorState {
  id: SocietySectorId;
  /** Produção real do setor em índice do cenário; a soma é o produto nacional do mês. */
  output: number;
  /** Participação do setor no produto nacional; a soma é 1. */
  share: number;
  /** Crescimento do setor no mês, em fração. */
  growth: number;
}

export interface SocietyQuintileState {
  id: SocietyQuintileId;
  /** Renda real média do quintil, índice (1 = média da população no início do cenário). */
  realIncome: number;
  /** Participação do quintil na renda real total; a soma é 1. */
  incomeShare: number;
  /** Componente transitório de transferências/tributos, que converge ao efeito dos impulsos ativos. */
  policyAdjustment: number;
}

export type SocietyMetric =
  'sector_output' | 'real_income' | 'real_wage' | 'minimum_wage' | 'poverty_rate' | 'unemployment';

/** Explicação do mês consumida pela interface social. `cause` é o `sourceId` do impulso ou uma causa interna. */
export interface SocietyExplanation {
  cause: string;
  label: string;
  delta: number;
  metric: SocietyMetric;
}

export interface SocietyState {
  sectors: SocietySectorState[];
  quintiles: SocietyQuintileState[];
  /** Produto nacional real do mês: `potentialIndex × exp(outputGap)`. */
  nationalOutput: number;
  /** Renda real média da população, índice (1 = início do cenário). */
  realIncome: number;
  /** Taxa de desemprego copiada do indicador nacional já atualizado pela economia. */
  unemployment: number;
  /** Salário real médio, índice (1 = início do cenário). */
  realWage: number;
  /** Salário mínimo real, índice (1 = início do cenário). */
  minimumWage: number;
  /** Fração estimada da população abaixo da linha de pobreza. */
  povertyRate: number;
  /** Explicações do mês corrente; histórico fica fora do GameState. */
  explanations: SocietyExplanation[];
  /**
   * Termos de troca do mês anterior, para a composição reagir à variação (e não ao nível) dos termos de troca.
   * Ausente em saves anteriores: o primeiro mês após carregar não desloca a composição.
   */
  termsOfTrade?: number;
}
