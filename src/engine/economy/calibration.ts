/**
 * Calibração centralizada do motor (ECONOMIC_MODEL.md §1.7, §6; AI_INSTRUCTIONS.md §3 "sem números mágicos").
 *
 * Todo coeficiente usado pela lógica do motor mora aqui, com faixa, significado (`note`) e justificativa
 * (`basis`: fonte, regra legal ou critério de jogo). Os valores continuam `PROVISORIO` até a importação das
 * séries oficiais; a faixa de cada um foi testada por `npm run sim:sensitivity` (resultado em
 * docs/CALIBRATION.md). O cenário pode sobrescrever qualquer um pelo mesmo nome em `scenario.parameters`
 * (ver `calibrationFromScenario`).
 *
 * Convenções: taxas anuais em fração; "por mês" quando o coeficiente é aplicado a cada turno.
 */

export interface ParamSpec {
  value: number;
  min: number;
  max: number;
  /** O que o parâmetro significa no motor. */
  note: string;
  /** Fonte, regra legal ou critério de jogo que justifica o valor (ECONOMIC_MODEL.md §6). */
  basis: string;
}

/** Justificativas recorrentes. */
const LIT_BCB = 'ordem de grandeza do modelo semiestrutural de pequeno porte do BCB (Relatórios de Inflação)';
const JOGO = 'critério de jogo: legibilidade e ritmo da campanha; testado na faixa';
const SATURACAO = 'saturação de segurança (ECONOMIC_MODEL.md §1.8)';

export const PARAMS = {
  // ── Produção (ECONOMIC_MODEL.md §5.1–5.2) ─────────────────────────────────────────────────────────
  g_pot_base: {
    value: 0.02,
    min: 0.01,
    max: 0.03,
    note: 'crescimento potencial anual',
    basis: 'estimativas de PIB potencial do Brasil (IFI, BCB): 1,5–2,5% ao ano',
  },
  rho_h: { value: 0.9, min: 0.8, max: 0.97, note: 'persistência mensal do hiato', basis: LIT_BCB },
  beta_r: {
    value: 0.01,
    min: 0.003,
    max: 0.02,
    note: 'efeito mensal no hiato de 1 p.p. de juro real acima do neutro (estado estacionário = beta_r / (1 − rho_h))',
    basis: LIT_BCB,
  },
  lag_r: {
    value: 6,
    min: 3,
    max: 12,
    note: 'meses para o juro real chegar à economia (média móvel)',
    basis: 'defasagem da política monetária de 6 a 9 meses citada pelo BCB',
  },
  juro_neutro: {
    value: 0.05,
    min: 0.035,
    max: 0.065,
    note: 'juro real neutro rn',
    basis: 'estimativas do juro neutro pelo BCB e pelo Focus (4,5–5,5%)',
  },
  mult_investimento: {
    value: 0.8,
    min: 0.3,
    max: 1.5,
    note: 'multiplicador do investimento público',
    basis: 'literatura de multiplicadores fiscais no Brasil (faixa ampla; ECONOMIC_MODEL.md §12)',
  },
  mult_custeio: {
    value: 0.5,
    min: 0.2,
    max: 1.0,
    note: 'multiplicador do custeio',
    basis: 'literatura de multiplicadores fiscais',
  },
  mult_transf_baixa_renda: {
    value: 0.7,
    min: 0.3,
    max: 1.3,
    note: 'multiplicador de transferências à baixa renda',
    basis: 'propensão a consumir alta da baixa renda (literatura de multiplicadores)',
  },
  mult_transf_alta_renda: {
    value: 0.3,
    min: 0.0,
    max: 0.6,
    note: 'multiplicador de transferências à alta renda',
    basis: 'propensão a consumir baixa da alta renda',
  },
  mult_obrigatoria: {
    value: 0.5,
    min: 0.2,
    max: 1.0,
    note: 'multiplicador da despesa obrigatória (pessoal, benefícios)',
    basis: 'média entre custeio e transferências',
  },
  mult_desoneracao_consumo: {
    value: 0.4,
    min: 0.1,
    max: 0.9,
    note: 'multiplicador da desoneração do consumo',
    basis: 'literatura de multiplicadores tributários',
  },
  mult_desoneracao_renda: {
    value: 0.2,
    min: 0.0,
    max: 0.5,
    note: 'multiplicador da desoneração da renda',
    basis: 'literatura de multiplicadores tributários',
  },
  mult_receita: {
    value: 0.3,
    min: 0.1,
    max: 0.6,
    note: 'efeito contracionista de aumento de receita',
    basis: 'literatura de multiplicadores tributários',
  },
  mult_credito: {
    value: 0.3,
    min: 0.1,
    max: 0.6,
    note: 'impulso de demanda por crédito mais barato',
    basis: JOGO,
  },
  mult_estrutural: {
    value: 0.5,
    min: 0.2,
    max: 1.0,
    note: 'multiplicador da variação da despesa estrutural (limite, compressão das discricionárias)',
    basis: 'mesmo do custeio: a compressão corta sobretudo custeio e investimento',
  },
  adaptacao_fiscal: {
    value: 1 / 36,
    min: 1 / 60,
    max: 1 / 12,
    note: 'fração mensal com que a economia se acomoda a uma postura fiscal (o impulso de nível se dissipa)',
    basis: 'efeito de multiplicador concentrado em 1–3 anos (literatura); evita hiato permanente',
  },
  sens_hiato: {
    value: 5,
    min: 2,
    max: 10,
    note: 'multiplicador × (1 + sens_hiato × max(0, −h)): ociosidade amplia',
    basis: 'multiplicadores dependentes de estado (ECONOMIC_MODEL.md §5.2)',
  },
  sens_risco: {
    value: 0.5,
    min: 0.2,
    max: 0.8,
    note: 'multiplicador × (1 − sens_risco × (1 − credibilidade))',
    basis: 'multiplicadores menores com risco fiscal alto (ECONOMIC_MODEL.md §5.2)',
  },
  ruido_hiato_casual: {
    value: 0.0005,
    min: 0,
    max: 0.001,
    note: 'desvio do ruído mensal do hiato (Casual)',
    basis: 'GAME_DESIGN.md §6: ruído baixo',
  },
  ruido_hiato_estrategica: {
    value: 0.001,
    min: 0,
    max: 0.002,
    note: 'desvio do ruído mensal do hiato (Estratégica); referência da escala de ruído das demais variáveis',
    basis: 'GAME_DESIGN.md §6: ruído médio',
  },
  ruido_hiato_realismo: {
    value: 0.0015,
    min: 0,
    max: 0.003,
    note: 'desvio do ruído mensal do hiato (Realismo)',
    basis: 'GAME_DESIGN.md §6: ruído alto',
  },
  efeito_termos_troca: {
    value: 0.0005,
    min: 0,
    max: 0.002,
    note: 'efeito mensal no hiato de 1 unidade (log) de termos de troca acima da média',
    basis: 'ciclo de commodities explica parte do ciclo brasileiro; 10% de alta → ~0,5% de hiato',
  },

  // ── Preços (§5.3) ───────────────────────────────────────────────────────────────────────────────
  kappa: { value: 0.25, min: 0.1, max: 0.5, note: 'inclinação da curva de Phillips', basis: LIT_BCB },
  ajuste_inflacao: {
    value: 0.15,
    min: 0.08,
    max: 0.3,
    note: 'fração mensal do caminho até a inflação-alvo (suavização da série de 12 meses)',
    basis: JOGO,
  },
  meta_inflacao: { value: 0.03, min: 0.03, max: 0.03, note: 'meta contínua (CMN)', basis: 'Resolução CMN 5.141/2024' },
  tolerancia_meta: {
    value: 0.015,
    min: 0.015,
    max: 0.015,
    note: 'intervalo de tolerância da meta',
    basis: 'Resolução CMN 5.141/2024',
  },
  repasse_cambial: {
    value: 0.1,
    min: 0.05,
    max: 0.25,
    note: 'repasse à inflação de 12 meses de 1 unidade (log) de depreciação real em 12 meses',
    basis: 'estimativas de pass-through no Brasil (5–15% em 12 meses)',
  },
  inflacao_externa: {
    value: 0.02,
    min: 0.015,
    max: 0.03,
    note: 'inflação anual dos parceiros comerciais (câmbio de equilíbrio por paridade)',
    basis: 'metas de inflação das economias avançadas (2%)',
  },

  // ── Banco Central (§5.4, §5.4.1) ────────────────────────────────────────────────────────────────
  phi_pi: { value: 1.5, min: 1.2, max: 2.0, note: 'reação às expectativas', basis: 'princípio de Taylor (φπ > 1)' },
  phi_h: { value: 0.5, min: 0.2, max: 1.0, note: 'reação ao hiato', basis: 'regra de Taylor clássica' },
  suav: { value: 0.7, min: 0.5, max: 0.9, note: 'suavização da Selic', basis: LIT_BCB },
  max_passo: {
    value: 0.01,
    min: 0.005,
    max: 0.015,
    note: 'movimento máximo por reunião',
    basis: 'maiores passos usuais do Copom (100 bp)',
  },
  max_passo_crise: {
    value: 0.015,
    min: 0.01,
    max: 0.02,
    note: 'movimento máximo por reunião em crise',
    basis: 'passos de 150 bp em 2021–2022 e dez/2024',
  },
  limiar_crise_inflacao: {
    value: 0.02,
    min: 0.01,
    max: 0.04,
    note: 'inflação acima do teto da meta por mais que isto = crise (passo maior)',
    basis: JOGO,
  },
  passo_selic: {
    value: 0.0025,
    min: 0.0025,
    max: 0.0025,
    note: 'Selic arredondada a 25 bp',
    basis: 'prática do Copom',
  },
  selic_piso: { value: 0.02, min: 0, max: 0.03, note: 'piso operacional da Selic', basis: 'mínima histórica de 2%' },
  repasse_risco_neutro: {
    value: 0.3,
    min: 0.2,
    max: 1.0,
    note: 'fração do prêmio de risco acima do básico que eleva o juro neutro do BC',
    basis: 'juro neutro brasileiro inclui prêmio de risco fiscal (estimativas do BCB)',
  },
  sub_base: {
    value: 0.6,
    min: 0.3,
    max: 0.9,
    note: 'submissão máxima do BC à pressão (diretoria toda indicada, autonomia nula)',
    basis: 'ECONOMIC_MODEL.md §5.4.1',
  },
  pressao_max: {
    value: 0.005,
    min: 0.0025,
    max: 0.01,
    note: 'corte máximo extra na próxima reunião obtido por pressão',
    basis: 'ECONOMIC_MODEL.md §5.4.1 (50 bp)',
  },
  custo_cred_pressao: {
    value: 0.05,
    min: 0.02,
    max: 0.1,
    note: 'credibilidade perdida por pressão, × (1 + pressões nos 12 meses anteriores)',
    basis: 'ECONOMIC_MODEL.md §5.4.1',
  },
  custo_risco_pressao: {
    value: 0.002,
    min: 0.001,
    max: 0.005,
    note: 'prêmio de risco extra por pressão nos últimos 12 meses',
    basis: 'ECONOMIC_MODEL.md §5.4.1 (20 bp)',
  },
  autonomia_percebida: {
    value: 0.5,
    min: 0.2,
    max: 0.8,
    note: 'autonomia percebida do BC (0–1), reduz a submissão',
    basis: 'LC 179/2021 (mandatos fixos); critério de jogo',
  },
  aprovacao_pressao: {
    value: 0.005,
    min: 0,
    max: 0.01,
    note: 'ganho imediato de aprovação ao pressionar por juros menores',
    basis: 'ECONOMIC_MODEL.md §5.4.1 ("a aprovação pode subir no curto prazo")',
  },
  diretoria_ano1: {
    value: 2 / 9,
    min: 2 / 9,
    max: 2 / 9,
    note: 'fração da diretoria do BC indicada pelo governo no 1º ano do mandato',
    basis: 'LC 179/2021 art. 4º: 2 diretores começam o mandato no 1º ano do governo',
  },
  diretoria_ano2: {
    value: 4 / 9,
    min: 4 / 9,
    max: 4 / 9,
    note: 'idem, 2º ano',
    basis: 'LC 179/2021: +2 diretores no 2º ano',
  },
  diretoria_ano3: {
    value: 7 / 9,
    min: 7 / 9,
    max: 7 / 9,
    note: 'idem, 3º ano',
    basis: 'LC 179/2021: presidente do BC e +2 diretores no 3º ano',
  },
  diretoria_ano4: {
    value: 1,
    min: 1,
    max: 1,
    note: 'idem, 4º ano',
    basis: 'LC 179/2021: últimos 2 diretores no 4º ano',
  },

  // ── Setor externo e risco (§5.5, §8) ────────────────────────────────────────────────────────────
  premio_base: {
    value: 0.025,
    min: 0.015,
    max: 0.035,
    note: 'prêmio de risco sem problemas fiscais',
    basis: 'CDS de 5 anos do Brasil em períodos calmos (150–250 bp)',
  },
  premio_extra_max: {
    value: 0.06,
    min: 0.03,
    max: 0.1,
    note: 'prêmio adicional máximo (saturação tanh)',
    basis: `CDS em crises (2002, 2015: +400–1.000 bp); ${SATURACAO}`,
  },
  sens_divida_risco: {
    value: 0.03,
    min: 0.02,
    max: 0.1,
    note: 'prêmio por unidade de dívida/PIB acima do limiar',
    basis: 'literatura de spreads soberanos de emergentes (3–5 bp por p.p. de dívida)',
  },
  sens_meta_risco: {
    value: 0.5,
    min: 0.2,
    max: 1.0,
    note: 'prêmio por unidade de déficit abaixo da banda da meta',
    basis: JOGO,
  },
  sens_cred_risco: {
    value: 0.04,
    min: 0.01,
    max: 0.08,
    note: 'prêmio por unidade de credibilidade abaixo da base',
    basis: JOGO,
  },
  sens_saida_capital: {
    value: 0.3,
    min: 0.1,
    max: 0.6,
    note: 'prêmio por unidade de carga sobre a renda acima do limiar (saída de capital, §5.7)',
    basis: JOGO,
  },
  ajuste_risco: {
    value: 0.3,
    min: 0.1,
    max: 0.6,
    note: 'fração mensal do caminho do prêmio até o alvo',
    basis: 'mercado reage em semanas',
  },
  juros_externos_medio: {
    value: 0.04,
    min: 0.02,
    max: 0.055,
    note: 'juro externo de longo prazo',
    basis: 'Fed funds neutro nominal (~3–4%)',
  },
  rho_juros_externos: {
    value: 0.97,
    min: 0.9,
    max: 0.99,
    note: 'persistência mensal do juro externo',
    basis: 'ciclos de política do Fed de vários anos',
  },
  ruido_juros_externos: {
    value: 0.001,
    min: 0,
    max: 0.002,
    note: 'desvio mensal do juro externo (Estratégica)',
    basis: JOGO,
  },
  rho_termos_troca: {
    value: 0.95,
    min: 0.85,
    max: 0.99,
    note: 'persistência mensal dos termos de troca (log)',
    basis: 'ciclos de commodities de vários anos',
  },
  ruido_termos_troca: {
    value: 0.02,
    min: 0,
    max: 0.04,
    note: 'desvio mensal dos termos de troca (Estratégica)',
    basis: 'volatilidade mensal de índices de commodities',
  },
  ajuste_cambio: {
    value: 0.1,
    min: 0.03,
    max: 0.3,
    note: 'fração mensal do caminho do câmbio até o equilíbrio',
    basis: 'meia-vida de desvios do câmbio real de 6–24 meses',
  },
  elast_cambio_juros: {
    value: 2,
    min: 0.5,
    max: 4,
    note: 'depreciação (log) por unidade de diferencial (juro externo + prêmio − Selic) acima do inicial',
    basis: 'paridade descoberta com prêmio; 1 p.p. de diferencial → ~2% de câmbio',
  },
  elast_cambio_termos_troca: {
    value: 0.5,
    min: 0.2,
    max: 1,
    note: 'apreciação (log) por unidade de termos de troca',
    basis: 'real como moeda de commodities',
  },
  desvio_cambio_max: {
    value: 0.4,
    min: 0.2,
    max: 0.6,
    note: 'desvio máximo (log) do câmbio de equilíbrio por diferencial de juros (saturação tanh)',
    basis: SATURACAO,
  },
  ruido_cambio: {
    value: 0.025,
    min: 0,
    max: 0.05,
    note: 'desvio mensal do câmbio (log, Estratégica)',
    basis: 'volatilidade mensal do real (3–4%)',
  },
  divida_cambial: {
    value: 0.05,
    min: 0,
    max: 0.15,
    note: 'fração da dívida bruta corrigida pelo câmbio',
    basis: 'dívida externa ~5% da DBGG (BCB)',
  },

  // ── Trabalho (§5.6) ─────────────────────────────────────────────────────────────────────────────
  nairu: {
    value: 0.065,
    min: 0.055,
    max: 0.09,
    note: 'desemprego de equilíbrio un',
    basis: 'estimativas recentes da NAIRU (6–8%)',
  },
  theta: { value: 0.35, min: 0.2, max: 0.6, note: 'coeficiente de Okun', basis: 'estimativas de Okun no Brasil' },
  ajuste_u: { value: 0.1, min: 0.05, max: 0.3, note: 'velocidade mensal de ajuste do desemprego', basis: JOGO },

  // ── Receitas (§5.7) ─────────────────────────────────────────────────────────────────────────────
  elast_receita_hiato: {
    value: 1.0,
    min: 0.5,
    max: 1.5,
    note: 'receita/PIB × (1 + elast × h)',
    basis: 'elasticidade da arrecadação ao ciclo (~1 ou pouco acima)',
  },
  elast_royalties_termos_troca: {
    value: 1.0,
    min: 0.5,
    max: 2,
    note: 'royalties e dividendos × (1 + elast × termos de troca)',
    basis: 'royalties do petróleo acompanham o preço internacional',
  },
  perda_max: {
    value: 0.3,
    min: 0.1,
    max: 0.5,
    note: 'perda máxima de arrecadação de um aumento de carga (sonegação, informalidade, elisão)',
    basis: 'ECONOMIC_MODEL.md §5.7 / elasticidade da base tributária',
  },
  escala_perda: {
    value: 0.02,
    min: 0.01,
    max: 0.04,
    note: 'carga acima do limiar (fração do PIB) que leva a perda a ~76% do máximo (tanh(1))',
    basis: JOGO,
  },
  margem_carga_renda: {
    value: 0.005,
    min: 0.002,
    max: 0.01,
    note: 'aumento de carga sobre a renda (fração do PIB) sem perda; acima dele a base reage',
    basis: 'base de renda de capital é a mais móvel',
  },
  margem_carga_folha: {
    value: 0.003,
    min: 0.001,
    max: 0.01,
    note: 'idem, folha (contribuições)',
    basis: 'informalidade reage a encargos sobre a folha',
  },
  margem_carga_consumo: {
    value: 0.008,
    min: 0.003,
    max: 0.015,
    note: 'idem, consumo (CBS, IS)',
    basis: 'base de consumo é a menos móvel',
  },
  margem_carga_outras: {
    value: 0.005,
    min: 0.002,
    max: 0.01,
    note: 'idem, demais tributos (IOF, comércio exterior, outros)',
    basis: JOGO,
  },

  // ── Despesas e limite do arcabouço (§5.8; POLITICAL_RULES.md §4.2–4.3) ───────────────────────────
  cresc_real_previdencia: {
    value: 0.025,
    min: 0.015,
    max: 0.035,
    note: 'crescimento real anual da previdência sem ganho do salário mínimo (beneficiários)',
    basis: 'crescimento do número de benefícios do RGPS (2,5–3% ao ano)',
  },
  cresc_real_beneficios: {
    value: 0.03,
    min: 0.015,
    max: 0.05,
    note: 'idem, BPC, abono e seguro-desemprego',
    basis: 'crescimento do BPC acima de 4% e do abono/seguro com o emprego',
  },
  cresc_real_pessoal: {
    value: 0,
    min: -0.01,
    max: 0.02,
    note: 'crescimento real anual da folha de pessoal sem reajustes extras',
    basis: 'reajustes pela inflação e reposição parcial de servidores',
  },
  cresc_real_outras: {
    value: 0.02,
    min: 0.01,
    max: 0.03,
    note: 'idem, demais obrigatórias (subsídios, sentenças, outras)',
    basis: 'acompanham o PIB',
  },
  peso_sm_previdencia: {
    value: 0.6,
    min: 0.5,
    max: 0.7,
    note: 'fração da previdência indexada ao salário mínimo',
    basis: 'cerca de 2/3 dos benefícios do RGPS são de um salário mínimo',
  },
  peso_sm_beneficios: {
    value: 1,
    min: 1,
    max: 1,
    note: 'fração de BPC, abono e seguro indexada ao salário mínimo',
    basis: 'BPC e abono iguais ao mínimo (CF art. 203; Lei 7.998/1990)',
  },
  sm_ganho_min: {
    value: 0.006,
    min: 0.006,
    max: 0.006,
    note: 'ganho real mínimo do salário mínimo pela regra',
    basis: 'Lei 15.077/2024: ganho real limitado à faixa do arcabouço (0,6%)',
  },
  sm_ganho_max: {
    value: 0.025,
    min: 0.025,
    max: 0.025,
    note: 'ganho real máximo pela regra',
    basis: 'Lei 15.077/2024: teto de 2,5%',
  },
  sm_regra_ate_mes: {
    value: 48,
    min: 48,
    max: 48,
    note: 'monthIndex a partir do qual a regra de valorização deixa de valer (jan/2031)',
    basis: 'Lei 15.077/2024: regra até 2030',
  },
  sm_ganho_apos_regra: {
    value: 0,
    min: 0,
    max: 0.01,
    note: 'ganho real anual do salário mínimo depois da regra (sem nova lei)',
    basis: 'CF art. 7º, IV exige só a preservação do poder de compra',
  },
  limite_fracao_receita: {
    value: 0.7,
    min: 0.7,
    max: 0.7,
    note: 'crescimento real do limite = fração × crescimento real da receita',
    basis: 'LC 200/2023 art. 5º (70%)',
  },
  limite_fracao_descumprida: {
    value: 0.5,
    min: 0.5,
    max: 0.5,
    note: 'idem, quando a meta de primário do ano anterior não foi cumprida',
    basis: 'LC 200/2023 art. 5º §1º (50%)',
  },
  limite_piso: {
    value: 0.006,
    min: 0.006,
    max: 0.006,
    note: 'crescimento real mínimo do limite',
    basis: 'LC 200/2023 art. 5º (0,6%)',
  },
  limite_teto: {
    value: 0.025,
    min: 0.025,
    max: 0.025,
    note: 'crescimento real máximo do limite',
    basis: 'LC 200/2023 art. 5º (2,5%)',
  },
  piso_custeio: {
    value: 0.012,
    min: 0.009,
    max: 0.014,
    note: 'discricionárias livres (fração do PIB) abaixo das quais começam paralisações',
    basis: 'estimativas de discricionária mínima para o funcionamento da máquina (IFI, ~R$ 120–160 bi)',
  },
  discricionaria_minima: {
    value: 0.006,
    min: 0.004,
    max: 0.008,
    note: 'discricionárias livres que não podem ser cortadas (estouro do limite acima disto)',
    basis: 'despesas essenciais de funcionamento; critério de jogo',
  },
  meta_primario: {
    value: 0.0025,
    min: -0.01,
    max: 0.02,
    note: 'meta de primário (LDO), fração do PIB',
    basis: 'metas recentes da LDO (0 a +0,25% do PIB)',
  },
  banda_meta_primario: {
    value: 0.0025,
    min: 0.0025,
    max: 0.0025,
    note: 'tolerância de ±0,25 p.p.',
    basis: 'LC 200/2023',
  },
  limiar_divida: {
    value: 0.8,
    min: 0.7,
    max: 0.9,
    note: 'dívida/PIB a partir da qual credibilidade e prêmio reagem',
    basis: 'nível em que a dívida brasileira passa a ser vista como alta (agências de rating)',
  },
  transmissao_selic_divida: {
    value: 1 / 36,
    min: 1 / 60,
    max: 1 / 12,
    note: 'fração mensal da distância Selic → taxa implícita da dívida',
    basis: 'prazo médio da DPF de ~4 anos, com ~45% pós-fixada',
  },
  repasse_risco_divida: {
    value: 0.3,
    min: 0.2,
    max: 1,
    note: 'fração do prêmio de risco acima do básico que chega à taxa implícita',
    basis: 'parcela prefixada e indexada à inflação, que carrega prêmio',
  },

  // ── Credibilidade (§5.3, §5.5) ──────────────────────────────────────────────────────────────────
  credibilidade_base: {
    value: 0.75,
    min: 0.5,
    max: 0.9,
    note: 'nível para onde a credibilidade volta sem problemas',
    basis: JOGO,
  },
  recuperacao_cred: { value: 0.02, min: 0.005, max: 0.05, note: 'fração mensal de retorno à base', basis: JOGO },
  pena_cred_fiscal: {
    value: 0.5,
    min: 0.2,
    max: 1.0,
    note: 'perda mensal = pena × déficit abaixo da banda / 12',
    basis: JOGO,
  },
  pena_cred_inflacao: {
    value: 0.3,
    min: 0.1,
    max: 0.6,
    note: 'perda mensal = pena × inflação acima do teto / 12',
    basis: JOGO,
  },
  pena_cred_divida: {
    value: 0.1,
    min: 0.05,
    max: 0.5,
    note: 'perda mensal = pena × (dívida − limiar) / 12',
    basis: JOGO,
  },
  pena_cred_estouro: {
    value: 0.5,
    min: 0.2,
    max: 1.0,
    note: 'perda mensal = pena × estouro do limite de despesas / 12',
    basis: 'descumprimento do arcabouço (LC 200/2023) afeta a confiança como o déficit',
  },
  cred_min: { value: 0.05, min: 0.05, max: 0.05, note: 'saturação inferior', basis: SATURACAO },
  cred_max: { value: 0.98, min: 0.98, max: 0.98, note: 'saturação superior', basis: SATURACAO },

  // ── Opinião pública (POLITICAL_RULES.md §11.1) ──────────────────────────────────────────────────
  aprovacao_base: {
    value: 0.42,
    min: 0.3,
    max: 0.55,
    note: 'aprovação de equilíbrio com economia neutra',
    basis: 'aprovação média de governos brasileiros fora de crises',
  },
  ajuste_aprovacao: {
    value: 0.15,
    min: 0.05,
    max: 0.3,
    note: 'fração mensal do caminho até a aprovação-alvo',
    basis: JOGO,
  },
  peso_inflacao: { value: 1.5, min: 0.5, max: 3, note: 'alvo += peso × (meta − inflação)', basis: JOGO },
  peso_desemprego: { value: 2.0, min: 0.5, max: 4, note: 'alvo += peso × (nairu − desemprego)', basis: JOGO },
  peso_crescimento: { value: 1.0, min: 0.3, max: 2, note: 'alvo += peso × (PIB 12m − g_pot_base)', basis: JOGO },
  peso_paralisacao: {
    value: 0.05,
    min: 0.02,
    max: 0.1,
    note: 'alvo −= peso × fração do piso de custeio que falta (paralisação de serviços)',
    basis: 'ECONOMIC_MODEL.md §5.8',
  },
  fator_lua_de_mel: {
    value: 0.6,
    min: 0.4,
    max: 0.9,
    note: 'multiplica perdas de aprovação na lua de mel',
    basis: 'POLITICAL_RULES.md §11.1',
  },
  meses_lua_de_mel: { value: 6, min: 3, max: 9, note: 'meses 0–5 do mandato', basis: 'POLITICAL_RULES.md §11.1' },
  aprovacao_min: { value: 0.05, min: 0.05, max: 0.05, note: 'saturação da aprovação-alvo', basis: SATURACAO },
  aprovacao_max: { value: 0.9, min: 0.9, max: 0.9, note: 'saturação da aprovação-alvo', basis: SATURACAO },
  capital_base: { value: 30, min: 10, max: 50, note: 'capital político-alvo com aprovação zero', basis: JOGO },
  capital_peso_aprovacao: { value: 60, min: 30, max: 90, note: 'capital-alvo += peso × aprovação', basis: JOGO },
  ajuste_capital: {
    value: 0.1,
    min: 0.05,
    max: 0.3,
    note: 'fração mensal do caminho até o capital-alvo',
    basis: JOGO,
  },

  // ── Congresso (POLITICAL_RULES.md §6.2–6.3) ─────────────────────────────────────────────────────
  w_ideo: {
    value: 0.5,
    min: 0.2,
    max: 0.8,
    note: 'peso da afinidade ideológica (1 − distância/2)',
    basis: 'POLITICAL_RULES.md §6.2',
  },
  w_rel: { value: 0.4, min: 0.2, max: 0.6, note: 'peso da relação com o governo (/100)', basis: 'idem' },
  w_int: { value: 0.2, min: 0.1, max: 0.4, note: 'peso de interesses atendidos (0 ou 1)', basis: 'idem' },
  w_opiniao: { value: 0.4, min: 0.1, max: 0.8, note: 'peso de (aprovação − 0,5)', basis: 'idem' },
  limiar_apoio: {
    value: 0.2,
    min: 0.1,
    max: 0.4,
    note: 'apoio acima do qual o bloco orienta "sim"',
    basis: 'idem',
  },
  inclinacao_apoio: {
    value: 8,
    min: 4,
    max: 12,
    note: 'inclinação da logística dos votos dissidentes',
    basis: 'idem',
  },
  ruido_apoio: {
    value: 0.08,
    min: 0.02,
    max: 0.15,
    note: 'desvio do sorteio de apoio por bloco e votação',
    basis: 'idem',
  },
  bonus_casual: {
    value: 0.1,
    min: 0,
    max: 0.2,
    note: 'Congresso mais receptivo no Casual (GAME_DESIGN.md §6)',
    basis: 'GAME_DESIGN.md §6',
  },
  margem_alteracao: {
    value: 0.1,
    min: 0.05,
    max: 0.2,
    note: 'aprovado por menos que esta fração das cadeiras acima do exigido → texto alterado',
    basis: JOGO,
  },
  escala_alterada: {
    value: 0.8,
    min: 0.6,
    max: 0.9,
    note: 'fração do texto que sobrevive quando alterado',
    basis: JOGO,
  },
  capacidade_pauta: {
    value: 3,
    min: 2,
    max: 5,
    note: 'propostas do governo tramitando ao mesmo tempo',
    basis: 'POLITICAL_RULES.md §6.3',
  },
  relacao_vitoria: {
    value: 3,
    min: 0,
    max: 10,
    note: 'relação dos blocos que votaram sim após aprovação',
    basis: JOGO,
  },
  relacao_derrota: { value: -3, min: -10, max: 0, note: 'relação dos blocos que votaram não', basis: JOGO },
  capital_vitoria: { value: 4, min: 0, max: 10, note: 'capital político por vitória legislativa', basis: JOGO },
  capital_derrota: { value: -8, min: -15, max: 0, note: 'capital político por derrota', basis: JOGO },
  capital_envio_pec: { value: -5, min: -10, max: 0, note: 'custo de capital ao enviar PEC', basis: JOGO },

  // ── Execução de políticas (ECONOMIC_MODEL.md §5.10, simplificado) ───────────────────────────────
  atraso_min_meses: {
    value: 2,
    min: 1,
    max: 3,
    note: 'atraso mínimo quando o risco "atraso" ocorre',
    basis: JOGO,
  },
  atraso_max_meses: { value: 6, min: 3, max: 12, note: 'atraso máximo', basis: JOGO },
  fator_sobrecusto: {
    value: 1.2,
    min: 1.1,
    max: 1.5,
    note: 'despesa × fator quando o risco "sobrecusto" ocorre',
    basis: 'sobrecustos médios de obras públicas (TCU)',
  },
  fator_baixa_adesao: {
    value: 0.7,
    min: 0.4,
    max: 0.9,
    note: 'efeito × fator quando há baixa adesão',
    basis: JOGO,
  },
  pena_cred_limite: {
    value: 0.03,
    min: 0.01,
    max: 0.06,
    note: 'credibilidade perdida ao executar acima do limite de despesas ou sem compensação (LRF)',
    basis: JOGO,
  },

  // ── Eventos (GAME_DESIGN.md §11.3) ──────────────────────────────────────────────────────────────
  max_eventos_mes: { value: 2, min: 1, max: 3, note: 'eventos novos por mês, no máximo', basis: JOGO },
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
