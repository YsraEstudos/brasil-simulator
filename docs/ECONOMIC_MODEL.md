# Brasil Simulator — Modelo Econômico

Versão 0.1 do documento • Fase 00 • 13/10/2026 • ✅ Revisado pelo autor em 13/10/2026 (pressão sobre o BC permitida; incerteza varia com a dificuldade)

> **Status:** especificação inicial. Todas as equações são **forma reduzida simplificada** e todos os parâmetros estão marcados como `A_CALIBRAR` até a Fase 03. Nenhum número deste documento é previsão.

---

## 1. Princípios

1. **Motor separado da interface.** O código fica em `src/engine/economy/`, em TypeScript puro, sem importar React, Expo ou SQLite.
2. **Determinismo.** Mesmo estado inicial + mesmas decisões + mesma semente = mesmo resultado, bit a bit. Proibido usar `Math.random()` ou `Date.now()` dentro do motor.
3. **O jogador não altera resultados.** Ele altera **instrumentos** (alíquotas, dotações, programas, regras). O motor calcula PIB, preços, emprego e contas.
4. **Contabilidade primeiro.** As identidades contábeis (§7) valem sempre, em qualquer dificuldade. Ruído e comportamento entram nas equações de comportamento, nunca nas identidades.
5. **Efeitos dependem do estado.** Multiplicadores, repasse cambial e reação do mercado variam com hiato, dívida e credibilidade.
6. **Auditoria.** Cada variação relevante é decomposta por causa (`contributions`) e gravada para o relatório "Por que mudou?".
7. **Parâmetros como dados.** Coeficientes ficam em arquivos versionados de cenário (`src/data/scenarios/`), não espalhados no código.

---

## 2. Unidades e convenções

| Grandeza | Unidade interna | Observação |
| --- | --- | --- |
| Valores monetários | R$ milhões, nominais, `number` | Exibição converte para bi/tri |
| Taxas anuais (juros, inflação 12m) | fração decimal (0,045 = 4,5%) | Nunca porcentagem inteira dentro do motor |
| Taxas mensais | fração decimal | Conversão: `m = (1 + a)^(1/12) − 1` |
| Razões ao PIB | fração do PIB nominal em 12 meses | Ex.: dívida/PIB |
| Índices de preço | número-índice (base = 1,0 no início do cenário) | |
| Tempo | `monthIndex` inteiro (0 = jan/2027) | Calendário derivado, nunca `Date` no motor |
| Pessoas | milhares | |

Tolerância de testes contábeis: |erro| < R$ 0,01 milhão por identidade por mês.

---

## 3. Variáveis de estado

| Bloco | Variáveis |
| --- | --- |
| **Produção** | PIB real mensal `Y`, PIB potencial `Ystar`, hiato `h = ln(Y/Ystar)`, deflator, PIB nominal 12m, produtividade total |
| **Setores** (0.5+) | valor adicionado de agropecuária, indústria extrativa, transformação, construção, energia, serviços |
| **Preços** | IPCA mensal e 12m, expectativa de inflação 12m `pe`, preços administrados, preços livres |
| **Juros e moeda** | Selic meta, juro real neutro `rn`, prêmio de risco `rp`, taxa implícita da dívida |
| **Câmbio e exterior** | câmbio nominal R$/US$, exportações, importações, termos de troca, fluxo de capital, reservas |
| **Trabalho** | desemprego `u`, NAIRU `un`, salário real médio, informalidade, salário mínimo |
| **Governo** | receitas por grupo, despesas obrigatórias por grupo, despesas discricionárias, resultado primário, juros nominais, resultado nominal, DBGG, DLSP |
| **Mercado e confiança** | confiança de consumidores e empresas, crédito, investimento privado |
| **Capital público** | estoque `Kg`, carteira de projetos em execução, despesa de manutenção |
| **Distribuição** (0.5+) | renda por quintil, taxa de pobreza, transferências por grupo |

---

## 4. Ordem de cálculo dentro do turno

Etapa 5 do pipeline geral ("Atualizar economia"), executada após Congresso e execução de políticas:

1. Aplicar choques exógenos do mês (commodities, juros externos, clima).
2. Atualizar PIB potencial (capital público concluído, produtividade, demografia).
3. Calcular impulso fiscal do mês a partir de **despesa efetivamente executada** e **mudanças tributárias vigentes**.
4. Atualizar prêmio de risco e câmbio.
5. Atualizar hiato do produto e PIB real.
6. Atualizar expectativas e inflação.
7. Banco Central decide a Selic (somente em meses com reunião do Copom).
8. Atualizar mercado de trabalho.
9. Calcular receitas (bases dependem do PIB nominal e da inflação do mês).
10. Calcular despesas obrigatórias (indexadas) e discricionárias executadas.
11. Fechar contas: primário, juros, nominal, dívida.
12. Verificar invariantes. Falha de invariante interrompe a simulação em modo de teste.

---

## 5. Equações v0.1 (forma reduzida)

Notação: `t` = mês. Parâmetros em `snake_case` estão na tabela do §6.

### 5.1 PIB potencial
```
g_pot_t = g_pot_base + elast_kg * (ΔKg_t / Kg_{t-1}) * 12 + produtividade_t
Ystar_t = Ystar_{t-1} * (1 + g_pot_t)^(1/12)
```
O capital público só entra em `Kg` quando um projeto é **concluído**. Kg deprecia `dep_kg` ao ano; manutenção abaixo do necessário acelera a depreciação.

### 5.2 Hiato do produto
```
h_t = rho_h * h_{t-1}
    − beta_r * (r_real_{t-lag_r} − rn_t)          // juros reais acima do neutro esfriam a economia
    + Σ_i mult_i(h, financiamento) * ImpulsoFiscal_i,t / Ystar_t
    + beta_conf * (conf_t − conf_media)
    + beta_ext * choque_externo_t
    + ruído_t                                      // amplitude depende da dificuldade
Y_t = Ystar_t * exp(h_t)
```
`ImpulsoFiscal_i` é separado por tipo (investimento, custeio, transferências à baixa renda, transferências à alta renda, desoneração de consumo, desoneração de renda), porque cada tipo tem multiplicador e defasagem próprios.

**Multiplicador dependente de estado:**
```
mult_i = mult_base_i * (1 + sens_hiato * max(0, −h_t)) * (1 − sens_risco * rp_excesso_t)
```
Economia ociosa → multiplicador maior. Risco fiscal alto → multiplicador menor (efeito do juro de mercado e da confiança).

### 5.3 Inflação (curva de Phillips com expectativas)
```
pe_t   = cred_t * meta + (1 − cred_t) * (pi12_{t-1})          // expectativa ancorada pela credibilidade
pi12_t = pe_t + kappa * h_t + passthrough * Δcambio12_t + choque_adm_t + choque_alimentos_t
```
`cred_t` (0–1) cai com descumprimento de meta fiscal, inflação persistente acima da meta e interferência percebida no Banco Central. Conversão de `pi12` em IPCA mensal é feita por suavização, para manter coerência entre série mensal e acumulado em 12 meses.

Meta de inflação: 3,0% contínua, intervalo de ±1,5 p.p. (parâmetro de cenário).

### 5.4 Banco Central (agente autônomo)
Somente em meses com reunião do Copom (8 por ano, calendário no cenário):
```
i_alvo = rn_t + pe_t + phi_pi * (pe_t − meta) + phi_h * h_t
Selic_t = arredondar_25bp( suav * Selic_{t-1} + (1 − suav) * i_alvo )
```
Limite de movimento por reunião: `max_passo` (ex.: 100 bp; 150 bp em crise). O jogador **não controla** esta regra; pode influenciá-la indiretamente (política fiscal, comunicação, indicações para a diretoria quando houver vaga) ou por **pressão pública** (§5.4.1).

#### 5.4.1 Pressão pública sobre o Banco Central

Ação de agenda "Pressionar o Banco Central" (custo 1 ponto). Decisão de design de 13/10/2026: o jogador **pode** tentar forçar juros menores, mas paga em credibilidade.

```
submissao_t = sub_base * fracao_diretoria_indicada_t * (1 − autonomia_percebida_t)    // 0–1
i_alvo'     = i_alvo − pressao_max_bp * submissao_t                                   // só na próxima reunião do Copom
cred_t      = cred_{t-1} − custo_cred * (1 + n_pressoes_12m)                           // repetir custa cada vez mais
rp_t       += custo_rp * n_pressoes_12m
```

- O BC pode **resistir** (submissão baixa): a diretoria indicada pelo governo anterior e a alta autonomia percebida reduzem o efeito. Nesse caso o jogador paga o custo e não ganha o corte.
- A queda de `cred_t` desancora `pe_t` (§5.3): o juro cai agora, mas a inflação esperada sobe e, nos meses seguintes, o próprio BC tende a subir a Selic acima do que subiria sem a pressão.
- O mercado reage no mesmo mês (prêmio de risco ↑, câmbio ↑). A aprovação pode subir no curto prazo.
- O relatório "Por que mudou?" atribui explicitamente esses efeitos à pressão.
- Parâmetros iniciais (`A_CALIBRAR`): `sub_base` 0,6; `pressao_max_bp` 50; `custo_cred` 0,05; `custo_rp` 0,002.
- Teste de sentido obrigatório: em 24 meses, uma estratégia-robô que pressiona o BC todo trimestre deve ter inflação média **maior** e não deve ter crescimento acumulado sistematicamente maior que a mesma estratégia sem pressão.

### 5.5 Prêmio de risco e câmbio
```
rp_t = rp_base + sens_divida * max(0, divida_pib_t − limiar_divida)
     + sens_meta * descumprimento_meta_t + choque_global_t
cambio_t = cambio_{t-1} * exp( beta_cdiff * Δ(i_ext − Selic + rp)_t + beta_tt * Δtermos_troca_t + ruído )
```

### 5.6 Mercado de trabalho (Okun)
```
u_alvo_t = un − theta * h_t
u_t      = u_{t-1} + ajuste_u * (u_alvo_t − u_{t-1})
```

### 5.7 Receitas
Para cada grupo de tributos `j` (IR, contribuições sobre folha/previdência, tributos sobre consumo federais (CBS/IPI), IOF, comércio exterior, royalties/dividendos, demais):
```
R_j,t = base_j(PIBnominal_t, componente) * aliquota_efetiva_j,t * (1 + elast_j * h_t)
```
- Mudanças de alíquota só passam a valer após **anterioridade/noventena** aplicável (ver [POLITICAL_RULES.md](POLITICAL_RULES.md) §5).
- Sazonalidade mensal da arrecadação vem do cenário.
- Transferências constitucionais a estados e municípios (FPE/FPM) são deduzidas da receita líquida do governo central conforme as regras de repartição.

### 5.8 Despesas
- **Obrigatórias** (previdência, pessoal, BPC, abono/seguro-desemprego, mínimos de saúde e educação, emendas impositivas): crescem por regra de indexação (inflação, salário mínimo, demografia, número de beneficiários).
- **Discricionárias**: definidas pela LOA, limitadas pelo Regime Fiscal Sustentável e afetadas por contingenciamento.
- **Execução:** `executado_t = min(autorizado_disponível, capacidade_execução_t)`; o saldo vira restos a pagar.

### 5.9 Contas públicas e dívida (identidades — ver §7)
```
Primário_t  = ReceitaPrimariaLiquida_t − DespesaPrimaria_t
Juros_t     = taxa_implicita_t * Divida_{t-1}
Nominal_t   = Primário_t − Juros_t
Divida_t    = Divida_{t-1} + Juros_t − Primário_t + AjustesPatrimoniais_t
```
`AjustesPatrimoniais` inclui variação cambial sobre dívida externa e operações financeiras (ex.: emissões para reservas), sempre registradas com causa. O motor completo (0.5+) distingue DBGG e DLSP, e conceito "acima da linha" e "abaixo da linha".

### 5.10 Investimento público com defasagem
Cada projeto tem fases: `planejamento → licenciamento → licitacao → obra → operacao`. Curva de desembolso padrão em S, ajustada por:
- `capacidade_adm` do órgão (0–1);
- probabilidade de atraso e de sobrecusto;
- eventos (judicialização, escândalo).

Ao entrar em `operacao`: `Kg += valor_ativo * eficiencia` e começa a despesa de manutenção (`manut_pct * valor_ativo` ao ano).

---

## 6. Parâmetros iniciais (todos `A_CALIBRAR`)

Valores de partida apenas para o protótipo funcionar; serão substituídos por calibração documentada na Fase 03.

| Parâmetro | Valor de partida | Faixa a testar | Significado |
| --- | --- | --- | --- |
| `g_pot_base` | 0,020 | 0,010–0,030 | crescimento potencial anual |
| `rho_h` | 0,90 | 0,80–0,97 | persistência mensal do hiato |
| `beta_r` | 0,010 | 0,003–0,020 | sensibilidade do hiato ao juro real |
| `lag_r` | 6 meses | 3–12 | defasagem da política monetária |
| `mult_base.investimento` | 0,8 | 0,3–1,5 | multiplicador acumulado de investimento |
| `mult_base.transf_baixa_renda` | 0,7 | 0,3–1,3 | |
| `mult_base.custeio` | 0,5 | 0,2–1,0 | |
| `mult_base.desoneracao_consumo` | 0,4 | 0,1–0,9 | |
| `mult_base.desoneracao_renda_alta` | 0,2 | 0,0–0,5 | |
| `kappa` | 0,25 | 0,10–0,50 | inclinação da curva de Phillips (anual) |
| `passthrough` | 0,10 | 0,05–0,25 | repasse cambial em 12 meses |
| `phi_pi` | 1,5 | 1,2–2,0 | reação do BC às expectativas |
| `phi_h` | 0,5 | 0,2–1,0 | reação do BC ao hiato |
| `suav` | 0,7 | 0,5–0,9 | suavização da Selic |
| `theta` | 0,35 | 0,2–0,6 | coeficiente de Okun |
| `limiar_divida` | 0,80 | 0,70–0,90 | dívida/PIB a partir da qual o prêmio sobe |
| `elast_kg` | 0,10 | 0,05–0,20 | elasticidade do potencial ao capital público |
| `dep_kg` | 0,04 | 0,03–0,06 | depreciação anual do capital público |

Cada parâmetro deverá ter, ao final da Fase 03: fonte ou justificativa, data, intervalo testado e resultado de sensibilidade (ver [DATA_SOURCES.md](DATA_SOURCES.md) §4).

---

## 7. Invariantes (testes obrigatórios)

Executados a cada mês em modo de teste e em toda simulação automatizada:

1. `Primário = Receita primária líquida − Despesa primária` (tolerância §2).
2. `Divida_t − Divida_{t-1} = Juros − Primário + Ajustes`.
3. Soma das contribuições ("Por que mudou?") = variação total do indicador.
4. Despesa executada ≤ despesa autorizada; despesa total ≤ limite do arcabouço, salvo exceções legais registradas.
5. Valores fisicamente possíveis: desemprego ∈ (0, 1), preços > 0, câmbio > 0, população > 0, Selic ≥ 0.
6. Nenhum `NaN` ou `Infinity` em qualquer variável.
7. Determinismo: duas execuções com a mesma semente geram estados idênticos.
8. Mês sem decisões e sem choques: variáveis convergem para estado estacionário (sem explosão).

---

## 8. Choques

| Choque | Canal | Origem |
| --- | --- | --- |
| Preço internacional de commodities | termos de troca, câmbio, receita de royalties, inflação | Processo estocástico com semente |
| Juros internacionais | câmbio, prêmio, fluxo de capital | idem |
| Clima (seca, enchente) | agropecuária, energia, preços de alimentos, despesa emergencial | sazonal + probabilidade |
| Choque de confiança | investimento e consumo | eventos políticos |
| Crise financeira global | fluxo de capital, câmbio, exportações | evento raro |

---

## 9. Validação e testes de sensibilidade

- **Campanhas automáticas:** 20 anos (240 meses), centenas de sementes, estratégias-robô diferentes (expansionista, austera, neutra, aleatória, distributiva, pró-oferta).
- **Critérios de aceitação (Fase 03):** nenhuma violação de invariante; nenhuma explosão sem causa (ex.: inflação > 100% a.a. sem choque e política correspondentes); trajetórias dentro de faixas plausíveis definidas no teste.
- **Testes de sentido (direção do efeito), não de valor exato:** por exemplo, "aumento de juros reais reduz o hiato em 6–12 meses, mantidas as demais condições".
- **Teste de viés:** nenhuma estratégia-robô deve dominar todas as outras em todos os objetivos; cada estratégia deve ter trade-offs mensuráveis.
- **Teste de cenários:** alta inflação, recessão, recuperação, déficit persistente, crescimento moderado, choque externo.

---

## 10. Evolução do modelo

| Versão | Escopo econômico |
| --- | --- |
| 0.1 | Hiato agregado, Phillips, BC, Okun, receitas em 3 grupos, despesas em 4 grupos, dívida simples |
| 0.5 | Setores, receitas e despesas detalhadas, LOA anual, arcabouço completo, distribuição por quintis, 27 UFs |
| 1.0 | Calibração documentada, previsões ministeriais com incerteza, crédito e investimento privado |
| 2.0 (Realismo Extremo) | Expectativas heterogêneas, setores interligados (insumo-produto simplificado), PPA, execução detalhada, comércio exterior |

---

## 11. Limitações declaradas

- É um modelo de jogo. Reproduzir números reais iniciais não o torna uma previsão.
- Formas reduzidas não capturam todas as interações; o objetivo é ser **plausível, consistente e explicável**.
- Coeficientes de multiplicador e repasse têm grande incerteza na literatura; o jogo deve comunicar essa incerteza em vez de escondê-la.
