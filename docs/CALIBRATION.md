# Brasil Simulator — Calibração do motor

Arquivo **gerado** por `npm run sim:sensitivity` (scripts/sim/sensitivity.sim.ts); não editar à mão.
Fonte dos valores: `src/engine/economy/calibration.ts`. Todos os valores são `PROVISORIO` até a importação das
séries oficiais ([DATA_SOURCES.md](DATA_SOURCES.md) §4); a justificativa de cada um está na coluna "Base".

## Método

Cada parâmetro com faixa é levado ao mínimo e ao máximo, com os demais no padrão, em campanhas de 240
meses das estratégias `inerte` e `populista_fiscal` e `fisiologica` com as sementes 1, 2, 3
no cenário `brasil_2027_01_v060`. O resultado mostra a dívida/PIB final média e a inflação média nos dois
extremos e o total de violações de invariantes. Critério de estabilidade: nenhuma violação, inflação abaixo de
30% e dívida abaixo de 500% do PIB em todas as campanhas
([ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) §9).

Referência (todos no padrão): dívida final 214%, inflação média 3,2%,
violações 0.

Resultado: todos os extremos estáveis.

## Parâmetros

| Parâmetro | Valor | Faixa testada | Significado | Base | Sensibilidade |
| --- | --- | --- | --- | --- | --- |
| `dep_kg` | 0,04 | 0,03 – 0,06 | depreciação anual do capital público novo | ECONOMIC_MODEL.md §5.1 e §6; calibração provisória | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `elast_kg` | 0,1 | 0,05 – 0,2 | elasticidade do potencial ao capital público concluído | ECONOMIC_MODEL.md §5.1 e §6; forma reduzida provisória | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `curva_s_projetos` | 8 | 4 – 12 | inclinação logística da curva de desembolso dos projetos | ritmo de execução em S, normalizado ao orçamento e ao perfil anual | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `capacidade_minima_projetos` | 0,1 | 0,05 – 0,2 | piso da capacidade de execução em pasta partidária | saturação de segurança (ECONOMIC_MODEL.md §1.8) | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `g_pot_base` | 0,02 | 0,01 – 0,03 | crescimento potencial anual | estimativas de PIB potencial do Brasil (IFI, BCB): 1,5–2,5% ao ano | dívida final 331% → 129% (−201,8 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `rho_h` | 0,9 | 0,8 – 0,97 | persistência mensal do hiato | ordem de grandeza do modelo semiestrutural de pequeno porte do BCB (Relatórios de Inflação) | dívida final 216% → 210% (−6,2 p.p.); inflação média 3,2% → 3,0%; violações 0 |
| `beta_r` | 0,01 | 0,003 – 0,02 | efeito mensal no hiato de 1 p.p. de juro real acima do neutro (estado estacionário = beta_r / (1 − rho_h)) | ordem de grandeza do modelo semiestrutural de pequeno porte do BCB (Relatórios de Inflação) | dívida final 211% → 211% (−0,6 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `lag_r` | 6 | 3 – 12 | meses para o juro real chegar à economia (média móvel) | defasagem da política monetária de 6 a 9 meses citada pelo BCB | dívida final 215% → 214% (−1,2 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `juro_neutro` | 0,05 | 0,035 – 0,065 | juro real neutro rn | estimativas do juro neutro pelo BCB e pelo Focus (4,5–5,5%) | dívida final 161% → 283% (+122,4 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `mult_investimento` | 0,8 | 0,3 – 1,5 | multiplicador do investimento público | literatura de multiplicadores fiscais no Brasil (faixa ampla; ECONOMIC_MODEL.md §12) | dívida final 214% → 214% (−0,1 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `mult_custeio` | 0,5 | 0,2 – 1 | multiplicador do custeio | literatura de multiplicadores fiscais | dívida final 214% → 212% (−2,6 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `mult_transf_baixa_renda` | 0,7 | 0,3 – 1,3 | multiplicador de transferências à baixa renda | propensão a consumir alta da baixa renda (literatura de multiplicadores) | dívida final 212% → 214% (+1,4 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `mult_transf_alta_renda` | 0,3 | 0 – 0,6 | multiplicador de transferências à alta renda | propensão a consumir baixa da alta renda | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `mult_obrigatoria` | 0,5 | 0,2 – 1 | multiplicador da despesa obrigatória (pessoal, benefícios) | média entre custeio e transferências | dívida final 214% → 214% (−0,4 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `mult_desoneracao_consumo` | 0,4 | 0,1 – 0,9 | multiplicador da desoneração do consumo | literatura de multiplicadores tributários | dívida final 214% → 214% (+0,1 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `mult_desoneracao_renda` | 0,2 | 0 – 0,5 | multiplicador da desoneração da renda | literatura de multiplicadores tributários | dívida final 214% → 214% (−0,3 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `mult_receita` | 0,3 | 0,1 – 0,6 | efeito contracionista de aumento de receita | literatura de multiplicadores tributários | dívida final 215% → 214% (−1,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `mult_credito` | 0,3 | 0,1 – 0,6 | impulso de demanda por crédito mais barato | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 215% → 214% (−0,7 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `mult_estrutural` | 0,5 | 0,2 – 1 | multiplicador da variação da despesa estrutural (limite, compressão das discricionárias) | mesmo do custeio: a compressão corta sobretudo custeio e investimento | dívida final 215% → 212% (−2,6 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `adaptacao_fiscal` | 0,02778 | 0,01667 – 0,08333 | fração mensal com que a economia se acomoda a uma postura fiscal (o impulso de nível se dissipa) | efeito de multiplicador concentrado em 1–3 anos (literatura); evita hiato permanente | dívida final 215% → 212% (−2,7 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `sens_hiato` | 5 | 2 – 10 | multiplicador × (1 + sens_hiato × max(0, −h)): ociosidade amplia | multiplicadores dependentes de estado (ECONOMIC_MODEL.md §5.2) | dívida final 214% → 214% (−0,3 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `sens_risco` | 0,5 | 0,2 – 0,8 | multiplicador × (1 − sens_risco × (1 − credibilidade)) | multiplicadores menores com risco fiscal alto (ECONOMIC_MODEL.md §5.2) | dívida final 214% → 213% (−0,8 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `ruido_hiato_casual` | 0,0005 | 0 – 0,001 | desvio do ruído mensal do hiato (Casual) | GAME_DESIGN.md §6: ruído baixo | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `ruido_hiato_estrategica` | 0,001 | 0 – 0,002 | desvio do ruído mensal do hiato (Estratégica); referência da escala de ruído das demais variáveis | GAME_DESIGN.md §6: ruído médio | dívida final 212% → 212% (−0,1 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `ruido_hiato_realismo` | 0,0015 | 0 – 0,003 | desvio do ruído mensal do hiato (Realismo) | GAME_DESIGN.md §6: ruído alto | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `efeito_termos_troca` | 0,0005 | 0 – 0,002 | efeito mensal no hiato de 1 unidade (log) de termos de troca acima da média | ciclo de commodities explica parte do ciclo brasileiro; 10% de alta sustentada → ~0,05 p.p. de hiato em estado estacionário (÷ (1 − rho_h)) | dívida final 213% → 215% (+1,4 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `kappa` | 0,25 | 0,1 – 0,5 | inclinação da curva de Phillips | ordem de grandeza do modelo semiestrutural de pequeno porte do BCB (Relatórios de Inflação) | dívida final 215% → 212% (−2,7 p.p.); inflação média 3,2% → 3,0%; violações 0 |
| `ajuste_inflacao` | 0,15 | 0,08 – 0,3 | fração mensal do caminho até a inflação-alvo (suavização da série de 12 meses) | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 212% → 214% (+1,6 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `meta_inflacao` | 0,03 | — | meta contínua (CMN) | Resolução CMN 5.141/2024 | fixo (regra legal ou saturação) |
| `tolerancia_meta` | 0,015 | — | intervalo de tolerância da meta | Resolução CMN 5.141/2024 | fixo (regra legal ou saturação) |
| `repasse_cambial` | 0,1 | 0,05 – 0,25 | repasse à inflação de 12 meses de 1 unidade (log) de depreciação real em 12 meses | estimativas de pass-through no Brasil (5–15% em 12 meses) | dívida final 215% → 215% (+0,1 p.p.); inflação média 3,1% → 3,4%; violações 0 |
| `inflacao_externa` | 0,02 | 0,015 – 0,03 | inflação anual dos parceiros comerciais (câmbio de equilíbrio por paridade) | metas de inflação das economias avançadas (2%) | dívida final 214% → 210% (−4,4 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `phi_pi` | 1,5 | 1,2 – 2 | reação às expectativas | princípio de Taylor (φπ > 1) | dívida final 213% → 213% (−0,1 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `phi_h` | 0,5 | 0,2 – 1 | reação ao hiato | regra de Taylor clássica | dívida final 216% → 209% (−7,9 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `suav` | 0,7 | 0,5 – 0,9 | suavização da Selic | ordem de grandeza do modelo semiestrutural de pequeno porte do BCB (Relatórios de Inflação) | dívida final 211% → 229% (+18,6 p.p.); inflação média 3,1% → 3,1%; violações 0 |
| `max_passo` | 0,01 | 0,005 – 0,015 | movimento máximo por reunião | maiores passos usuais do Copom (100 bp) | dívida final 215% → 214% (−0,9 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `max_passo_crise` | 0,015 | 0,01 – 0,02 | movimento máximo por reunião em crise | passos de 150 bp em 2021–2022 e dez/2024 | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `limiar_crise_inflacao` | 0,02 | 0,01 – 0,04 | inflação acima do teto da meta por mais que isto = crise (passo maior) | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `passo_selic` | 0,0025 | — | Selic arredondada a 25 bp | prática do Copom | fixo (regra legal ou saturação) |
| `selic_piso` | 0,02 | 0 – 0,03 | piso operacional da Selic | mínima histórica de 2% | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `repasse_risco_neutro` | 0,3 | 0,2 – 1 | fração do prêmio de risco acima do básico que eleva o juro neutro do BC | juro neutro brasileiro inclui prêmio de risco fiscal (estimativas do BCB) | dívida final 206% → 293% (+86,4 p.p.); inflação média 3,2% → 3,0%; violações 0 |
| `sub_base` | 0,6 | 0,3 – 0,9 | submissão máxima do BC à pressão (diretoria toda indicada, autonomia nula) | ECONOMIC_MODEL.md §5.4.1 | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `pressao_max` | 0,005 | 0,0025 – 0,01 | corte máximo extra na próxima reunião obtido por pressão | ECONOMIC_MODEL.md §5.4.1 (50 bp) | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `custo_cred_pressao` | 0,05 | 0,02 – 0,1 | credibilidade perdida por pressão, × (1 + pressões nos 12 meses anteriores) | ECONOMIC_MODEL.md §5.4.1 | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `custo_risco_pressao` | 0,002 | 0,001 – 0,005 | prêmio de risco extra por pressão nos últimos 12 meses | ECONOMIC_MODEL.md §5.4.1 (20 bp) | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `autonomia_percebida` | 0,5 | 0,2 – 0,8 | autonomia percebida do BC (0–1), reduz a submissão | LC 179/2021 (mandatos fixos); critério de jogo | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `aprovacao_pressao` | 0,005 | 0 – 0,01 | ganho imediato de aprovação ao pressionar por juros menores | ECONOMIC_MODEL.md §5.4.1 ("a aprovação pode subir no curto prazo") | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `diretoria_ano1` | 0,2222 | — | fração da diretoria do BC indicada pelo governo no 1º ano do mandato | LC 179/2021 art. 4º: 2 diretores começam o mandato no 1º ano do governo | fixo (regra legal ou saturação) |
| `diretoria_ano2` | 0,4444 | — | idem, 2º ano | LC 179/2021: +2 diretores no 2º ano | fixo (regra legal ou saturação) |
| `diretoria_ano3` | 0,7778 | — | idem, 3º ano | LC 179/2021: presidente do BC e +2 diretores no 3º ano | fixo (regra legal ou saturação) |
| `diretoria_ano4` | 1 | — | idem, 4º ano | LC 179/2021: últimos 2 diretores no 4º ano | fixo (regra legal ou saturação) |
| `premio_base` | 0,025 | 0,015 – 0,035 | prêmio de risco sem problemas fiscais | CDS de 5 anos do Brasil em períodos calmos (150–250 bp) | dívida final 211% → 213% (+1,7 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `premio_extra_max` | 0,06 | 0,03 – 0,1 | prêmio adicional máximo (saturação tanh) | CDS em crises (2002, 2015: +400–1.000 bp); saturação de segurança (ECONOMIC_MODEL.md §1.8) | dívida final 205% → 218% (+12,7 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `sens_divida_risco` | 0,03 | 0,02 – 0,1 | prêmio por unidade de dívida/PIB acima do limiar | literatura de spreads soberanos de emergentes (3–5 bp por p.p. de dívida) | dívida final 205% → 256% (+51,3 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `sens_meta_risco` | 0,5 | 0,2 – 1 | prêmio por unidade de déficit abaixo da banda da meta | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 212% → 216% (+3,9 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `sens_cred_risco` | 0,04 | 0,01 – 0,08 | prêmio por unidade de credibilidade abaixo da base | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 201% → 230% (+29,4 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `sens_saida_capital` | 0,3 | 0,1 – 0,6 | prêmio por unidade de carga sobre a renda acima do limiar (saída de capital, §5.7) | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `ajuste_risco` | 0,3 | 0,1 – 0,6 | fração mensal do caminho do prêmio até o alvo | mercado reage em semanas | dívida final 209% → 214% (+4,7 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `juros_externos_medio` | 0,04 | 0,02 – 0,055 | juro externo de longo prazo | Fed funds neutro nominal (~3–4%) | dívida final 214% → 215% (+1,8 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `rho_juros_externos` | 0,97 | 0,9 – 0,99 | persistência mensal do juro externo | ciclos de política do Fed de vários anos | dívida final 213% → 215% (+1,1 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `ruido_juros_externos` | 0,001 | 0 – 0,002 | desvio mensal do juro externo (Estratégica) | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 211% (−2,4 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `rho_termos_troca` | 0,95 | 0,85 – 0,99 | persistência mensal dos termos de troca (log) | ciclos de commodities de vários anos | dívida final 214% → 216% (+2,3 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `ruido_termos_troca` | 0,02 | 0 – 0,04 | desvio mensal dos termos de troca (Estratégica) | volatilidade mensal de índices de commodities | dívida final 213% → 214% (+1,1 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `ajuste_cambio` | 0,1 | 0,03 – 0,3 | fração mensal do caminho do câmbio até o equilíbrio | meia-vida de desvios do câmbio real de 6–24 meses | dívida final 214% → 211% (−2,5 p.p.); inflação média 3,1% → 3,1%; violações 0 |
| `elast_cambio_juros` | 2 | 0,5 – 4 | depreciação (log) por unidade de diferencial (juro externo + prêmio − Selic) acima do inicial | paridade descoberta com prêmio; 1 p.p. de diferencial → ~2% de câmbio | dívida final 211% → 217% (+5,4 p.p.); inflação média 3,1% → 3,3%; violações 0 |
| `elast_cambio_termos_troca` | 0,5 | 0,2 – 1 | apreciação (log) por unidade de termos de troca | real como moeda de commodities | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `desvio_cambio_max` | 0,4 | 0,2 – 0,6 | desvio máximo (log) do câmbio de equilíbrio por diferencial de juros (saturação tanh) | saturação de segurança (ECONOMIC_MODEL.md §1.8) | dívida final 211% → 214% (+3,8 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `ruido_cambio` | 0,025 | 0 – 0,05 | desvio mensal do câmbio (log, Estratégica) | volatilidade mensal do real (3–4%) | dívida final 213% → 212% (−1,2 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `divida_cambial` | 0,05 | 0 – 0,15 | fração da dívida bruta corrigida pelo câmbio | dívida externa ~5% da DBGG (BCB) | dívida final 209% → 226% (+16,4 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `nairu` | 0,065 | 0,055 – 0,09 | desemprego de equilíbrio un | estimativas recentes da NAIRU (6–8%) | dívida final 213% → 214% (+0,9 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `theta` | 0,35 | 0,2 – 0,6 | coeficiente de Okun | estimativas de Okun no Brasil | dívida final 214% → 214% (−0,5 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `ajuste_u` | 0,1 | 0,05 – 0,3 | velocidade mensal de ajuste do desemprego | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (−0,6 p.p.); inflação média 3,1% → 3,1%; violações 0 |
| `elast_receita_hiato` | 1 | 0,5 – 1,5 | receita/PIB × (1 + elast × h) | elasticidade da arrecadação ao ciclo (~1 ou pouco acima) | dívida final 213% → 214% (+1,8 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `elast_royalties_termos_troca` | 1 | 0,5 – 2 | royalties e dividendos × (1 + elast × termos de troca) | royalties do petróleo acompanham o preço internacional | dívida final 213% → 214% (+0,5 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `perda_max` | 0,3 | 0,1 – 0,5 | perda máxima de arrecadação de um aumento de carga (sonegação, informalidade, elisão) | ECONOMIC_MODEL.md §5.7 / elasticidade da base tributária | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `escala_perda` | 0,02 | 0,01 – 0,04 | carga acima do limiar (fração do PIB) que leva a perda a ~76% do máximo (tanh(1)) | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `margem_carga_renda` | 0,005 | 0,002 – 0,01 | aumento de carga sobre a renda (fração do PIB) sem perda; acima dele a base reage | base de renda de capital é a mais móvel | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `margem_carga_folha` | 0,003 | 0,001 – 0,01 | idem, folha (contribuições) | informalidade reage a encargos sobre a folha | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `margem_carga_consumo` | 0,008 | 0,003 – 0,015 | idem, consumo (CBS, IS) | base de consumo é a menos móvel | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `margem_carga_outras` | 0,005 | 0,002 – 0,01 | idem, demais tributos (IOF, comércio exterior, outros) | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `cresc_real_previdencia` | 0,025 | 0,015 – 0,035 | crescimento real anual da previdência sem ganho do salário mínimo (beneficiários) | crescimento do número de benefícios do RGPS (2,5–3% ao ano) | dívida final 190% → 249% (+58,8 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `cresc_real_beneficios` | 0,03 | 0,015 – 0,05 | idem, BPC, abono e seguro-desemprego | crescimento do BPC acima de 4% e do abono/seguro com o emprego | dívida final 204% → 231% (+27,2 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `cresc_real_pessoal` | 0 | -0,01 – 0,02 | crescimento real anual da folha de pessoal sem reajustes extras | reajustes pela inflação e reposição parcial de servidores | dívida final 206% → 236% (+29,8 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `cresc_real_outras` | 0,02 | 0,01 – 0,03 | idem, demais obrigatórias (subsídios, sentenças, outras) | acompanham o PIB | dívida final 210% → 217% (+7,2 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `peso_sm_previdencia` | 0,6 | 0,5 – 0,7 | fração da previdência indexada ao salário mínimo | cerca de 2/3 dos benefícios do RGPS são de um salário mínimo | dívida final 212% → 216% (+4,2 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `peso_sm_beneficios` | 1 | — | fração de BPC, abono e seguro indexada ao salário mínimo | BPC e abono iguais ao mínimo (CF art. 203; Lei 7.998/1990) | fixo (regra legal ou saturação) |
| `sm_ganho_min` | 0,006 | — | ganho real mínimo do salário mínimo pela regra | Lei 15.077/2024: ganho real limitado à faixa do arcabouço (0,6%) | fixo (regra legal ou saturação) |
| `sm_ganho_max` | 0,025 | — | ganho real máximo pela regra | Lei 15.077/2024: teto de 2,5% | fixo (regra legal ou saturação) |
| `sm_regra_ate_mes` | 48 | — | monthIndex a partir do qual a regra de valorização deixa de valer (jan/2031) | Lei 15.077/2024: regra até 2030 | fixo (regra legal ou saturação) |
| `sm_ganho_apos_regra` | 0 | 0 – 0,01 | ganho real anual do salário mínimo depois da regra (sem nova lei) | CF art. 7º, IV exige só a preservação do poder de compra | dívida final 214% → 234% (+19,9 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `limite_fracao_receita` | 0,7 | — | crescimento real do limite = fração × crescimento real da receita | LC 200/2023 art. 5º (70%) | fixo (regra legal ou saturação) |
| `limite_fracao_descumprida` | 0,5 | — | idem, quando a meta de primário do ano anterior não foi cumprida | LC 200/2023 art. 5º §1º (50%) | fixo (regra legal ou saturação) |
| `limite_piso` | 0,006 | — | crescimento real mínimo do limite | LC 200/2023 art. 5º (0,6%) | fixo (regra legal ou saturação) |
| `limite_teto` | 0,025 | — | crescimento real máximo do limite | LC 200/2023 art. 5º (2,5%) | fixo (regra legal ou saturação) |
| `piso_custeio` | 0,012 | 0,009 – 0,014 | discricionárias livres (fração do PIB) abaixo das quais começam paralisações | estimativas de discricionária mínima para o funcionamento da máquina (IFI, ~R$ 120–160 bi) | dívida final 214% → 214% (+0,4 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `discricionaria_minima` | 0,006 | 0,004 – 0,008 | discricionárias livres que não podem ser cortadas (estouro do limite acima disto) | despesas essenciais de funcionamento; critério de jogo | dívida final 206% → 221% (+14,8 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `meta_primario` | 0,0025 | -0,01 – 0,02 | meta de primário (LDO), fração do PIB | metas recentes da LDO (0 a +0,25% do PIB) | dívida final 212% → 230% (+18,6 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `banda_meta_primario` | 0,0025 | — | tolerância de ±0,25 p.p. | LC 200/2023 | fixo (regra legal ou saturação) |
| `limiar_divida` | 0,8 | 0,7 – 0,9 | dívida/PIB a partir da qual credibilidade e prêmio reagem | nível em que a dívida brasileira passa a ser vista como alta (agências de rating) | dívida final 220% → 205% (−14,7 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `transmissao_selic_divida` | 0,02778 | 0,01667 – 0,08333 | fração mensal da distância Selic → taxa implícita da dívida | prazo médio da DPF de ~4 anos, com ~45% pós-fixada | dívida final 226% → 203% (−22,2 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `repasse_risco_divida` | 0,3 | 0,2 – 1 | fração do prêmio de risco acima do básico que chega à taxa implícita | parcela prefixada e indexada à inflação, que carrega prêmio | dívida final 205% → 304% (+98,7 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `credibilidade_base` | 0,75 | 0,5 – 0,9 | nível para onde a credibilidade volta sem problemas | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 212% → 215% (+2,6 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `recuperacao_cred` | 0,02 | 0,005 – 0,05 | fração mensal de retorno à base | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 230% → 203% (−26,7 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `pena_cred_fiscal` | 0,5 | 0,2 – 1 | perda mensal = pena × déficit abaixo da banda / 12 | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 215% → 214% (−0,2 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `pena_cred_inflacao` | 0,3 | 0,1 – 0,6 | perda mensal = pena × inflação acima do teto / 12 | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (−0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `pena_cred_divida` | 0,1 | 0,05 – 0,5 | perda mensal = pena × (dívida − limiar) / 12 | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 210% → 239% (+29,4 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `pena_cred_estouro` | 0,5 | 0,2 – 1 | perda mensal = pena × estouro do limite de despesas / 12 | descumprimento do arcabouço (LC 200/2023) afeta a confiança como o déficit | dívida final 214% → 215% (+1,6 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `cred_min` | 0,05 | — | saturação inferior | saturação de segurança (ECONOMIC_MODEL.md §1.8) | fixo (regra legal ou saturação) |
| `cred_max` | 0,98 | — | saturação superior | saturação de segurança (ECONOMIC_MODEL.md §1.8) | fixo (regra legal ou saturação) |
| `aprovacao_base` | 0,42 | 0,3 – 0,55 | aprovação de equilíbrio com economia neutra | aprovação média de governos brasileiros fora de crises | dívida final 208% → 214% (+5,7 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `ajuste_aprovacao` | 0,15 | 0,05 – 0,3 | fração mensal do caminho até a aprovação-alvo | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 213% → 213% (−0,3 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `peso_inflacao` | 1,5 | 0,5 – 3 | alvo += peso × (meta − inflação) | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 215% → 211% (−3,6 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `peso_desemprego` | 2 | 0,5 – 4 | alvo += peso × (nairu − desemprego) | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 213% → 215% (+1,7 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `peso_crescimento` | 1 | 0,3 – 2 | alvo += peso × (PIB 12m − g_pot_base) | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (−0,7 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `peso_paralisacao` | 0,05 | 0,02 – 0,1 | alvo −= peso × fração do piso de custeio que falta (paralisação de serviços) | ECONOMIC_MODEL.md §5.8 | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `fator_lua_de_mel` | 0,6 | 0,4 – 0,9 | multiplica perdas de aprovação na lua de mel | POLITICAL_RULES.md §11.1 | dívida final 214% → 213% (−1,2 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `meses_lua_de_mel` | 6 | 3 – 9 | meses 0–5 do mandato | POLITICAL_RULES.md §11.1 | dívida final 214% → 214% (−0,3 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `aprovacao_min` | 0,05 | — | saturação da aprovação-alvo | saturação de segurança (ECONOMIC_MODEL.md §1.8) | fixo (regra legal ou saturação) |
| `aprovacao_max` | 0,9 | — | saturação da aprovação-alvo | saturação de segurança (ECONOMIC_MODEL.md §1.8) | fixo (regra legal ou saturação) |
| `capital_base` | 30 | 10 – 50 | capital político-alvo com aprovação zero | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 212% → 215% (+2,4 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `capital_peso_aprovacao` | 60 | 30 – 90 | capital-alvo += peso × aprovação | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 213% → 215% (+2,3 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `ajuste_capital` | 0,1 | 0,05 – 0,3 | fração mensal do caminho até o capital-alvo | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 211% (−2,5 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `w_ideo` | 0,5 | 0,2 – 0,8 | peso da afinidade ideológica (1 − distância/2) | POLITICAL_RULES.md §6.2 | dívida final 207% → 214% (+7,5 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `w_rel` | 0,4 | 0,2 – 0,6 | peso da relação com o governo (/100) | idem | dívida final 213% → 214% (+1,1 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `w_int` | 0,2 | 0,1 – 0,4 | peso de interesses atendidos (0 ou 1) | idem | dívida final 212% → 214% (+1,9 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `w_opiniao` | 0,4 | 0,1 – 0,8 | peso de (aprovação − 0,5) | idem | dívida final 215% → 211% (−4,3 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `limiar_apoio` | 0,2 | 0,1 – 0,4 | apoio acima do qual o bloco orienta "sim" | idem | dívida final 216% → 206% (−10,1 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `inclinacao_apoio` | 8 | 4 – 12 | inclinação da logística dos votos dissidentes | idem | dívida final 212% → 212% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `ruido_apoio` | 0,08 | 0,02 – 0,15 | desvio do sorteio de apoio por bloco e votação | idem | dívida final 214% → 209% (−4,9 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `bonus_casual` | 0,1 | 0 – 0,2 | Congresso mais receptivo no Casual (GAME_DESIGN.md §6) | GAME_DESIGN.md §6 | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `escala_alterada` | 0,8 | 0,6 – 0,9 | fração do texto que sobrevive quando o relator altera o texto | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 213% → 215% (+2,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `capacidade_pauta` | 3 | 2 – 5 | vagas de pauta de cada Casa para propostas do governo tramitando ao mesmo tempo | POLITICAL_RULES.md §6.3 | dívida final 213% → 216% (+2,3 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `vagas_pec` | 2 | 1 – 3 | vagas de pauta que uma PEC ocupa na Casa | POLITICAL_RULES.md §6.3: PEC e reformas grandes ocupam mais de uma vaga | dívida final 215% → 214% (−0,6 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `fracao_tramitacao_camara` | 0,5 | 0,3 – 0,7 | fração do prazo de tramitação esperado gasta na Câmara (o resto no Senado; mínimo de 1 mês em cada) | a Câmara é a Casa iniciadora dos projetos do Executivo (CF art. 64) | dívida final 212% → 214% (+1,5 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `peso_relator_presidente` | 1 | 0 – 3 | peso extra do bloco que preside a Casa no sorteio do relator (peso = cadeiras × (1 + este)) | o presidente da Casa designa os relatores de plenário; testado na faixa | dívida final 215% → 212% (−2,7 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `bonus_texto_alterado` | 0,1 | 0,05 – 0,2 | apoio extra de todos os blocos ao texto alterado pelo relator | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 215% (+1,7 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `prob_acrescimo` | 0,15 | 0 – 0,4 | chance de o relator que altera o texto incluir acréscimos estranhos ao projeto | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 213% → 213% (+0,0 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `prob_acrescimo_emendas` | 0,5 | 0,2 – 0,8 | a mesma chance quando o relator é de bloco com interesse em emendas | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `custo_acrescimo` | 0,0005 | 0,0002 – 0,001 | despesa dos acréscimos do relator, fração do PIB ao ano | ordem de grandeza de emendas de relator (R$ 5–10 bi/ano) | dívida final 213% → 213% (+0,2 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `meses_acrescimo` | 24 | 12 – 36 | meses de despesa dos acréscimos | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 213% → 214% (+1,1 p.p.); inflação média 3,1% → 3,1%; violações 0 |
| `limiar_presidente_casa` | 0 | -20 – 20 | relação com o bloco que preside a Casa abaixo da qual a pauta pode não andar | POLITICAL_RULES.md §6.3 | dívida final 214% → 215% (+1,4 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `prob_nao_pautar` | 0,5 | 0,2 – 0,8 | chance mensal de o presidente da Casa não pautar, abaixo do limiar | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 213% → 217% (+3,3 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `max_adiamentos` | 3 | 1 – 6 | adiamentos por Casa (pedágio, presidente) antes de a votação acontecer de qualquer jeito | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 213% (−1,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `prob_adiamento_pedagio` | 0,6 | 0,3 – 0,9 | chance de os líderes adiarem votação difícil sem emendas liberadas | POLITICAL_RULES.md §6.3: emendas como pedágio | dívida final 214% → 214% (−0,7 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `folga_votacao_dificil` | 0,05 | 0,02 – 0,1 | votação é difícil se o "sim" esperado fica abaixo do exigido mais esta fração das cadeiras | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 211% (−2,8 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `negociacao_apoio` | 0,15 | 0,05 – 0,25 | apoio do bloco à proposta por negociação intensiva | POLITICAL_RULES.md §6.2 (contrapartidas) | dívida final 214% → 214% (+0,2 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `negociacao_apoio_max` | 0,3 | 0,15 – 0,5 | saturação do apoio negociado por bloco e proposta | saturação de segurança (ECONOMIC_MODEL.md §1.8) | dívida final 214% → 214% (−0,4 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `capital_negociacao` | -3 | -6 – -1 | capital político por negociação | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `relacao_negociacao` | 3 | 0 – 8 | relação do bloco negociado | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (−0,2 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `emendas_pedagio` | 0,0008 | 0,0004 – 0,0015 | emendas liberadas, fração do PIB ao ano enquanto duram (saem das discricionárias) | POLITICAL_RULES.md §6.3; ordem de R$ 5 bi por votação difícil | dívida final 214% → 214% (−0,1 p.p.); inflação média 3,1% → 3,1%; violações 0 |
| `emendas_meses` | 6 | 3 – 12 | meses de pagamento das emendas liberadas | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (−0,2 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `apoio_emendas` | 0,08 | 0,03 – 0,15 | apoio de todos os blocos com emendas liberadas | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 215% → 214% (−0,2 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `apoio_emendas_interesse` | 0,1 | 0,05 – 0,2 | apoio extra dos blocos com interesse em emendas | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `escala_concessao` | 0,85 | 0,7 – 0,95 | fração do texto que sobrevive quando o governo cede | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `apoio_concessao` | 0,08 | 0,03 – 0,15 | apoio de todos os blocos ao texto cedido | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `relacao_urgencia` | -3 | -8 – 0 | relação do bloco que preside a Câmara quando o governo pede urgência | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `capital_veto_derrubado` | -6 | -12 – 0 | capital político quando o Congresso derruba um veto | POLITICAL_RULES.md §7: derrubada de veto = derrota política | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `capital_veto_mantido` | 2 | 0 – 5 | capital político quando o veto é mantido | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `apoio_acrescimo_base` | 0,1 | 0 – 0,3 | apoio de todos os blocos a derrubar o veto aos acréscimos (benefício paroquial) | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `apoio_ministerio` | 0,25 | 0,1 – 0,4 | apoio do bloco nas votações por pasta ocupada, × peso da pasta | POLITICAL_RULES.md §6.3.1 | dívida final 214% → 214% (+0,4 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `apoio_ministerio_max` | 0,4 | 0,2 – 0,6 | saturação do apoio por ministérios de um bloco | saturação de segurança (ECONOMIC_MODEL.md §1.8) | dívida final 214% → 214% (−0,1 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `relacao_nomeacao` | 15 | 5 – 25 | relação do bloco ao receber uma pasta, × peso | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (−0,1 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `relacao_demissao` | -20 | -35 – -5 | relação do bloco ao perder uma pasta, × peso | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `capital_demissao` | -4 | -8 – 0 | capital político por demissão de ministro de bloco | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `perda_execucao_partidaria` | 0,25 | 0,1 – 0,4 | parte do resultado (capital público, aprovação) perdida nas políticas de pasta de bloco | POLITICAL_RULES.md §6.3.1: capacidade administrativa menor | dívida final 213% → 215% (+1,6 p.p.); inflação média 3,2% → 3,1%; violações 0 |
| `atraso_ministerio_contrario` | 3 | 1 – 6 | meses de atraso quando a pasta de bloco é contrária à política | POLITICAL_RULES.md §6.3.1 | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `escandalo_base_mes` | 0,004 | 0,001 – 0,01 | chance mensal de escândalo numa pasta de bloco recém-nomeada (× peso) | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (+0,2 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `escandalo_por_ano` | 0,006 | 0,002 – 0,015 | aumento da chance mensal por ano no cargo (× peso) | POLITICAL_RULES.md §6.3.1: cresce com o tempo no cargo | dívida final 214% → 214% (−0,1 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `escandalo_max_mes` | 0,03 | 0,01 – 0,05 | saturação da chance mensal por pasta | saturação de segurança (ECONOMIC_MODEL.md §1.8) | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `relacao_vitoria` | 3 | 0 – 10 | relação dos blocos que votaram sim após aprovação | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 209% → 214% (+5,2 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `relacao_derrota` | -3 | -10 – 0 | relação dos blocos que votaram não | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 213% → 214% (+1,4 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `capital_vitoria` | 4 | 0 – 10 | capital político por vitória legislativa | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `capital_derrota` | -8 | -15 – 0 | capital político por derrota | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (−0,4 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `capital_envio_pec` | -5 | -10 – 0 | custo de capital ao enviar PEC | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (−1,0 p.p.); inflação média 3,1% → 3,1%; violações 0 |
| `atraso_min_meses` | 2 | 1 – 3 | atraso mínimo quando o risco "atraso" ocorre | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (+0,3 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `atraso_max_meses` | 6 | 3 – 12 | atraso máximo | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (+0,3 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `fator_sobrecusto` | 1,2 | 1,1 – 1,5 | despesa × fator quando o risco "sobrecusto" ocorre | sobrecustos médios de obras públicas (TCU) | dívida final 215% → 215% (−0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `fator_baixa_adesao` | 0,7 | 0,4 – 0,9 | efeito × fator quando há baixa adesão | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `risco_juridico_flag` | 0,15 | 0,05 – 0,3 | chance extra de ação no STF por regra quebrada (LRF, limite de despesas) | POLITICAL_RULES.md §1.1, §8: riscoJuridico a partir de flags | dívida final 213% → 215% (+1,3 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `liminar_lag_max` | 3 | 1 – 6 | meses até a liminar, no máximo (sorteio de 1 até este) | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 212% → 212% (−0,4 p.p.); inflação média 3,1% → 3,1%; violações 0 |
| `suspensao_min_meses` | 3 | 1 – 6 | duração mínima da suspensão pela liminar | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (+0,6 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `suspensao_max_meses` | 12 | 6 – 24 | duração máxima da suspensão | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 213% → 214% (+1,4 p.p.); inflação média 3,1% → 3,1%; violações 0 |
| `prob_inconstitucional` | 0,3 | 0,1 – 0,5 | chance de o julgamento derrubar a medida suspensa | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (+0,2 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `prob_inconstitucional_flag` | 0,2 | 0,05 – 0,3 | chance extra de derrubada por regra quebrada | POLITICAL_RULES.md §1.1 | dívida final 214% → 214% (+0,2 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `escandalo_aprovacao` | -0,005 | -0,01 – -0,002 | aprovação por mês de escândalo na execução de uma política | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `escandalo_meses` | 4 | 2 – 8 | meses de desgaste do escândalo na execução | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `escandalo_lag_max` | 6 | 1 – 12 | meses entre o início da execução e o escândalo, no máximo | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `fator_escandalo_partidario` | 1 | 0,5 – 2 | risco de escândalo na execução × (1 + fator) quando a pasta é de bloco | POLITICAL_RULES.md §6.3.1 | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `pena_cred_limite` | 0,03 | 0,01 – 0,06 | credibilidade perdida ao executar acima do limite de despesas ou sem compensação (LRF) | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 212% → 218% (+6,8 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `concentracao_regional` | 0,6 | 0,3 – 0,9 | fração do efeito de demanda (e do capital público) que fica na UF onde o gasto federal ocorre; o resto vaza para as demais pelo comércio entre UFs | ordem de grandeza dos vazamentos inter-regionais em modelos insumo-produto regionais do Brasil; faixa ampla | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `ciclo_agro_termos` | 1 | 0,3 – 2 | desvio (log) da agropecuária em relação ao agregado por unidade de termos de troca (log) | safra exportada e preços de commodities agrícolas movem mais o PIB das UFs agrícolas; critério de jogo testado na faixa | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `ciclo_extrativa_termos` | 1,5 | 0,5 – 3 | desvio (log) da indústria extrativa (petróleo, minério) por unidade de termos de troca (log) | a extrativa é o setor mais exposto a preços internacionais; critério de jogo testado na faixa | dívida final 214% → 214% (−0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `ciclo_industria_hiato` | 1,5 | 0,5 – 2,5 | amplitude extra do ciclo da indústria sobre o hiato do produto (desvio relativo ao agregado = este valor × hiato) | a produção industrial oscila de 2 a 3 vezes o PIB no ciclo (PIM-PF × PIB trimestral, IBGE) | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `desvio_atividade_max` | 0,1 | 0,05 – 0,2 | desvio máximo (log) da atividade de uma UF em relação à sua tendência; saturação por tanh | saturação de segurança (ECONOMIC_MODEL.md §1.8) | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `okun_regional` | 6 | 3 – 10 | queda do log do desemprego relativo da UF por unidade (log) de atividade acima da tendência | coeficiente de Okun nacional (0,35 p.p. por 1% de hiato) convertido para razão log com desemprego de ~6% | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `aprovacao_gasto_regional` | 8 | 3 – 15 | aprovação extra na UF por unidade de gasto federal per capita acima da média (fração do PIB nacional × desvio relativo per capita) | programa de 0,2% do PIB focalizado no Nordeste rende ~2 p.p. de aprovação local acima da média; critério de jogo | dívida final 214% → 214% (−0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `aprovacao_atividade_regional` | 1 | 0,3 – 2 | aprovação extra na UF por unidade (log) de atividade local acima da tendência | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (−0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `aprovacao_governador` | 0,04 | 0,01 – 0,08 | aprovação extra na UF com governador totalmente aliado (relação 100); simétrica com governador hostil | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `desvio_aprovacao_max` | 0,15 | 0,08 – 0,25 | diferença máxima entre a aprovação de uma UF e a média nacional; saturação por tanh | saturação de segurança (ECONOMIC_MODEL.md §1.8) | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `governador_alinhamento` | 0,5 | 0,2 – 0,8 | peso da relação do bloco do governador com o governo na relação do próprio governador | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 212% → 214% (+1,6 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `governador_aprovacao` | 1 | 0,3 – 2 | pontos de relação do governador por p.p. de aprovação local do presidente acima da base | governadores se aproximam de presidentes populares no seu estado; critério de jogo | dívida final 214% → 213% (−0,7 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `ajuste_governador` | 0,1 | 0,03 – 0,25 | fração mensal do caminho da relação do governador até a sua meta | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 213% → 214% (+0,3 p.p.); inflação média 3,1% → 3,2%; violações 0 |
| `adesao_base` | 0,6 | 0,4 – 0,8 | probabilidade de um estado com governador neutro aderir a programa federal por convênio | adesão parcial dos estados a programas federais de cooperação; critério de jogo | dívida final 215% → 214% (−0,7 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `adesao_relacao` | 0,4 | 0,2 – 0,6 | probabilidade extra de adesão com governador aliado (relação 100); a mesma a menos com governador hostil | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 215% (+0,8 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `aprovacao_visita` | 0,02 | 0,005 – 0,04 | aprovação extra na UF visitada pelo presidente, enquanto dura o efeito | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `meses_visita` | 3 | 1 – 6 | meses de efeito da visita na aprovação local | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `relacao_visita` | 10 | 3 – 20 | pontos de relação ganhos com o governador do estado visitado | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 214% → 214% (+0,0 p.p.); inflação média 3,2% → 3,2%; violações 0 |
| `max_eventos_mes` | 2 | 1 – 3 | eventos novos por mês, no máximo | critério de jogo: legibilidade e ritmo da campanha; testado na faixa | dívida final 213% → 214% (+0,5 p.p.); inflação média 3,2% → 3,2%; violações 0 |

## Perfil ideológico do governo e alinhamento por UF (PR 4 do PLANO_GLOBO)

Módulo `src/engine/politics/calibration.ts` (`PROFILE_PARAMS`, não sobrescritos pelo cenário). Valores `PROVISORIO`; revisão de calibração prevista no PLANO_GLOBO.md §10.

| Parâmetro | Valor | Faixa | Significado |
| --- | --- | --- | --- |
| `memoria_decisao` | 0,12 | 0,05 – 0,25 | λ: fração do caminho até a posição de uma decisão sancionada ou executada |
| `peso_proposta` | 0,25 | 0,1 – 0,5 | peso da proposta enviada, relativo à sanção |
| `peso_veto` | 0,5 | 0,25 – 1 | peso do veto total (sentido oposto), relativo à sanção |
| `peso_evento` | 0,75 | 0,25 – 1 | peso de escolha de evento com posição |
| `memoria_maxima` | 0,5 | 0,3 – 0,8 | teto do λ efetivo (λ × peso × relevância) |
| `movimentos_por_mes` | 3 | 1 – 6 | decisões que mais moveram o perfil guardadas no relatório |
| `alinhamento_regional_max` | 0,04 | 0,02 – 0,08 | k: desvio máximo de aprovação da UF por alinhamento |
| `alinhamento_regional_escala` | 0,12 | 0,06 – 0,25 | s: diferença de alinhamento que satura o desvio (tanh) |
| `eleitor_mediano_teto` | 0,02 | 0,01 – 0,04 | efeito nacional máximo na aprovação (estado estacionário) |
| `eleitor_mediano_distancia_neutra` | 0,2 | 0,1 – 0,35 | distância normalizada ao mediano em que o termo nacional é zero |
| `eleitor_mediano_escala` | 0,15 | 0,08 – 0,3 | distância normalizada que satura o termo nacional |
| `ufs_destacadas_previa`, `faixa_central` | 5; 0,2 | — | só interface (prévia e descrição em palavras) |

## Clima (PR 7 do PLANO_GLOBO)

Módulo `src/engine/climate/calibration.ts` (`CLIMATE_PARAMS`, não sobrescritos pelo cenário). Valores `PROVISORIO`; **contrato do PR 7: nenhum código do motor os lê ainda** (só validadores e testes), de modo que não mudam nenhum resultado. Existem para o `climateEvolutionStep` e os efeitos regionais do PR 8, que os revisa e remove os que não usar. Faixa e justificativa de cada um no código; o teste confere valor dentro da faixa.

| Parâmetro | Valor | Faixa | Significado |
| --- | --- | --- | --- |
| `enso_persistencia` | 0,92 | 0,85 – 0,97 | φ: coeficiente AR(1) mensal do ENSO latente (constante de tempo de ~1 ano) |
| `enso_choque` | 0,18 | 0,1 – 0,3 | desvio do choque mensal sobre o ENSO latente (estacionário ≈ 0,46 antes da saturação) |
| `enso_saturacao` | 1 | 0,7 – 1,5 | escala da saturação: ENSO = tanh(latente ÷ escala) |
| `chuva_persistencia` | 0,35 | 0,1 – 0,6 | fração da anomalia do mês anterior que a UF carrega |
| `chuva_choque_regional` | 0,14 | 0,05 – 0,25 | desvio do choque mensal compartilhado pela macrorregião |
| `chuva_choque_uf` | 0,16 | 0,05 – 0,3 | desvio do ruído mensal próprio da UF |
| `chuva_anomalia_max` | 0,6 | 0,4 – 0,9 | anomalia máxima em módulo (tanh) |
| `intensidade_casual` / `_estrategica` / `_realismo` | 0,7 / 1 / 1,2 | 0,5–1 / 0,8–1,2 / 1–1,5 | magnitude por dificuldade (nunca o lugar) |
| `seca_limiar_anomalia` | −0,1 | −0,3 – 0 | anomalia abaixo da qual o mês conta como déficit |
| `seca_deficit_referencia_mm` | 60 | 30 – 120 | déficit/excesso em mm que satura ganho/recuperação da seca (distingue semiárido de região úmida) |
| `seca_ganho` | 0,3 | 0,15 – 0,5 | aumento máximo mensal da seca |
| `seca_memoria` | 0,85 | 0,7 – 0,95 | fração da seca que persiste de um mês para o outro |
| `seca_recuperacao` | 0,25 | 0,1 – 0,5 | redução máxima mensal extra por chuva acima da normal |
| `cheia_limiar_anomalia` | 0,35 | 0,2 – 0,6 | anomalia positiva a partir da qual o risco de cheia sobe |
| `cheia_peso_umidade` | 0,5 | 0,2 – 0,8 | peso da anomalia positiva do mês anterior (solo úmido) |
| `cheia_escala` | 0,25 | 0,1 – 0,5 | excesso acima do limiar que satura o risco (tanh) |
| `cheia_risco_max` | 0,6 | 0,3 – 0,9 | risco mensal máximo de cheia (nunca certeza) |
| `dano_pib_seca_max` | 0,005 | 0,002 – 0,01 | perda máxima de nível do PIB por seca nacional extrema |
| `dano_alimentos_seca_max` | 0,01 | 0,005 – 0,02 | pressão máxima da seca sobre a inflação de alimentos (12 meses) |
| `aprovacao_clima_max` | 0,015 | 0,005 – 0,03 | desvio máximo de aprovação da UF por chuva/seca (redistribui, D7) |

Os três últimos (tetos de efeito) são só ordem de grandeza e serão calibrados no PR 8 com as suítes de sensibilidade; a força do humor pela chuva é uma das decisões de calibração em aberto (PLANO_GLOBO.md §10).
