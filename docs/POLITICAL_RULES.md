# Brasil Simulator — Regras Políticas e Institucionais

Versão 0.2 do documento • 13/10/2026 • ✅ Revisado pelo autor em 13/10/2026 (fidelidade por dificuldade e quebra de regras com consequências, §1.1) • v0.2: capacidade de pauta, ministérios técnicos ou partidários, emendas como pedágio, ciclo do mandato • v0.3 (Fase 04): regras aplicadas pelo motor 0.4.0 (§6.5, §7, §8) • v0.4 (Fase 05): governadores e adesão a convênios no motor (§2.1) • v0.5 (27/10/2026, Fase C6a do [PLANO_CAMPANHA.md](PLANO_CAMPANHA.md)): diretorias de estatais (§6.3.2), motor 0.10.0 • v0.6 (27/10/2026, Fase C6b): casos de escândalo graduais (§9.1), motor 0.11.0 • v0.7 (27/10/2026, Fase C6e): gaveta do impeachment (§10.1), motor 0.12.0

> **Natureza deste documento.** Resume regras da Constituição Federal (CF) e de leis federais para orientar a simulação. **Não é orientação jurídica.** Cada regra tem a fonte indicada. Itens marcados com ⚠ devem ser revalidados na legislação vigente antes da Fase 04, porque podem ter mudado ou depender de regulamentação recente.
>
> Todas as regras ficam em **parâmetros de cenário**: uma PEC aprovada dentro do jogo, ou um cenário histórico, pode alterá-las.

---

## 1. Princípios da simulação institucional

1. O presidente **propõe e executa**; outras instituições **decidem** por conta própria.
2. Toda ação passa por validação de **competência → instrumento → requisitos → financiamento**.
3. Atores autônomos simulados: Câmara, Senado, partidos/blocos, presidentes das Casas, Banco Central, STF (simplificado), TCU (simplificado), governadores, mercado e opinião pública.
4. Quando a ação é inválida, o jogo explica o motivo e indica o instrumento correto.

### 1.1 Regras institucionais e assistência

A escolha institucional é independente do desafio. **Brasileiras** aplica os mecanismos existentes de anterioridade, noventena, riscos da LRF, recesso, vedação eleitoral e adesão estadual; não significa que todos os procedimentos legais já estejam simulados. **Simplificadas**, explicitamente fictícias, dispensam essas restrições, eliminam a dívida de campanha na posse e não oferecem caixa 2. O jogador escolhe separadamente clareza da informação e dicas.

**Quebra de regras é permitida, com consequências.** Ações que violam a LRF, o arcabouço, a anterioridade ou a competência de outro ente não são bloqueadas de forma absoluta (exceto o fisicamente impossível, como votar sem quórum). O jogo mostra um **aviso explícito com os riscos** e, se o jogador confirmar, a ação segue marcada com flags de irregularidade que alimentam:
- `riscoJuridico` (ADI/ADPF e liminares do STF, §8);
- alertas e parecer do TCU pela rejeição das contas (§8);
- `pressaoImpeachment` como possível crime de responsabilidade (§10);
- credibilidade fiscal e prêmio de risco (ECONOMIC_MODEL.md §5.5).

Nas regras brasileiras, a quebra modelada continua sujeita às consequências descritas. As regras simplificadas não representam o processo institucional brasileiro.

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
| Adesão a convênios | Política com a condição `adesao_estadual` (hoje, a cooperação em segurança): no início da execução cada estado adere com probabilidade `adesao_base + adesao_relacao × relação/100`. O gasto e o capital público alcançam só a população dos estados que aderiram e são repartidos só entre eles; substitui o risco genérico de baixa adesão. Nas regras simplificadas todos aderem. A mesa de despacho mostra a adesão esperada. |
| Visita presidencial | Ação de agenda (custo 1, uma por estado por mês): aprovação local `aprovacao_visita` por `meses_visita` meses e `relacao_visita` pontos com o governador. Não muda a aprovação nacional. Enquanto o efeito local dura, a UF visitada ganha um pin de visita no mapa (PR 13; tocar abre o cartão da UF). |
| Resposta federal à emergência climática (PR 13) | Numa UF em cheia ou seca prolongada **com prevenção ativa nela** (obra de segurança hídrica ou de drenagem em andamento ou pronta, ou dotação da Defesa Civil), a relação com o governador sobe até `prevencao_relacao_max` pontos no mês, proporcional à severidade e à proteção (menos que a visita; volta à meta sozinha). Sem prevenção, nada. A prevenção em si é política comum: os projetos são projetos de lei (votação dos blocos pela `position`, negociação e capital político, §6) e a rotina da Defesa Civil é ato executivo com dotação. Modelo em [ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) §5.21. |
| Obras no mapa (PR 13) | Obra da carteira (projeto) só ganha pin em UF que a **política cita** no escopo regional (`regional.scope`); obra nacional ou de macrorregião não tem pin e nenhuma coordenada é inventada. O pin fica na âncora da UF, só enquanto a obra está em andamento. |
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

O painel de planejamento mostra o período previsto de PPA e os prazos federais de envio ao Congresso, em regras associadas aos cenários brasileiros (`federal_2027_v1`). O calendário é informativo: ainda não registra a aprovação das leis, não autoriza despesas e não implementa a tramitação do ciclo. Fonte: [Constituição e ADCT, art. 35 §2º](https://www.planalto.gov.br/ccivil_03/constituicao/constituicaocompilado.htm).

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

### 5.3 Mudança de tributo no motor (onda R3 do plano de expansão, motor 0.16.0)
Validado no esquema de política (`src/types/policy.ts`): conteúdo que viola a regra não carrega, então o presidente não executa tributo ilegal por decisão própria.

| Regra | Como o jogo aplica |
| --- | --- |
| Competência | Política com canal tributário (`receita_*`, `desoneracao_*`) só com `competence: federal`. Tributo de estado ou município (ICMS, ISS, ITCMD, IPTU) exige acordo federativo e fica fora das decisões da União. |
| Instrumento | Lei (PL, PLP, MP, PEC) ou, nos impostos regulatórios, decreto de alíquota (§5.1). Decreto regulamentar ou portaria não mexem em tributo. |
| Anterioridade | Aumento por lei declara `anterioridade_anual` ou `noventena` (tabela do §5.1); a execução adia a receita (`proposals.ts`). Desoneração pode valer de imediato. |
| Fases | Reforma em fases é uma política com mais de um impacto de receita, cada um com sua defasagem; o parecer da Fazenda lista as fases antes da anterioridade. |
| Composição | O cenário reparte cada grupo de receita em tributos por fase legal (`Scenario.taxation`); cada fase soma 100% do grupo, então tributo antigo e novo nunca arrecadam em dobro. A transição ICMS/ISS → IBS (§5.2) aparece como calendário, fora do caixa da União. |

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
| Execução do orçamento da pasta | Capacidade depende das competências do indicado | Capacidade depende das competências do indicado |
| Risco de escândalo | baixo | maior, cresce com o tempo no cargo |
| Agenda da pasta | segue o presidente | pode **travar** políticas contrárias à ideologia do bloco |

Todos os pesos são parâmetros a calibrar (Fase 04). Demitir um ministro de bloco custa capital político e piora a relação com o bloco.

### 6.3.2 Diretorias de estatais (Fase C6a do PLANO_CAMPANHA, motor 0.10.0)
Cargos de segundo escalão em estatais e bancos públicos, **genéricos e fictícios** ("estatal de energia", "banco público", "estatal de obras", "banco público de habitação"; `FICTICIO`, sem estatal real; [PLANO_CAMPANHA.md](PLANO_CAMPANHA.md) §5.3). Cada diretoria do cenário (`institutions.directorates`) é um cargo, vinculado a um ministério, com peso e ocupante: **técnico** ou **indicação de bloco**, como as pastas (§6.3.1). Os requisitos legais de nomeação em estatais não são modelados (simplificação: a verificar antes de qualquer regra que dependa deles).

| Regra | Como o motor aplica |
| --- | --- |
| Cargos limitados | Uma vaga por diretoria do cenário (4 no cenário padrão, todas técnicas no início). A troca é a ação de agenda `nomear_diretoria` (custo 1, params `directorateId` e `occupant`), processada na etapa do gabinete, na ordem das decisões. Não há vaga extra nem acúmulo. |
| Efeito político | O bloco que recebe a diretoria melhora a relação (`relacao_nomeacao_diretoria` × peso) e passa a apoiar o governo em todas as votações (`apoio_diretoria` × peso), **somado** ao apoio das pastas sob o mesmo teto (`apoio_ministerio_max`). |
| Custo de substituição | Tirar a diretoria de um bloco custa capital (`capital_demissao_diretoria`) e a relação com ele (`relacao_demissao_diretoria` × peso), para outro bloco ou para o quadro técnico. |
| Risco | Diretoria técnica não tem risco. A de bloco segue a regra das pastas (`escandalo_base_mes` + `escandalo_por_ano` × anos no cargo, × peso, saturada em `escandalo_max_mes`), × `fator_porteira_fechada` quando o mesmo bloco ocupa o ministério ao qual a diretoria se vincula ("porteira fechada"). O risco agregado é 1 − Π(1 − p). |
| Escândalo, com causa | O evento "Escândalo em diretoria de estatal" só é elegível com diretoria de bloco (sem ela, não consome o sorteio) e dispara com probabilidade igual ao risco agregado. No disparo, o motor **congela o alvo** (`PendingEvent.subjectId`): a diretoria de maior risco (empate: a há mais tempo no cargo). O relatório do mês diz a causa: a diretoria, o bloco, o tempo no cargo e se a porteira está fechada. "Afastar" devolve **essa** diretoria ao quadro técnico, com o custo de substituição; se ela já mudou de mãos, não faz nada. |
| Sistema desligado | Sem `institutions.directorates` no cenário, nada muda. O estado só ganha `congress.directorates` na primeira troca, então o jogo sem trocas é idêntico com o sistema ligado ou desligado (teste de regressão). |
| Para a Fase C6b | `directorateScandalChance`, `directorateScandalRisk` e `riskiestDirectorate` são o risco que a C6b (escândalos graduais) vai consumir. Nenhuma marca é gravada nesta fase. |

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
| Ministérios (§6.3.1) | Cada pasta tem peso e áreas de política. Indicação de bloco: apoio do bloco em todas as votações (`apoio_ministerio` × peso, saturado), relação melhora na nomeação; a execução depende da competência do indicado, independentemente da origem, e atrasa se o bloco for ideologicamente contrário à política (`atraso_ministerio_contrario`). O risco mensal de escândalo ainda cresce com os anos no cargo (`escandalo_base_mes`, `escandalo_por_ano`, saturado). O evento "Escândalo em ministério" só dispara com pasta de bloco, com probabilidade igual a esse risco; a resposta "Demitir" troca o indicado mais antigo por um técnico. Demitir indicado custa capital e a relação com o bloco. |
| Medida provisória (§3) | Vigência imediata; se não for convertida em 4 meses (120 dias), perde a eficácia e os efeitos param. A partir do 2º mês (mais de 45 dias) tranca a pauta da Casa em que está: as demais propostas dessa Casa esperam. |
| Ainda não modelado | Comissões permanentes, emendas de plenário, destaques, obstrução, recesso de julho, convocação extraordinária, CPIs, impeachment e TCU. |

---

## 7. Sanção e veto
1. Aprovado o projeto, o presidente tem **15 dias úteis** para sancionar ou vetar (no jogo: dentro do mesmo turno ou do seguinte). Silêncio = sanção tácita.
2. Veto parcial só pode abranger texto integral de artigo, parágrafo, inciso ou alínea.
3. O Congresso aprecia o veto em sessão conjunta; derrubada exige **maioria absoluta de cada Casa**.
4. Derrubada de veto = derrota política (capital político ↓).

**No motor (Fase 04):** aprovado no Congresso, o projeto fica **aguardando sanção** no mês seguinte; sem resposta, vale a sanção tácita. O jogador pode sancionar, vetar o projeto inteiro ou, quando o relator incluiu acréscimos, vetar só os acréscimos (o motor trata os acréscimos como dispositivos inteiros, então o veto parcial é sempre possível). O veto vai à sessão conjunta no mês seguinte; a derrubada exige maioria absoluta de cada Casa e depende do interesse dos blocos no texto, menos a lealdade ao governo (relação e pastas) e a popularidade do presidente. Veto derrubado: a lei (ou os acréscimos) entra em vigor e o capital cai; veto mantido rende um pouco de capital. **PEC** é promulgada pelas Mesas, sem sanção (CF art. 60 §3º); **MP** convertida segue em vigor sem nova sanção no motor.

### 7.1 Pauta-bomba (Fase C6c do PLANO_CAMPANHA)
Projeto de aumento de despesa ou de renúncia aprovado pelo Congresso **por iniciativa própria**, contra o governo. Textos genéricos e fictícios (`FICTICIO`), com valores de ordem de grandeza. Antes desta fase não havia nenhum evento com aumento aprovado pelo Congresso nem escolha entre vetar e sancionar (verificação C0.5 do plano); os vizinhos (pauta travada, obstrução, liminar do STF, greve de servidores) continuam como estão.

| Regra | Como o motor aplica |
| --- | --- |
| Textos | Os do cenário (`institutions.fiscalBombs`): no padrão, reajuste extra de carreiras do serviço público (despesa obrigatória, cerca de R$ 12 bi/ano) e desoneração ampliada da folha de setores (renúncia, cerca de R$ 15 bi/ano), ambos sem compensação e com perda de credibilidade fiscal. Ficam fora do catálogo do jogador. Cada texto chega no máximo uma vez, na ordem do cenário. |
| Quem propõe | O bloco com maior apoio à **derrubada de um veto** ao texto (afinidade e interesse menos a lealdade ao governo, a mesma conta da sessão do veto). |
| Quando chega | Só com a relação média com o Congresso abaixo de `bomba_relacao_limite`, fora de janeiro (recesso) e pelo menos `bomba_intervalo_meses` depois da anterior. Chance mensal `bomba_chance_por_ponto` × distância ao limite, até `bomba_chance_max`. Sorteio **por chave** (não consome o PRNG principal). |
| Sanção e veto | O texto chega já aprovado, **aguardando sanção** no mês seguinte, e segue o caminho deste §7: sem resposta, sanção tácita; o veto total vai à sessão conjunta, onde a derrubada exige maioria absoluta de cada Casa (veto derrubado custa capital; mantido rende um pouco). O cartão de sanção diz quem propôs e quanto custa. |
| Impacto fiscal | Executado, o custo entra pelos canais da política (ECONOMIC_MODEL.md §5.11): `despesa_obrigatoria` ou `desoneracao_renda` em R$ milhões/ano ÷ PIB nominal, permanente; com o limite de despesas fixo, a despesa obrigatória comprime as discricionárias. A regra de compensação da LRF (§4.5) vale como para qualquer política sem compensação. |
| Sistema desligado | Sem `institutions.fiscalBombs`, nada muda. Ligado, o jogo é idêntico até a primeira chegada (teste de regressão); numa partida sem decisões a relação média cai abaixo do limite e a pauta-bomba chega no 1º ano. |

---

## 8. Controle judicial e de contas (simplificado)

- **STF**: legitimados (partidos com representação no Congresso, governadores, Mesas, PGR, OAB, entidades de classe nacionais) podem propor ADI/ADPF. Cada medida tem um `riscoJuridico` (0–1) calculado a partir de flags (ex.: renúncia sem compensação, MP sem urgência, invasão de competência estadual). Probabilidade mensal de ação e de liminar suspendendo a medida = f(riscoJuridico, interesse dos legitimados).
- **TCU**: emite alertas sobre execução e contas. Parecer pela rejeição das contas aumenta o risco de impeachment e afeta a credibilidade. O julgamento das contas é feito pelo Congresso.
- **No motor (Fase 04):** o risco `judicializacao` da política, mais `risco_juridico_flag` por regra quebrada (gasto acima do limite, renúncia ou despesa sem compensação na LRF; também para políticas sem esse risco previsto), decide no início da execução se haverá ação no STF. Havendo, uma liminar suspende a execução de 1 a `liminar_lag_max` meses depois, por `suspensao_min_meses`–`suspensao_max_meses`; no julgamento a medida volta a valer ou é declarada inconstitucional (`prob_inconstitucional`, maior com regra quebrada). Os efeitos da janela suspensa são retirados da fila (ECONOMIC_MODEL.md §5.11). A janela e a derrubada valem também para os acréscimos do relator, que fazem parte da mesma lei. O TCU é modelado na Fase 07 (§9); indicações ao STF ainda não são modelados.
- **Indicações**: vagas no STF e na diretoria do BC surgem conforme calendário do cenário (no STF, pela aposentadoria compulsória aos 75 anos — EC 88/2015 e LC 152/2015 —, ou por evento); exigem aprovação do Senado (maioria absoluta para ministro do STF, CF art. 101; maioria simples em votação secreta após arguição para presidente e diretores do BC, CF art. 52, III, d ✔).
- **STF no motor:** ver §8.1 (Fase C6d).
- **Diretoria do BC (LC 179/2021):** mandatos fixos de 4 anos, não coincidentes com o do presidente da República. O presidente do BC começa no 3º ano do mandato presidencial; os 8 diretores entram 2 por ano. No motor, a fração indicada pelo governo é 2/9, 4/9, 7/9 e 9/9 do 1º ao 4º ano e 9/9 em todo o 2º mandato do mesmo presidente (correção da Fase C6f do [PLANO_CAMPANHA.md](PLANO_CAMPANHA.md), ECONOMIC_MODEL.md §5.4.2), e as indicações são consideradas aprovadas pelo Senado. Ela determina quanto o BC cede à pressão pública (ECONOMIC_MODEL.md §5.4.1).

### 8.1 STF: vaga, indicação e aprovação (Fase C6d do PLANO_CAMPANHA, motor 0.10.0)
Três passos **separados**, e a decisão judicial (ADI e liminar, acima) continua como estava: quem o governo indicou não muda a chance nem a duração de uma liminar nesta fase.

| Passo | Como o motor aplica |
| --- | --- |
| Vaga | Abre no mês do **calendário do cenário** (`institutions.supremeCourt.vacancies`, `FICTICIO`): no padrão, uma por aposentadoria compulsória no mês 14 e uma por saída antecipada no mês 33. O estado **não guarda idade** de ministro (a regra dos 75 anos, EC 88/2015 e LC 152/2015, aparece só como motivo da vaga); vaga por evento fica para depois. O estado ganha `court` só quando a primeira vaga abre. |
| Indicação | Ação de agenda `indicar_ministro_stf` (custo 1, params `vacancyId` e `profile`): **jurista de carreira** ou **aliado do governo**. Só numa vaga aberta; a vaga fica em sabatina. |
| Aprovação | Sabatina e votação no plenário do Senado no mês seguinte, por **maioria absoluta** (41 de 81, CF art. 101 parágrafo único). O apoio de cada bloco é o das votações (relação com o governo, pastas, popularidade e o bônus do Casual), mais o termo do perfil: o jurista tem apoio próprio (`stf_apoio_jurista`); o aliado depende da afinidade do bloco com o perfil ideológico do governo (`w_ideo`), mais `stf_apoio_aliado`. Um sorteio de apoio por bloco, como nas demais votações. |
| Resultado | Aprovada: vaga preenchida e `stf_capital_aprovada`. Rejeitada: `stf_capital_rejeitada` e a vaga volta a ficar aberta para nova indicação. |
| Interface | Cartão "Supremo Tribunal Federal" no Congresso: as vagas, a previsão de votos de cada perfil antes de indicar e a última votação. |

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

### 9.1 Casos de escândalo graduais (Fase C6b do PLANO_CAMPANHA, motor 0.11.0)
Ficção (`FICTICIO`): o caso atinge o **indicado do bloco** numa diretoria de estatal (§6.3.2), não a Presidência. O jogo não descreve procedimento ilícito; não há ação ilegal do jogador nesta fase (D-C3 continua em aberto para a Camada 3).

| Regra | Como o motor aplica |
| --- | --- |
| Gatilho | O escândalo em diretoria (§6.3.2) abre um caso em **investigação** sobre a diretoria e o bloco congelados no disparo, e grava a marca `escandalo_investigacao`. Ligado por `institutions.scandalCases` no cenário (exige diretorias). |
| Etapas | `investigacao` → `acusacao` → `condenacao`, ou `arquivado`. A **condenação só vem depois de uma acusação**, nunca direto da investigação (invariante), e cada etapa dura pelo menos `caso_meses_min` meses. |
| Descoberta | Mesma especificação de perigo do caixa 2 (Fase C3): exposição E_t = δ·E_{t−1} + volume_t (`caso_decaimento`), com volume 1 enquanto o bloco do caso segue no cargo e 0 depois; perigo de avançar h = min(`caso_perigo_max`, 1 − e^(−`caso_lambda`·E)). Um sorteio por caso e por mês, **por chave** (não consome o PRNG principal). |
| Arquivamento | Exposição abaixo de `caso_arquivamento` arquiva o caso (em investigação ou acusação). Afastar o indicado corta o volume: a exposição cai mês a mês e o caso tende a ser arquivado. |
| Defesa | Ação de agenda `defender_caso` (custo 1, params `caseId`): reduz o perigo do mês em `caso_defesa` e custa capital (`capital_defesa_caso`). Não arquiva sozinha. |
| Acusação | Marca `escandalo_acusacao`, aprovação `caso_aprovacao_acusacao` por 2 meses e, com chance `caso_prob_cpi` (sorteio por chave), agenda a CPI existente (`fase07_inst_cpi_instalada`) para o mês seguinte (a CPI continua com no máximo uma ocorrência). |
| Condenação | Marca `escandalo_condenacao`, aprovação `caso_aprovacao_condenacao` por 3 meses e o condenado sai do cargo (volta ao quadro técnico; o bloco perde a diretoria e piora a relação, sem custo de capital). |
| Pressão de impeachment | As três marcas têm prefixo `escandalo_` e entram na contagem existente (§10), cada uma uma vez. A cadeia de impeachment segue a única via de condenação da Presidência. |
| Para a Fase C6e | As marcas acima e `GameState.cases` são o que a gaveta do impeachment vai consumir. |

#### 9.1.1 Fato, prova e desfecho (onda R3 do plano de expansão, motor 0.16.0)
A R3 separa o que aconteceu, o que se provou e a pressão pública, e substitui as linhas "Etapas", "Arquivamento", "Defesa" e "Condenação" da tabela acima onde houver conflito.

| Regra | Como o motor aplica |
| --- | --- |
| Fato latente | `irregular`, sorteado uma vez na abertura, por chave, com chance `caso_prob_irregular` igual para qualquer ocupante e bloco. Nada o altera depois, e a interface não o lê. Indicação partidária aumenta a exposição a escândalo (§6.3.2), não a chance de culpa. |
| Prova | `evidence` (0–1) anda a cada mês uma fração (`caso_descoberta`) da distância até o que os fatos sustentam: 1 se houve irregularidade, `caso_prova_teto_indicios` se não houve. A interface mostra só a faixa (indícios fracos, moderados, fortes). |
| Auditoria da CGU | Ação `fiscalizar_caso` (custo 1, params `caseId`): no mês, a fração sobe para `caso_descoberta_auditoria` e, sem irregularidade, o alvo vira 0 (a auditoria esclarece). Custa relação com o bloco investigado (`relacao_auditoria_caso`). Fiscalizar mais descobre mais; não cria irregularidade. |
| Acusação | Além do perigo do mês, exige prova ≥ `caso_prova_acusacao`. Como o teto dos indícios fica acima desse limiar, inocente pode ser acusado. |
| Julgamento | Toda acusação vai a julgamento (perigo mínimo `caso_perigo_julgamento`). Prova ≥ `caso_prova_condenacao`: **condenação judicial** (marca `escandalo_condenacao`, sai do cargo). Prova ≥ `caso_prova_sancao`: **sanção administrativa** da CGU (sai do cargo, `caso_aprovacao_sancao`, sem marca de condenação). Abaixo: **absolvição por falta de provas**, inclusive de quem cometeu a irregularidade. |
| Rumor não condena | O teto dos indícios fica abaixo do limiar de sanção em qualquer ponto das faixas calibradas; o invariante recusa `condenacao` ou `sancao` sem irregularidade real. |
| Defesa | `defender_caso` contesta no mês uma fração `caso_defesa` da prova usada na decisão. Não muda o fato nem a prova acumulada e não reduz mais o perigo. |
| Arquivamento | Só na investigação: exposição abaixo de `caso_arquivamento` **e** indícios abaixo do limiar de acusação (investigação inconclusiva). |
| Responsabilidade | O caso atinge o indicado; a Presidência só sente o custo político (aprovação, CPI, pressão de impeachment pelas marcas). |

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

### 10.1 Gaveta do impeachment (Fase C6e do PLANO_CAMPANHA, motor 0.12.0)
Pedidos de impeachment se acumulam na Câmara, e quem decide é a presidência da Casa (`housePresidents.camara`), como no passo 1 acima. A gaveta **só alimenta o 1º passo da cadeia**: ela nunca grava marca de impeachment, e a autorização e a condenação continuam só pelos eventos de §10.

| Regra | Como o motor aplica |
| --- | --- |
| Acúmulo | Um pedido por marca de escândalo gravada no mês (Fase C6b: `escandalo_investigacao`, `escandalo_acusacao`, `escandalo_condenacao`) e, por sorteio com chave, um pedido com chance `gaveta_pedido_pressao` × pressão de impeachment. |
| Descarte | Presidência aliada (relação ≥ `gaveta_relacao_arquivo`) arquiva os pedidos com mais de `gaveta_meses_arquivo` meses. O governo pode **negociar** (ação `negociar_gaveta`, custo 1): arquiva o pedido mais antigo, custa `capital_negociar_gaveta` e melhora a relação com o bloco que preside a Casa (`relacao_negociar_gaveta`). |
| Abertura | Presidência hostil (relação < `gaveta_relacao_abertura`), pressão ≥ `gaveta_pressao_abertura` (a mesma do evento de pedido) e a cadeia ainda sem pedido: com chance `gaveta_chance_abertura`, abre o pedido mais antigo e **agenda o evento de pedido** (`fase07_inst_pedido_impeachment`) para o mês seguinte, pelo caminho dos encadeados (a chegada confere as condições e as marcas do evento). Entre a abertura e a chegada, o sorteio próprio do evento continua valendo. |
| Sorteios | Por chave (`gaveta`, mês): não consomem o PRNG principal. |
| Sistema desligado | Sem `institutions.impeachmentDrawer`, nada muda. Ligado, a gaveta só aparece no estado e nas notas até a primeira abertura (teste de regressão). |

**Fora da Fase 07:** o afastamento de até 180 dias (texto do evento, sem efeito mecânico); o presidente do STF no julgamento; crimes de responsabilidade além do excesso de limite de despesa; mobilização social como fator próprio; sucessão pelo vice (a condenação encerra a campanha).

---

## 11. Eleições (resumo; detalhamento na Fase 08)
- Eleições gerais em out/2030 (presidente, governadores, Senado 2/3, Câmara); municipais em out/2028 (afetam bases parlamentares e governadores aliados).
- 1º turno no primeiro domingo de outubro; 2º turno no último domingo de outubro, se nenhum candidato obtiver maioria absoluta dos votos válidos (CF art. 77).
- Reeleição para um único período subsequente (CF art. 14 §5º). ✔ 13/10/2026: a PEC 12/2022 (fim da reeleição, mandatos de 5 anos) foi aprovada na CCJ do Senado em mai/2025 e desmembrada, sem aprovação em plenário; mesmo pelo texto da CCJ, o presidente eleito em 2026 ainda poderia disputar a reeleição em 2030. Fica como parâmetro do cenário e candidata a evento/PEC dentro do jogo.
- Condutas vedadas (Lei 9.504/1997, art. 73): nos 3 meses anteriores à eleição ficam proibidas transferências voluntárias a estados e municípios (salvo obra em andamento e emergência), publicidade institucional e nomeações/demissões de servidores (com exceções); revisão geral de remuneração dos servidores acima da inflação é vedada a partir de 180 dias antes. Em ano eleitoral, programas sociais novos também são restringidos (art. 73 §10). ✔
- **No jogo (simplificação):** a lei veda o benefício gratuito novo durante todo o ano eleitoral (art. 73 §10); o motor aplica a vedação só nos **3 meses antes de cada pleito** (`VEDACAO_MESES = 3`): meses 18–20 antes da municipal (mês 21) e 42–44 antes da geral (mês 45), e de novo no 2º mandato ([src/engine/elections/vedacao.ts](../src/engine/elections/vedacao.ts)). Conta como benefício novo a política com impacto positivo em transferências, despesa obrigatória ou salário mínimo real; a política é recusada com o motivo `vedacao_eleitoral`. O jogador pode forçar a brecha da emergência (`vedacao_bypass`, regra quebrável, §1.1): a medida passa, mas paga pena na intenção de voto e risco de multa por abuso de poder. As regras simplificadas não aplicam a vedação. As demais condutas vedadas acima (transferências voluntárias, publicidade, nomeações) não são modeladas.

### 11.0 Finanças antes da posse (PLANO_CAMPANHA.md Fase C3)

A corrida dispõe de caixa simples ou de três bolsos configurados pelo cenário. Quantias são R$ mil inteiros; gastos contratados contam para um teto global e as decisões disputam saldo na ordem enviada. Aporte pessoal é limitado pela liquidez e pelo limite do cenário, que não supera 10% do teto; repasses futuros e arrecadação só entram no turno previsto. Doações são agregadas: o jogo não representa rendimentos nem verifica limites de doadores individuais. Repasses, riscos e custos do cenário atual são `FICTICIO`. O teto de R$ 88.944 mil é aproximação conservadora `PROVISORIO` do limite de primeiro turno. Consulte [DATA_SOURCES.md](DATA_SOURCES.md) §6 quanto às fontes e lacunas.

Dívida é uma escolha explícita, limitada e contabilizada no gasto contratado; na posse ela vira compromisso pessoal, exceto nas regras simplificadas. O pagamento sai do patrimônio pessoal, não do orçamento público. Após o prazo, a cobrança reduz capital político conforme parâmetro `PROVISORIO`, uma vez. Caixa 2 é ficcional, indisponível nas regras simplificadas e sujeito a exposição e fiscalização por turno; uma descoberta inicia investigação e notícia, não condenação automática. A cassação depende da Fase C5.
### 11.1 Ciclo do mandato (modelo de opinião)
O peso que o eleitor dá a cada coisa muda ao longo do mandato (parâmetros a calibrar, valores de partida abaixo):

| Fase | Meses (`monthIndex`) | Regra |
| --- | --- | --- |
| **Lua de mel** | 0–5 (jan–jun/2027) | Perda de aprovação por medidas impopulares reduzida (`fator_lua_de_mel` ≈ 0,6) e parte da culpa por indicadores ruins atribuída ao governo anterior. É a janela para medidas duras. |
| **Meio do mandato** | 6–38 | Regras normais. O "custo de manter a coalizão crescente com o tempo" **não está modelado** (conferido no código em 27/10/2026, [PLANO_CAMPANHA.md](PLANO_CAMPANHA.md) Fase C0, tarefa C0.2): a relação com os blocos não se desgasta sozinha com os meses. O único custo que cresce com o tempo é o risco de escândalo nas pastas de bloco (§6.5, `escandalo_por_ano`). |
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

### 11.3 Mapa eleitoral: voto estimado e resultado simulado por UF (PR 12 do [PLANO_GLOBO.md](PLANO_GLOBO.md) §5.3)
Código em `src/engine/elections/regionalResult.ts`. O motor continua sem voto por UF: a votação nacional da eleição geral (`vote1`/`vote2`, §11 e FASE_08.md) é sorteada como antes e **distribuída** às UFs depois, sem sorteio novo.

- **Conta.** Cada UF parte do logit da sua aprovação no mês da eleição (já com o alinhamento, §11.2) e recebe um **deslocamento comum** `s`; a votação da UF é `σ(logit(aprovação) + s)`. O `s` é achado por bissecção para que a soma ponderada pelo eleitorado seja exatamente a votação nacional do turno. Quem aprova mais vota mais (a ordem das UFs se mantém) e mais voto nacional é mais voto em todas as UFs. Aprovação e votação são limitadas a ]10⁻⁶, 1 − 10⁻⁶[ só para o logit existir.
- **Turnos.** 1º turno: `vote1`. 2º turno (quando o governo não passou de 0,5): governo ÷ (governo + oposição), com `vote2` e a oposição do próprio sorteio; passa de 0,5 exatamente quando `vote2 > opponent`, a regra do motor. O último turno decide.
- **Pesos.** `electorateWeights`: participação na **população** — **PROVISORIO** (o cenário não traz eleitores aptos por UF), a mesma ponderação da aprovação regional (D7).
- **Troca de governador.** Sorteada em `governorTurnoverStep` (§11, FASE_08.md) no mesmo mês do pleito; as UFs que trocaram vão em `ElectionResult.governorChanges`, separadas do voto presidencial. O motor não tem a posse de janeiro como mês próprio.
- **Intenção estimada.** `regionalVoteIntention`: a mesma conta com a intenção nacional de voto do momento no lugar da votação sorteada. É **estimativa** em qualquer mês, inclusive no da eleição — a votação real ainda leva o ruído do sorteio e, no 2º turno, a oposição.
- **Registro.** `MonthReport.electionResult` (só no mês do pleito) e a tabela `election_results` do banco (migração 6), gravada na transação do mês; não vive no `GameState`.
- **Neutralidade.** As cores do mapa eleitoral não são cores de partido, e a inclinação política (violeta ↔ âmbar) não marca nenhum lado como melhor (GAME_DESIGN.md §1).

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
| 21 | Segurança hídrica do semiárido (PR 13, v0.8.0) | Saneamento / clima | PL + obra (carteira) | Espaço no limite de despesas; território no escopo regional (9 UFs); reduz o dano da seca, não a chuva; manutenção anual |
| 22 | Drenagem urbana e contenção de encostas (PR 13, v0.8.0) | Cidades / clima | PL + obra (carteira) | Espaço no limite de despesas; nacional; reduz o dano das cheias; manutenção anual |
| 23 | Reforço da Defesa Civil (PR 13, v0.8.0) | Cidades / clima | Rotina (ato executivo + dotação anual) | Uma rotina por pasta e ano; efeito proporcional à dotação liberada, com maturação |
| 24 | Tributação de lucros e dividendos com redução do IR das empresas (R3, v0.8.0) | Tributação | PL ordinário | Anterioridade anual; duas fases (a segunda 12 meses depois); pesa mais sobre o quinto mais rico (§5.3) |
| 25 | Alíquotas maiores no Imposto Seletivo (R3, v0.8.0) | Tributação | PL ordinário | Noventena; pesa proporcionalmente mais sobre o quinto mais pobre (§5.3) |

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
