# Brasil Simulator — Calibração do motor

Arquivo **gerado** por `npm run sim:sensitivity` (scripts/sim/sensitivity.sim.ts); não editar à mão.
Fonte dos valores: `src/engine/economy/calibration.ts`. Todos os valores são `PROVISORIO` até a importação das
séries oficiais ([DATA_SOURCES.md](DATA_SOURCES.md) §4); a justificativa de cada um está na coluna "Base".

## Método

Cada parâmetro com faixa é levado ao mínimo e ao máximo, com os demais no padrão, em campanhas de 240
meses das estratégias `inerte` e `populista_fiscal` com as sementes 1, 2, 3
no cenário `brasil_2027_01`. O resultado mostra a dívida/PIB final média e a inflação média nos dois
extremos e o total de violações de invariantes. Critério de estabilidade: nenhuma violação, inflação abaixo de
30% e dívida abaixo de 500% do PIB em todas as campanhas
([ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) §9).

Referência (todos no padrão): dívida final 220%, inflação média 3,2%,
violações 0.

Resultado: todos os extremos estáveis.

## Parâmetros

| Parâmetro | Valor | Faixa testada | Significado | Base | Sensibilidade |
| --- | --- | --- | --- | --- | --- |
| `g_pot_base` | 0,02 | 0,01 – 0,03 | crescimento potencial anual | estimativas de PIB potencial do Brasil (IFI, BCB): 1,5–2,5% ao ano | dívida final 339% → 136% (−203,2 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `rho_h` | 0,9 | 0,8 – 0,97 | persistência mensal do hiato | ordem de grandeza do modelo semiestrutural de pequeno porte do BCB (Relatórios de Inflação) | dívida final 219% → 213% (−5,7 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `beta_r` | 0,01 | 0,003 – 0,02 | efeito mensal no hiato de 1 p.p. de juro real acima do neutro (estado estacionário = beta_r / (1 − rho_h)) | ordem de grandeza do modelo semiestrutural de pequeno porte do BCB (Relatórios de Inflação) | dívida final 217% → 217% (−0,2 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `lag_r` | 6 | 3 – 12 | meses para o juro real chegar à economia (média móvel) | defasagem da política monetária de 6 a 9 meses citada pelo BCB | dívida final 220% → 219% (−0,7 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `juro_neutro` | 0,05 | 0,035 – 0,065 | juro real neutro rn | estimativas do juro neutro pelo BCB e pelo Focus (4,5–5,5%) | dívida final 164% → 288% (+123,9 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `mult_investimento` | 0,8 | 0,3 – 1,5 | multiplicador do investimento público | literatura de multiplicadores fiscais no Brasil (faixa ampla; ECONOMIC_MODEL.md §12) | dívida final 220% → 220% (−0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `mult_custeio` | 0,5 | 0,2 – 1 | multiplicador do custeio | literatura de multiplicadores fiscais | dívida final 217% → 217% (−0,4 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `mult_transf_baixa_renda` | 0,7 | 0,3 – 1,3 | multiplicador de transferências à baixa renda | propensão a consumir alta da baixa renda (literatura de multiplicadores) | dívida final 219% → 218% (−1,2 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `mult_transf_alta_renda` | 0,3 | 0 – 0,6 | multiplicador de transferências à alta renda | propensão a consumir baixa da alta renda | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `mult_obrigatoria` | 0,5 | 0,2 – 1 | multiplicador da despesa obrigatória (pessoal, benefícios) | média entre custeio e transferências | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `mult_desoneracao_consumo` | 0,4 | 0,1 – 0,9 | multiplicador da desoneração do consumo | literatura de multiplicadores tributários | dívida final 219% → 219% (−0,5 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `mult_desoneracao_renda` | 0,2 | 0 – 0,5 | multiplicador da desoneração da renda | literatura de multiplicadores tributários | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `mult_receita` | 0,3 | 0,1 – 0,6 | efeito contracionista de aumento de receita | literatura de multiplicadores tributários | dívida final 220% → 220% (−0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `mult_credito` | 0,3 | 0,1 – 0,6 | impulso de demanda por crédito mais barato | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 219% → 219% (+0,6 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `mult_estrutural` | 0,5 | 0,2 – 1 | multiplicador da variação da despesa estrutural (limite, compressão das discricionárias) | mesmo do custeio: a compressão corta sobretudo custeio e investimento | dívida final 218% → 218% (+0,7 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `adaptacao_fiscal` | 0,02778 | 0,01667 – 0,08333 | fração mensal com que a economia se acomoda a uma postura fiscal (o impulso de nível se dissipa) | efeito de multiplicador concentrado em 1–3 anos (literatura); evita hiato permanente | dívida final 220% → 219% (−1,3 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `sens_hiato` | 5 | 2 – 10 | multiplicador × (1 + sens_hiato × max(0, −h)): ociosidade amplia | multiplicadores dependentes de estado (ECONOMIC_MODEL.md §5.2) | dívida final 220% → 220% (−0,2 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `sens_risco` | 0,5 | 0,2 – 0,8 | multiplicador × (1 − sens_risco × (1 − credibilidade)) | multiplicadores menores com risco fiscal alto (ECONOMIC_MODEL.md §5.2) | dívida final 219% → 219% (−0,4 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `ruido_hiato_casual` | 0,0005 | 0 – 0,001 | desvio do ruído mensal do hiato (Casual) | GAME_DESIGN.md §6: ruído baixo | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `ruido_hiato_estrategica` | 0,001 | 0 – 0,002 | desvio do ruído mensal do hiato (Estratégica); referência da escala de ruído das demais variáveis | GAME_DESIGN.md §6: ruído médio | dívida final 220% → 218% (−2,4 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `ruido_hiato_realismo` | 0,0015 | 0 – 0,003 | desvio do ruído mensal do hiato (Realismo) | GAME_DESIGN.md §6: ruído alto | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `efeito_termos_troca` | 0,0005 | 0 – 0,002 | efeito mensal no hiato de 1 unidade (log) de termos de troca acima da média | ciclo de commodities explica parte do ciclo brasileiro; 10% de alta → ~0,5% de hiato | dívida final 220% → 218% (−1,6 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `kappa` | 0,25 | 0,1 – 0,5 | inclinação da curva de Phillips | ordem de grandeza do modelo semiestrutural de pequeno porte do BCB (Relatórios de Inflação) | dívida final 219% → 220% (+1,5 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `ajuste_inflacao` | 0,15 | 0,08 – 0,3 | fração mensal do caminho até a inflação-alvo (suavização da série de 12 meses) | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 219% → 221% (+1,8 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `meta_inflacao` | 0,03 | — | meta contínua (CMN) | Resolução CMN 5.141/2024 | fixo (regra legal ou saturação) |
| `tolerancia_meta` | 0,015 | — | intervalo de tolerância da meta | Resolução CMN 5.141/2024 | fixo (regra legal ou saturação) |
| `repasse_cambial` | 0,1 | 0,05 – 0,25 | repasse à inflação de 12 meses de 1 unidade (log) de depreciação real em 12 meses | estimativas de pass-through no Brasil (5–15% em 12 meses) | dívida final 219% → 220% (+1,2 p.p.); inflação média 3,1% → 3,4%; violações 0 |
| `inflacao_externa` | 0,02 | 0,015 – 0,03 | inflação anual dos parceiros comerciais (câmbio de equilíbrio por paridade) | metas de inflação das economias avançadas (2%) | dívida final 221% → 215% (−5,7 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `phi_pi` | 1,5 | 1,2 – 2 | reação às expectativas | princípio de Taylor (φπ > 1) | dívida final 219% → 222% (+3,7 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `phi_h` | 0,5 | 0,2 – 1 | reação ao hiato | regra de Taylor clássica | dívida final 222% → 215% (−7,3 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `suav` | 0,7 | 0,5 – 0,9 | suavização da Selic | ordem de grandeza do modelo semiestrutural de pequeno porte do BCB (Relatórios de Inflação) | dívida final 218% → 245% (+26,8 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `max_passo` | 0,01 | 0,005 – 0,015 | movimento máximo por reunião | maiores passos usuais do Copom (100 bp) | dívida final 221% → 220% (−1,0 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `max_passo_crise` | 0,015 | 0,01 – 0,02 | movimento máximo por reunião em crise | passos de 150 bp em 2021–2022 e dez/2024 | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `limiar_crise_inflacao` | 0,02 | 0,01 – 0,04 | inflação acima do teto da meta por mais que isto = crise (passo maior) | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `passo_selic` | 0,0025 | — | Selic arredondada a 25 bp | prática do Copom | fixo (regra legal ou saturação) |
| `selic_piso` | 0,02 | 0 – 0,03 | piso operacional da Selic | mínima histórica de 2% | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `repasse_risco_neutro` | 0,3 | 0,2 – 1 | fração do prêmio de risco acima do básico que eleva o juro neutro do BC | juro neutro brasileiro inclui prêmio de risco fiscal (estimativas do BCB) | dívida final 212% → 296% (+84,0 p.p.); inflação média 3,2% → 2,9%; violações 0 |
| `sub_base` | 0,6 | 0,3 – 0,9 | submissão máxima do BC à pressão (diretoria toda indicada, autonomia nula) | ECONOMIC_MODEL.md §5.4.1 | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `pressao_max` | 0,005 | 0,0025 – 0,01 | corte máximo extra na próxima reunião obtido por pressão | ECONOMIC_MODEL.md §5.4.1 (50 bp) | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `custo_cred_pressao` | 0,05 | 0,02 – 0,1 | credibilidade perdida por pressão, × (1 + pressões nos 12 meses anteriores) | ECONOMIC_MODEL.md §5.4.1 | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `custo_risco_pressao` | 0,002 | 0,001 – 0,005 | prêmio de risco extra por pressão nos últimos 12 meses | ECONOMIC_MODEL.md §5.4.1 (20 bp) | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `autonomia_percebida` | 0,5 | 0,2 – 0,8 | autonomia percebida do BC (0–1), reduz a submissão | LC 179/2021 (mandatos fixos); critério de jogo | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `aprovacao_pressao` | 0,005 | 0 – 0,01 | ganho imediato de aprovação ao pressionar por juros menores | ECONOMIC_MODEL.md §5.4.1 ("a aprovação pode subir no curto prazo") | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `diretoria_ano1` | 0,2222 | — | fração da diretoria do BC indicada pelo governo no 1º ano do mandato | LC 179/2021 art. 4º: 2 diretores começam o mandato no 1º ano do governo | fixo (regra legal ou saturação) |
| `diretoria_ano2` | 0,4444 | — | idem, 2º ano | LC 179/2021: +2 diretores no 2º ano | fixo (regra legal ou saturação) |
| `diretoria_ano3` | 0,7778 | — | idem, 3º ano | LC 179/2021: presidente do BC e +2 diretores no 3º ano | fixo (regra legal ou saturação) |
| `diretoria_ano4` | 1 | — | idem, 4º ano | LC 179/2021: últimos 2 diretores no 4º ano | fixo (regra legal ou saturação) |
| `premio_base` | 0,025 | 0,015 – 0,035 | prêmio de risco sem problemas fiscais | CDS de 5 anos do Brasil em períodos calmos (150–250 bp) | dívida final 219% → 220% (+0,8 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `premio_extra_max` | 0,06 | 0,03 – 0,1 | prêmio adicional máximo (saturação tanh) | CDS em crises (2002, 2015: +400–1.000 bp); saturação de segurança (ECONOMIC_MODEL.md §1.8) | dívida final 212% → 223% (+11,6 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `sens_divida_risco` | 0,03 | 0,02 – 0,1 | prêmio por unidade de dívida/PIB acima do limiar | literatura de spreads soberanos de emergentes (3–5 bp por p.p. de dívida) | dívida final 211% → 264% (+53,7 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `sens_meta_risco` | 0,5 | 0,2 – 1 | prêmio por unidade de déficit abaixo da banda da meta | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 219% → 222% (+3,2 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `sens_cred_risco` | 0,04 | 0,01 – 0,08 | prêmio por unidade de credibilidade abaixo da base | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 208% → 234% (+26,7 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `sens_saida_capital` | 0,3 | 0,1 – 0,6 | prêmio por unidade de carga sobre a renda acima do limiar (saída de capital, §5.7) | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `ajuste_risco` | 0,3 | 0,1 – 0,6 | fração mensal do caminho do prêmio até o alvo | mercado reage em semanas | dívida final 217% → 221% (+4,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `juros_externos_medio` | 0,04 | 0,02 – 0,055 | juro externo de longo prazo | Fed funds neutro nominal (~3–4%) | dívida final 218% → 219% (+1,1 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `rho_juros_externos` | 0,97 | 0,9 – 0,99 | persistência mensal do juro externo | ciclos de política do Fed de vários anos | dívida final 220% → 220% (+0,2 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `ruido_juros_externos` | 0,001 | 0 – 0,002 | desvio mensal do juro externo (Estratégica) | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 220% → 220% (−0,1 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `rho_termos_troca` | 0,95 | 0,85 – 0,99 | persistência mensal dos termos de troca (log) | ciclos de commodities de vários anos | dívida final 220% → 220% (+0,5 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `ruido_termos_troca` | 0,02 | 0 – 0,04 | desvio mensal dos termos de troca (Estratégica) | volatilidade mensal de índices de commodities | dívida final 218% → 217% (−0,6 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `ajuste_cambio` | 0,1 | 0,03 – 0,3 | fração mensal do caminho do câmbio até o equilíbrio | meia-vida de desvios do câmbio real de 6–24 meses | dívida final 219% → 220% (+1,1 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `elast_cambio_juros` | 2 | 0,5 – 4 | depreciação (log) por unidade de diferencial (juro externo + prêmio − Selic) acima do inicial | paridade descoberta com prêmio; 1 p.p. de diferencial → ~2% de câmbio | dívida final 219% → 218% (−0,6 p.p.); inflação média 3,1% → 3,3%; violações 0 |
| `elast_cambio_termos_troca` | 0,5 | 0,2 – 1 | apreciação (log) por unidade de termos de troca | real como moeda de commodities | dívida final 220% → 218% (−1,3 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `desvio_cambio_max` | 0,4 | 0,2 – 0,6 | desvio máximo (log) do câmbio de equilíbrio por diferencial de juros (saturação tanh) | saturação de segurança (ECONOMIC_MODEL.md §1.8) | dívida final 220% → 220% (+0,1 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `ruido_cambio` | 0,025 | 0 – 0,05 | desvio mensal do câmbio (log, Estratégica) | volatilidade mensal do real (3–4%) | dívida final 219% → 219% (+0,7 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `divida_cambial` | 0,05 | 0 – 0,15 | fração da dívida bruta corrigida pelo câmbio | dívida externa ~5% da DBGG (BCB) | dívida final 215% → 230% (+15,6 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `nairu` | 0,065 | 0,055 – 0,09 | desemprego de equilíbrio un | estimativas recentes da NAIRU (6–8%) | dívida final 220% → 220% (−0,1 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `theta` | 0,35 | 0,2 – 0,6 | coeficiente de Okun | estimativas de Okun no Brasil | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `ajuste_u` | 0,1 | 0,05 – 0,3 | velocidade mensal de ajuste do desemprego | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `elast_receita_hiato` | 1 | 0,5 – 1,5 | receita/PIB × (1 + elast × h) | elasticidade da arrecadação ao ciclo (~1 ou pouco acima) | dívida final 218% → 218% (−0,2 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `elast_royalties_termos_troca` | 1 | 0,5 – 2 | royalties e dividendos × (1 + elast × termos de troca) | royalties do petróleo acompanham o preço internacional | dívida final 219% → 219% (+0,3 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `perda_max` | 0,3 | 0,1 – 0,5 | perda máxima de arrecadação de um aumento de carga (sonegação, informalidade, elisão) | ECONOMIC_MODEL.md §5.7 / elasticidade da base tributária | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `escala_perda` | 0,02 | 0,01 – 0,04 | carga acima do limiar (fração do PIB) que leva a perda a ~76% do máximo (tanh(1)) | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `margem_carga_renda` | 0,005 | 0,002 – 0,01 | aumento de carga sobre a renda (fração do PIB) sem perda; acima dele a base reage | base de renda de capital é a mais móvel | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `margem_carga_folha` | 0,003 | 0,001 – 0,01 | idem, folha (contribuições) | informalidade reage a encargos sobre a folha | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `margem_carga_consumo` | 0,008 | 0,003 – 0,015 | idem, consumo (CBS, IS) | base de consumo é a menos móvel | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `margem_carga_outras` | 0,005 | 0,002 – 0,01 | idem, demais tributos (IOF, comércio exterior, outros) | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `cresc_real_previdencia` | 0,025 | 0,015 – 0,035 | crescimento real anual da previdência sem ganho do salário mínimo (beneficiários) | crescimento do número de benefícios do RGPS (2,5–3% ao ano) | dívida final 192% → 257% (+64,8 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `cresc_real_beneficios` | 0,03 | 0,015 – 0,05 | idem, BPC, abono e seguro-desemprego | crescimento do BPC acima de 4% e do abono/seguro com o emprego | dívida final 209% → 239% (+29,5 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `cresc_real_pessoal` | 0 | -0,01 – 0,02 | crescimento real anual da folha de pessoal sem reajustes extras | reajustes pela inflação e reposição parcial de servidores | dívida final 211% → 243% (+31,4 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `cresc_real_outras` | 0,02 | 0,01 – 0,03 | idem, demais obrigatórias (subsídios, sentenças, outras) | acompanham o PIB | dívida final 217% → 224% (+7,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `peso_sm_previdencia` | 0,6 | 0,5 – 0,7 | fração da previdência indexada ao salário mínimo | cerca de 2/3 dos benefícios do RGPS são de um salário mínimo | dívida final 218% → 222% (+3,6 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `peso_sm_beneficios` | 1 | — | fração de BPC, abono e seguro indexada ao salário mínimo | BPC e abono iguais ao mínimo (CF art. 203; Lei 7.998/1990) | fixo (regra legal ou saturação) |
| `sm_ganho_min` | 0,006 | — | ganho real mínimo do salário mínimo pela regra | Lei 15.077/2024: ganho real limitado à faixa do arcabouço (0,6%) | fixo (regra legal ou saturação) |
| `sm_ganho_max` | 0,025 | — | ganho real máximo pela regra | Lei 15.077/2024: teto de 2,5% | fixo (regra legal ou saturação) |
| `sm_regra_ate_mes` | 48 | — | monthIndex a partir do qual a regra de valorização deixa de valer (jan/2031) | Lei 15.077/2024: regra até 2030 | fixo (regra legal ou saturação) |
| `sm_ganho_apos_regra` | 0 | 0 – 0,01 | ganho real anual do salário mínimo depois da regra (sem nova lei) | CF art. 7º, IV exige só a preservação do poder de compra | dívida final 220% → 239% (+19,3 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `limite_fracao_receita` | 0,7 | — | crescimento real do limite = fração × crescimento real da receita | LC 200/2023 art. 5º (70%) | fixo (regra legal ou saturação) |
| `limite_fracao_descumprida` | 0,5 | — | idem, quando a meta de primário do ano anterior não foi cumprida | LC 200/2023 art. 5º §1º (50%) | fixo (regra legal ou saturação) |
| `limite_piso` | 0,006 | — | crescimento real mínimo do limite | LC 200/2023 art. 5º (0,6%) | fixo (regra legal ou saturação) |
| `limite_teto` | 0,025 | — | crescimento real máximo do limite | LC 200/2023 art. 5º (2,5%) | fixo (regra legal ou saturação) |
| `piso_custeio` | 0,012 | 0,009 – 0,014 | discricionárias livres (fração do PIB) abaixo das quais começam paralisações | estimativas de discricionária mínima para o funcionamento da máquina (IFI, ~R$ 120–160 bi) | dívida final 220% → 220% (−0,4 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `discricionaria_minima` | 0,006 | 0,004 – 0,008 | discricionárias livres que não podem ser cortadas (estouro do limite acima disto) | despesas essenciais de funcionamento; critério de jogo | dívida final 212% → 227% (+14,8 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `meta_primario` | 0,0025 | -0,01 – 0,02 | meta de primário (LDO), fração do PIB | metas recentes da LDO (0 a +0,25% do PIB) | dívida final 217% → 240% (+23,0 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `banda_meta_primario` | 0,0025 | — | tolerância de ±0,25 p.p. | LC 200/2023 | fixo (regra legal ou saturação) |
| `limiar_divida` | 0,8 | 0,7 – 0,9 | dívida/PIB a partir da qual credibilidade e prêmio reagem | nível em que a dívida brasileira passa a ser vista como alta (agências de rating) | dívida final 228% → 211% (−17,2 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `transmissao_selic_divida` | 0,02778 | 0,01667 – 0,08333 | fração mensal da distância Selic → taxa implícita da dívida | prazo médio da DPF de ~4 anos, com ~45% pós-fixada | dívida final 232% → 207% (−25,1 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `repasse_risco_divida` | 0,3 | 0,2 – 1 | fração do prêmio de risco acima do básico que chega à taxa implícita | parcela prefixada e indexada à inflação, que carrega prêmio | dívida final 211% → 307% (+95,8 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `credibilidade_base` | 0,75 | 0,5 – 0,9 | nível para onde a credibilidade volta sem problemas | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 220% → 222% (+2,6 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `recuperacao_cred` | 0,02 | 0,005 – 0,05 | fração mensal de retorno à base | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 233% → 211% (−21,7 p.p.); inflação média 3,1% → 3,1%; violações 0 |
| `pena_cred_fiscal` | 0,5 | 0,2 – 1 | perda mensal = pena × déficit abaixo da banda / 12 | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 220% → 220% (+0,8 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `pena_cred_inflacao` | 0,3 | 0,1 – 0,6 | perda mensal = pena × inflação acima do teto / 12 | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `pena_cred_divida` | 0,1 | 0,05 – 0,5 | perda mensal = pena × (dívida − limiar) / 12 | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 215% → 243% (+28,5 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `pena_cred_estouro` | 0,5 | 0,2 – 1 | perda mensal = pena × estouro do limite de despesas / 12 | descumprimento do arcabouço (LC 200/2023) afeta a confiança como o déficit | dívida final 219% → 221% (+1,5 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `cred_min` | 0,05 | — | saturação inferior | saturação de segurança (ECONOMIC_MODEL.md §1.8) | fixo (regra legal ou saturação) |
| `cred_max` | 0,98 | — | saturação superior | saturação de segurança (ECONOMIC_MODEL.md §1.8) | fixo (regra legal ou saturação) |
| `aprovacao_base` | 0,42 | 0,3 – 0,55 | aprovação de equilíbrio com economia neutra | aprovação média de governos brasileiros fora de crises | dívida final 218% → 220% (+1,8 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `ajuste_aprovacao` | 0,15 | 0,05 – 0,3 | fração mensal do caminho até a aprovação-alvo | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 219% → 220% (+1,4 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `peso_inflacao` | 1,5 | 0,5 – 3 | alvo += peso × (meta − inflação) | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 220% → 219% (−0,6 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `peso_desemprego` | 2 | 0,5 – 4 | alvo += peso × (nairu − desemprego) | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 220% → 220% (+0,2 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `peso_crescimento` | 1 | 0,3 – 2 | alvo += peso × (PIB 12m − g_pot_base) | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `peso_paralisacao` | 0,05 | 0,02 – 0,1 | alvo −= peso × fração do piso de custeio que falta (paralisação de serviços) | ECONOMIC_MODEL.md §5.8 | dívida final 220% → 219% (−1,3 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `fator_lua_de_mel` | 0,6 | 0,4 – 0,9 | multiplica perdas de aprovação na lua de mel | POLITICAL_RULES.md §11.1 | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `meses_lua_de_mel` | 6 | 3 – 9 | meses 0–5 do mandato | POLITICAL_RULES.md §11.1 | dívida final 220% → 220% (−0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `aprovacao_min` | 0,05 | — | saturação da aprovação-alvo | saturação de segurança (ECONOMIC_MODEL.md §1.8) | fixo (regra legal ou saturação) |
| `aprovacao_max` | 0,9 | — | saturação da aprovação-alvo | saturação de segurança (ECONOMIC_MODEL.md §1.8) | fixo (regra legal ou saturação) |
| `capital_base` | 30 | 10 – 50 | capital político-alvo com aprovação zero | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `capital_peso_aprovacao` | 60 | 30 – 90 | capital-alvo += peso × aprovação | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `ajuste_capital` | 0,1 | 0,05 – 0,3 | fração mensal do caminho até o capital-alvo | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `w_ideo` | 0,5 | 0,2 – 0,8 | peso da afinidade ideológica (1 − distância/2) | POLITICAL_RULES.md §6.2 | dívida final 212% → 223% (+10,5 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `w_rel` | 0,4 | 0,2 – 0,6 | peso da relação com o governo (/100) | idem | dívida final 219% → 217% (−1,6 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `w_int` | 0,2 | 0,1 – 0,4 | peso de interesses atendidos (0 ou 1) | idem | dívida final 218% → 220% (+2,6 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `w_opiniao` | 0,4 | 0,1 – 0,8 | peso de (aprovação − 0,5) | idem | dívida final 218% → 218% (−0,4 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `limiar_apoio` | 0,2 | 0,1 – 0,4 | apoio acima do qual o bloco orienta "sim" | idem | dívida final 223% → 211% (−12,2 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `inclinacao_apoio` | 8 | 4 – 12 | inclinação da logística dos votos dissidentes | idem | dívida final 220% → 220% (−0,2 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `ruido_apoio` | 0,08 | 0,02 – 0,15 | desvio do sorteio de apoio por bloco e votação | idem | dívida final 217% → 217% (+0,1 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `bonus_casual` | 0,1 | 0 – 0,2 | Congresso mais receptivo no Casual (GAME_DESIGN.md §6) | GAME_DESIGN.md §6 | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `margem_alteracao` | 0,1 | 0,05 – 0,2 | aprovado por menos que esta fração das cadeiras acima do exigido → texto alterado | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 219% → 220% (+1,3 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `escala_alterada` | 0,8 | 0,6 – 0,9 | fração do texto que sobrevive quando alterado | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 218% → 219% (+1,4 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `capacidade_pauta` | 3 | 2 – 5 | propostas do governo tramitando ao mesmo tempo | POLITICAL_RULES.md §6.3 | dívida final 214% → 212% (−1,9 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `relacao_vitoria` | 3 | 0 – 10 | relação dos blocos que votaram sim após aprovação | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 219% → 222% (+3,2 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `relacao_derrota` | -3 | -10 – 0 | relação dos blocos que votaram não | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 215% → 218% (+3,2 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `capital_vitoria` | 4 | 0 – 10 | capital político por vitória legislativa | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `capital_derrota` | -8 | -15 – 0 | capital político por derrota | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `capital_envio_pec` | -5 | -10 – 0 | custo de capital ao enviar PEC | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `atraso_min_meses` | 2 | 1 – 3 | atraso mínimo quando o risco "atraso" ocorre | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `atraso_max_meses` | 6 | 3 – 12 | atraso máximo | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `fator_sobrecusto` | 1,2 | 1,1 – 1,5 | despesa × fator quando o risco "sobrecusto" ocorre | sobrecustos médios de obras públicas (TCU) | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `fator_baixa_adesao` | 0,7 | 0,4 – 0,9 | efeito × fator quando há baixa adesão | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 220% → 220% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `pena_cred_limite` | 0,03 | 0,01 – 0,06 | credibilidade perdida ao executar acima do limite de despesas ou sem compensação (LRF) | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 218% → 221% (+2,9 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `max_eventos_mes` | 2 | 1 – 3 | eventos novos por mês, no máximo | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 216% → 219% (+3,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
