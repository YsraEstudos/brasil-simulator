import type { ParamSpec } from '../economy/calibration';

/**
 * Calibração da carreira antes da posse (PLANO_CAMPANHA.md Fase C2; AI_INSTRUCTIONS.md §3: sem números mágicos).
 * Mesma forma de `PARAMS` e `CLIMATE_PARAMS`: valor, faixa, significado e justificativa. Valores `PROVISORIO`
 * (ordens de grandeza registradas no DATA_SOURCES.md §6) ou de jogo, a calibrar por simulação.
 *
 * **Todos os parâmetros são lidos pelo motor** (`career/viability.ts`, `career/electorate.ts`, `career/polls.ts`,
 * `career/actions.ts`, `career/debate.ts`, `career/election.ts`);
 * quem adicionar um parâmetro aqui sem usá-lo deve removê-lo (teste em `career/viability.test.ts`).
 *
 * Unidades: reconhecimento, rejeição e parcelas do eleitorado em fração (0–1); "por mês" quando aplicado a cada mês
 * coberto pelo turno. Sorteios: só por chave (`career/draw.ts`), nunca o PRNG principal.
 */

const JOGO = 'critério de jogo: legibilidade e ritmo da campanha; testado na faixa';
const TSE_2022 = 'ordem de grandeza do 1º turno presidencial de 2022 (DATA_SOURCES.md §6, 27/10/2026)';

export const CAREER_PARAMS = {
  // --- eleitorado (PLANO_CAMPANHA.md Fase C2, contabilidade dos eleitores)
  eleitorado_total: {
    value: 156_454_011,
    min: 140_000_000,
    max: 170_000_000,
    note: 'eleitores aptos no país, repartidos entre as UFs pela população',
    basis: `${TSE_2022}: comparecimento + abstenção`,
  },
  abstencao: {
    value: 0.2095,
    min: 0.15,
    max: 0.3,
    note: 'fração do eleitorado que não comparece',
    basis: TSE_2022,
  },
  brancos_nulos: {
    value: 0.0441,
    min: 0.02,
    max: 0.1,
    note: 'fração do comparecimento que vota em branco ou nulo (antes do eleitor sem opção aceitável)',
    basis: `${TSE_2022}: nulos 2,82% + brancos 1,59%`,
  },
  indecisos_peso: {
    value: 0.25,
    min: 0.05,
    max: 0.6,
    note: 'peso da opção "indeciso" na pesquisa, na mesma escala dos pesos dos candidatos',
    basis: JOGO,
  },
  indecisos_brancos: {
    value: 0.3,
    min: 0,
    max: 0.6,
    note: 'fração dos indecisos que vota em branco ou nulo no dia da eleição',
    basis: JOGO,
  },
  // --- opinião entre quem conhece (aprovação e rejeição não são complementares)
  neutros: {
    value: 0.3,
    min: 0.1,
    max: 0.5,
    note: 'fração de quem conhece o candidato que não aprova nem rejeita',
    basis: JOGO,
  },
  opiniao_escala: {
    value: 2,
    min: 1,
    max: 4,
    note: 'inclinação da partilha entre aprovação e rejeição: aprova = (1 − neutros) · σ(escala · utilidade)',
    basis: JOGO,
  },
  valencia_escala: {
    value: 1.5,
    min: 0.5,
    max: 3,
    note: 'peso da valência nacional na utilidade do candidato numa UF',
    basis: JOGO,
  },
  alinhamento_peso: {
    value: 0.25,
    min: 0,
    max: 2,
    note: 'peso do alinhamento entre a ideologia do bloco e a inclinação da UF na utilidade (−1…1)',
    basis: `${JOGO}; ajuste provisório, ver DIAGNOSTICO_CAMPANHA.md`,
  },
  // --- reconhecimento: decaimento antes, crescimento depois, ambos pela distância ao limite (I10)
  ostracismo_taxa: {
    value: 0.03,
    min: 0.01,
    max: 0.06,
    note: 'fração da distância ao piso perdida por mês sem exposição',
    basis: `${JOGO}; ordem de grandeza do documento de origem (−1% a −3% ao mês)`,
  },
  ostracismo_piso: {
    value: 0.05,
    min: 0,
    max: 0.15,
    note: 'reconhecimento abaixo do qual o esquecimento não age',
    basis: JOGO,
  },
  organico_pre_campanha: {
    value: 0.01,
    min: 0,
    max: 0.03,
    note: 'fração da distância ao teto (1) ganha por mês de pré-campanha, sem ação',
    basis: `${JOGO}; documento de origem: +1% a +2% ao mês`,
  },
  organico_campanha: {
    value: 0.12,
    min: 0.05,
    max: 0.25,
    note: 'fração da distância ao teto ganha por mês de campanha oficial (cobertura e propaganda obrigatória)',
    basis: `${JOGO}; trajetória-alvo do documento de origem (I11), não regra`,
  },
  // --- pesquisas (sorteio por chave, PLANO_CAMPANHA.md §4.1)
  ruido_nacional: {
    value: 0.01,
    min: 0,
    max: 0.03,
    note: 'desvio do erro de cada parcela da pesquisa nacional (antes de renormalizar)',
    basis: JOGO,
  },
  ruido_uf: {
    value: 0.05,
    min: 0,
    max: 0.1,
    note: 'desvio do erro do reconhecimento estimado por UF (faixa do mapa)',
    basis: JOGO,
  },
  pesquisa_margem: {
    value: 0.02,
    min: 0.01,
    max: 0.04,
    note: 'margem de erro divulgada com a pesquisa nacional',
    basis: 'margem usual de pesquisa nacional com cerca de 2 mil entrevistas',
  },
  // --- faixas do mapa de reconhecimento (I8): [0; baixo], (baixo; médio], (médio; alto], (alto; 1]
  faixa_baixo: { value: 0.2, min: 0.1, max: 0.3, note: 'limite superior da faixa "desconhecido"', basis: JOGO },
  faixa_medio: { value: 0.45, min: 0.3, max: 0.6, note: 'limite superior da faixa "pouco conhecido"', basis: JOGO },
  faixa_alto: { value: 0.75, min: 0.6, max: 0.9, note: 'limite superior da faixa "conhecido"', basis: JOGO },
  // --- ações de campanha (PLANO_CAMPANHA.md Fase C4, tarefa C4.1): fração da distância ao teto ganha no turno
  acao_nacional: {
    value: 0.01,
    min: 0.01,
    max: 0.08,
    note: 'comício nacional: fração da distância a 1 ganha pelo reconhecimento em todas as UFs',
    basis: `${JOGO}; ajuste provisório, ver DIAGNOSTICO_CAMPANHA.md; menor que a caravana numa UF, mas no país inteiro`,
  },
  acao_regional: {
    value: 0.15,
    min: 0.05,
    max: 0.3,
    note: 'caravana: fração da distância a 1 ganha pelo reconhecimento na UF visitada',
    basis: JOGO,
  },
  acao_mobilizacao: {
    value: 0.02,
    min: 0.02,
    max: 0.15,
    note: 'mobilização da militância: ganho de reconhecimento por unidade de alinhamento positivo da UF',
    basis: `${JOGO}; ajuste provisório, ver DIAGNOSTICO_CAMPANHA.md; só rende onde o bloco do partido é forte`,
  },
  ataque_dano: {
    value: 0.08,
    min: 0.02,
    max: 0.15,
    note: 'ataque bem-sucedido: queda da valência do adversário atacado',
    basis: JOGO,
  },
  ataque_bumerangue: {
    value: 0.06,
    min: 0.02,
    max: 0.12,
    note: 'ataque que vira bumerangue: queda da valência do próprio jogador',
    basis: JOGO,
  },
  ataque_risco_base: {
    value: 0.2,
    min: 0.05,
    max: 0.4,
    note: 'chance de bumerangue contra um adversário de imagem neutra ou ruim',
    basis: JOGO,
  },
  ataque_risco_valencia: {
    value: 0.5,
    min: 0.2,
    max: 1,
    note: 'chance extra de bumerangue por unidade de valência positiva do atacado (atacar quem é bem avaliado)',
    basis: JOGO,
  },
  ataque_risco_max: {
    value: 0.8,
    min: 0.5,
    max: 0.95,
    note: 'teto da chance de bumerangue',
    basis: JOGO,
  },
  // --- debate na TV (Fase C4, tarefa C4.2)
  debate_exposicao: {
    value: 0.05,
    min: 0.01,
    max: 0.1,
    note: 'debate: fração da distância a 1 ganha pelo reconhecimento em todas as UFs, qualquer que seja a postura',
    basis: JOGO,
  },
  debate_propositivo: {
    value: 0.03,
    min: 0.01,
    max: 0.06,
    note: 'postura propositiva: ganho de valência, sem risco',
    basis: JOGO,
  },
  debate_tecnico: {
    value: 0.1,
    min: 0.03,
    max: 0.2,
    note: 'postura técnica: ganho de valência por unidade de reconhecimento nacional (rende para quem já é conhecido)',
    basis: JOGO,
  },
  // --- eleição (PLANO_CAMPANHA.md Fase C5, tarefa C5.1)
  abstencao_2t: {
    value: 0.2059,
    min: 0.15,
    max: 0.3,
    note: 'fração do eleitorado que não comparece ao 2º turno',
    basis: 'ordem de grandeza do 2º turno presidencial de 2022 (DATA_SOURCES.md §6, 27/10/2026)',
  },
  ruido_eleicao: {
    value: 0.08,
    min: 0,
    max: 0.2,
    note: 'desvio do humor do dia da eleição: fator e^(σ·z) no peso de cada candidato, igual em todas as UFs',
    basis: `${JOGO}; a pesquisa não acerta o resultado com certeza`,
  },
} as const satisfies Record<string, ParamSpec>;

export type CareerParamName = keyof typeof CAREER_PARAMS;

/** Valor de um parâmetro da carreira. */
export function careerParam(name: CareerParamName): number {
  return CAREER_PARAMS[name].value;
}
