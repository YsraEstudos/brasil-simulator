/**
 * Parâmetros de apresentação das notícias (FASE_07.md, tarefa T2). Não são coeficientes do modelo econômico:
 * definem quantas notícias ficam guardadas, quantas nascem por mês e em que níveis um indicador vira manchete.
 * Todos os níveis são frações, como os indicadores (ECONOMIC_MODEL.md §2: 0,06 = 6%). Os níveis são escolhas de
 * jogo (critério de legibilidade do feed), não previsões; ajustáveis sem mudar a lógica de `news.ts`.
 */

/** Notícias guardadas no estado (feed da aba Notícias). As mais antigas saem primeiro. */
export const NEWS_LIMIT = 48;

/**
 * Manchetes geradas por mês. Se houver mais candidatas, ficam as de maior prioridade: institucional, evento,
 * personagem, congresso e, por último, economia (news.ts).
 */
export const NEWS_PER_MONTH_MAX = 6;

/**
 * Níveis de cruzamento por indicador. Uma manchete sai quando o valor cruza um nível, para cima ou para baixo, e
 * no máximo uma por indicador no mês (o nível percorrido mais longe). Listas em ordem crescente.
 */
export const NEWS_LEVELS = {
  /** IPCA 12 meses: 4,5% é a faixa de alerta e 6% é inflação alta (critério de jogo). */
  inflation12m: [0.045, 0.06],
  /** Desemprego: 6% é o patamar de atenção e 8% é desemprego alto (critério de jogo). */
  unemployment: [0.06, 0.08],
  /** Aprovação do governo: 30% é impopularidade e 50% é maioria de apoio (critério de jogo). */
  approval: [0.3, 0.5],
  /** Dívida bruta do governo geral, fração do PIB: 90% e 100% do PIB são os patamares de alerta. */
  grossDebt: [0.9, 1.0],
  /** Prêmio de risco soberano anual: 3 p.p. acima da referência é sinal de desconfiança (critério de jogo). */
  riskPremium: [0.03],
  /** Selic meta anual: 10% e 15% marcam mudanças de ciclo para a manchete (o Copom já tem a sua). */
  selic: [0.1, 0.15],
} as const;

/** Variação do câmbio (R$/US$) em um mês acima da qual sai manchete, em módulo. */
export const NEWS_EXCHANGE_MONTHLY_MOVE = 0.05;

/**
 * Escala mínima ao comparar variações de condições de evento com o limiar (evita divisão por limiar zero ou muito
 * pequeno). Só afeta a escolha de qual condição aparece na causa.
 */
export const NEWS_CAUSE_MARGIN_FLOOR = 0.01;
