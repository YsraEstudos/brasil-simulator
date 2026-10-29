import type { ParamSpec } from '../economy/calibration';

/**
 * Calibração do comércio exterior e da diplomacia (PLANO_EXPANSAO EX-25). Valores de jogo `PROVISORIO`; os níveis de
 * comércio, a tarifa e os choques ficam no conteúdo (`src/data/trade/`). Ver docs/EXPANSAO_CALIBRACAO.md (R7).
 */
const JOGO = 'critério de jogo: legibilidade e ritmo da campanha; testado na faixa';
const LIT = 'ordem de grandeza da literatura de comércio (elasticidades-preço de importação entre 0,5 e 2)';

export const TRADE_PARAMS = {
  elast_importacao_tarifa: {
    value: 1.2,
    min: 0.5,
    max: 2,
    note: 'queda proporcional das importações por ponto (fração) de tarifa acima da base',
    basis: LIT,
  },
  repasse_importacao: {
    value: 0.35,
    min: 0.1,
    max: 0.7,
    note: 'fração da alta dos preços de importação repassada ao IPCA (multiplica a participação das importações no PIB)',
    basis: `${JOGO}; repasse parcial e de uma vez: é mudança do nível de preços, não inflação permanente`,
  },
  meses_repasse: {
    value: 12,
    min: 6,
    max: 18,
    note: 'meses em que a alta de preços de importação entra na inflação de 12 meses',
    basis: 'um choque de nível de preços sai da inflação acumulada em 12 meses depois de um ano',
  },
  mult_saldo_externo: {
    value: 0.6,
    min: 0.3,
    max: 1,
    note: 'efeito no hiato de 1 ponto do PIB de saldo externo acima do início (nível; o desvio converge para este valor)',
    basis: `${JOGO}; menor que 1 porque parte da perda de exportação é absorvida por outros mercados e estoques`,
  },
  elast_cambio_saldo: {
    value: 0.5,
    min: 0,
    max: 2,
    note: 'apreciação (log) do câmbio por ponto do PIB de melhora do saldo externo, no mês da mudança',
    basis: `${JOGO}; canal de volume e acesso; o canal de preço é dos termos de troca (ECONOMIC_MODEL.md §8), sem duplicar`,
  },
  relacao_tarifa: {
    value: 6,
    min: 2,
    max: 15,
    note: 'pontos de relação perdidos com cada parceiro a cada passo de alta da tarifa (ganhos na redução)',
    basis: `${JOGO}; protecionismo provoca reação dos parceiros`,
  },
  retaliacao_tarifa: {
    value: 0.25,
    min: 0,
    max: 1,
    note: 'aumento proporcional do risco de barreira por passo de tarifa acima da base',
    basis: `${JOGO}; elevar tarifa protege o mercado interno, mas convida retaliação`,
  },
  risco_relacao: {
    value: 0.6,
    min: 0,
    max: 1,
    note: 'redução proporcional do risco de barreira com relação 100 (aumento com relação −100)',
    basis: `${JOGO}; diplomacia previne, não elimina choques`,
  },
  reducao_risco_acordo: {
    value: 0.5,
    min: 0,
    max: 0.9,
    note: 'redução proporcional do risco de barreira de um parceiro com acordo vigente',
    basis: `${JOGO}; acordos têm mecanismos de solução de controvérsias`,
  },
  ganho_missao: {
    value: 8,
    min: 2,
    max: 20,
    note: 'pontos de relação ganhos por missão comercial ao parceiro',
    basis: JOGO,
  },
  missao_reduz_barreira: {
    value: 2,
    min: 0,
    max: 6,
    note: 'meses cortados de uma barreira ativa do parceiro por missão comercial',
    basis: `${JOGO}; negociação encurta o choque, não o desfaz`,
  },
  retorno_relacao: {
    value: 0.03,
    min: 0,
    max: 0.2,
    note: 'fração mensal com que a relação volta à inicial do cenário',
    basis: `${JOGO}; ganhos e perdas diplomáticos se desgastam com o tempo`,
  },
  relacao_minima_acordo: {
    value: -10,
    min: -50,
    max: 30,
    note: 'relação mínima para abrir ou avançar a negociação de um acordo',
    basis: JOGO,
  },
  rodadas_acordo: {
    value: 4,
    min: 2,
    max: 8,
    note: 'rodadas de negociação até a assinatura (uma por mês, ação de agenda)',
    basis: `${JOGO}; acordo não sai por decisão instantânea (plano F14)`,
  },
  ganho_rodada: {
    value: 3,
    min: 0,
    max: 10,
    note: 'pontos de relação ganhos por rodada de negociação',
    basis: JOGO,
  },
  meses_ratificacao: {
    value: 3,
    min: 1,
    max: 12,
    note: 'meses entre a assinatura e a votação do decreto legislativo',
    basis: 'tramitação de tratado (CF art. 49, I) simplificada a uma votação por Casa',
  },
  posicao_acordo: {
    value: 0.5,
    min: 0,
    max: 1,
    note: 'posição econômica (eixo −1 a 1) atribuída a um acordo de liberalização, para o apoio ideológico dos blocos',
    basis: `${JOGO}; blocos liberais apoiam mais; nacionalistas menos`,
  },
  vigencia_anos: {
    value: 10,
    min: 4,
    max: 20,
    note: 'anos de vigência de um acordo ratificado (renovação exige nova negociação)',
    basis: JOGO,
  },
  reabrir_meses: {
    value: 12,
    min: 0,
    max: 36,
    note: 'meses depois de rejeição ou fim do acordo para abrir nova negociação',
    basis: JOGO,
  },
  ganho_acesso_acordo: {
    value: 0.08,
    min: 0,
    max: 0.3,
    note: 'aumento proporcional das exportações ao parceiro com acordo vigente',
    basis: `${JOGO}; ganho gradual de acesso não é medido em microdados`,
  },
  ganho_importacao_acordo: {
    value: 0.1,
    min: 0,
    max: 0.3,
    note: 'aumento proporcional das importações do parceiro com acordo vigente (contrapartida)',
    basis: JOGO,
  },
  concessao_tarifa: {
    value: 0.5,
    min: 0,
    max: 1,
    note: 'fração da tarifa que deixa de ser cobrada nas importações do parceiro com acordo vigente',
    basis: `${JOGO}; a contrapartida custa arrecadação`,
  },
} as const satisfies Record<string, ParamSpec>;

export type TradeParamName = keyof typeof TRADE_PARAMS;

export function tradeParam(name: TradeParamName): number {
  return TRADE_PARAMS[name].value;
}
