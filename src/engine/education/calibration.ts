import type { ParamSpec } from '../economy/calibration';

/**
 * Calibração da educação por coorte (PLANO_EXPANSAO EX-19; AI_INSTRUCTIONS.md §3: sem números mágicos). Mesma forma de
 * `PARAMS` e `CLIMATE_PARAMS`: valor, faixa, significado e justificativa. Todos os valores são `PROVISORIO`: ordens de
 * grandeza arredondadas, não séries do INEP/IBGE nem estimativas causais (ver docs/DATA_SOURCES.md §3.6).
 *
 * Unidades: pessoas em **milhões**; taxas **anuais** (o motor divide por 12 a cada mês); aprendizagem é um índice 0–1
 * (fração dos concluintes com proficiência adequada); escolaridade em anos de estudo. Quem adicionar um parâmetro aqui
 * sem usá-lo deve removê-lo.
 */

const JOGO = 'critério de jogo: legibilidade e ritmo da campanha; testado na faixa';
const ORDEM_INEP =
  'ordem de grandeza arredondada do Censo Escolar/INEP e da PNAD Contínua/IBGE; PROVISORIO, não é série oficial';
const MINCER =
  'retorno de Mincer ~10% por ano de estudo × participação do trabalho ~0,6 na renda (literatura de contabilidade do crescimento); PROVISORIO';

export const EDUCATION_PARAMS = {
  // --- coortes e fluxo
  entrada_coorte: {
    value: 3,
    min: 2.4,
    max: 3.4,
    note: 'milhões de crianças que entram no ensino fundamental por ano (coorte dos 6 anos; constante até a demografia, EX-22)',
    basis: ORDEM_INEP,
  },
  duracao_fundamental: { value: 9, min: 9, max: 9, note: 'anos do ensino fundamental', basis: 'LDB (Lei 9.394/96)' },
  duracao_medio: { value: 3, min: 3, max: 3, note: 'anos do ensino médio', basis: 'LDB (Lei 9.394/96)' },
  duracao_superior: {
    value: 4.5,
    min: 4,
    max: 5,
    note: 'anos médios de um curso superior de graduação',
    basis: ORDEM_INEP,
  },
  evasao_fundamental: {
    value: 0.02,
    min: 0.01,
    max: 0.04,
    note: 'fração dos matriculados no fundamental que abandona a escola por ano, sem política',
    basis: ORDEM_INEP,
  },
  evasao_medio: {
    value: 0.06,
    min: 0.03,
    max: 0.1,
    note: 'fração dos matriculados no médio que abandona a escola por ano, sem política',
    basis: ORDEM_INEP,
  },
  evasao_superior: {
    value: 0.08,
    min: 0.05,
    max: 0.12,
    note: 'fração dos matriculados no superior que abandona o curso por ano',
    basis: ORDEM_INEP,
  },
  transicao_medio: {
    value: 0.85,
    min: 0.75,
    max: 0.92,
    note: 'fração dos concluintes do fundamental que se matricula no médio, sem política',
    basis: ORDEM_INEP,
  },
  transicao_superior: {
    value: 0.35,
    min: 0.25,
    max: 0.45,
    note: 'fração dos concluintes do médio que se matricula no superior',
    basis: ORDEM_INEP,
  },
  transicao_max: {
    value: 0.97,
    min: 0.9,
    max: 0.99,
    note: 'teto da transição fundamental → médio com política (sempre há quem não continue)',
    basis: 'saturação de segurança (ECONOMIC_MODEL.md §1.8)',
  },
  saida_forca_trabalho: {
    value: 0.025,
    min: 0.02,
    max: 0.03,
    note: 'fração da força de trabalho que sai por ano (aposentadoria e mortalidade; ~40 anos de vida ativa)',
    basis: ORDEM_INEP,
  },
  // --- aprendizagem
  aprendizagem_fundamental: {
    value: 0.55,
    min: 0.4,
    max: 0.7,
    note: 'aprendizagem de base dos concluintes do fundamental (fração com proficiência adequada)',
    basis: 'ordem de grandeza do Saeb/INEP, arredondada; PROVISORIO',
  },
  aprendizagem_medio: {
    value: 0.45,
    min: 0.3,
    max: 0.6,
    note: 'aprendizagem de base dos concluintes do médio',
    basis: 'ordem de grandeza do Saeb/INEP, arredondada; PROVISORIO',
  },
  aprendizagem_superior: {
    value: 0.6,
    min: 0.45,
    max: 0.75,
    note: 'aprendizagem de base dos concluintes do superior (o jogo não tem alavanca federal para ela nesta onda)',
    basis: 'ordem de grandeza do Enade/INEP, arredondada; PROVISORIO',
  },
  aprendizagem_ajuste: {
    value: 1 / 24,
    min: 1 / 48,
    max: 1 / 12,
    note: 'fração mensal do caminho da aprendizagem até o alvo (a escola leva ~2 anos para mudar o resultado)',
    basis: `${JOGO}; efeito defasado exigido pelo plano (F09: gasto não gera salto instantâneo)`,
  },
  // --- alavancas (força das políticas, já multiplicada pela capacidade entregue na carteira)
  alavanca_escala: {
    value: 1,
    min: 0.5,
    max: 2,
    note: 'escala da saturação das alavancas: efeito = teto × tanh(força somada ÷ escala); duas rotinas iguais não dobram o efeito',
    basis: 'saturação de segurança (ECONOMIC_MODEL.md §1.8)',
  },
  alfabetizacao_aprendizagem: {
    value: 0.08,
    min: 0.03,
    max: 0.12,
    note: 'teto do ganho de aprendizagem no fundamental com alfabetização em plena capacidade',
    basis: JOGO,
  },
  alfabetizacao_evasao: {
    value: 0.25,
    min: 0.1,
    max: 0.4,
    note: 'teto da redução relativa da evasão no fundamental com alfabetização em plena capacidade',
    basis: JOGO,
  },
  docentes_aprendizagem: {
    value: 0.06,
    min: 0.02,
    max: 0.1,
    note: 'teto do ganho de aprendizagem no fundamental e no médio com formação docente em plena capacidade',
    basis: JOGO,
  },
  permanencia_evasao: {
    value: 0.35,
    min: 0.15,
    max: 0.5,
    note: 'teto da redução relativa da evasão no médio com escola de tempo integral em operação plena',
    basis: JOGO,
  },
  permanencia_transicao: {
    value: 0.06,
    min: 0.02,
    max: 0.1,
    note: 'teto do ganho na transição fundamental → médio com escola de tempo integral em operação plena',
    basis: JOGO,
  },
  // --- capital humano → produtividade (único canal; ver docs/PUBLIC_POLICIES.md, "Educação por coorte")
  anos_sem_fundamental: {
    value: 4,
    min: 2,
    max: 6,
    note: 'anos médios de estudo de quem não concluiu o fundamental',
    basis: ORDEM_INEP,
  },
  anos_fundamental: { value: 9, min: 9, max: 9, note: 'anos de estudo do fundamental completo', basis: 'LDB' },
  anos_medio: { value: 12, min: 12, max: 12, note: 'anos de estudo do médio completo', basis: 'LDB' },
  anos_superior: { value: 16, min: 15, max: 17, note: 'anos de estudo do superior completo', basis: ORDEM_INEP },
  retorno_aprendizagem: {
    value: 0.5,
    min: 0.2,
    max: 1,
    note: 'peso da aprendizagem nos anos efetivos: anos × (1 + peso × desvio da aprendizagem em relação à de base)',
    basis: `${JOGO}; anos de escola com aprendizagem maior valem mais (Hanushek-Woessmann, qualitativo)`,
  },
  elast_capital_humano: {
    value: 0.06,
    min: 0.03,
    max: 0.09,
    note: 'variação do log do PIB potencial por ano efetivo de estudo a mais na força de trabalho média',
    basis: MINCER,
  },
} as const satisfies Record<string, ParamSpec>;

export type EducationParamName = keyof typeof EDUCATION_PARAMS;

/** Valor de um parâmetro da educação. */
export function educationParam(name: EducationParamName): number {
  return EDUCATION_PARAMS[name].value;
}
