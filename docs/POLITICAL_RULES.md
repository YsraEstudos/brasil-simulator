# Brasil Simulator — Regras Políticas e Institucionais

Versão 0.2 do documento • 13/10/2026 • ✅ Revisado pelo autor em 13/10/2026 (fidelidade por dificuldade e quebra de regras com consequências, §1.1) • v0.2: capacidade de pauta, ministérios técnicos ou partidários, emendas como pedágio, ciclo do mandato • v0.3 (Fase 04): regras aplicadas pelo motor 0.4.0 (§6.5, §7, §8) • v0.4 (Fase 05): governadores e adesão a convênios no motor (§2.1)

> **Natureza deste documento.** Resume regras da Constituição Federal (CF) e de leis federais para orientar a simulação. **Não é orientação jurídica.** Cada regra tem a fonte indicada. Itens marcados com ⚠ devem ser revalidados na legislação vigente antes da Fase 04, porque podem ter mudado ou depender de regulamentação recente.
>
> Todas as regras ficam em **parâmetros de cenário**: uma PEC aprovada dentro do jogo, ou um cenário histórico, pode alterá-las.

---

## 1. Princípios da simulação institucional

1. O presidente **propõe e executa**; outras instituições **decidem** por conta própria.
2. Toda ação passa por validação de **competência → instrumento → requisitos → financiamento**.
3. Atores autônomos simulados: Câmara, Senado, partidos/blocos, presidentes das Casas, Banco Central, STF (simplificado), TCU (simplificado), governadores, mercado e opinião pública.
4. Quando a ação é inválida, o jogo explica o motivo e indica o instrumento correto.

### 1.1 Fidelidade às regras por dificuldade (decisão de 13/10/2026)

| Aspecto | Casual | Estratégica | Realismo Extremo |
| --- | --- | --- | --- |
| Regras aplicadas | Simplificadas: sem noventena/anterioridade, compensação da LRF automática, recesso parlamentar ignorado | Completas (quóruns, prazos, LRF, arcabouço, anterioridade, recesso) | Completas, mais regimentos internos, prazos de tramitação reais e calendário orçamentário detalhado |
| Explicações | Sempre disponíveis em todos os modos: por que uma ação é inválida ou arriscada, e qual o instrumento correto | idem | idem |

**Quebra de regras é permitida, com consequências.** Ações que violam a LRF, o arcabouço, a anterioridade ou a competência de outro ente não são bloqueadas de forma absoluta (exceto o fisicamente impossível, como votar sem quórum). O jogo mostra um **aviso explícito com os riscos** e, se o jogador confirmar, a ação segue marcada com flags de irregularidade que alimentam:
- `riscoJuridico` (ADI/ADPF e liminares do STF, §8);
- alertas e parecer do TCU pela rejeição das contas (§8);
- `pressaoImpeachment` como possível crime de responsabilidade (§10);
- credibilidade fiscal e prêmio de risco (ECONOMIC_MODEL.md §5.5).

No modo Casual a quebra continua possível e com consequências, mas mais brandas.

---

## 2. Competências (quem pode fazer o quê)

| Tema | União | Estados | Municípios | Base |
| --- | --- | --- | --- | --- |
| Moeda, câmbio, política monetária | Exclusiva (BC autônomo; o presidente só pode pressionar publicamente, com custo — ECONOMIC_MODEL.md §5.4.1) | — | — | CF arts. 21, 22, 164; LC 179/2021 |
| Tributos federais (IR, IOF, IPI, CBS, II, IE, IS) | Sim | — | — | CF art. 153, 195; EC 132/2023 |
| ICMS (até a transição) / IBS (compartilhado) | — | Sim | IBS compartilhado | CF art. 155, 156-A |
| ISS (até a transição), IPTU | — | — | Sim | CF art. 156 |
| Saúde (SUS) | Financiamento, coordenação | Gestão de média/alta complexidade | Atenção primária | CF arts. 23, 196–198 |
| Educação | Ensino superior federal, apoio técnico e financeiro | Ensino médio | Educação infantil e fundamental | CF arts. 211–212 |
| Segurança pública | Polícia Federal, PRF, Força Nacional, coordenação | Polícias Civil e Militar | Guardas municipais | CF art. 144 |
| Rodovias, ferrovias, portos federais | Sim | Malha estadual | Vias urbanas | CF art. 21 |
| Previdência dos trabalhadores do setor privado (RGPS) | Exclusiva | — | — | CF art. 201 |
| Assistência social | Concorrente, com programas nacionais | Sim | Execução | CF arts. 23, 203–204 |
| Meio ambiente | Comum | Comum | Comum | CF arts. 23, 225 |
| Direito penal, civil, trabalhista, eleitoral | Legislação privativa | — | — | CF art. 22 |

**Regra do jogo:** em temas de competência comum ou estadual, o presidente atua por **programas nacionais, convênios, transferências voluntárias e normas gerais**. Os governadores decidem se aderem.

### 2.1 Federação no motor (Fase 05, motor 0.5.0)
Parâmetros em `src/engine/economy/calibration.ts` (seção Federação); distribuição econômica em [ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) §5.15.

| Regra | Como o motor aplica |
| --- | --- |
| Governadores | 27 governadores fictícios (cenário v0.4.0), cada um de um bloco e com relação própria com o governo (−100…100). A relação anda até a meta: posição própria do governador + `governador_alinhamento` × relação do bloco dele + `governador_aprovacao` × aprovação do presidente no estado acima da base. Eventos movem governadores de regiões específicas (`governadores.relacao`). |
| Governador e aprovação local | Governador aliado puxa a aprovação do presidente no estado para cima; hostil, para baixo (`aprovacao_governador`). |
| Adesão a convênios | Política com a condição `adesao_estadual` (hoje, a cooperação em segurança): no início da execução cada estado adere com probabilidade `adesao_base + adesao_relacao × relação/100`. O gasto e o capital público alcançam só a população dos estados que aderiram e são repartidos só entre eles; substitui o risco genérico de baixa adesão. No Casual todos aderem. A mesa de despacho mostra a adesão esperada. |
| Visita presidencial | Ação de agenda (custo 1, uma por estado por mês): aprovação local `aprovacao_visita` por `meses_visita` meses e `relacao_visita` pontos com o governador. Não muda a aprovação nacional. |
| Ainda não modelado | Finanças e dívidas estaduais (o evento das dívidas estaduais só mexe em relação, atividade e risco), FPE/FPM por UF, bancadas estaduais no Congresso, eleição de governadores (Fase 08), invasão de competência estadual como risco jurídico. |

---

## 3. Instrumentos normativos

| Instrumento | Quem propõe | Quórum de aprovação | Tramitação | Efeito no jogo |
| --- | --- | --- | --- | --- |
| **Decreto regulamentar** | Presidente | — | Imediato | Não pode criar obrigação nova sem lei; Congresso pode sustar atos que exorbitem (CF art. 49, V) |
| **Decreto de alíquota** (II, IE, IPI, IOF; CIDE-combustíveis) | Presidente | — | Imediato, respeitando a noventena quando aplicável | CF art. 153 §1º; art. 177 §4º |
| **Decreto de programação orçamentária / contingenciamento** | Presidente | — | Imediato | LRF art. 9º; relatórios bimestrais |
| **Medida Provisória (MP)** | Presidente | Maioria simples para conversão | Vigência de 60 + 60 dias; tranca a pauta após 45 dias; perde eficácia se não convertida | CF art. 62 |
| **Projeto de Lei Ordinária (PL)** | Presidente, parlamentares, outros | Maioria simples, com maioria absoluta presente | Câmara → Senado (ou inverso); comissões; plenário | CF arts. 47, 61, 64–66 |
| **Urgência constitucional** em PL do presidente | Presidente | — | 45 dias em cada Casa; depois tranca a pauta | CF art. 64 §§1º–2º |
| **Projeto de Lei Complementar (PLP)** | Idem | **Maioria absoluta**: 257 deputados / 41 senadores | Idem | CF art. 69 |
| **Proposta de Emenda à Constituição (PEC)** | Presidente, 1/3 de uma Casa, mais da metade das Assembleias | **3/5 em dois turnos em cada Casa**: 308 deputados / 49 senadores | Câmara e Senado; promulgada pelas Mesas, sem sanção | CF art. 60 |
| **PLN (créditos adicionais, LDO, LOA, PPA)** | Presidente (iniciativa privativa) | Maioria simples em sessão conjunta | Comissão Mista de Orçamento → sessão conjunta | CF arts. 165–166 |
| **Veto** | Presidente | Derrubada: **maioria absoluta de cada Casa** (257 / 41) em sessão conjunta | Prazo de 15 dias úteis para sancionar/vetar; Congresso aprecia em 30 dias, depois tranca a pauta da sessão conjunta | CF art. 66 |

### 3.1 Vedações à Medida Provisória (CF art. 62 §1º)
Não pode tratar de: nacionalidade, cidadania, direitos políticos, partidos e direito eleitoral; direito penal e processual; organização do Judiciário e do Ministério Público; **PPA, LDO, orçamento e créditos adicionais** (exceto **crédito extraordinário**, só para despesas imprevisíveis e urgentes, CF art. 167 §3º); matéria reservada a lei complementar; matéria já aprovada pelo Congresso e pendente de sanção. Reedição na mesma sessão legislativa é proibida (CF art. 62 §10): no motor, MP rejeitada ou caducada não pode ser reenviada no mesmo ano-calendário (motivo `reedicao_vedada`).

### 3.2 Iniciativa privativa do presidente (CF art. 61 §1º)
Efetivo das Forças Armadas; criação de cargos e aumento de remuneração na administração direta; servidores públicos da União; criação e extinção de ministérios e órgãos. Leis orçamentárias (CF art. 165).

### 3.3 Calendário do Congresso
- Sessão legislativa: **2/fev a 17/jul** e **1º/ago a 22/dez** (CF art. 57). A sessão não é interrompida sem aprovação da LDO.
- Nova legislatura em 1º/fev/2027, com eleição das Mesas da Câmara e do Senado.
- Fora desses períodos, votação só com **convocação extraordinária** (custo político no jogo).

---

## 4. Ciclo orçamentário e regras fiscais

### 4.1 Peças orçamentárias
| Peça | Envio pelo Executivo | Conteúdo |
| --- | --- | --- |
| PPA (4 anos) | Até 31/ago do 1º ano do mandato | Programas e metas plurianuais |
| LDO | Até 15/abr | Metas fiscais, prioridades e regras para a LOA |
| LOA | Até 31/ago | Receitas e despesas do ano seguinte |

Prazos do ADCT art. 35 §2º. Em jan/2027 vigora a **LOA 2027 votada pelo Congresso anterior**. Se ela não tiver sido aprovada, o jogo aplica a regra de execução provisória prevista na LDO (proporção mensal de despesas). ⚠ Reconferir na LDO 2027 quando aprovada (o PLOA 2027 foi enviado em 31/08/2026).

### 4.2 Regime Fiscal Sustentável (LC 200/2023) — verificado em 13/10/2026
- **Limite de despesa primária**: cresce em termos reais **70% da variação real da receita** (50% se a meta de primário do ano anterior não tiver sido cumprida), com piso de **0,6%** e teto de **2,5%** de crescimento real.
- **Meta de resultado primário** definida na LDO, com **banda de tolerância de ±0,25 p.p. do PIB**.
- Descumprimento aciona **gatilhos** de contenção (restrições a criação de despesas, reajustes e concursos) e reduz o crescimento permitido do limite.
- Exceções ao limite (lista legal): parte delas é parâmetro do cenário. A exclusão de precatórios do limite (PEC 66/2023) e as ADIs 7064/7047 no STF tornam esse ponto instável: tratar como parâmetro.
- Pacote de dez/2024: com déficit primário a partir de 2025, fica vedada no ano seguinte a criação, ampliação ou prorrogação de benefícios tributários (gatilho no cenário).
- Limite de despesas primárias da LOA 2026: R$ 2,428 tri (referência para calibrar o cenário de 2027).
- **No motor (Fase 03, ECONOMIC_MODEL.md §5.14):** o limite é revisto todo janeiro pela regra acima, com a receita do ano-calendário anterior como aproximação do período de apuração; a meta é considerada cumprida se o primário de 12 meses em dezembro ficou acima de meta − banda. As discricionárias recebem o espaço que sobra depois das obrigatórias e vinculadas; o que passa do limite é registrado como estouro (com perda de credibilidade), e créditos extraordinários (calamidades, CF art. 167 §3º) ficam fora dele. Os gatilhos de contenção não são modelados além do redutor de 50% e da perda de credibilidade.
- **Salário mínimo (Lei 15.077/2024):** reajuste de janeiro com ganho real igual ao PIB de dois anos antes, na faixa de 0,6% a 2,5%, até 2030; depois, só a reposição da inflação (parâmetro). Propaga-se para previdência (parcela de um salário mínimo) e para BPC, abono e seguro-desemprego.

### 4.3 Mínimos constitucionais e despesas vinculadas
- Saúde: mínimo de **15% da receita corrente líquida** da União (CF art. 198, redação da EC 86/2015), em vigor desde o fim do teto de gastos. ✔ 13/10/2026 (piso de 2026: R$ 254,9 bi). Há propostas de mudar a base de cálculo e o governo já sinalizou dificuldade para cumprir os pisos em 2027: bom gancho de evento.
- Educação: mínimo de **18% da receita de impostos**, líquida de transferências (CF art. 212).
- **Emendas parlamentares impositivas**: individuais **2% da RCL** do exercício anterior (1,55% deputados, 0,45% senadores; metade para saúde — EC 126/2022) e de bancada estadual **1% da RCL** (EC 100/2019) (CF art. 166). A LC 210/2024 passou a limitar o crescimento das emendas pelas regras do arcabouço (0,6%–2,5% reais). ✔ 13/10/2026 (LOA 2026: R$ 61 bi em emendas). A parcela de bancada para 2027 deve ser reconferida na LDO 2027.
- Benefícios previdenciários e BPC vinculados ao **salário mínimo**. Regra (Lei 15.077/2024, até 2030): INPC de 12 meses até novembro + crescimento real do PIB de dois anos antes, **limitado à faixa do arcabouço (0,6%–2,5% reais)**. ✔ 13/10/2026 (2026: R$ 1.621; PLOA 2027 prevê ~R$ 1.741).

### 4.4 Execução
- **Relatório bimestral de avaliação de receitas e despesas**: se a receita frustrar a meta → **contingenciamento**; se a despesa obrigatória crescer acima do limite → **bloqueio**.
- **Créditos adicionais** (Lei 4.320/1964 arts. 40–46): suplementar (reforça dotação, por lei ou autorização na LOA), especial (despesa sem dotação, por lei), extraordinário (urgente e imprevisível, por MP).
- **Restos a pagar**: o que foi empenhado e não pago passa para o ano seguinte e consome caixa.

### 4.5 Lei de Responsabilidade Fiscal (LC 101/2000)
- **Art. 14 — renúncia de receita**: exige estimativa de impacto em três exercícios e (a) demonstração de que foi considerada na LOA ou (b) medida de compensação por aumento de receita.
- **Arts. 16–17 — criação de despesa obrigatória continuada**: exige estimativa de impacto e compensação (aumento permanente de receita ou redução permanente de despesa).
- Descumprimento no jogo: risco jurídico (STF/TCU), risco de crime de responsabilidade e perda de credibilidade fiscal.

---

## 5. Regras tributárias

### 5.1 Anterioridade
| Tributo | Anterioridade anual (CF 150, III, b) | Noventena (CF 150, III, c) | Alteração por decreto |
| --- | --- | --- | --- |
| Imposto de Importação / Exportação | Não | Não | Sim (alíquotas) |
| IOF | Não | Não | Sim (alíquotas) |
| IPI | Não | Sim | Sim (alíquotas) |
| Imposto de Renda | Sim | Não | Não |
| Contribuições sociais (CF 195 §6º) | Não | Sim (90 dias) | Não |
| CIDE-combustíveis (redução e restabelecimento) | Não | Sim | Sim |
| CBS / IBS | Não (regra própria de transição; alíquota de referência fixada por resolução do Senado) | Sim | Não |
| Imposto Seletivo | Não | Sim | Não (alíquotas por lei ordinária) |

**Redução** de tributo pode valer de imediato; **aumento** respeita a tabela acima. MP que aumente impostos (exceto II, IE, IPI, IOF e extraordinário) só produz efeito no exercício seguinte se convertida em lei até o fim do ano (CF art. 62 §2º).

### 5.2 Reforma tributária sobre o consumo (EC 132/2023, LC 214/2025, alterada pela LC 227/2026) — verificado em 13/10/2026
Situação para o cenário de 2027 (fontes secundárias; reconferir o texto compilado antes da Fase 03):
- 2026: fase de teste da CBS e do IBS com alíquotas reduzidas.
- **2027: CBS cobrada integralmente (alíquota de referência estimada pela Fazenda em ~8,8%, com redutor de 0,1 p.p. em 2027–2028); PIS/Cofins extintos; IPI reduzido a zero, exceto para produtos da Zona Franca de Manaus; IBS simbólico de 0,1% (0,05% estadual + 0,05% municipal); início do Imposto Seletivo** (veículos, embarcações, aeronaves, fumo, bebidas alcoólicas e açucaradas, bens minerais, apostas), com alíquotas dependentes de lei ordinária ainda não aprovada — no jogo, a definição dessas alíquotas pode ser uma decisão do jogador em 2027.
- 2029–2032: transição gradual de ICMS/ISS para IBS.
- 2033: sistema novo integral.

Consequência de design: no cenário de 2027 a política "reduzir IPI" **não está disponível** como instrumento geral de estímulo.

---

## 6. Congresso no protótipo (0.1)

### 6.1 Blocos
O Congresso é simulado em **5 blocos ideológicos fictícios**. Cada bloco tem:

| Atributo | Descrição |
| --- | --- |
| `cadeirasCamara`, `cadeirasSenado` | distribuição inicial do cenário |
| `ideologia` | eixos econômico (estado ↔ mercado) e social (progressista ↔ conservador), de −1 a 1 |
| `coesao` | 0–1, fração que vota com a orientação do bloco |
| `relacaoGoverno` | −100 a 100 |
| `interesses` | regiões, setores e temas prioritários |
| `cargos` | ministérios ocupados pelo bloco |
| `liderInfluencia` | peso do líder na negociação |

Blocos padrão (nomes de trabalho): Esquerda, Centro-Esquerda, Centro, Centro-Direita e Direita. A distribuição de cadeiras do cenário de 2027 será calibrada com os resultados oficiais de 2026 (TSE), agregados em blocos (ver [DATA_SOURCES.md](DATA_SOURCES.md)).

### 6.2 Votação
Para cada bloco `b` e proposta `p`:
```
apoio_b = w_ideo * afinidade(ideologia_b, posicao_p)
        + w_rel * relacaoGoverno_b
        + w_int * beneficio_interesses_b(p)
        + w_neg * contrapartidas_b
        + w_opiniao * aprovacao_popular_na_base_b
        − w_custo * custo_eleitoral_b(p, meses_ate_eleicao)
votos_sim_b = cadeiras_b * [coesao_b * 1{apoio_b > limiar} + (1 − coesao_b) * prob(apoio_b)]
```
O sorteio usa a semente da campanha. Resultados possíveis: aprovação, rejeição, **alteração do texto** (o relator retira itens de menor apoio), **não pautar** (decisão do presidente da Casa) e **pedido de vista/adiamento**.

### 6.3 Pauta e negociação
- Os **presidentes da Câmara e do Senado** controlam a pauta. Uma relação ruim com eles atrasa propostas.
- Instrumentos de negociação: ministérios, cargos, priorização de emendas, alterações no texto, apoio em pautas do bloco. Cada contrapartida tem custo (fiscal, de imagem ou risco de escândalo).
- Tempo médio de tramitação por instrumento é parâmetro do cenário; PEC tende a levar vários meses.
- **Capacidade de pauta.** Cada Casa tramita no máximo `capacidade_pauta` propostas **prioritárias** do governo ao mesmo tempo (parâmetro do cenário; PEC e reformas grandes ocupam mais de uma vaga). Acima disso, as propostas excedentes ficam paradas até abrir vaga. É diferente das ações de agenda: as ações limitam o que o presidente **envia** no mês; a pauta limita o que **anda** ao mesmo tempo. Mandar duas reformas grandes juntas atrasa as duas.
- **Emendas como pedágio.** Em votações difíceis (PEC, quórum qualificado, base insuficiente), os líderes cobram liberação ou antecipação de emendas. A liberação não aumenta o limite de despesas: sai do espaço das discricionárias ([ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) §5.8), competindo com os programas e obras do próprio governo.

### 6.3.1 Ministérios: quadro técnico ou indicação partidária
Cada ministério relevante tem um ocupante com `origem`: **técnico/aliado** ou **indicação de bloco**.

| Efeito | Técnico/aliado | Indicação de bloco |
| --- | --- | --- |
| Apoio do bloco no Congresso | nenhum ganho direto | `relacaoGoverno_b ↑` e contrapartida em `apoio_b` (§6.2), proporcional ao peso da pasta |
| Execução do orçamento da pasta | `capacidade_adm` ↑ | `capacidade_adm` ↓ (parte do gasto rende menos) |
| Risco de escândalo | baixo | maior, cresce com o tempo no cargo |
| Agenda da pasta | segue o presidente | pode **travar** políticas contrárias à ideologia do bloco |

Todos os pesos são parâmetros a calibrar (Fase 04). Demitir um ministro de bloco custa capital político e piora a relação com o bloco.

### 6.4 Evolução
Fase 04: Câmara e Senado separadas e relatores (feito, §6.5). Comissões permanentes individuais e parlamentares individuais: Fase 09.

### 6.5 No motor (Fase 04, motor 0.4.0)
Parâmetros em `src/engine/economy/calibration.ts` (faixas testadas em [CALIBRATION.md](CALIBRATION.md)); o cenário define quem preside cada Casa e os ministérios (`institutions`).

| Regra | Como o motor aplica |
| --- | --- |
| Casas separadas | A proposta vota na Câmara e só depois vai ao Senado; o prazo esperado de tramitação é repartido (`fracao_tramitacao_camara`, mínimo de 1 mês em cada Casa). PEC vota os dois turnos da mesma Casa no mesmo mês (o interstício cabe no turno mensal). PLN tramita pela Comissão Mista e vota em sessão conjunta, contada por Casa, sem ocupar a pauta das Casas. Janeiro continua recesso. |
| Capacidade de pauta (§6.3) | Cada Casa tem `capacidade_pauta` vagas; PEC ocupa `vagas_pec`. Sem vaga, a proposta fica **parada** e entra quando abrir vaga (pauta vazia sempre aceita). As paradas têm prioridade, em ordem de criação, sobre as propostas enviadas no mês. |
| Relator | Sorteado ao entrar em cada Casa, com peso pelas cadeiras e peso extra para o bloco que preside a Casa. Se o bloco do relator não apoia o texto, ele o altera uma vez (escala `escala_alterada`; todos os blocos passam a apoiar mais, `bonus_texto_alterado`) e pode incluir **acréscimos estranhos ao projeto** (despesa extra, `custo_acrescimo` por `meses_acrescimo`), mais provável quando o relator é de bloco que cobra emendas. Na MP o relator só reduz o texto. |
| Presidência da Casa | Relação com o bloco que preside a Casa abaixo de `limiar_presidente_casa`: a cada votação marcada, chance `prob_nao_pautar` de adiar um mês. |
| Emendas como pedágio (§6.3) | Votação difícil (PEC, PLP ou "sim" esperado a menos de `folga_votacao_dificil` das cadeiras do exigido) sem emendas liberadas: chance `prob_adiamento_pedagio` de os líderes adiarem. Adiamentos por presidência e pedágio são limitados a `max_adiamentos` por Casa; depois, a votação acontece. |
| Negociação (ação de agenda, custo 1 cada) | **Negociar com um bloco** (apoio do bloco à proposta + `negociacao_apoio`, saturado; relação melhora; custa capital). **Liberar emendas** (todos apoiam mais, quem cobra emendas mais ainda; despesa `emendas_pedagio` por `emendas_meses` que sai das discricionárias, ECONOMIC_MODEL.md §5.8). **Ceder no texto** (escala × `escala_concessao`, todos apoiam mais). **Pedir urgência** (só PL e PLP, CF art. 64: votação em até 2 meses em cada Casa; o bloco que preside a Câmara não gosta). |
| Ministérios (§6.3.1) | Cada pasta tem peso e áreas de política. Indicação de bloco: apoio do bloco em todas as votações (`apoio_ministerio` × peso, saturado), relação melhora na nomeação; a política da pasta rende menos (`perda_execucao_partidaria` no capital público e nos ganhos de aprovação), atrasa se o bloco for ideologicamente contrário a ela (`atraso_ministerio_contrario`) e o risco mensal de escândalo cresce com os anos no cargo (`escandalo_base_mes`, `escandalo_por_ano`, saturado). O evento "Escândalo em ministério" só dispara com pasta de bloco, com probabilidade igual a esse risco; a resposta "Demitir" troca o indicado mais antigo por um técnico. Demitir indicado custa capital e a relação com o bloco. |
| Medida provisória (§3) | Vigência imediata; se não for convertida em 4 meses (120 dias), perde a eficácia e os efeitos param. A partir do 2º mês (mais de 45 dias) tranca a pauta da Casa em que está: as demais propostas dessa Casa esperam. |
| Ainda não modelado | Comissões permanentes, emendas de plenário, destaques, obstrução, recesso de julho, convocação extraordinária, CPIs, impeachment e TCU. |

---

## 7. Sanção e veto
1. Aprovado o projeto, o presidente tem **15 dias úteis** para sancionar ou vetar (no jogo: dentro do mesmo turno ou do seguinte). Silêncio = sanção tácita.
2. Veto parcial só pode abranger texto integral de artigo, parágrafo, inciso ou alínea.
3. O Congresso aprecia o veto em sessão conjunta; derrubada exige **maioria absoluta de cada Casa**.
4. Derrubada de veto = derrota política (capital político ↓).

**No motor (Fase 04):** aprovado no Congresso, o projeto fica **aguardando sanção** no mês seguinte; sem resposta, vale a sanção tácita. O jogador pode sancionar, vetar o projeto inteiro ou, quando o relator incluiu acréscimos, vetar só os acréscimos (o motor trata os acréscimos como dispositivos inteiros, então o veto parcial é sempre possível). O veto vai à sessão conjunta no mês seguinte; a derrubada exige maioria absoluta de cada Casa e depende do interesse dos blocos no texto, menos a lealdade ao governo (relação e pastas) e a popularidade do presidente. Veto derrubado: a lei (ou os acréscimos) entra em vigor e o capital cai; veto mantido rende um pouco de capital. **PEC** é promulgada pelas Mesas, sem sanção (CF art. 60 §3º); **MP** convertida segue em vigor sem nova sanção no motor.

---

## 8. Controle judicial e de contas (simplificado)

- **STF**: legitimados (partidos com representação no Congresso, governadores, Mesas, PGR, OAB, entidades de classe nacionais) podem propor ADI/ADPF. Cada medida tem um `riscoJuridico` (0–1) calculado a partir de flags (ex.: renúncia sem compensação, MP sem urgência, invasão de competência estadual). Probabilidade mensal de ação e de liminar suspendendo a medida = f(riscoJuridico, interesse dos legitimados).
- **TCU**: emite alertas sobre execução e contas. Parecer pela rejeição das contas aumenta o risco de impeachment e afeta a credibilidade. O julgamento das contas é feito pelo Congresso.
- **No motor (Fase 04):** o risco `judicializacao` da política, mais `risco_juridico_flag` por regra quebrada (gasto acima do limite, renúncia ou despesa sem compensação na LRF; também para políticas sem esse risco previsto), decide no início da execução se haverá ação no STF. Havendo, uma liminar suspende a execução de 1 a `liminar_lag_max` meses depois, por `suspensao_min_meses`–`suspensao_max_meses`; no julgamento a medida volta a valer ou é declarada inconstitucional (`prob_inconstitucional`, maior com regra quebrada). Os efeitos da janela suspensa são retirados da fila (ECONOMIC_MODEL.md §5.11). A janela e a derrubada valem também para os acréscimos do relator, que fazem parte da mesma lei. O TCU é modelado na Fase 07 (§9); indicações ao STF ainda não são modelados.
- **Indicações**: vagas no STF e na diretoria do BC surgem conforme calendário do cenário (no STF, pela aposentadoria compulsória aos 75 anos — EC 88/2015 e LC 152/2015 —, ou por evento); exigem aprovação do Senado (maioria absoluta para ministro do STF, CF art. 101; maioria simples em votação secreta após arguição para presidente e diretores do BC, CF art. 52, III, d ✔).
- **Diretoria do BC (LC 179/2021):** mandatos fixos de 4 anos, não coincidentes com o do presidente da República. O presidente do BC começa no 3º ano do mandato presidencial; os 8 diretores entram 2 por ano. No motor, a fração indicada pelo governo é 2/9, 4/9, 7/9 e 9/9 do 1º ao 4º ano, e as indicações são consideradas aprovadas pelo Senado. Ela determina quanto o BC cede à pressão pública (ECONOMIC_MODEL.md §5.4.1).

---

## 9. CPIs, TCU e investigações (Fase 07, v0.6.0)
- CPI: requerimento de **1/3 dos membros** da Casa (171 deputados ou 27 senadores), **fato determinado** e **prazo certo** (CF art. 58 §3º).
- **No jogo (PROVISORIO):** a CPI não sai de uma fórmula de escândalos; chega por **cadeia de eventos** (`followUps`, GAME_DESIGN.md §11.3.1). Uma reportagem sobre ministério de indicação partidária (condições: aprovação abaixo de 45% e pelo menos um ministério partidário; 10% por mês, uma vez a cada 18 meses no máximo duas) grava a marca `escandalo_denuncia`. Investigar internamente agenda a CPI com 35% em 2 meses; negar tudo (escolha padrão), com 60% em 1 mês. Ao chegar, o evento `fase07_inst_cpi_instalada` grava `cpi_instalada`.
- **Relatório final:** sorteado quando a pressão de impeachment passa de 15% (30%, uma vez, depois de 24 meses de intervalo). Negociar o texto ou enfrentá-lo grava `cpi_encerrada`; sem resposta, o relatório é aceito e grava `cpi_encerrada` e `cpi_relatorio_pesado`. Negociar agenda o pacto com 50% em 2 meses.
- **Pacto entre os Poderes:** só chega depois de `cpi_encerrada` e antes de qualquer denúncia de impeachment aceita. Aceitar o pacto (ou aceitá-lo com ressalvas, a padrão) apaga `escandalo_denuncia`; a versão cheia recupera relação com o Congresso, aprovação e capital político.
- **Marcas de CPI e escândalo:** `escandalo_denuncia`, `cpi_instalada`, `cpi_encerrada`, `cpi_relatorio_pesado`. A pressão de impeachment conta as marcas com prefixo `escandalo_` ou `cpi_` (até 4); ver ECONOMIC_MODEL.md §5.17 e o caveat abaixo.
- **TCU (contas):** o gasto acima do limite de despesas (`limitExcess` > 0) dá o **alerta do TCU** (30%, até 3 vezes, intervalo de 6 meses; grava `tcu_alerta`). Corrigir a execução contingencia custeio por seis meses; defender a execução (padrão) ou pedir prazo deixa o alerta virar **parecer** em 3 meses com 50% (sorteio único). O parecer pela rejeição grava `tcu_parecer_rejeicao` (sem resposta, é a escolha padrão) e pesa na credibilidade. O julgamento final das contas continua **fora**: o jogo não tem votação do Congresso sobre o parecer.
- **Contagem na pressão:** `cpi_instalada` e `cpi_encerrada` contam como uma CPI só; `cpi_relatorio_pesado` conta à parte (relatório desfavorável pesa mais).
- **Fora da Fase 07:** CPI com comissão própria, votos por bancada e convocações (Fase 09); efeito das CPIs sobre ministérios (demissão automática).

---

## 10. Impeachment (CF arts. 85–86; Lei 1.079/1950)
1. Denúncia por crime de responsabilidade aceita pelo presidente da Câmara.
2. Comissão especial → plenário: autorização exige **2/3 da Câmara (342 deputados)**.
3. Senado instaura o processo (maioria simples) → presidente **afastado por até 180 dias**.
4. Julgamento presidido pelo presidente do STF; condenação exige **2/3 do Senado (54 senadores)**; pena de perda do cargo e inabilitação por 8 anos.

**Modelo no jogo (Fase 07, v0.6.0; PROVISORIO).** A pressão é `impeachmentPressure`, um número em [0, 1] que vem de uma função logística de aprovação, relação com o Congresso, marcas de escândalo e CPI, excesso do limite de despesa e desemprego acima do neutro (ECONOMIC_MODEL.md §5.17). Ela não é votação: só alimenta as condições de três eventos encadeados, e o jogador vê a faixa no quadro de Instituições (GAME_DESIGN.md §11.3.1).

1. **Pedido** (`fase07_inst_pedido_impeachment`): pressão acima de 50%, com 25% por mês (uma vez, 24 meses de intervalo). A Presidência da Câmara decide a admissibilidade: negociar o arquivamento (grava `impeachment_arquivado`, custa relação com o Congresso) ou **enfrentar a denúncia**, que é a escolha padrão e grava `impeachment_denuncia_aceita`. Apelar ao STF também aceita a denúncia.
2. **Câmara** (`fase07_inst_impeachment_camara`): exige `impeachment_denuncia_aceita`; pressão acima de 55%, com probabilidade mensal de 0,6 × pressão (base 60% multiplicada pelo fator `impeachmentPressure`). Mobilizar a base e negociar votos (2 ações de agenda) arquiva o processo. Enfrentar no plenário encerra a etapa sem autorizar. **Deixar votar** (padrão) grava `impeachment_autorizado`.
3. **Senado** (`fase07_inst_impeachment_senado`): exige `impeachment_autorizado`; pressão acima de 60%, com probabilidade mensal de 0,5 × pressão (base 50% multiplicada pelo fator `impeachmentPressure`). Mobilizar a base no Senado (2 ações) arquiva. Resistir sem apoio e **aguardar o julgamento** (padrão) gravam `impeachment_condenado`.
4. **Condenação:** `campaignOutcome` (`src/engine/events/outcome.ts`) devolve `impeachment` quando a marca `impeachment_condenado` existe. A campanha termina como derrota (GAME_DESIGN.md §7.1), e o save guarda a marca.

**Marcas exatas da cadeia:** `impeachment_denuncia_aceita`, `impeachment_autorizado`, `impeachment_camara_votou`, `impeachment_senado_votou`, `impeachment_arquivado`, `impeachment_condenado`. Só chegam pela cadeia acima.

**Caveats (medidos em 48 e 240 meses, em [ROADMAP.md](ROADMAP.md) §8.2):**
- Quem não responde deixa a cadeia avançar: as três escolhas padrão levam à condenação. Medido com 20 sementes: em 48 meses, a cadeia só começa na estratégia fisiológica (denúncia em 11 de 20; condenação em 9 de 20). Em 240 meses, a estratégia inerte é condenada em 20 de 20 sementes, a partir do mês 161. A populista escapa em todas porque sempre escolhe a resposta de maior ganho de aprovação (arquivamento na Câmara), mas a pressão dela chega a cerca de 90% no mês 200 nas três sementes observadas, com o pico de 98,6% em 240 meses.
- A escolha "mobilizar a base no Senado" tem a descrição "se a base não estiver pronta, a escolha perde força", e o motor não verifica a base: ela arquiva sempre.
- A regra dos dois terços não é contada bancada por bancada: a escolha do jogador e a probabilidade fazem o papel dela.

**Fora da Fase 07:** o afastamento de até 180 dias (texto do evento, sem efeito mecânico); o presidente do STF no julgamento; crimes de responsabilidade além do excesso de limite de despesa; mobilização social como fator próprio; sucessão pelo vice (a condenação encerra a campanha).

---

## 11. Eleições (resumo; detalhamento na Fase 08)
- Eleições gerais em out/2030 (presidente, governadores, Senado 2/3, Câmara); municipais em out/2028 (afetam bases parlamentares e governadores aliados).
- 1º turno no primeiro domingo de outubro; 2º turno no último domingo de outubro, se nenhum candidato obtiver maioria absoluta dos votos válidos (CF art. 77).
- Reeleição para um único período subsequente (CF art. 14 §5º). ✔ 13/10/2026: a PEC 12/2022 (fim da reeleição, mandatos de 5 anos) foi aprovada na CCJ do Senado em mai/2025 e desmembrada, sem aprovação em plenário; mesmo pelo texto da CCJ, o presidente eleito em 2026 ainda poderia disputar a reeleição em 2030. Fica como parâmetro do cenário e candidata a evento/PEC dentro do jogo.
- Condutas vedadas (Lei 9.504/1997, art. 73): nos 3 meses anteriores à eleição ficam proibidas transferências voluntárias a estados e municípios (salvo obra em andamento e emergência), publicidade institucional e nomeações/demissões de servidores (com exceções); revisão geral de remuneração dos servidores acima da inflação é vedada a partir de 180 dias antes. Em ano eleitoral, programas sociais novos também são restringidos (art. 73 §10). ✔
- **No jogo:** durante **todo o ano eleitoral** (2030) fica bloqueada a criação de benefício gratuito novo, salvo calamidade, estado de emergência ou programa autorizado em lei e já em execução orçamentária no ano anterior (art. 73 §10). O jogador pode forçar a brecha da emergência (regra quebrável, §1.1): a medida passa, mas abre risco de ação na Justiça Eleitoral por abuso de poder, com efeito sobre a candidatura.

### 11.1 Ciclo do mandato (modelo de opinião)
O peso que o eleitor dá a cada coisa muda ao longo do mandato (parâmetros a calibrar, valores de partida abaixo):

| Fase | Meses (`monthIndex`) | Regra |
| --- | --- | --- |
| **Lua de mel** | 0–5 (jan–jun/2027) | Perda de aprovação por medidas impopulares reduzida (`fator_lua_de_mel` ≈ 0,6) e parte da culpa por indicadores ruins atribuída ao governo anterior. É a janela para medidas duras. |
| **Meio do mandato** | 6–38 | Regras normais; o custo de manter a coalizão sobe com o tempo. |
| **Pré-eleição** | 39–45 (abr–out/2030) | **Memória curta:** inflação de alimentos, desemprego e renda dos últimos 6 meses pesam mais na intenção de voto do que o desempenho acumulado (`peso_recente` ≈ 3×). Valem as vedações acima. |

Válido também para mandatos seguintes, contando a partir de cada posse.

### 11.2 Perfil ideológico do governo e alinhamento por UF (PR 4 do [PLANO_GLOBO.md](PLANO_GLOBO.md) §5.1)
Código em `src/engine/politics/` (`calibration.ts`, `alignment.ts`, `profile.ts`); estado `GameState.government.profile = { economic, social }` (v10). Eixos iguais aos de `Policy.position` e `Bloc.ideology`: econômico −1 estado … 1 mercado; social −1 progressista … 1 conservador. Parâmetros em `PROFILE_PARAMS` (valores `PROVISORIO`, faixa e justificativa por parâmetro; resumo em [CALIBRATION.md](CALIBRATION.md)).

- **Perfil inicial (D-G9).** Escolhido no NOVO JOGO entre seis posições nomeadas, sem partidos reais: Centro (0/0, padrão), Centro-esquerda (−0,3/−0,3), Esquerda (−0,7/−0,6), Centro-direita (0,3/0,3), Liberal (0,7/−0,2) e Conservador (0,2/0,7). É só o ponto de partida: não muda regras nem consome a semente. Saves anteriores à v10 migram com 0/0.
- **Como o perfil se move.** Média móvel com memória, **por decisão**: `perfil' = (1 − λ·peso·relevância)·perfil + λ·peso·relevância·(sinal·posição)`, com `λ = memoria_decisao` (0,12) e o λ efetivo limitado a `memoria_maxima` (0,5). Sanção, sanção tácita, ato do Executivo, conversão de MP, promulgação e sanção com veto aos acréscimos pesam 1; **proposta enviada** ao Congresso pesa `peso_proposta` (0,25); **veto total** pesa `peso_veto` (0,5) com o sinal trocado (o perfil anda para o lado oposto ao do projeto vetado); escolha de evento **do jogador** com `position` pesa `peso_evento` (0,75). Derrubada de veto, escolha padrão por falta de resposta e rotinas administrativas não movem o perfil. `Policy.salience` (padrão 1; 0 = não move) multiplica o peso. O resultado é sempre uma combinação convexa de pontos dos eixos: nunca sai de [−1, 1].
- **Registro.** `MonthReport.profileMoves` guarda as `movimentos_por_mes` (3) decisões de maior deslocamento do mês, com origem, tipo (`sancao`, `proposta`, `veto`, `evento`) e deslocamento por eixo. Fica no relatório (que o banco já guarda por mês) e não no estado, para o estado seguir enxuto.
- **Inclinação das UFs.** `lean: { economic, social }` por UF no cenário `brasil_2027_01_v080` ([DATA_SOURCES.md](DATA_SOURCES.md) §4.2, `PROVISORIO`). Cenários até a v0.7.0 não têm inclinação: o alinhamento não age neles e a simulação segue idêntica.
- **Efeito regional (redistribui).** `alinhamento = 1 − distância/(2√2)` entre o perfil e a inclinação da UF; desvio bruto de aprovação `k·tanh((alinhamento_UF − alinhamento médio ponderado pela população)/s)` com `k = alinhamento_regional_max` (0,04) e `s = alinhamento_regional_escala` (0,12). Entra como a causa "Alinhamento com o perfil do governo" (`alinhamento_perfil`) em `regiao.aprovacao`, junto das demais; a saturação `desvio_aprovacao_max` e a normalização à média nacional do ECONOMIC_MODEL.md §5.15 valem como antes, então a média ponderada das UFs continua igual à nacional (D7).
- **Efeito nacional (D-G10).** Eleitor mediano = média das inclinações das UFs ponderada pela população. O termo `eleitor_mediano_teto · tanh((d_neutra − d)/escala)`, com `d` a distância normalizada (0–1) entre o perfil e o mediano, vale no máximo ±2 p.p. de aprovação (estado estacionário; `eleitor_mediano_teto` = 0,02, `d_neutra` = 0,2, `escala` = 0,15) e entra como pressão mensal `ajuste_aprovacao × termo` na opinião pública, causa "Distância do eleitor médio". É ímpar em torno da distância neutra e igual para quaisquer posições à mesma distância do mediano: **nenhuma posição é premiada em si** (GAME_DESIGN.md §1).
- **Leituras para a interface.** `alignmentView` (alinhamento por UF, mediano, termo nacional) e `previewProfilePush` (para onde uma política empurra o perfil e quais UFs tendem a ganhar ou perder aprovação relativa; estimativa, também em `RegionalDecisionPreview.profilePush`).

---

## 12. Catálogo inicial de políticas (com instrumento e requisitos)

Este é o catálogo-semente. As 8 primeiras compõem o protótipo (ver [GAME_DESIGN.md](GAME_DESIGN.md) §11.2).

| # | Política | Área | Instrumento | Requisitos e restrições principais |
| --- | --- | --- | --- | --- |
| 1 | Crédito adicional para infraestrutura | Infraestrutura | PLN + execução | Espaço no limite do arcabouço ou corte compensatório; capacidade de execução |
| 2 | Redução do IOF sobre crédito | Economia | Decreto | Imediato; LRF art. 14 (compensação); efeito sobre o crédito e a arrecadação |
| 3 | Alteração da tabela e das deduções do IRPF | Tributação | PL ordinário | Anterioridade anual; LRF art. 14 se houver perda de receita. Partir da Lei 15.270/2025 (isenção até R$ 5 mil/mês, desconto até R$ 7.350 e imposto mínimo para rendas acima de R$ 600 mil/ano, em vigor desde jan/2026) ✔ |
| 4 | Contingenciamento de discricionárias | Fiscal | Decreto | Não atinge obrigatórias nem emendas impositivas além do limite legal |
| 5 | Ampliação de programa de transferência de renda | Social | PL / crédito adicional + regulamento | LRF arts. 16–17 se for despesa continuada; limite do arcabouço |
| 6 | Programa federal de segurança cooperativa | Segurança | PL ou MP + convênios | Adesão voluntária dos estados; competência estadual das polícias |
| 7 | Revisão de gastos tributários | Tributação | PL / PLP | Anterioridade se aumentar tributo; forte resistência setorial |
| 8 | Reforma administrativa | Estado | PEC + leis | 3/5 em dois turnos; efeitos de longo prazo |
| 9 | Concessões de rodovias e ferrovias | Infraestrutura | Atos + leilões (lei existente) | Estudos, TCU, licenciamento; receita de outorga |
| 10 | Ampliação da atenção primária | Saúde | Portaria + transferências fundo a fundo | Adesão dos municípios; mínimo constitucional |
| 11 | Expansão do ensino técnico | Educação | PL / programa + convênios | Estados ofertam ensino médio; maturação longa |
| 12 | Alfabetização na idade certa | Educação | Programa + transferências | Execução municipal |
| 13 | Saneamento básico (apoio a concessões) | Infraestrutura | Linhas de crédito + atos | Titularidade municipal/regional |
| 14 | Fiscalização ambiental reforçada | Meio ambiente | Ato + orçamento | Capacidade operacional; efeito sobre desmatamento e agro |
| 15 | Leilão de energia renovável | Energia | Atos regulatórios | Calendário do setor elétrico |
| 16 | Reajuste dos servidores federais | Fiscal | PL (iniciativa privativa) | Limite do arcabouço; gatilhos se a meta foi descumprida |
| 17 | Mudança na regra do salário mínimo | Social/Fiscal | PL | Indexa previdência e BPC; impacto fiscal elevado |
| 18 | Reforma da previdência (parâmetros) | Fiscal | PEC + leis | 3/5; alto custo político; efeito de décadas |
| 19 | Desoneração setorial temporária | Indústria | PL / MP | LRF art. 14; contribuições sociais: noventena |
| 20 | Crédito extraordinário para calamidade | Emergência | MP | Somente com evento de calamidade ativo |

---

## 13. Parâmetros institucionais do cenário

Ficam em `src/data/scenarios/<cenario>/institutions.json`:
quórums, cadeiras, prazos de tramitação esperados, calendário do Copom, calendário legislativo, regras fiscais (limites, bandas, gatilhos), regras tributárias de anterioridade, regra de reeleição, mínimos constitucionais, calendário eleitoral.

---

## 14. Fontes jurídicas
- Constituição Federal de 1988 e ADCT — planalto.gov.br
- LC 101/2000 (LRF), LC 179/2021 (autonomia do BC), LC 200/2023 (Regime Fiscal Sustentável), LC 214/2025 (regulamentação da reforma tributária)
- EC 111/2021 (data de posse), EC 132/2023 (reforma tributária)
- Lei 4.320/1964 (normas de orçamento), Lei 1.079/1950 (crimes de responsabilidade), Lei 9.504/1997 (eleições)
- Regimentos Internos da Câmara, do Senado e Comum do Congresso Nacional

Antes da Fase 04, cada item ⚠ deve ser conferido no texto compilado vigente e a data de verificação deve ser registrada em [DATA_SOURCES.md](DATA_SOURCES.md).
