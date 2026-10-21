import type { ParamSpec } from '../economy/calibration';

/**
 * Calibração dos eventos da Fase 07 (AI_INSTRUCTIONS.md §3: sem números mágicos). Mesma forma de `PARAMS` do
 * módulo de economia: valor, faixa, significado e justificativa. Valores PROVISORIO, sujeitos a ajuste pelas
 * campanhas-robô da Fase 07 (T8).
 */

const JOGO = 'critério de jogo: legibilidade da pressão; testado na faixa';

/**
 * Pressão de impeachment em logit (POLITICAL_RULES.md §10): `pressão = 1 / (1 + e^−logit)`, com o logit uma soma
 * de termos lineares e limitados. A logística é a saturação do modelo (ECONOMIC_MODEL.md §1.8): não passa de 1.
 */
export const IMPEACHMENT_PARAMS = {
  intercepto: {
    value: -4.5,
    min: -6,
    max: -3,
    note: 'logit com todos os fatores neutros (pressão de cerca de 1%)',
    basis: JOGO,
  },
  aprovacao_neutra: {
    value: 0.5,
    min: 0.4,
    max: 0.6,
    note: 'aprovação (fração) a partir da qual a baixa aprovação passa a pesar',
    basis: 'metade do eleitorado: referência neutra do indicador',
  },
  peso_aprovacao: {
    value: 8,
    min: 4,
    max: 12,
    note: 'logit por unidade (100 p.p.) de aprovação abaixo da neutra; acima dela, reduz a pressão',
    basis: JOGO,
  },
  peso_relacao: {
    value: 2,
    min: 1,
    max: 3,
    note: 'logit por 100 pontos de relação ruim com o Congresso (−100…100)',
    basis: JOGO,
  },
  peso_escandalo: {
    value: 0.8,
    min: 0.4,
    max: 1.2,
    note: 'logit por marca de escândalo ou CPI ativa (POLITICAL_RULES.md §9)',
    basis: JOGO,
  },
  escandalos_max: {
    value: 4,
    min: 3,
    max: 6,
    note: 'marcas de escândalo ou CPI que ainda contam; acima disso a pressão não cresce por esta via',
    basis: 'saturação de segurança (ECONOMIC_MODEL.md §1.8)',
  },
  escala_excesso_limite: {
    value: 0.01,
    min: 0.005,
    max: 0.02,
    note: 'excesso do limite de despesa (fração do PIB) que vale uma unidade de peso',
    basis: 'ordem de grandeza do arcabouço: 1 ponto percentual do PIB',
  },
  peso_excesso_limite: {
    value: 2,
    min: 1,
    max: 3,
    note: 'logit por unidade de excesso do limite (ver escala_excesso_limite)',
    basis: 'descumprimento grave da LRF é flag de crime de responsabilidade (POLITICAL_RULES.md §10)',
  },
  desemprego_neutro: {
    value: 0.08,
    min: 0.06,
    max: 0.1,
    note: 'desemprego (fração) acima do qual a alta passa a pesar',
    basis: 'faixa típica do desemprego brasileiro em anos normais (IBGE, PNAD Contínua)',
  },
  escala_desemprego: {
    value: 0.05,
    min: 0.03,
    max: 0.08,
    note: 'alta do desemprego acima do neutro (5 p.p.) que vale uma unidade de peso',
    basis: JOGO,
  },
  peso_desemprego: {
    value: 1,
    min: 0.5,
    max: 2,
    note: 'logit por unidade de alta do desemprego (ver escala_desemprego)',
    basis: JOGO,
  },
} as const satisfies Record<string, ParamSpec>;

/** Limite do prestígio de personagens (−100…100), igual ao contrato de `characterEffectSchema` (FASE_07.md). */
export const STANDING_LIMIT = 100;

/** Limite da relação com o Congresso e com os governadores (−100…100), na mesma escala do prestígio. */
export const RELATION_LIMIT = 100;

/**
 * Eventos geográficos (PLANO_GLOBO.md §6.3; PR 9). O local de um evento climático é congelado no disparo.
 * `PROVISORIO`, a rever na revisão de calibração do PLANO_GLOBO.md §10.
 */
export const GEO_EVENT_PARAMS = {
  ufs_max: {
    value: 8,
    min: 3,
    max: 12,
    note: 'máximo de UFs no local de um evento climático (as de maior severidade); o resto do país segue sob o efeito do próprio clima',
    basis: `${JOGO}; o cartão do evento e a notícia precisam caber numa linha legível`,
  },
} as const satisfies Record<string, ParamSpec>;
