import type { ParamSpec } from '../economy/calibration';

/**
 * Calibração das habilidades (PLANO_EXPANSAO EX-21). Valores de jogo `PROVISORIO`: o conteúdo dos perks iniciais é
 * decisão de autoria (plano §10) e fica registrado como proposta em docs/POLITICAL_RULES.md §6.6.
 */

const JOGO = 'critério de jogo: legibilidade e ritmo da campanha; testado na faixa';
const SEM_FARM = `${JOGO}; um treino por mês (chave da ação de agenda) impede evolução instantânea`;

export const SKILL_PARAMS = {
  treino_nivel_1: { value: 3, min: 2, max: 6, note: 'meses de treino acumulados para o nível 1', basis: SEM_FARM },
  treino_nivel_2: { value: 8, min: 5, max: 12, note: 'meses de treino acumulados para o nível 2', basis: SEM_FARM },
  treino_nivel_3: { value: 15, min: 10, max: 24, note: 'meses de treino acumulados para o nível 3', basis: SEM_FARM },
  treino_capital: {
    value: 2,
    min: 1,
    max: 5,
    note: 'capital político gasto por mês de treino (agenda afastada da articulação), além da ação de agenda',
    basis: `${JOGO}; custo de oportunidade explícito exigido pelo plano (F06)`,
  },
  negociacao_desconto: {
    value: 0.12,
    min: 0.05,
    max: 0.2,
    note: 'redução, por nível, do capital político gasto em cada negociação com bloco (`capital_negociacao`)',
    basis: `${JOGO}; no nível 3 a negociação ainda custa ~2/3 do original: nenhuma estratégia vira de graça`,
  },
  federalismo_adesao: {
    value: 0.04,
    min: 0.02,
    max: 0.08,
    note: 'probabilidade somada, por nível, à adesão de cada governador a convênio (programa ou obra federativa)',
    basis: `${JOGO}; governador hostil continua recusando: o bônus é menor que o peso da relação (adesao_relacao)`,
  },
  ciencia_falha: {
    value: 0.15,
    min: 0.05,
    max: 0.25,
    note: 'fração, por nível, da chance de falha parcial de cada estágio de pesquisa ou absorção que a equipe evita',
    basis: `${JOGO}; no nível 3 ainda resta mais da metade do risco: desenvolver continua incerto (R7)`,
  },
  diplomacia_avanco: {
    value: 0.25,
    min: 0.1,
    max: 0.5,
    note: 'rodadas somadas, por nível, a cada rodada de negociação de acordo comercial',
    basis: `${JOGO}; no nível 3 a negociação ainda exige mais de uma rodada e a ratificação do Congresso (R7)`,
  },
} as const satisfies Record<string, ParamSpec>;

export type SkillParamName = keyof typeof SKILL_PARAMS;

export function skillParam(name: SkillParamName): number {
  return SKILL_PARAMS[name].value;
}
