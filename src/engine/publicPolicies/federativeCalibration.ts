import type { ParamSpec } from '../economy/calibration';

/**
 * Calibração das obras federativas (PLANO_EXPANSAO EX-20; F11). A probabilidade de adesão de cada governador é a mesma
 * dos programas por convênio (`adesao_base`, `adesao_relacao` na calibração econômica); aqui ficam só a negociação, o
 * descumprimento e a regularização. Valores de jogo `PROVISORIO`.
 */

const JOGO = 'critério de jogo: legibilidade e ritmo da campanha; testado na faixa';

export const FEDERATIVE_PARAMS = {
  convenio_contrapartida_negociada: {
    value: 0.5,
    min: 0.25,
    max: 0.75,
    note: 'fração da contrapartida estadual que sobra depois da negociação (a União paga o resto)',
    basis: `${JOGO}; compensação legítima exigida pelo plano (F11): custa dinheiro federal, não favor pessoal`,
  },
  convenio_adesao_negociacao: {
    value: 0.2,
    min: 0.1,
    max: 0.35,
    note: 'probabilidade somada à nova decisão do governador depois da negociação',
    basis: `${JOGO}; governador muito hostil ainda pode recusar`,
  },
  convenio_inadimplencia_base: {
    value: 0.005,
    min: 0,
    max: 0.02,
    note: 'chance mensal de um estado em dia deixar de pagar a contrapartida da obra, com governador neutro',
    basis: JOGO,
  },
  convenio_inadimplencia_hostil: {
    value: 0.03,
    min: 0.01,
    max: 0.06,
    note: 'chance mensal somada com governador no extremo hostil (proporcional à relação negativa)',
    basis: `${JOGO}; o contrato persiste: a relação muda o risco de descumprir, não desfaz a adesão`,
  },
  convenio_regularizacao_base: {
    value: 0.06,
    min: 0.02,
    max: 0.12,
    note: 'chance mensal de um estado inadimplente voltar a pagar, com governador neutro',
    basis: JOGO,
  },
  convenio_regularizacao_aliado: {
    value: 0.1,
    min: 0.04,
    max: 0.2,
    note: 'chance mensal somada com governador no extremo aliado (proporcional à relação positiva)',
    basis: `${JOGO}; um novo governador eleito com outra relação muda a chance de regularizar`,
  },
} as const satisfies Record<string, ParamSpec>;

export type FederativeParamName = keyof typeof FEDERATIVE_PARAMS;

export function federativeParam(name: FederativeParamName): number {
  return FEDERATIVE_PARAMS[name].value;
}
