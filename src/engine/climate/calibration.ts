import type { ParamSpec } from '../economy/calibration';
import type { Difficulty } from '../types';

/**
 * Calibração do clima (PLANO_GLOBO.md §6; AI_INSTRUCTIONS.md §3: sem números mágicos). Mesma forma de `PARAMS` e
 * `PROFILE_PARAMS`: valor, faixa, significado e justificativa. Valores `PROVISORIO`, a rever na revisão de calibração do
 * PLANO_GLOBO.md §10.
 *
 * **Todos os parâmetros são lidos pelo motor** (PR 8): `climate/evolution.ts` (ENSO, chuva, seca) e `climate/effects.ts`
 * (cheia, danos nacionais, humor regional). Quem adicionar um parâmetro aqui sem usá-lo deve removê-lo.
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
    note: 'escala da saturação do ENSO: índice = tanh((φ · índice anterior + choque) ÷ escala), sempre dentro de (−1, 1)',
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
  seca_deficit_referencia: {
    value: 0.25,
    min: 0.1,
    max: 0.5,
    note: 'déficit (ou excesso) de chuva, em mm, como fração da chuva mensal média da UF, que satura (tanh) o ganho (ou a recuperação) mensal da seca',
    basis: `${SATURACAO}; o déficit em mm vs. a normal do mês separa o semiárido (a estação chuvosa curta concentra a chuva: falhar nela pesa muito) de uma região úmida e de um mês seco (pouca chuva a perder)`,
  },
  seca_expoente_aridez: {
    value: 0.5,
    min: 0.25,
    max: 1,
    note: 'expoente da vulnerabilidade hídrica (chuva anual média do país ÷ chuva anual da UF)^expoente: >1 no semiárido, <1 em região úmida; multiplica o ganho da seca e divide a recuperação',
    basis: `${JOGO}; menos reserva de água (solo, rios, açudes) no semiárido: a mesma anomalia seca mais depressa e demora mais a se recuperar`,
  },
  seca_ganho: {
    value: 0.25,
    min: 0.15,
    max: 0.5,
    note: 'aumento máximo mensal da seca (fração de 0–1) com déficit saturado, antes da vulnerabilidade hídrica',
    basis: `${JOGO}; ~4–5 meses de déficit forte levam a seca a ~0,7`,
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
    note: 'redução máxima mensal extra da seca por chuva acima da normal (excesso saturado), antes da vulnerabilidade hídrica',
    basis: `${JOGO}; uma estação chuvosa boa encerra a seca, mas não de uma vez`,
  },
  // --- cheia
  cheia_limiar_anomalia: {
    value: 0.35,
    min: 0.2,
    max: 0.6,
    note: 'anomalia positiva de chuva a partir da qual o risco de cheia começa a subir (solo sem seca)',
    basis: `${CHUVA_LIT}; chuva ~35% acima da normal já supera a capacidade de drenagem de áreas vulneráveis`,
  },
  cheia_absorcao_seca: {
    value: 0.5,
    min: 0.2,
    max: 0.8,
    note: 'quanto a seca acumulada (0–1) eleva o limiar da cheia: limiar × (1 + valor × seca); solo úmido (sem seca) escoa mais, solo seco absorve',
    basis: `${JOGO}; a memória hídrica da UF (a seca) faz o papel da umidade do solo, sem guardar mais um número no estado`,
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
  cheia_vulnerabilidade_piso: {
    value: 0.4,
    min: 0.2,
    max: 0.7,
    note: 'vulnerabilidade da UF menos exposta (a de maior renda): vulnerabilidade = piso + (1 − piso) × pobreza ÷ pobreza máxima entre as UFs',
    basis: `${JOGO}; proxy simples e documentada: a pobreza do cenário representa moradia precária em área de risco (não há dado de risco geológico por UF)`,
  },
  // --- efeitos nacionais (agregados antes da economia; PLANO_GLOBO.md §6.2)
  dano_atividade_seca: {
    value: 0.1,
    min: 0.05,
    max: 0.2,
    note: 'perda (log) da atividade de uma UF por seca 1 e agropecuária 100% do valor adicionado: perda = valor × participação da agropecuária × seca',
    basis: `${JOGO}; MT/MS (agro ~25–30%) perdem ~2–3% de atividade relativa numa seca extrema; a soma ponderada pelo PIB é o dano nacional`,
  },
  dano_pib_seca_max: {
    value: 0.005,
    min: 0.002,
    max: 0.01,
    note: 'perda máxima de nível do PIB por seca nacional extrema (fração do PIB, estado estacionário; tanh sobre a soma ponderada dos danos das UFs)',
    basis: `${JOGO}; ordem de grandeza das quebras de safra e crises hídricas recentes`,
  },
  dano_alimentos_seca_max: {
    value: 0.01,
    min: 0.005,
    max: 0.02,
    note: 'pressão máxima da seca sobre a inflação de alimentos (fração em 12 meses, entra como `choque.inflacao`)',
    basis: `${JOGO}; quebras de safra contribuíram com ~1 p.p. do IPCA em 2021`,
  },
  dano_energia_seca_max: {
    value: 0.004,
    min: 0.001,
    max: 0.01,
    note: 'pressão máxima da seca sobre a inflação via tarifa de energia (fração em 12 meses, `choque.inflacao`); índice = seca média das UFs do Sudeste e do Centro-Oeste ponderada pelo PIB',
    basis: `${JOGO}; proxy documentada: os grandes reservatórios do Sistema Interligado ficam no Sudeste e no Centro-Oeste; o jogo não tem preço de energia`,
  },
  seca_escala_nacional: {
    value: 0.4,
    min: 0.2,
    max: 0.8,
    note: 'índice nacional de seca (média da seca ponderada pelo peso da agropecuária, ou pelo PIB do Sudeste/Centro-Oeste na energia) em que o dano chega a 76% do teto (tanh)',
    basis: SATURACAO,
  },
  dano_pib_chuva_max: {
    value: 0.002,
    min: 0.0005,
    max: 0.005,
    note: 'perda máxima de nível do PIB por cheias e chuva excessiva em escala nacional (fração do PIB, estado estacionário)',
    basis: `${JOGO}; logística e perdas de safra, menor que a da seca`,
  },
  dano_alimentos_chuva_max: {
    value: 0.004,
    min: 0.001,
    max: 0.01,
    note: 'pressão máxima da chuva excessiva sobre a inflação de alimentos (fração em 12 meses, `choque.inflacao`)',
    basis: `${JOGO}; menor que a da seca`,
  },
  cheia_escala_nacional: {
    value: 0.1,
    min: 0.05,
    max: 0.3,
    note: 'risco médio de cheia ponderado pelo PIB em que o dano nacional de chuva chega a 76% do teto (tanh)',
    basis: SATURACAO,
  },
  // --- humor regional (redistribui a aprovação; a parte nacional é a média ponderada pela população)
  aprovacao_clima_max: {
    value: 0.015,
    min: 0.005,
    max: 0.03,
    note: 'desvio máximo de aprovação de uma UF por chuva acima da normal (cheia) ou por seca prolongada, cada um (estado estacionário)',
    basis: `${JOGO}; menor que o do alinhamento (alinhamento_regional_max = 0,04)`,
  },
  seca_humor_limiar: {
    value: 0.5,
    min: 0.3,
    max: 0.8,
    note: 'seca acumulada (0–1) a partir da qual ela pesa no humor da UF; abaixo disso a seca não é "prolongada"',
    basis: `${JOGO}; com ganho e memória atuais, ~3 meses de déficit forte: pesa devagar`,
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

/**
 * Valor esperado de cada termo de dano nacional sob o clima estacionário, como **fração do teto** do termo (o
 * valor entre 0 e 1 que sai de `tanh`, antes de multiplicar pelo teto). O dano usado pela economia é o termo menos
 * este valor: o clima fica de média zero em torno da normal climatológica (clima bom dá pressão negativa: boa safra,
 * reservatórios cheios), em vez de virar inflação permanente. Sem isso, o lado ruim do clima (seca, cheia) só empurra
 * para cima e, somado em anos, vira uma inflação média maior, Selic maior e aprovação menor em toda campanha.
 *
 * Depende da dificuldade (a magnitude muda a distribuição do clima) e do cenário (pesos de PIB e de agropecuária por
 * UF): medido no cenário padrão (v0.8.0), 30 sementes × 2.880 meses após 120 de aquecimento, com os `CLIMATE_PARAMS`
 * atuais. **Se algum parâmetro de evolução ou de dano mudar, refazer a medição**: o teste
 * `evolution.test.ts` ("valores esperados") falha quando a tabela deixa de bater com uma medição nova. `PROVISORIO`.
 * - `droughtGdp`: perda de PIB por seca ÷ `dano_pib_seca_max`;
 * - `droughtFood`: alimentos ÷ `dano_alimentos_seca_max`; `droughtEnergy`: energia ÷ `dano_energia_seca_max`;
 * - `rain`: índice nacional de cheia (usado pela perda de PIB e pelos alimentos da chuva excessiva).
 */
export interface ExpectedDamage {
  droughtGdp: number;
  droughtFood: number;
  droughtEnergy: number;
  rain: number;
}

export const CLIMATE_EXPECTED_DAMAGE: Readonly<Record<Difficulty, ExpectedDamage>> = {
  casual: { droughtGdp: 0.0854, droughtFood: 0.1673, droughtEnergy: 0.1574, rain: 0.0028 },
  estrategica: { droughtGdp: 0.1347, droughtFood: 0.2597, droughtEnergy: 0.2456, rain: 0.0278 },
  realismo: { droughtGdp: 0.1599, droughtFood: 0.3052, droughtEnergy: 0.2887, rain: 0.0608 },
};
