import type { TradeSector } from '../../types/trade';

/**
 * Comércio exterior e diplomacia (PLANO_EXPANSAO F14, EX-25). Estado do país, não do governo: acordos, relações e
 * tarifa atravessam as trocas de administração (plano F14: "acordos persistem entre governos").
 */

/** Etapas de um acordo comercial: negociação, ratificação pelo Congresso (CF art. 49, I), vigência. */
export type TradeAgreementStage = 'negociacao' | 'ratificacao' | 'vigente' | 'rejeitado' | 'encerrado';

export interface TradeAgreement {
  stage: TradeAgreementStage;
  /** Rodadas de negociação cumpridas (com o bônus da diplomacia). */
  progress: number;
  startedMonth: number;
  signedMonth?: number;
  /** Mês da votação no Congresso (agendada na assinatura). */
  voteMonth?: number;
  /** Placar por Casa, quando votado. */
  votes?: { camara: { yes: number; no: number }; senado: { yes: number; no: number } };
  inForceFrom?: number;
  /** Último mês de vigência (inclusive). */
  endMonth?: number;
  /** Mês em que terminou (rejeição ou fim da vigência), para o prazo de nova tentativa. */
  closedMonth?: number;
}

export interface TradePartnerState {
  id: string;
  /** Relação diplomática, −100 a 100. */
  relation: number;
  agreement?: TradeAgreement;
}

export interface TradeShock {
  id: string;
  kind: 'barreira' | 'cadeia';
  /** Parceiro que impôs a barreira. */
  partnerId?: string;
  startMonth: number;
  /** Último mês ativo (inclusive). */
  endMonth: number;
  /** Fração do acesso perdida (barreira) ou alta dos preços de importação (cadeia). */
  size: number;
}

/**
 * Fluxos do último mês, em fração do PIB anualizada e **como desvio do início da campanha**: o nível de comércio do
 * cenário já está na economia; aqui só entra o que as decisões e os choques mudaram.
 */
export interface TradeFlows {
  /** Exportações de bens perdidas ou ganhas pelo acesso aos mercados. */
  exports: number;
  /** Exportações de tecnologia certificada. */
  techExports: number;
  /** Importações a mais (tarifa e acordos). */
  imports: number;
  /** Importações dos programas de tecnologia (parte paga a fornecedores externos). */
  techImports: number;
  /** Saldo: exportações − importações (desvios). */
  net: number;
  /** Arrecadação do imposto de importação em relação à do início. */
  tariffRevenue: number;
  /** Exportações perdidas ou ganhas por setor mais exposto. */
  sectors: Record<TradeSector, number>;
}

export interface TradeState {
  /** Tarifa média de importação (fração). */
  tariff: number;
  partners: TradePartnerState[];
  /** Choques ativos. Vencidos saem do estado (o relatório do mês guarda a nota). */
  shocks: TradeShock[];
  flows: TradeFlows;
}
