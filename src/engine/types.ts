import type { RngState } from './rng';

/** Versão da estrutura do GameState. Mudou a estrutura → incrementar e escrever migração + teste (AI_INSTRUCTIONS.md §2.10). */
export const STATE_SCHEMA_VERSION = 1;

/** Versão do motor gravada nos saves (resultados podem mudar entre versões do motor). */
export const ENGINE_VERSION = '0.1.0';

export type Difficulty = 'casual' | 'estrategica' | 'realismo';

/**
 * Indicadores do protótipo (GAME_DESIGN.md §8.1). Todos em **fração decimal** (0,045 = 4,5%), nunca
 * porcentagem inteira (ECONOMIC_MODEL.md §2).
 */
export interface Indicators {
  /** Aprovação do governo, 0–1. */
  approval: number;
  /** Crescimento do PIB real em 12 meses. */
  gdpGrowth12m: number;
  /** IPCA acumulado em 12 meses. */
  inflation12m: number;
  /** Desemprego, fração da força de trabalho (0–1). */
  unemployment: number;
  /** Resultado primário acumulado em 12 meses, fração do PIB. */
  primaryBalance12m: number;
}

export type IndicatorKey = keyof Indicators;

/** Recursos do jogador (GAME_DESIGN.md §5). */
export interface Resources {
  /** 0–100 */
  politicalCapital: number;
  /** Pontos de agenda por mês (GAME_DESIGN.md §4.3). */
  agendaPointsPerMonth: number;
}

/**
 * Uma escolha do jogador no mês. Escolher nunca altera indicadores diretamente: a decisão vira uma proposta
 * que o motor processa (GAME_DESIGN.md §9). O catálogo de políticas e a máquina de estados chegam na Fase 02.
 */
export interface Decision {
  /** ID de conteúdo em português, ex.: `infraestrutura_credito_adicional`. */
  policyId: string;
  /** Custo em pontos de agenda (virá do catálogo na Fase 02). */
  agendaCost: number;
  params?: Readonly<Record<string, number | string | boolean>>;
}

export type DecisionRejection = 'sem_pontos_de_agenda' | 'custo_invalido';

/** Parcela de uma variação, com causa, para o "Por que mudou?" (ECONOMIC_MODEL.md §1.6). */
export interface Contribution {
  indicator: IndicatorKey;
  /** ID da causa: proposta, choque, Banco Central, tendência… */
  cause: string;
  delta: number;
}

/** Registro permanente de uma decisão aceita (trilha de auditoria). */
export interface DecisionRecord {
  monthIndex: number;
  decision: Decision;
}

export interface GameState {
  schemaVersion: typeof STATE_SCHEMA_VERSION;
  engineVersion: string;
  scenarioId: string;
  difficulty: Difficulty;
  seed: number;
  rng: RngState;
  /** Mês que está para ser jogado (0 = jan/2027). */
  monthIndex: number;
  indicators: Indicators;
  resources: Resources;
  decisionLog: DecisionRecord[];
}

export interface MonthReport {
  /** Mês processado. */
  monthIndex: number;
  accepted: Decision[];
  rejected: { decision: Decision; reason: DecisionRejection }[];
  /** Variação de cada indicador no mês, decomposta por causa. */
  contributions: Contribution[];
}

export interface MonthResult {
  state: GameState;
  report: MonthReport;
}
