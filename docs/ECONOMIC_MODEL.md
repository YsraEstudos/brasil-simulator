# Brasil Simulator — Modelo Econômico

Versão 0.3 do documento • 13/10/2026 • ✅ Revisado pelo autor em 13/10/2026 (pressão sobre o BC permitida; incerteza varia com a dificuldade) • v0.2: fila de efeitos agendados, distribuição regional a partir do agregado, retorno decrescente de tributos, compressão das discricionárias, retenção do histórico, saturação de realimentações • v0.3 (Fase 03): o que o motor 0.3.0 implementa (§5.14), regra aplicada da pressão sobre o BC (§5.4.1), calibração documentada (§6 e [CALIBRATION.md](CALIBRATION.md))

> **Status:** todas as equações são **forma reduzida simplificada**. Os parâmetros têm justificativa e faixa testada ([CALIBRATION.md](CALIBRATION.md)), mas continuam `PROVISORIO` até a importação das séries oficiais. Nenhum número deste documento é previsão.

---

## 1. Princípios

1. **Motor separado da interface.** O código fica em `src/engine/economy/`, em TypeScript puro, sem importar React, Expo ou SQLite.
2. **Determinismo.** Mesmo estado inicial + mesmas decisões + mesma semente = mesmo resultado, bit a bit. Proibido usar `Math.random()` ou `Date.now()` dentro do motor.
3. **O jogador não altera resultados.** Ele altera **instrumentos** (alíquotas, dotações, programas, regras). O motor calcula PIB, preços, emprego e contas.
4. **Contabilidade primeiro.** As identidades contábeis (§7) valem sempre, em qualquer dificuldade. Ruído e comportamento entram nas equações de comportamento, nunca nas identidades.
5. **Efeitos dependem do estado.** Multiplicadores, repasse cambial e reação do mercado variam com hiato, dívida e credibilidade.
6. **Auditoria.** Cada variação relevante é decomposta por causa (`contributions`) e gravada para o relatório "Por que mudou?". Retenção em §11.
7. **Parâmetros como dados.** Nenhum coeficiente numérico dentro das funções de lógica. Os valores padrão ficam num único módulo declarativo (`src/engine/economy/calibration.ts`), cada um com nome, faixa e justificativa; o cenário (`src/data/scenarios/`) pode sobrescrevê-los.
8. **Realimentações saturam.** Todo laço de realimentação (ex.: dívida alta → prêmio de risco → juros → dívida) usa função de saturação (`tanh`, logística ou limite explícito), para não gerar espiral infinita por acidente numérico. Crises continuam possíveis, mas precisam de causa registrada (choque, decisão ou evento).
9. **Agregado primeiro.** O motor calcula a economia nacional; estados e regiões são uma distribuição desse agregado (§5.12), nunca 27 motores somados.

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
- **Regra aplicada (Fase 03):** o corte não entra no `i_alvo` (a suavização de 70% e o arredondamento de 25 bp o anulariam sempre); ele é subtraído da Selic já suavizada, em passos de 25 bp (corte abaixo de 12,5 bp não muda a decisão). A diretoria indicada segue a LC 179/2021: 2, 4, 7 e 9 de 9 membros no 1º, 2º, 3º e 4º ano do mandato. Com `sub_base` 0,6 e autonomia percebida 0,5, o BC resiste nos três primeiros anos e cede 25 bp no quarto. O prêmio de risco sobe `custo_rp` por pressão nos últimos 12 meses (dentro da saturação do §5.5).
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
- **Retorno decrescente.** Acima de um limiar de carga, parte de cada aumento de alíquota se perde por sonegação, informalidade, elisão e menor investimento:
  ```
  aliquota_efetiva_j = aliquota_legal_j * (1 − perda_j(aliquota_legal_j))
  perda_j(a)        = perda_max_j * tanh( max(0, a − limiar_carga_j) / escala_j )
  ```
  Aumentos grandes e rápidos sobre renda de capital também elevam a **saída de capital** (fluxo de capital ↓ → câmbio ↑ → inflação de importados ↑). Assim não existe "fonte infinita de dinheiro" no primeiro mês. Os parâmetros vêm de estimativas de elasticidade da base tributária, não de posição ideológica, e o "Por que mudou?" mostra a perda de arrecadação como causa própria.
- Sazonalidade mensal da arrecadação vem do cenário.
- Transferências constitucionais a estados e municípios (FPE/FPM) são deduzidas da receita líquida do governo central conforme as regras de repartição.

### 5.8 Despesas
- **Obrigatórias** (previdência, pessoal, BPC, abono/seguro-desemprego, mínimos de saúde e educação, emendas impositivas): crescem por regra de indexação (inflação, salário mínimo, demografia, número de beneficiários).
- **Discricionárias**: definidas pela LOA, limitadas pelo Regime Fiscal Sustentável e afetadas por contingenciamento.
- **Execução:** `executado_t = min(autorizado_disponível, capacidade_execução_t)`; o saldo vira restos a pagar.
- **Compressão das discricionárias.** Com o limite de despesas fixo, cada real a mais de obrigatória sai do espaço das discricionárias. O caso mais tentador é o aumento real do salário mínimo: aprovação imediata nas faixas de menor renda, mas ele reajusta automaticamente previdência, BPC, abono e seguro-desemprego. Abaixo de um piso de funcionamento (`piso_custeio`), o jogo dispara eventos de **paralisação da máquina** (emissão de passaportes, manutenção de rodovias, bolsas, fiscalização), com custo de aprovação e de capacidade administrativa.

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

### 5.11 Fila de efeitos agendados (`ScheduledImpulse`)
Defasagens não são calculadas olhando para o passado com `if/else`. Quando uma decisão, lei, obra ou evento produz efeitos futuros, ele **agenda impulsos** numa fila que faz parte do `GameState`:

```ts
interface ScheduledImpulse {
  sourceId: string; // decisão, lei, projeto ou evento de origem
  label: string; // texto do "Por que mudou?", ex.: "Obras da ferrovia"
  target: string; // variável afetada, ex.: 'spending.investment'
  delta: number; // efeito por mês, na unidade da variável
  startMonth: number; // monthIndex do primeiro mês com efeito
  endMonth: number | null; // null = permanente
}
```

- Em cada mês, o motor aplica os impulsos ativos **antes** das equações do §5 e registra cada um como `contribution` com o seu `label`. A auditoria sai de graça: o "Por que mudou?" lê os impulsos consumidos naquele mês.
- Atrasos, sobrecustos e cancelamentos (§5.10) **reagendam ou removem** impulsos, sempre com causa registrada.
- Efeitos permanentes já estabilizados são consolidados no estado (ex.: incorporados ao `Kg` ou ao potencial) e saem da fila, para ela não crescer sem limite.

### 5.12 Distribuição regional (Fase 05+)
Decisão de arquitetura D7 (13/10/2026, [ROADMAP.md](ROADMAP.md) §7.1): **o agregado nacional é calculado primeiro e distribuído às UFs.**

```
participacao_uf,t = normalizar( participacao_uf,t-1 * (1 + Σ_s sens_uf,s * crescimento_setor_s,t + bonus_regional_uf,t) )
Y_uf,t            = Y_t * participacao_uf,t
```

- Cada UF tem apenas uma **matriz de participação e de sensibilidade setorial** (ex.: uma UF agrícola absorve mais do crescimento da agropecuária; uma UF industrial, mais da indústria). Fonte: Contas Regionais do IBGE.
- Obras e programas regionais alteram `bonus_regional_uf` e a eficiência local, e geram efeito marginal no agregado via `Kg` (§5.1), sem motor macroeconômico por UF.
- Desemprego, renda e aprovação regionais seguem a mesma lógica. A soma das UFs é igual ao total nacional por construção (invariante 9).

### 5.13 O que o protótipo 0.1 implementa (Fase 02)
Código em `src/engine/economy/economy.ts`; coeficientes em `src/engine/economy/calibration.ts`. Simplificações em relação às equações acima, todas a revisar na Fase 03:

- **Impulso fiscal como nível.** Um gasto ativo de `L` (fração do PIB ao ano) entra no hiato como `(1 − rho_h) · mult · L` por mês, de modo que o hiato estacionário seja `mult · L` (multiplicador acumulado). O §5.2 escrevia o impulso sem o fator `(1 − rho_h)`.
- **Defasagem monetária por média móvel.** Em vez de `r_real_{t−lag_r}`, o motor guarda o juro real efetivo `effectiveRealRate`, que anda `1/lag_r` por mês em direção ao juro real ex ante (Selic − expectativa). Assim não há série histórica no estado (§11).
- **Indicadores de 12 meses por suavização.** PIB 12m anda `(g_pot − g12)/12 + Δh` por mês; inflação 12m anda a fração `ajuste_inflacao` do caminho até `pe + kappa·h + choques`; o primário 12m anda 1/12 do caminho até o resultado do mês. Todas as parcelas são lineares, então a soma das contribuições fecha exatamente (§7.3).
- **Sem câmbio nem prêmio de risco** (§5.5) no protótipo. O papel do risco fiscal fica com a **credibilidade** (0–1): cai com déficit abaixo da banda da meta, inflação acima do teto e dívida acima de `limiar_divida`; reduz o multiplicador e desancora as expectativas.
- **Contas em razões ao PIB.** Receita e despesa partem das razões do cenário mais os impulsos ativos; a dívida segue `d_t = d_{t−1} + (juros − primário)/12 + ajuste`, com o ajuste do denominador `−d·(g + π)/12` (§7.2).
- **Fila de impulsos** (§5.11) em uso por políticas e eventos. A consolidação de efeitos permanentes no estado ainda não é feita (a fila de 12 meses é pequena).
- **Pressão sobre o BC** (§5.4.1), retorno decrescente de tributos (§5.7) e compressão das discricionárias (§5.8) ficam para a Fase 03.

### 5.14 O que o motor 0.3.0 implementa (Fase 03)
Código em `src/engine/economy/` (`economy.ts` orquestra; `external.ts`, `monetary.ts`, `fiscal.ts`). Estado v3; saves v2 são atualizados (`upgrade.ts`). Em relação ao §5.13:

- **Setor externo e risco (§5.5, §8).** Juro externo e termos de troca são AR(1) com semente. O prêmio de risco anda `ajuste_risco` por mês até `premio_base + premio_extra_max · tanh(causas / premio_extra_max)`, com causas: dívida acima do limiar, déficit abaixo da banda, credibilidade abaixo da base, carga sobre a renda acima da margem (saída de capital, §5.7), pressões sobre o BC e choques `choque.risco`. O câmbio é escrito **em nível**: volta (`ajuste_cambio`) a um equilíbrio de paridade (câmbio inicial × preços internos ÷ externos), deslocado pelo diferencial de juros (saturado em `desvio_cambio_max`) e pelos termos de troca; o random walk da forma em diferenças do §5.5 acumularia ruído sem limite em 20 anos. O repasse usa a depreciação **real** de 12 meses.
- **Banco Central.** Juro neutro do Copom = `juro_neutro + repasse_risco_neutro · (rp − premio_base)`; passo de 150 bp quando a inflação passa do teto em mais de `limiar_crise_inflacao` ou o prêmio passa da metade da saturação. O prêmio também encarece o crédito no hiato (causa "Prêmio de risco e juros de mercado") e entra na taxa implícita da dívida (`repasse_risco_divida`).
- **Receitas por grupo (§5.7).** Renda, folha, consumo, outras e royalties, com repartição a estados e municípios (`transferShares` do cenário). Impulsos de receita mudam a carga legal do grupo; acima da carga inicial + margem do grupo, a perda é `perda_max · tanh(excesso / escala_perda)` e aparece no "Por que mudou?" como "Perda de arrecadação". Royalties seguem os termos de troca.
- **Despesas, limite e compressão (§5.8; POLITICAL_RULES.md §4.2–4.3).** Obrigatórias por grupo crescem pela própria regra (beneficiários, folha) em relação ao PIB **potencial**; previdência (60%) e benefícios (100%) recebem em janeiro o ganho real do salário mínimo (Lei 15.077/2024 até 2030; depois `sm_ganho_apos_regra`). Vinculadas acompanham a receita sem a folha. O limite cresce em termos reais pela regra da LC 200/2023, revista em janeiro com a receita do ano anterior (ano-calendário como aproximação). As discricionárias livres ficam com o espaço que sobra (a LOA usa todo o limite), nunca abaixo de `discricionaria_minima`; gasto discricionário novo sai desse espaço; contingenciamento corta abaixo dele. O que passa do limite é **estouro registrado** (invariante §7.4) e derruba a credibilidade (`pena_cred_estouro`). Créditos extraordinários (`gasto.extraordinario`) ficam fora do limite. Abaixo de `piso_custeio` há paralisação: perda de aprovação e o evento "Serviços públicos começam a parar".
- **Consequência:** sob o limite, despesa obrigatória nova **não aumenta o gasto total**: comprime as discricionárias (causa "Compressão das discricionárias"). O primário só piora com renúncia de receita, crédito extraordinário ou estouro do limite.
- **Postura fiscal que se dissipa.** O impulso de demanda de cada política continua em nível (`(1 − rho_h) · mult · L`), mas a economia se acomoda: a referência `demandRef` anda `adaptacao_fiscal` por mês até a postura total, e a distância é o que move o hiato (causa "Economia se acomoda à política fiscal"). A deriva estrutural (limite caindo em % do PIB, compressão) entra com `mult_estrutural`. Sem isso, a queda do limite em 20 anos geraria hiato negativo permanente.
- **Níveis.** PIB potencial e IPCA como índices; o PIB nominal corrente converte custos de políticas em R$ para fração do PIB; o ajuste do denominador da dívida usa o crescimento nominal **do mês**, e a variação cambial corrige a parcela `divida_cambial` da dívida.
- **Dívida em 20 anos.** Com juro real neutro de 5%, crescimento potencial de 2% e primário perto de zero, `r − g ≈ 3` a `5 p.p.` e a dívida não tem estado estacionário: nas campanhas automáticas de 240 meses ela termina entre ~185% (austera) e ~240% (populista) do PIB, e ~310% com pressão trimestral sobre o BC. É trajetória com causa registrada (juros acima do crescimento, estouro do limite, prêmio de risco), não espiral numérica: o prêmio satura. Estabilizar a dívida exige primário de ~2,5% do PIB, fora do alcance das 9 políticas atuais (Fase 06). A dívida é a variável mais sensível a `g_pot_base` e `juro_neutro` ([CALIBRATION.md](CALIBRATION.md)).
- **Ações de agenda** (`src/engine/actions.ts`): decisões sem proposta, no máximo uma por mês cada; hoje só "Pressionar o Banco Central".
- **Não implementado ainda:** capital público explícito e carteira de projetos (§5.10, Fase 06), setores e quintis (0.5), distribuição regional (§5.12, Fase 05), consolidação de impulsos permanentes (a fila fica limitada porque cada política só tem uma execução ativa e os eventos não criam efeitos permanentes; testado em 240 meses).

---

## 6. Parâmetros

Os valores, faixas, significados e justificativas estão em `src/engine/economy/calibration.ts`; a tabela completa, com a faixa testada e o resultado de sensibilidade de cada parâmetro em campanhas de 20 anos, é gerada em [CALIBRATION.md](CALIBRATION.md) por `npm run sim:sensitivity`. A tabela abaixo é a de partida da Fase 00, mantida como registro.

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
| `limiar_carga_j` | por grupo | a definir | alíquota a partir da qual a arrecadação perde eficiência |
| `perda_max_j` | 0,30 | 0,10–0,50 | perda máxima de base (sonegação, informalidade, elisão) |
| `piso_custeio` | a definir | — | discricionária mínima para a máquina funcionar sem paralisações |

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
9. Soma das variáveis regionais = total nacional (Fase 05+).

Situação na Fase 03 (`src/engine/invariants.ts` e testes): 1–6 verificados a cada mês, incluindo receitas e despesas por grupo somando os totais e o §7.4 como "despesa sujeita ao limite ≤ limite + estouro registrado" (exceções legais e créditos extraordinários fora do limite); 7 nos testes de determinismo; 8 no teste de estado estacionário de `economy.test.ts`, com deriva fiscal neutralizada (hiato, inflação, desemprego e Selic convergem; a dívida só precisa não explodir, porque com `r > g` e primário nulo ela não tem ponto fixo, §5.14).

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

- **Campanhas automáticas:** 20 anos (240 meses), centenas de sementes, estratégias-robô diferentes: populista fiscal (gasta no limite, aumento real do mínimo todo ano), austera extrema, **inerte** (não decide nada; linha de base), aleatória, distributiva, pró-oferta e **fisiológica** (entrega ministérios e emendas para aprovar tudo; Fase 04+).
- **`npm run sim:balance`:** roda N campanhas de cada estratégia em Node, sem interface, e imprime uma tabela por estratégia: inflação média, PIB acumulado, dívida/PIB final, aprovação média e, quando existirem, taxas de reeleição e de impeachment. Roda a cada mudança de fórmula ou parâmetro. Se uma estratégia claramente explorável (ex.: populista fiscal) vencer sem crise, é um exploit a corrigir.
- **Critérios de aceitação (Fase 03):** nenhuma violação de invariante; nenhuma explosão sem causa (ex.: inflação > 100% a.a. sem choque e política correspondentes); trajetórias dentro de faixas plausíveis definidas no teste.
- **Testes de sentido (direção do efeito), não de valor exato:** por exemplo, "aumento de juros reais reduz o hiato em 6–12 meses, mantidas as demais condições".
- **Teste de viés:** nenhuma estratégia-robô deve dominar todas as outras em todos os objetivos; cada estratégia deve ter trade-offs mensuráveis.
- **Teste de cenários:** alta inflação, recessão, recuperação, déficit persistente, crescimento moderado, choque externo.
- **Situação na Fase 03:** 8 estratégias-robô (inerte, populista fiscal, austera, reformista, distributiva, pró-oferta, inerte com pressão trimestral sobre o BC e aleatória; a fisiológica fica para a Fase 04). Testes: 12 e 48 meses × várias sementes, 240 meses × 3 sementes com faixas de explosão, teste de sentido da pressão sobre o BC (§5.4.1), cenários de estresse (`src/engine/sim/stress.test.ts`) e estado estacionário (§7.8). `npm run sim:balance` imprime 12, 48 e 240 meses com PIB acumulado, máximos de dívida e inflação, prêmio final e meses com estouro do limite e com discricionárias abaixo do piso. `npm run sim:sensitivity` leva cada parâmetro aos extremos da faixa em 20 anos e gera [CALIBRATION.md](CALIBRATION.md): nenhum extremo gera violação ou explosão. Trade-offs em 20 anos: a austera termina com menos dívida e menos aprovação; populista e distributiva, com mais dívida; nenhuma domina as outras. A aprovação de longo prazo converge para perto de `aprovacao_base` em todas (limitação conhecida até as eleições da Fase 08).

---

## 10. Evolução do modelo

| Versão | Escopo econômico |
| --- | --- |
| 0.1 | Hiato agregado, Phillips, BC, Okun, receitas em 3 grupos, despesas em 4 grupos, dívida simples |
| 0.5 | Setores, receitas e despesas detalhadas, LOA anual, arcabouço completo, distribuição por quintis, 27 UFs |
| 1.0 | Calibração documentada, previsões ministeriais com incerteza, crédito e investimento privado |
| 2.0 (Realismo Extremo) | Expectativas heterogêneas, setores interligados (insumo-produto simplificado), PPA, execução detalhada, comércio exterior |

---

## 11. Retenção do histórico

Para o estado não crescer sem limite em campanhas longas (240+ meses) em celulares de entrada:

- O `GameState` em memória guarda só as **contribuições do mês corrente** e a fila de impulsos ativos (§5.11). Nenhuma série histórica vive dentro do estado.
- O banco guarda, por mês, o snapshot e a decomposição causal. Nos **últimos 12 meses** a decomposição fica completa (alimenta o "Por que mudou?"); nos meses mais antigos ela é descartada e fica só o vetor de indicadores (alimenta os gráficos de longo prazo).
- A compactação roda ao gravar o mês, na mesma transação.
- Implementado na Fase 03 (migração 4 do banco): `month_reports` guarda os últimos 12 relatórios; `snapshots` guarda o estado completo só do mês atual e dos 12 anteriores; `indicator_history` guarda, para a campanha inteira, os indicadores, a Selic, a dívida, a credibilidade, o câmbio e o prêmio de risco (preenchida a partir dos snapshots existentes ao migrar).

---

## 12. Limitações declaradas

- É um modelo de jogo. Reproduzir números reais iniciais não o torna uma previsão.
- Formas reduzidas não capturam todas as interações; o objetivo é ser **plausível, consistente e explicável**.
- Coeficientes de multiplicador e repasse têm grande incerteza na literatura; o jogo deve comunicar essa incerteza em vez de escondê-la.
