import type { ParamSpec } from '../economy/calibration';

/**
 * Calibração da imprensa e da confiança (PLANO_EXPANSAO EX-28). Valores de jogo `PROVISORIO`; veículos e modelos de
 * rumor ficam no conteúdo (`src/data/press/`). Ver docs/EXPANSAO_CALIBRACAO.md (R8).
 */
const JOGO = 'critério de jogo: legibilidade e ritmo da campanha; testado na faixa';

export const PRESS_PARAMS = {
  confianca_inicial: { value: 0.5, min: 0.2, max: 0.8, note: 'confiança de partida', basis: JOGO },
  retorno_confianca: {
    value: 0.03,
    min: 0,
    max: 0.2,
    note: 'fração da distância à confiança de partida que volta por mês',
    basis: `${JOGO}; a memória do público é longa, mas não eterna`,
  },
  ganho_transparencia: {
    value: 0.03,
    min: 0,
    max: 0.1,
    note: 'confiança ganha por mês de tom transparente com crise ativa (× distância até 1)',
    basis: JOGO,
  },
  perda_contradicao: {
    value: 0.06,
    min: 0,
    max: 0.2,
    note: 'confiança perdida quando o tom tranquilizador é desmentido pelos números (casos notificados subindo)',
    basis: JOGO,
  },
  alta_contradicao: {
    value: 0.2,
    min: 0.05,
    max: 1,
    note: 'alta dos casos notificados entre boletins que caracteriza contradição com o tom tranquilizador',
    basis: JOGO,
  },
  perda_alarmismo: {
    value: 0.03,
    min: 0,
    max: 0.1,
    note: 'confiança perdida por mês de tom de alerta sem crise identificada ou com R estimado abaixo de 1',
    basis: JOGO,
  },
  ganho_desmentido: {
    value: 0.03,
    min: 0,
    max: 0.1,
    note: 'confiança ganha quando o governo desmentiu um boato que a checagem confirma ser falso',
    basis: JOGO,
  },
  perda_negar_verdade: {
    value: 0.1,
    min: 0,
    max: 0.3,
    note: 'confiança perdida quando o governo desmentiu um rumor que a checagem confirma',
    basis: `${JOGO}; negar o que é verdade custa mais do que admitir`,
  },
  ganho_esclarecer: {
    value: 0.015,
    min: 0,
    max: 0.05,
    note: 'confiança ganha ao responder um rumor com dados oficiais',
    basis: JOGO,
  },
  corte_desmentir: {
    value: 0.7,
    min: 0,
    max: 1,
    note: 'fração da circulação cortada por um desmentido, multiplicada pela confiança (×2, no máximo 1)',
    basis: 'desmentido de quem tem pouca credibilidade alcança pouco',
  },
  corte_esclarecer: {
    value: 0.35,
    min: 0,
    max: 1,
    note: 'fração da circulação cortada por um esclarecimento com dados (sem depender tanto da confiança)',
    basis: JOGO,
  },
  chance_rumor: {
    value: 0.35,
    min: 0,
    max: 1,
    note: 'chance mensal de surgir um rumor com crise detectada e confiança 0,5',
    basis: JOGO,
  },
  rumor_sem_boletim: {
    value: 1.5,
    min: 1,
    max: 3,
    note: 'multiplicador da chance de rumor quando os boletins não são públicos',
    basis: 'vácuo de informação oficial abre espaço para boato',
  },
  meses_rumor: {
    value: 2,
    min: 1,
    max: 4,
    note: 'meses até a checagem independente resolver um rumor',
    basis: 'agências de checagem e investigação jornalística',
  },
  ajuste_credibilidade: {
    value: 0.06,
    min: 0,
    max: 0.2,
    note: 'mudança da confiabilidade do veículo por rumor confirmado ou desmentido',
    basis: JOGO,
  },
  subnotificacao: {
    value: 0.6,
    min: 0.3,
    max: 0.9,
    note: 'mortes notificadas abaixo desta fração das reais tornam verdadeiro o rumor de mortes escondidas',
    basis: JOGO,
  },
  itens_max: { value: 40, min: 10, max: 100, note: 'itens de imprensa guardados no estado', basis: JOGO },
  registro_confianca: { value: 12, min: 4, max: 48, note: 'mudanças de confiança guardadas', basis: JOGO },
} as const satisfies Record<string, ParamSpec>;

export type PressParamName = keyof typeof PRESS_PARAMS;

export function pressParam(name: PressParamName): number {
  return PRESS_PARAMS[name].value;
}
