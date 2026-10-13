/**
 * Calibração centralizada do motor (ECONOMIC_MODEL.md §1.7, §6; AI_INSTRUCTIONS.md §3 "sem números mágicos").
 *
 * Todo coeficiente usado pela lógica do motor mora aqui, com faixa e justificativa. Todos são `A_CALIBRAR`
 * (status `PROVISORIO`) até a Fase 03. O cenário pode sobrescrever qualquer um pelo mesmo nome em
 * `scenario.parameters` (ver `calibrationFromScenario`).
 *
 * Convenções: taxas anuais em fração; "por mês" quando o coeficiente é aplicado a cada turno.
 */

export interface ParamSpec {
  value: number;
  min: number;
  max: number;
  note: string;
}

export const PARAMS = {
  // ── Produção (ECONOMIC_MODEL.md §5.1–5.2) ─────────────────────────────────────────────────────────
  g_pot_base: { value: 0.02, min: 0.01, max: 0.03, note: 'crescimento potencial anual' },
  rho_h: { value: 0.9, min: 0.8, max: 0.97, note: 'persistência mensal do hiato' },
  beta_r: {
    value: 0.01,
    min: 0.003,
    max: 0.02,
    note: 'efeito mensal no hiato de 1 p.p. de juro real acima do neutro (estado estacionário = beta_r / (1 − rho_h))',
  },
  lag_r: { value: 6, min: 3, max: 12, note: 'meses para o juro real chegar à economia (média móvel)' },
  juro_neutro: { value: 0.05, min: 0.035, max: 0.065, note: 'juro real neutro rn' },
  mult_investimento: { value: 0.8, min: 0.3, max: 1.5, note: 'multiplicador do investimento público' },
  mult_custeio: { value: 0.5, min: 0.2, max: 1.0, note: 'multiplicador do custeio' },
  mult_transf_baixa_renda: { value: 0.7, min: 0.3, max: 1.3, note: 'multiplicador de transferências à baixa renda' },
  mult_transf_alta_renda: { value: 0.3, min: 0.0, max: 0.6, note: 'multiplicador de transferências à alta renda' },
  mult_obrigatoria: {
    value: 0.5,
    min: 0.2,
    max: 1.0,
    note: 'multiplicador da despesa obrigatória (pessoal, benefícios)',
  },
  mult_desoneracao_consumo: { value: 0.4, min: 0.1, max: 0.9, note: 'multiplicador da desoneração do consumo' },
  mult_desoneracao_renda: { value: 0.2, min: 0.0, max: 0.5, note: 'multiplicador da desoneração da renda' },
  mult_receita: { value: 0.3, min: 0.1, max: 0.6, note: 'efeito contracionista de aumento de receita' },
  mult_credito: { value: 0.3, min: 0.1, max: 0.6, note: 'impulso de demanda por crédito mais barato' },
  sens_hiato: { value: 5, min: 2, max: 10, note: 'multiplicador × (1 + sens_hiato × max(0, −h)): ociosidade amplia' },
  sens_risco: { value: 0.5, min: 0.2, max: 0.8, note: 'multiplicador × (1 − sens_risco × (1 − credibilidade))' },
  ruido_hiato_casual: { value: 0.0005, min: 0, max: 0.001, note: 'desvio do ruído mensal do hiato (Casual)' },
  ruido_hiato_estrategica: { value: 0.001, min: 0, max: 0.002, note: 'desvio do ruído mensal do hiato (Estratégica)' },
  ruido_hiato_realismo: { value: 0.0015, min: 0, max: 0.003, note: 'desvio do ruído mensal do hiato (Realismo)' },

  // ── Preços (§5.3) ───────────────────────────────────────────────────────────────────────────────
  kappa: { value: 0.25, min: 0.1, max: 0.5, note: 'inclinação da curva de Phillips' },
  ajuste_inflacao: {
    value: 0.15,
    min: 0.08,
    max: 0.3,
    note: 'fração mensal do caminho até a inflação-alvo (suavização da série de 12 meses)',
  },
  meta_inflacao: { value: 0.03, min: 0.03, max: 0.03, note: 'meta contínua (CMN)' },
  tolerancia_meta: { value: 0.015, min: 0.015, max: 0.015, note: 'intervalo de tolerância da meta' },

  // ── Banco Central (§5.4) ────────────────────────────────────────────────────────────────────────
  phi_pi: { value: 1.5, min: 1.2, max: 2.0, note: 'reação às expectativas' },
  phi_h: { value: 0.5, min: 0.2, max: 1.0, note: 'reação ao hiato' },
  suav: { value: 0.7, min: 0.5, max: 0.9, note: 'suavização da Selic' },
  max_passo: { value: 0.01, min: 0.005, max: 0.015, note: 'movimento máximo por reunião' },
  passo_selic: { value: 0.0025, min: 0.0025, max: 0.0025, note: 'Selic arredondada a 25 bp' },
  selic_piso: { value: 0.02, min: 0, max: 0.03, note: 'piso operacional da Selic' },

  // ── Trabalho (§5.6) ─────────────────────────────────────────────────────────────────────────────
  nairu: { value: 0.065, min: 0.055, max: 0.09, note: 'desemprego de equilíbrio un' },
  theta: { value: 0.35, min: 0.2, max: 0.6, note: 'coeficiente de Okun' },
  ajuste_u: { value: 0.1, min: 0.05, max: 0.3, note: 'velocidade mensal de ajuste do desemprego' },

  // ── Contas públicas (§5.7–5.9) ──────────────────────────────────────────────────────────────────
  elast_receita_hiato: { value: 1.0, min: 0.5, max: 1.5, note: 'receita/PIB × (1 + elast × h)' },
  transmissao_selic_divida: {
    value: 1 / 36,
    min: 1 / 60,
    max: 1 / 12,
    note: 'fração mensal da distância Selic → taxa implícita da dívida',
  },
  meta_primario: { value: 0.0025, min: -0.01, max: 0.02, note: 'meta de primário (LDO), fração do PIB' },
  banda_meta_primario: { value: 0.0025, min: 0.0025, max: 0.0025, note: 'tolerância de ±0,25 p.p. (LC 200/2023)' },
  limite_despesa: {
    value: 0.195,
    min: 0.17,
    max: 0.22,
    note: 'despesa primária máxima compatível com o limite do arcabouço, fração do PIB',
  },
  limiar_divida: { value: 0.8, min: 0.7, max: 0.9, note: 'dívida/PIB a partir da qual a credibilidade cai' },

  // ── Credibilidade (§5.3, §5.5 simplificado) ─────────────────────────────────────────────────────
  credibilidade_base: { value: 0.75, min: 0.5, max: 0.9, note: 'nível para onde a credibilidade volta sem problemas' },
  recuperacao_cred: { value: 0.02, min: 0.005, max: 0.05, note: 'fração mensal de retorno à base' },
  pena_cred_fiscal: { value: 0.5, min: 0.2, max: 1.0, note: 'perda mensal = pena × déficit abaixo da banda / 12' },
  pena_cred_inflacao: { value: 0.3, min: 0.1, max: 0.6, note: 'perda mensal = pena × inflação acima do teto / 12' },
  pena_cred_divida: { value: 0.2, min: 0.05, max: 0.5, note: 'perda mensal = pena × (dívida − limiar) / 12' },
  cred_min: { value: 0.05, min: 0.05, max: 0.05, note: 'saturação inferior' },
  cred_max: { value: 0.98, min: 0.98, max: 0.98, note: 'saturação superior' },

  // ── Opinião pública (POLITICAL_RULES.md §11.1) ──────────────────────────────────────────────────
  aprovacao_base: { value: 0.42, min: 0.3, max: 0.55, note: 'aprovação de equilíbrio com economia neutra' },
  ajuste_aprovacao: { value: 0.15, min: 0.05, max: 0.3, note: 'fração mensal do caminho até a aprovação-alvo' },
  peso_inflacao: { value: 1.5, min: 0.5, max: 3, note: 'alvo += peso × (meta − inflação)' },
  peso_desemprego: { value: 2.0, min: 0.5, max: 4, note: 'alvo += peso × (nairu − desemprego)' },
  peso_crescimento: { value: 1.0, min: 0.3, max: 2, note: 'alvo += peso × (PIB 12m − g_pot_base)' },
  fator_lua_de_mel: { value: 0.6, min: 0.4, max: 0.9, note: 'multiplica perdas de aprovação na lua de mel' },
  meses_lua_de_mel: { value: 6, min: 3, max: 9, note: 'meses 0–5 do mandato' },
  aprovacao_min: { value: 0.05, min: 0.05, max: 0.05, note: 'saturação da aprovação-alvo' },
  aprovacao_max: { value: 0.9, min: 0.9, max: 0.9, note: 'saturação da aprovação-alvo' },
  capital_base: { value: 30, min: 10, max: 50, note: 'capital político-alvo com aprovação zero' },
  capital_peso_aprovacao: { value: 60, min: 30, max: 90, note: 'capital-alvo += peso × aprovação' },
  ajuste_capital: { value: 0.1, min: 0.05, max: 0.3, note: 'fração mensal do caminho até o capital-alvo' },

  // ── Congresso (POLITICAL_RULES.md §6.2–6.3) ─────────────────────────────────────────────────────
  w_ideo: { value: 0.5, min: 0.2, max: 0.8, note: 'peso da afinidade ideológica (1 − distância/2)' },
  w_rel: { value: 0.4, min: 0.2, max: 0.6, note: 'peso da relação com o governo (/100)' },
  w_int: { value: 0.2, min: 0.1, max: 0.4, note: 'peso de interesses atendidos (0 ou 1)' },
  w_opiniao: { value: 0.4, min: 0.1, max: 0.8, note: 'peso de (aprovação − 0,5)' },
  limiar_apoio: { value: 0.2, min: 0.1, max: 0.4, note: 'apoio acima do qual o bloco orienta "sim"' },
  inclinacao_apoio: { value: 8, min: 4, max: 12, note: 'inclinação da logística dos votos dissidentes' },
  ruido_apoio: { value: 0.08, min: 0.02, max: 0.15, note: 'desvio do sorteio de apoio por bloco e votação' },
  bonus_casual: { value: 0.1, min: 0, max: 0.2, note: 'Congresso mais receptivo no Casual (GAME_DESIGN.md §6)' },
  margem_alteracao: {
    value: 0.1,
    min: 0.05,
    max: 0.2,
    note: 'aprovado por menos que esta fração das cadeiras acima do exigido → texto alterado',
  },
  escala_alterada: { value: 0.8, min: 0.6, max: 0.9, note: 'fração do texto que sobrevive quando alterado' },
  capacidade_pauta: { value: 3, min: 2, max: 5, note: 'propostas do governo tramitando ao mesmo tempo' },
  relacao_vitoria: { value: 3, min: 0, max: 10, note: 'relação dos blocos que votaram sim após aprovação' },
  relacao_derrota: { value: -3, min: -10, max: 0, note: 'relação dos blocos que votaram não' },
  capital_vitoria: { value: 4, min: 0, max: 10, note: 'capital político por vitória legislativa' },
  capital_derrota: { value: -8, min: -15, max: 0, note: 'capital político por derrota' },
  capital_envio_pec: { value: -5, min: -10, max: 0, note: 'custo de capital ao enviar PEC' },

  // ── Execução de políticas (ECONOMIC_MODEL.md §5.10, simplificado) ───────────────────────────────
  atraso_min_meses: { value: 2, min: 1, max: 3, note: 'atraso mínimo quando o risco "atraso" ocorre' },
  atraso_max_meses: { value: 6, min: 3, max: 12, note: 'atraso máximo' },
  fator_sobrecusto: { value: 1.2, min: 1.1, max: 1.5, note: 'despesa × fator quando o risco "sobrecusto" ocorre' },
  fator_baixa_adesao: { value: 0.7, min: 0.4, max: 0.9, note: 'efeito × fator quando há baixa adesão' },
  pena_cred_limite: {
    value: 0.03,
    min: 0.01,
    max: 0.06,
    note: 'credibilidade perdida ao executar acima do limite de despesas',
  },

  // ── Eventos (GAME_DESIGN.md §11.3) ──────────────────────────────────────────────────────────────
  max_eventos_mes: { value: 2, min: 1, max: 3, note: 'eventos novos por mês, no máximo' },
} as const satisfies Record<string, ParamSpec>;

export type ParamName = keyof typeof PARAMS;
export type Calibration = Readonly<Record<ParamName, number>>;

export const DEFAULT_CALIBRATION: Calibration = Object.fromEntries(
  Object.entries(PARAMS).map(([k, p]) => [k, p.value]),
) as Record<ParamName, number>;

/** Calibração padrão com os parâmetros do cenário por cima (chaves desconhecidas são ignoradas). */
export function calibrationFromScenario(parameters: Readonly<Record<string, { value: number }>>): Calibration {
  const c: Record<string, number> = { ...DEFAULT_CALIBRATION };
  for (const [k, v] of Object.entries(parameters)) if (k in PARAMS) c[k] = v.value;
  return c as Calibration;
}
