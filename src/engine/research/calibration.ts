import type { ParamSpec } from '../economy/calibration';

/**
 * Calibração da árvore de tecnologias (PLANO_EXPANSAO EX-24 e EX-32). Valores de jogo `PROVISORIO`: custos, prazos e
 * efeitos de cada nó ficam no conteúdo (`src/data/technology/`); aqui moram as regras comuns a todos os nós.
 */
const JOGO = 'critério de jogo: legibilidade e ritmo da campanha; testado na faixa';

export const RESEARCH_PARAMS = {
  ritmo_capital_humano: {
    value: 1.5,
    min: 0.5,
    max: 3,
    note: 'elasticidade do ritmo de cada estágio aos anos efetivos de estudo da força de trabalho (÷ referência do nó)',
    basis: `${JOGO}; a educação muda o capital humano devagar: o efeito no ritmo aparece em anos, não em meses`,
  },
  ritmo_min: {
    value: 0.5,
    min: 0.2,
    max: 0.9,
    note: 'ritmo mínimo de um estágio (fração do pleno) com capital humano muito abaixo da referência',
    basis: `${JOGO}; limite explícito da realimentação (AI_INSTRUCTIONS §3: realimentações saturam)`,
  },
  ritmo_max: {
    value: 1.3,
    min: 1,
    max: 2,
    note: 'ritmo máximo de um estágio (fração do pleno) com capital humano muito acima da referência',
    basis: `${JOGO}; nenhuma equipe encurta um estágio pela metade`,
  },
  perda_falha: {
    value: 0.4,
    min: 0.2,
    max: 0.8,
    note: 'fração do estágio que precisa ser refeita depois de uma falha parcial (protótipo reprovado, absorção incompleta)',
    basis: `${JOGO}; falha parcial custa tempo e dinheiro, mas guarda parte do aprendizado`,
  },
  falhas_maximas: {
    value: 3,
    min: 2,
    max: 5,
    note: 'falhas parciais que encerram o programa; os estágios já concluídos ficam como resultado intermediário',
    basis: `${JOGO}; desenvolver pode falhar de vez (plano F07)`,
  },
  ajuste_efeito: {
    value: 0.15,
    min: 0.05,
    max: 0.5,
    note: 'fração mensal com que o efeito da tecnologia adotada se aproxima da manutenção paga (0–1)',
    basis: `${JOGO}; a adoção difunde-se em meses e a falta de manutenção desgasta aos poucos (plano F07: gradual)`,
  },
  racionamento_maximo: {
    value: 0.02,
    min: 0,
    max: 0.1,
    note: 'fração da demanda de eletricidade não atendida acima da qual a adoção que depende de energia para',
    basis: `${JOGO}; a adoção depende de energia (plano R7), não de energia perfeita`,
  },
  relacao_minima_transferencia: {
    value: 0,
    min: -50,
    max: 50,
    note: 'relação mínima (−100 a 100) com o parceiro para começar ou continuar a transferência de tecnologia',
    basis: `${JOGO}; transferir exige negociação com quem detém a tecnologia (plano F07)`,
  },
  capacidade_exportar: {
    value: 0.5,
    min: 0.3,
    max: 1,
    note: 'domínio técnico local mínimo (0–1) para pedir a certificação de exportação',
    basis: `${JOGO}; importar não dá domínio: exportar exige transferência absorvida ou desenvolvimento (plano F07)`,
  },
  meses_certificacao: {
    value: 6,
    min: 3,
    max: 18,
    note: 'meses entre o pedido de certificação e a primeira exportação',
    basis: `${JOGO}; certificação e acesso a mercado não são instantâneos`,
  },
  rampa_exportacao: {
    value: 24,
    min: 6,
    max: 60,
    note: 'meses, depois da certificação, até a exportação alcançar o potencial do nó',
    basis: `${JOGO}; ganhar mercado leva anos`,
  },
} as const satisfies Record<string, ParamSpec>;

export type ResearchParamName = keyof typeof RESEARCH_PARAMS;

export function researchParam(name: ResearchParamName): number {
  return RESEARCH_PARAMS[name].value;
}
