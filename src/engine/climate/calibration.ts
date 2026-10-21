import type { ParamSpec } from '../economy/calibration';
import type { Difficulty } from '../types';

/**
 * Calibração do clima (PLANO_GLOBO.md §6; AI_INSTRUCTIONS.md §3: sem números mágicos). Mesma forma de `PARAMS` e
 * `PROFILE_PARAMS`: valor, faixa, significado e justificativa. Valores `PROVISORIO`, a rever no PR 8 (motor
 * climático) e na revisão de calibração do PLANO_GLOBO.md §10.
 *
 * **Contrato do PR 7:** estes parâmetros existem para o `climateEvolutionStep` e os efeitos regionais do PR 8;
 * nenhum código do motor os lê ainda (só validadores e testes), de modo que o PR 7 não muda nenhum resultado de
 * simulação. Quem adicionar um parâmetro aqui sem usá-lo no PR 8 deve removê-lo.
 *
 * Unidades: o índice ENSO é adimensional em [−1, 1] (+ = El Niño, − = La Niña); a anomalia de chuva é fração da
 * normal do mês (0 = normal); a seca é 0–1; "por mês" quando aplicado a cada turno. Sorteios: só o PRNG do clima
 * (`GameState.climate.rng`).
 */

const JOGO = 'critério de jogo: legibilidade e ritmo da campanha; testado na faixa';
const SATURACAO = 'saturação de segurança (ECONOMIC_MODEL.md §1.8)';
const ENSO_LIT =
  'ordem de grandeza da climatologia do ENSO (NOAA/CPC): eventos duram ~9–12 meses, retorno ao neutro em 1–3 anos';
const CHUVA_LIT = 'ordem de grandeza da variabilidade mensal da chuva no Brasil (INMET/CPTEC), suavizada para o jogo';

export const CLIMATE_PARAMS = {
  // --- ENSO (AR(1) saturado)
  enso_persistencia: {
    value: 0.92,
    min: 0.85,
    max: 0.97,
    note: 'φ: coeficiente AR(1) mensal do índice ENSO latente (memória do mês anterior)',
    basis: `${ENSO_LIT}; e^(−1/12) ≈ 0,92: constante de tempo de ~1 ano`,
  },
  enso_choque: {
    value: 0.18,
    min: 0.1,
    max: 0.3,
    note: 'desvio-padrão do choque mensal (normal do PRNG do clima) sobre o índice ENSO latente',
    basis: `${ENSO_LIT}; desvio estacionário do latente = σ/√(1−φ²) ≈ 0,46 antes da saturação`,
  },
  enso_saturacao: {
    value: 1,
    min: 0.7,
    max: 1.5,
    note: 'escala da saturação do ENSO: índice = tanh(latente ÷ escala), sempre dentro de (−1, 1)',
    basis: SATURACAO,
  },
  // --- anomalia de chuva por UF
  chuva_persistencia: {
    value: 0.35,
    min: 0.1,
    max: 0.6,
    note: 'fração da anomalia do mês anterior que a UF carrega para o mês seguinte (umidade do solo, regime regional)',
    basis: `${CHUVA_LIT}; autocorrelação mensal baixa a moderada`,
  },
  chuva_choque_regional: {
    value: 0.14,
    min: 0.05,
    max: 0.25,
    note: 'desvio-padrão do choque mensal compartilhado por todas as UFs de uma macrorregião (fração da normal)',
    basis: `${CHUVA_LIT}; a chuva é espacialmente coerente numa região`,
  },
  chuva_choque_uf: {
    value: 0.16,
    min: 0.05,
    max: 0.3,
    note: 'desvio-padrão do ruído mensal próprio de cada UF (fração da normal)',
    basis: `${CHUVA_LIT}; menor que a variabilidade real para o jogo ficar legível`,
  },
  chuva_anomalia_max: {
    value: 0.6,
    min: 0.4,
    max: 0.9,
    note: 'anomalia máxima em módulo (fração da normal): a anomalia é tanh-saturada nesse teto',
    basis: SATURACAO,
  },
  // --- dificuldade: magnitude, nunca o lugar (PLANO_GLOBO.md §6.2)
  intensidade_casual: {
    value: 0.7,
    min: 0.5,
    max: 1,
    note: 'multiplicador da magnitude do ENSO e dos choques de chuva na dificuldade Casual',
    basis: JOGO,
  },
  intensidade_estrategica: {
    value: 1,
    min: 0.8,
    max: 1.2,
    note: 'multiplicador da magnitude do ENSO e dos choques de chuva na dificuldade Estratégica (referência)',
    basis: JOGO,
  },
  intensidade_realismo: {
    value: 1.2,
    min: 1,
    max: 1.5,
    note: 'multiplicador da magnitude do ENSO e dos choques de chuva na dificuldade Realismo',
    basis: JOGO,
  },
  // --- seca com memória e recuperação
  seca_limiar_anomalia: {
    value: -0.1,
    min: -0.3,
    max: 0,
    note: 'anomalia de chuva (fração da normal) abaixo da qual o mês conta como déficit para a seca',
    basis: 'convenção de seca meteorológica: chuva abaixo de ~90% da normal já é considerada seca leve',
  },
  seca_deficit_referencia_mm: {
    value: 60,
    min: 30,
    max: 120,
    note: 'déficit (ou excesso) de chuva em mm que satura, via tanh, o ganho (ou a recuperação) mensal da seca',
    basis: `${SATURACAO}; o déficit em mm separa o semiárido (pouca chuva a perder) de uma região úmida (PLANO_GLOBO.md §6.1)`,
  },
  seca_ganho: {
    value: 0.3,
    min: 0.15,
    max: 0.5,
    note: 'aumento máximo mensal da seca (fração de 0–1) com déficit saturado',
    basis: `${JOGO}; ~4 meses de déficit forte levam a seca a ~0,7`,
  },
  seca_memoria: {
    value: 0.85,
    min: 0.7,
    max: 0.95,
    note: 'fração da seca acumulada que persiste de um mês para o outro (decai sem déficit)',
    basis: `${JOGO}; meia-vida de ~4 meses`,
  },
  seca_recuperacao: {
    value: 0.25,
    min: 0.1,
    max: 0.5,
    note: 'redução máxima mensal extra da seca por chuva acima da normal (excesso saturado em mm)',
    basis: `${JOGO}; uma estação chuvosa boa encerra a seca, mas não de uma vez`,
  },
  // --- cheia
  cheia_limiar_anomalia: {
    value: 0.35,
    min: 0.2,
    max: 0.6,
    note: 'anomalia positiva de chuva a partir da qual o risco de cheia começa a subir',
    basis: `${CHUVA_LIT}; chuva ~35% acima da normal já supera a capacidade de drenagem de áreas vulneráveis`,
  },
  cheia_peso_umidade: {
    value: 0.5,
    min: 0.2,
    max: 0.8,
    note: 'peso da anomalia positiva do mês anterior (solo úmido) somada à do mês no risco de cheia',
    basis: `${JOGO}; solo saturado escoa mais`,
  },
  cheia_escala: {
    value: 0.25,
    min: 0.1,
    max: 0.5,
    note: 'excesso de anomalia acima do limiar que satura o risco de cheia (tanh)',
    basis: SATURACAO,
  },
  cheia_risco_max: {
    value: 0.6,
    min: 0.3,
    max: 0.9,
    note: 'risco mensal máximo de cheia numa UF (antes da vulnerabilidade); nunca certeza',
    basis: `${SATURACAO}; crise só acontece com causa registrada`,
  },
  // --- tetos dos efeitos (usados pelo PR 8)
  dano_pib_seca_max: {
    value: 0.005,
    min: 0.002,
    max: 0.01,
    note: 'perda máxima de nível do PIB por seca nacional extrema (fração do PIB, estado estacionário)',
    basis: `${JOGO}; ordem de grandeza das quebras de safra e crises hídricas recentes; a revisar no PR 8`,
  },
  dano_alimentos_seca_max: {
    value: 0.01,
    min: 0.005,
    max: 0.02,
    note: 'pressão máxima da seca sobre a inflação de alimentos (fração em 12 meses)',
    basis: `${JOGO}; a revisar no PR 8`,
  },
  aprovacao_clima_max: {
    value: 0.015,
    min: 0.005,
    max: 0.03,
    note: 'desvio máximo de aprovação de uma UF por chuva acima da normal ou seca prolongada (redistribui, D7)',
    basis: `${JOGO}; menor que o do alinhamento (alinhamento_regional_max = 0,04); a revisar no PR 8`,
  },
} as const satisfies Record<string, ParamSpec>;

export type ClimateParamName = keyof typeof CLIMATE_PARAMS;

/** Valor de um parâmetro do clima. */
export function climateParam(name: ClimateParamName): number {
  return CLIMATE_PARAMS[name].value;
}

/** Multiplicador de magnitude do clima por dificuldade (PLANO_GLOBO.md §6.2: muda a magnitude, nunca o lugar). */
export const CLIMATE_INTENSITY_PARAM: Readonly<Record<Difficulty, ClimateParamName>> = {
  casual: 'intensidade_casual',
  estrategica: 'intensidade_estrategica',
  realismo: 'intensidade_realismo',
};
