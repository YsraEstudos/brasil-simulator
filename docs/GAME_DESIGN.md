# Brasil Simulator — Documento de Design do Jogo (GDD)

Versão 0.1 do documento • Fase 00 • 13/10/2026 • ✅ Revisado pelo autor em 13/10/2026 (início jan/2027, turno mensal com 3 pontos, 8 decisões e tom confirmados; pressão sobre o BC adicionada)
Documentos relacionados: [ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) · [POLITICAL_RULES.md](POLITICAL_RULES.md) · [DATA_SOURCES.md](DATA_SOURCES.md) · [ROADMAP.md](ROADMAP.md) · [AI_INSTRUCTIONS.md](AI_INSTRUCTIONS.md)

---

## 1. Visão

**Brasil Simulator** é um jogo de estratégia por turnos para celular em que o jogador assume a Presidência da República do Brasil e governa por meio de **políticas**, não de botões mágicos. Toda decisão passa por instituições que têm vontade própria (Congresso, Banco Central, Judiciário, governadores, mercado e população) e produz efeitos com atraso, custo e incerteza.

### Pilares de design

| Pilar | O que significa na prática |
| --- | --- |
| **Poder limitado** | O presidente propõe, negocia e executa. Não define PIB, inflação nem Selic. |
| **Consequências rastreáveis** | Cada mudança relevante num indicador tem uma causa registrada que o jogador pode abrir. |
| **Tempo importa** | Medidas têm prazos de tramitação, execução e maturação. Educação hoje vira produtividade em anos. |
| **Sem resposta universal** | Cortar imposto ou gastar mais não é sempre bom nem sempre ruim; depende das condições do país. |
| **Neutralidade** | O modelo não premia uma ideologia. Os parâmetros são documentados e testados em cenários variados. |
| **Ficção declarada** | Presidente, personagens e notícias são fictícios. O jogo não tem vínculo com nenhum órgão público. |

### Frase-resumo
> "Você tem quatro anos, um Congresso que não é seu e um orçamento que já vem comprometido. O que você consegue mudar?"

---

## 2. Plataforma e escopo técnico (resumo)

- Android primeiro, iOS depois. Orientação vertical. Funciona offline.
- React Native + Expo + TypeScript. Motor de simulação em TypeScript puro, sem dependência de React.
- Persistência local em SQLite. Detalhes em [ROADMAP.md](ROADMAP.md) e [AI_INSTRUCTIONS.md](AI_INSTRUCTIONS.md).

---

## 3. O papel do jogador

O jogador é um **presidente fictício** que toma posse em **5 de janeiro de 2027** (data de posse definida pela EC 111/2021 a partir do mandato iniciado em 2027).

### 3.1 O que o jogador PODE fazer

| Categoria | Exemplos | Depende de terceiros? |
| --- | --- | --- |
| Atos do Executivo | Decretos regulamentares, contingenciamento, programação financeira, nomeações de ministros | Não, mas pode ser questionado no Judiciário |
| Propostas legislativas | PL, PLP, PEC, MP, PLN de crédito, projeto de LDO/LOA | Sim: Congresso |
| Sanção e veto | Sancionar, vetar total ou parcialmente | Congresso pode derrubar o veto |
| Negociação política | Ceder ministérios, priorizar emendas, alterar texto, apoiar candidaturas | Sim: partidos e líderes |
| Relação federativa | Propor convênios, transferências voluntárias, programas nacionais | Sim: governadores aderem ou não |
| Comunicação | Pronunciamentos, campanhas, posicionamento em crises, **pressão pública sobre o Banco Central** | Efeito sobre opinião pública e mercado; a pressão sobre o BC tem custo de credibilidade ([ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) §5.4.1) |
| Indicações | Diretoria do Banco Central quando houver vaga, ministros do STF quando houver vaga | Sabatina e aprovação no Senado |

### 3.2 O que o jogador NÃO PODE fazer

- Definir diretamente PIB, inflação, desemprego, câmbio ou qualquer indicador de resultado.
- Fixar a taxa Selic. O Banco Central é autônomo (LC 179/2021) e é simulado como agente próprio. O jogador pode **pressioná-lo publicamente**, o que pode antecipar cortes de juros, mas cobra caro em credibilidade e expectativas de inflação.
- Comandar o orçamento de estados e municípios.
- Ignorar decisões judiciais ou o resultado de votações.
- Gastar além das autorizações orçamentárias ou descumprir a LRF **sem consequência**: é possível quebrar regras, mas isso gera risco jurídico, alertas do TCU e pressão por impeachment.

Quando o jogador tenta algo que não é sua competência, o jogo **explica o motivo** e sugere o instrumento correto (por exemplo, "Segurança pública estadual é competência do governador. Você pode propor um convênio ou um programa federal de cooperação.").

---

## 4. Tempo e turnos

### 4.1 Unidade de tempo
- **1 turno = 1 mês.** O mandato completo tem 48 turnos (jan/2027 a dez/2030; o mandato termina em 5/1/2031).
- Dentro do mês há **eventos** que exigem resposta, mas o cálculo econômico é mensal.
- Alguns sistemas seguem calendário próprio dentro do turno mensal:
  - Copom: 8 reuniões por ano (nem todo mês tem decisão de juros).
  - Congresso: sessão legislativa de 2/fev a 17/jul e de 1º/ago a 22/dez (art. 57 da CF). Em janeiro e na segunda metade de julho não há votações, salvo convocação extraordinária.
  - Orçamento: envio do PLDO até 15/abr, envio do PLOA até 31/ago, relatórios bimestrais de avaliação de receitas e despesas.
  - Divulgação de indicadores: no modo Realismo Extremo, PIB e desemprego chegam com atraso, como na vida real.

### 4.2 Estrutura de um turno (visão do jogador)

1. **Briefing do mês**: resumo do que aconteceu, indicadores, alertas dos ministérios e manchetes.
2. **Caixa de entrada**: eventos que pedem decisão (crise, pedido de governador, votação marcada, escândalo).
3. **Agenda presidencial**: o jogador escolhe ações até o limite de **pontos de agenda** do mês.
4. **Encerrar o mês**: o motor processa instituições, economia, sociedade e eventos.
5. **Relatório de consequências**: o que mudou, por quê e o que está em andamento.

### 4.3 Pontos de agenda
O presidente não faz tudo ao mesmo tempo. Cada mês oferece um número limitado de pontos (padrão: 3; varia com dificuldade, crises e qualidade da equipe ministerial). Exemplos de custo:

| Ação | Custo |
| --- | --- |
| Enviar PL ordinário | 1 |
| Enviar PEC | 2 |
| Negociação intensiva com um bloco | 1 |
| Editar MP | 1 |
| Decreto ou ato administrativo simples | 0 a 1 |
| Responder evento crítico | 0 a 2 |

Isso obriga o jogador a priorizar e impede que ele dispare todas as reformas no primeiro mês.

---

## 5. Recursos do jogador

| Recurso | Faixa | Como sobe | Como cai |
| --- | --- | --- | --- |
| **Aprovação popular** | 0–100% | Renda, emprego, inflação baixa, serviços, comunicação | Inflação, desemprego, escândalos, crises mal geridas |
| **Capital político** | 0–100 | Vitórias legislativas, aprovação alta, início de mandato | Derrotas, desgaste, uso em negociações |
| **Base parlamentar** | cadeiras | Coalizão, cargos, emendas, alinhamento | Atritos, escândalos, eleições se aproximando |
| **Confiança do mercado** | índice | Previsibilidade fiscal, cumprimento de metas | Descumprimento de metas, medidas surpresa |
| **Espaço orçamentário** | R$ | Crescimento da receita, cortes, reformas | Despesas obrigatórias crescentes, frustração de receita |
| **Pontos de agenda** | por mês | Equipe competente, estabilidade | Crises simultâneas |

Aprovação do governo e intenção de voto são **indicadores distintos** (o segundo só aparece a partir da Fase 08).

---

## 6. Dificuldades

As três dificuldades usam **o mesmo motor**. Elas mudam parâmetros, visibilidade de informações e tolerância a erro, nunca a contabilidade.

| Aspecto | Casual | Estratégica (padrão) | Realismo Extremo |
| --- | --- | --- | --- |
| Pontos de agenda | 4 | 3 | 2–3 |
| Congresso | Mais receptivo | Calibrado | Calibrado, com comportamento individual a partir da Fase 09 |
| Ruído nos efeitos | Baixo | Médio | Alto |
| Atraso de divulgação de dados | Nenhum | Nenhum | Igual ao real (PIB trimestral etc.) |
| Explicações | Detalhadas e com dica | Detalhadas | Cadeia causal estimada, com incerteza |
| Previsões dos ministérios | Precisas | Com margem de erro | Com margem de erro e viés institucional |
| Eventos negativos | Menos frequentes | Calibrados | Calibrados, encadeados |
| Regras legais | Simplificadas | Completas | Completas e detalhadas |
| Quebra de regras | Permitida, consequências brandas | Permitida, com STF/TCU/impeachment | idem, mais severas |

Detalhes em [POLITICAL_RULES.md](POLITICAL_RULES.md) §1.1. Explicações estão sempre disponíveis, em qualquer modo.

---

## 7. Condições de fim de jogo e objetivos

### 7.1 Fim da campanha

| Condição | Tipo | Como ocorre |
| --- | --- | --- |
| Impeachment | Derrota | Câmara autoriza (2/3) e Senado condena (2/3). Ver [POLITICAL_RULES.md](POLITICAL_RULES.md) §10. |
| Renúncia | Derrota voluntária | Opção do jogador ou evento extremo aceito pelo jogador |
| Derrota eleitoral | Derrota | O presidente ou o candidato apoiado perde a eleição (Fase 08) |
| Fim de mandato sem reeleição | Encerramento | Mandato termina e o jogador não concorre ou já cumpriu dois mandatos consecutivos |
| Fim do protótipo | Encerramento | Na versão 0.1, a campanha termina em dez/2027 |

Toda campanha encerrada gera um **Relatório de Legado**: país recebido vs. país entregue, reformas aprovadas, objetivos cumpridos, pontuação.

### 7.2 Objetivos alternativos (escolhidos no início)
O jogador escolhe de 1 a 3 objetivos de legado. Cada um tem meta mensurável e peso na pontuação final:

| Objetivo | Indicador de medida (exemplo) |
| --- | --- |
| Reduzir a pobreza | Taxa de pobreza (linha configurável) |
| Aumentar a renda | Renda média real per capita |
| Equilibrar as contas | Resultado primário e trajetória da dívida bruta/PIB |
| Industrializar o país | Participação da indústria de transformação no valor adicionado |
| Desenvolver as regiões | Redução da dispersão de renda entre UFs (Fase 05+) |
| Reeleição | Vencer a eleição de 2030 (Fase 08+) |

O protótipo 0.1 usa apenas pontuação simples sobre os 5 indicadores básicos.

---

## 8. Indicadores

### 8.1 Protótipo (0.1)
| Indicador | Unidade | Exibição |
| --- | --- | --- |
| Aprovação | % | mensal |
| Crescimento do PIB | % em 12 meses | mensal (estimado pelo motor) |
| Inflação (IPCA) | % em 12 meses | mensal |
| Desemprego | % da força de trabalho | mensal |
| Resultado primário | % do PIB, acumulado em 12 meses | mensal |

### 8.2 Versões posteriores
Lista completa em [ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) §3. Inclui Selic, câmbio, dívida bruta, informalidade, salários, setores e indicadores sociais por UF.

---

## 9. Ciclo de vida de uma decisão

Selecionar uma opção **nunca aplica o efeito diretamente**. Ela cria uma **Proposta**, que percorre uma máquina de estados:

```
RASCUNHO
  └─► VALIDAÇÃO ── falha ──► BLOQUEADA (motivo explicado: competência, financiamento, vedação legal)
        └─► ENVIADA
              ├─ (ato do Executivo) ─────────────────────────────► EM_EXECUÇÃO
              └─ (exige Congresso) ─► EM_TRAMITAÇÃO
                                         ├─► REJEITADA
                                         ├─► ARQUIVADA / PARADA (sem pauta)
                                         └─► APROVADA (texto original ou ALTERADO)
                                                └─► SANÇÃO / VETO (parcial ou total)
                                                       └─► (veto) APRECIAÇÃO DO VETO ─► mantido / derrubado
                                                └─► EM_EXECUÇÃO
                                                       ├─► CONCLUÍDA
                                                       ├─► SUSPENSA (decisão judicial, falta de recursos)
                                                       └─► ABANDONADA
```

Em cada transição o motor grava: data, causa, atores envolvidos e valores. Essa trilha de auditoria alimenta o relatório de consequências.

### 9.1 Campos estruturados de uma política
Toda política do catálogo é um arquivo de dados (JSON validado por Zod em `src/types/policy.ts`). As chaves ficam em inglês no JSON (decisão D2) e os valores em português; correspondência entre parênteses:

| Campo | Exemplo |
| --- | --- |
| `id` | `infraestrutura_ferrovias` |
| `competencia` (`competence`) | `federal` |
| `instrumento` (`instruments`) | `credito_adicional` + `ato_execucao` |
| `custo` (`cost`) | valor por mês/ano e perfil de desembolso |
| `fonteFinanciamento` (`fundingSources`) | dotação existente, remanejamento, crédito adicional, operação de crédito |
| `prazos` (`timeline`) | planejamento, tramitação esperada, execução, maturação |
| `condicoes` (`conditions`) | espaço no limite de despesas, quórum, vedações |
| `impactos` (`impacts`) | canais afetados (demanda, capital público, renda de grupos, receita) e parâmetros |
| `riscos` (`risks`) | atraso, sobrecusto, judicialização, baixa adesão |
| `afetados` (`affected`) | grupos de renda, setores, regiões |

---

## 10. Exemplo completo: da decisão ao indicador

Este é o critério de conclusão da Fase 00: explicar, sem código, como uma decisão presidencial chega ao Congresso, afeta o orçamento, é implementada e modifica os indicadores.

**Decisão:** em janeiro de 2027, o jogador escolhe "Propor R$ 15 bilhões adicionais para infraestrutura".

1. **Validação (jan/2027).** O motor verifica:
   - Competência: infraestrutura de transporte federal → federal. ✔
   - Orçamento: a LOA 2027 já foi votada pelo Congresso anterior. Não há dotação para esse gasto. Instrumento correto: **crédito adicional** (suplementar ou especial) por meio de **PLN**, votado em sessão conjunta. Remanejamento dentro dos limites da própria LOA pode cobrir parte.
   - Limite de despesas do Regime Fiscal Sustentável (LC 200/2023): se a despesa total já estiver no limite, os R$ 15 bi exigem **corte equivalente** em outra despesa discricionária. O jogo mostra as opções de corte.
   - Crédito extraordinário por MP **não é permitido**, pois não há urgência imprevisível. A opção aparece bloqueada com explicação.
2. **Envio e tramitação (jan–abr/2027).** O PLN é enviado em janeiro, mas o Congresso está em recesso. A legislatura é instalada em 1º/fev, com eleição das Mesas. A Comissão Mista de Orçamento analisa o projeto. Os blocos partidários avaliam a proposta segundo ideologia, interesse regional e relação com o governo. O jogador pode gastar capital político e oferecer contrapartidas (por exemplo, incluir obras em estados de um bloco). Resultado possível: aprovado com valor reduzido para R$ 12 bi e redistribuição regional.
3. **Sanção (abr/2027).** O jogador sanciona. O crédito entra no orçamento.
4. **Execução (mai/2027 → 2029).** Os projetos passam por planejamento, licenciamento, licitação e obra. A execução mensal depende da **capacidade administrativa** do ministério. Parte dos recursos vira restos a pagar. Desembolso típico: pequeno no primeiro ano, maior no segundo e no terceiro.
5. **Efeitos econômicos.**
   - **Curto prazo (demanda):** o gasto efetivamente executado aumenta a demanda agregada com multiplicador que depende do hiato do produto (maior com economia ociosa, menor perto do pleno emprego) → PIB um pouco maior, desemprego um pouco menor, pressão inflacionária pequena.
   - **Fiscal:** despesa primária maior → resultado primário pior no ano, a menos que haja corte compensatório. A dívida cresce com o déficit e com os juros. Se o mercado perceber risco fiscal, o prêmio de risco sobe e afeta câmbio, expectativas de inflação e, por consequência, a Selic decidida pelo Banco Central.
   - **Longo prazo (oferta):** quando cada obra é concluída, o estoque de capital público aumenta → o PIB potencial sobe um pouco → crescimento futuro sem inflação adicional. A partir daí surge **custo de manutenção** anual.
6. **Política e sociedade.** Empregos na construção civil nos estados beneficiados aumentam a aprovação regional (Fase 05+). Atrasos ou escândalos de licitação podem virar eventos negativos.
7. **Explicação ao jogador.** O relatório mensal mostra, por exemplo: "Desemprego −0,1 p.p.: obras do programa de infraestrutura (R$ 0,8 bi executados no mês) e queda dos juros futuros." Cada parcela é rastreável até a proposta original.

---

## 11. Protótipo 0.1 — especificação

### 11.1 Conteúdo
- Campanha única: jan/2027 a dez/2027 (12 turnos).
- 5 indicadores (§8.1).
- Congresso em **5 blocos** (ver [POLITICAL_RULES.md](POLITICAL_RULES.md) §6).
- Banco Central como agente automático.
- 8 decisões, 10 eventos, relatório mensal, salvar e carregar.

### 11.2 As 8 decisões do protótipo

| # | Decisão | Instrumento | Exige Congresso | Efeito principal esperado |
| --- | --- | --- | --- | --- |
| 1 | R$ 15 bi adicionais para infraestrutura | PLN de crédito adicional + execução | Sim | Demanda agora, oferta depois, primário pior |
| 2 | Redução do IOF sobre operações de crédito | Decreto (alíquota extrafiscal) + compensação LRF | Não (mas exige compensação) | Crédito e consumo ↑, receita ↓ |
| 3 | Alteração da tabela e das deduções do IRPF | PL ordinário (anterioridade anual) | Sim | Distributivo; efeito líquido na receita depende do desenho |
| 4 | Contingenciamento de despesas discricionárias | Decreto de programação orçamentária | Não | Primário melhor, serviços e investimento ↓, aprovação ↓ |
| 5 | Ampliar programa de transferência de renda | PL ou crédito adicional + regulamentação | Sim | Pobreza ↓, consumo ↑, despesa obrigatória ↑ |
| 6 | Programa federal de segurança em cooperação com estados | MP ou PL + convênios | Sim (adesão estadual) | Efeito lento, aprovação ↑ se bem executado |
| 7 | Revisão de gastos tributários (subsídios) | PL ordinário / PLP | Sim | Receita ↑ no médio prazo, resistência de setores |
| 8 | Reforma administrativa | PEC | Sim (3/5, dois turnos) | Despesa de pessoal ↓ no longo prazo, alto custo político |

Os valores e o desenho exato de cada decisão serão especificados em `src/data/policies/` na Fase 02, com referência às regras de [POLITICAL_RULES.md](POLITICAL_RULES.md).

### 11.3 Os 10 eventos do protótipo

| # | Evento | Gatilho (condições + probabilidade) | Escolhas típicas |
| --- | --- | --- | --- |
| 1 | Alta internacional do petróleo | Aleatório, com probabilidade base | Absorver, subsidiar diesel, repassar |
| 2 | Seca afeta safra e energia | Sazonal (2º semestre) | Crédito emergencial, nada, bandeira tarifária |
| 3 | Greve de servidores federais | Reajuste abaixo da inflação acumulada | Negociar, endurecer, ceder |
| 4 | Escândalo em ministério | Risco ↑ com ministérios entregues a blocos sem critério | Demitir, defender, abrir investigação |
| 5 | Agência de rating revisa nota | Trajetória da dívida + cumprimento da meta | Responder com medidas, ignorar |
| 6 | Presidente da Câmara trava pauta | Relação ruim com o bloco do presidente da Casa | Negociar, ceder cargos, confrontar |
| 7 | Enchentes em região metropolitana | Sazonal (verão) | Crédito extraordinário (aqui é cabível), Defesa Civil |
| 8 | Saída de capitais de emergentes | Aleatório + dívida alta amplifica | Comunicação, ajuste fiscal, nada |
| 9 | Pressão de governadores por transferências | Receita estadual em queda | Negociar, recusar |
| 10 | Dados de emprego surpreendem | Condicionado ao hiato do produto | Comunicação (efeito na aprovação) |

Eventos são determinados por **condições verificáveis + probabilidade configurada + sorteio com semente** (reprodutível).

### 11.4 Critério de conclusão do protótipo
Jogar os 12 meses, tomar decisões diferentes em duas campanhas, observar consequências diferentes e explicáveis, e conseguir reiniciar ou retomar a campanha.

---

## 12. Explicabilidade

- Cada indicador tem um botão **"Por que mudou?"** que mostra a decomposição da variação do mês por causa (políticas, choques, Banco Central, tendência).
- Cada proposta tem uma **linha do tempo** com o estado atual e o histórico.
- Previsões ministeriais aparecem antes da decisão, com faixa de incerteza (§6).
- O jogo nunca mostra uma "resposta certa".

---

## 13. Tom, neutralidade e avisos

- Tela inicial e loja: "Simulação fictícia e independente, sem afiliação a qualquer órgão do governo brasileiro."
- Personagens, partidos (decisão D1 do ROADMAP: fictícios, em blocos) e notícias são fictícios. Nenhuma conduta é atribuída a pessoas reais.
- Instituições reais (Congresso, STF, Banco Central) aparecem como **papéis institucionais genéricos**, sem logotipos oficiais.
- Políticas são descritas por mecanismo e efeito, não por rótulo partidário.
- Testes de viés: campanhas automatizadas com estratégias de orientações diferentes não devem ter vantagem estrutural injustificada (ver [ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) §9).

---

## 14. Fora do escopo da versão 1.0

Multiplayer em tempo real, Forças Armadas e guerra, governar estados ou municípios, IA generativa em diálogos, editor de cenários, diplomacia profunda. Ver Fase 11 em [ROADMAP.md](ROADMAP.md).
