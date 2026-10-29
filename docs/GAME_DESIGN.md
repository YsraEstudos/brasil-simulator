# Brasil Simulator — Documento de Design do Jogo (GDD)

Versão 0.6 do documento • 27/10/2026 (Fase C7: depois do mandato, §7.1) • v0.5: 20/10/2026 • ✅ Revisado pelo autor em 13/10/2026 (início jan/2027, turno mensal com 3 pontos, 8 decisões e tom confirmados; pressão sobre o BC adicionada) • v0.2: mesa de despacho, capacidade de pauta, diretrizes e marcas de governo, ciclo do mandato • v0.3 (Fase 04): negociação e nomeações na agenda, aba Congresso, sanção e veto • v0.4 (Fase 05): mapa da federação e visita a estado • v0.5 (20/10/2026): Painel único — o jogo sem abas, com folhas e subtelas (§4.6)
Documentos relacionados: [ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) · [POLITICAL_RULES.md](POLITICAL_RULES.md) · [DATA_SOURCES.md](DATA_SOURCES.md) · [ROADMAP.md](ROADMAP.md) · [AI_INSTRUCTIONS.md](AI_INSTRUCTIONS.md)

O percurso eleitoral antes da posse, suas entregas e limitações atuais estão em [PLANO_CAMPANHA.md](PLANO_CAMPANHA.md); as eleições ao longo do mandato seguem o modelo deste documento e de [FASE_08.md](FASE_08.md).

Em Novo Jogo, a situação inicial pode manter as condições do cenário ou aplicar uma hipótese fictícia de pressão externa ou desaceleração; o resumo identifica a escolha. O laboratório permite experimentar ações em uma cópia descartável e recomeçar com a mesma semente, sem alterar a campanha salva.

Os ajustes de desafio permitem variar pressão econômica inicial, oposição, estabilidade da coalizão e frequência de eventos climáticos elegíveis. Seus parâmetros são provisórios e constam de [CALIBRATION.md](CALIBRATION.md). As regras institucionais e a clareza de pesquisas e pareceres são escolhas separadas; a opção institucional simplificada é explicitamente fictícia e não representa todos os procedimentos brasileiros.

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

- Android primeiro, iOS depois. Orientação vertical e horizontal (auto-rotação). Funciona offline.
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

Todos os passos partem do **Painel** (§4.6):

1. **Briefing do mês**: resumo do que aconteceu, indicadores, alertas dos ministérios e manchetes. Fica no HUD do Painel e nas folhas **Indicadores** e **Meta atual**; as manchetes, na subtela **Notícias**.
2. **Caixa de entrada**: eventos que pedem decisão (crise, pedido de governador, votação marcada, escândalo). Ficam na folha **Alertas e eventos** (o sino do HUD), onde o jogador responde ali mesmo, vê os três pareceres da mesa de despacho e sanciona ou veta projetos aprovados. O selo do sino conta o que ainda não tem resposta marcada; sem resposta vale a escolha padrão do evento e, no projeto, a sanção tácita.
3. **Agenda presidencial**: o jogador escolhe ações até o limite de **ações de agenda** do mês, no **Gabinete** (decisões, políticas públicas, marcas de governo e ações simples), no **Congresso** (negociações e nomeações) e no cartão de cada UF (visita). As decisões grandes passam pela **mesa de despacho** (§4.4).
4. **Encerrar o mês**: botão dourado da doca do Painel, com "x de y ações usadas". O motor processa instituições, economia, sociedade e eventos.
5. **Relatório de consequências**: a folha **Relatório do mês** abre sozinha ao encerrar; mostra o que mudou, por quê e o que está em andamento. Ao fim da campanha, o botão vira "Ver legado" e o jogo abre a subtela **Legado**.

### 4.3 Ações de agenda
O presidente não faz tudo ao mesmo tempo. Cada mês oferece um número limitado de ações (padrão: 3; varia com dificuldade, crises e qualidade da equipe ministerial). Exemplos de custo:

| Ação | Custo |
| --- | --- |
| Enviar PL ordinário | 1 |
| Enviar PEC | 2 |
| Negociação intensiva com um bloco | 1 |
| Editar MP | 1 |
| Decreto ou ato administrativo simples | 0 a 1 |
| Responder evento crítico | 0 a 2 |
| Pressionar o Banco Central (ação imediata, sem proposta; uma vez por mês) | 1 |
| Negociar com um bloco, liberar emendas, ceder no texto ou pedir urgência numa proposta (uma vez por mês por alvo) | 1 |
| Nomear ou demitir ministro | 1 |
| Visitar um estado (uma vez por mês por estado) | 1 |
| Sancionar ou vetar projeto aprovado | 0 |

Isso obriga o jogador a priorizar e impede que ele dispare todas as reformas no primeiro mês. Um segundo limite atua no Congresso: a **capacidade de pauta** ([POLITICAL_RULES.md](POLITICAL_RULES.md) §6.3) só deixa andar um número limitado de propostas prioritárias ao mesmo tempo. O **capital político** (§5) é gasto em negociações, MPs, demissões e votações forçadas.

### 4.3.1 Subtela Congresso (Fase 04)
É aberta direto pela doca do Painel, com o hemiciclo no topo. Mostra as Mesas (bloco que preside cada Casa e relação com ele), a ocupação da pauta de cada Casa, as propostas por etapa (Casa, turnos, data prevista, relator), o parecer de articulação para a próxima votação com as contrapartidas já negociadas, os blocos com as pastas que ocupam e os ministérios com ocupante e risco de escândalo. Negociações e nomeações marcadas ali entram na **mesma agenda do mês** do Gabinete (mesmas ações) e valem ao encerrar o mês. Projetos aprovados aparecem na folha Alertas e eventos do Painel para sanção ou veto (POLITICAL_RULES.md §6.5, §7). As propostas que saíram do plenário (à espera de sanção, em vigor ou encerradas) ficam em **Fora do Congresso**, com o histórico de cada etapa.

### 4.4 Mesa de despacho
Antes de confirmar uma decisão grande (proposta ao Congresso, MP, corte, reforma, resposta a crise), o jogador vê um cartão de despacho com **três pareceres curtos** (até 2 linhas cada), que podem discordar entre si:

| Voz | Olha para |
| --- | --- |
| **Fazenda** | meta fiscal, inflação, juros e reação do mercado |
| **Articulação política** (Casa Civil / Relações Institucionais) | votos prováveis por bloco, presidentes das Casas, governadores |
| **Comunicação** (SECOM) | aprovação, grupos afetados, risco de crise de imagem |

- Os pareceres são **gerados a partir das previsões do próprio motor** (mesma fonte das previsões ministeriais, §6), não de texto fixo. Por isso a qualidade deles varia com a dificuldade: precisos no Casual, com margem de erro na Estratégica, com margem de erro e viés da pasta no Realismo Extremo.
- Nenhum parecer diz "a resposta certa"; cada um mostra um custo diferente da mesma escolha (§13).
- Entra no protótipo (Fase 02) para as 8 decisões, em versão simples.
- Desde a Fase 07, o parecer usa as mesmas escalas da execução: o custo do programa por convênio considera só os estados que devem aderir, o ganho de aprovação rende menos em pasta com ministro de bloco, e a Fazenda cita a defasagem do efeito fiscal, a credibilidade fiscal e o ganho real do salário mínimo.
- Respostas a eventos também têm mesa de despacho: a folha Alertas e eventos mostra os três pareceres da escolha marcada (ou da escolha padrão, se nenhuma foi marcada), lidos dos efeitos da própria escolha.

### 4.5 Mapa da federação no Painel (Fase 05)
O globo do Painel é o mapa da federação: cada UF pintada pelo indicador escolhido — crescimento em 12 meses, desemprego e aprovação comparados à média nacional, PIB per capita (Brasil = 1), relação com o governador, **Alinhamento** (o quanto cada UF pensa como o perfil do governo, em aprovação a mais ou a menos que a média; só em cenário com a inclinação das UFs, estimativa), **Chuva** (a chuva do mês contra a normal do estado, do marrom, mais seco, ao azul, mais chuvoso) e **Seca** (índice de falta de água acumulada, de 0 a 100%). No globo a seca também tinge a terra de palha e há nuvens opcionais (Configurações → Nuvens); no mapa 2D, seca forte e chuva forte ganham hachura e cada estado com chuva acima do normal, um ícone de nuvem. As escalas comparativas vão do vermelho (pior que a média) ao azul (melhor), com cinza na média; a renda usa um só azul. Quatro camadas formam o **Mapa eleitoral** (PLANO_GLOBO.md §5.3), cada uma com selo próprio: a **Relação com o governador**, a **Inclinação política** do eleitorado (dado do cenário, "dado provisório"), a **Intenção de voto** por estado (sempre "estimativa", a partir da aprovação) e o **Resultado da eleição** (o voto simulado por estado, com o selo "resultado" e a data; só abre depois da eleição geral e fecha com o resultado nacional). A legenda fica na folha **Camadas do mapa**, junto da escolha da camada, e a **lista** da folha **Visão regional** mostra as 27 UFs ordenadas com o número (a mesma informação sem depender da cor). Tocar numa UF abre o cartão com os números da UF e do Brasil, o governador (bloco e relação), **"Por que esta UF está diferente da média?"** (as maiores causas do mês, do relatório) o bloco **Obras, visita e prevenção** (as obras da UF com a fase, a visita ainda valendo e a proteção contra seca e cheia) e o botão de **visita presidencial**, que entra na mesma agenda do mês. Visita recente e obra em andamento com UF aparecem também como **pins** no mapa (PLANO_GLOBO.md §7, PR 13): bandeira verde para a visita (enquanto o efeito local dura) e martelo violeta para a obra, sem pulso; tocar abre o cartão da UF. Obra nacional não tem pin. Não há decisão "estadual": o presidente só age por políticas federais, convênios e visitas (§3.2). Regras em [POLITICAL_RULES.md](POLITICAL_RULES.md) §2.1 e modelo em [ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) §5.15.

A mesa de despacho (§4.4) passou a dizer onde a política pesa mais por habitante (Comunicação: "Favorece mais o Nordeste e o Norte") e, nos programas por convênio, quantos estados devem aderir (Articulação). A prévia regional da mesa de despacho tem um mini-mapa 2D com as três UFs que mais pesam por habitante, a parcela de recursos de cada UF, a adesão provável do governador e as incertezas (votação no Congresso, sorteio de adesão, efeito com defasagem), sempre rotulada como "Estimativa — não é garantia". Em **Configurações**, a opção **Qualidade do mapa** escolhe entre **Automático** (padrão: globo 3D que mede a fluidez do aparelho e se ajusta sozinho, um nível por vez, entre Econômico 3D, Equilibrado e Alto) e um perfil fixo (Econômico 3D, Equilibrado, Alto, Essencial 2D ou Essencial 2D leve); escolher um perfil desliga o ajuste automático. A escolha fica fora do save e, se o globo 3D não iniciar, o Painel cai para o Mapa 2D na sessão, com o aviso "O globo 3D não iniciou".

### 4.6 A mesa do Painel: folhas e subtelas (Painel único, 20/10/2026)

Na subtela Economia, os cartões de população e eletricidade mostram as faixas etárias e os fluxos por UF, além da demanda, geração, entrega, escassez e reservatório do último mês. A lista de UFs é expansível; antes do primeiro mês, os fluxos aparecem como aguardando processamento. O diagnóstico explica se a limitação está na transmissão, na água disponível ou na geração, e indica respostas possíveis. As hipóteses são provisórias. A rotina de eficiência usa dotação e atraso; obras de geração, transmissão e armazenamento dependem da carteira e só entregam capacidade ao entrar em operação.
Não há barra de abas nem tela "Presidência". Depois de **Novo jogo**, **Carregar jogo** ou **Continuar**, o jogador cai direto no **Painel**: o globo do Brasil com HUD. Tudo parte dele e tudo volta para ele. O conteúdo chega à mesa de dois jeitos:

- **Folha** — consulta ou decisão rápida, sem sair da mesa: abre por cima do globo e fecha no ✕.
- **Subtela** — mesa de trabalho, com cenário próprio: troca a tela inteira, tem o botão **"Voltar ao Painel"** (que volta direto ao Painel, mesmo de uma subtela aberta a partir de outra) e uma faixa com mês, ações restantes e capital político. Sempre no visual escuro e dourado da mesa. O globo pausa enquanto uma subtela está aberta.

**Regra:** se cabe numa folha e não precisa de cenário próprio, é folha; se é uma mesa de trabalho (muitas linhas, rolagem longa, cena 3D), é subtela.

| Região | Conteúdo |
| --- | --- |
| HUD (topo) | Mês, turno e ações; aprovação, PIB e população; em retrato, 2ª linha com capital político, inflação e desemprego. ☰ Menu (voltar ao menu principal, que fecha a partida encerrada; Configurações), centralizar o globo e o sino de alertas. |
| Trilho esquerdo ("o mês") — folhas | Alertas e eventos · Meta atual · Relatório do mês · Eleições (só no período eleitoral) |
| Trilho direito ("o país") — folhas | Camadas do mapa · Visão regional (com a lista de UFs) · Indicadores (com "Por que mudou?", setores e gráfico do PIB) · Ministérios · Perfil do governo (plano de dois eixos com o governo, o rastro dos últimos meses, as UFs, o eleitor mediano e as decisões que mais moveram o perfil; PLANO_GLOBO.md §5.2) |
| Doca (base) — subtelas | **Gabinete** (agenda presidencial: decisões com mesa de despacho, políticas públicas e marcas de governo, ações de agenda) · **Congresso** · **Economia** · **Notícias**, com selos (votação marcada no Congresso, manchetes novas) · botão **Encerrar o mês** ("Ver legado" com a campanha encerrada) |
| Fim da campanha | Subtela **Legado**: o jogo abre nela quando a campanha termina. |

Em **Configurações** (☰ Menu), a opção **Qualidade do mapa** define se o país aparece no globo 3D (Automático, Econômico, Equilibrado ou Alto), no Essencial 2D ou no Essencial 2D leve (§4.5); a opção não muda a simulação.

Sem partida em andamento não há Painel: o modo demonstração (globo sem partida) só existe como reserva técnica. O plano e as decisões estão em [PLANO_PAINEL_UNICO.md](PLANO_PAINEL_UNICO.md).

---

### 4.7 Ciência, tecnologia e comércio no Gabinete (onda R7 do plano de expansão)

Dois cartões no Gabinete, depois de Habilidades. **Ciência e tecnologia:** a árvore por ramo (transporte e logística,
energia, agricultura); cada nó abre pré-requisitos, efeito esperado, quem ganha, riscos e custos, exigências de obra e
energia e as rotas possíveis, cada uma com prazo no ritmo atual, custo total, risco de falha por estágio, parte paga lá
fora, manutenção e domínio local. O programa em andamento mostra estágio, gargalo do mês, gasto e efeito em vigor; os
botões suspendem ou pedem certificação de exportação. **Comércio exterior e diplomacia:** tarifa e faixa do decreto,
fluxos do último mês em pontos do PIB (desvio do início), setores afetados, choques ativos e, por parceiro, relação,
acesso, acordo (com a previsão sem sorteio da ratificação), missão comercial e rodada de negociação. Toda escolha é uma
ação de agenda; abrir os cartões não muda o estado.

### 4.8 Saúde, crises e imprensa no Gabinete (onda R8 do plano de expansão)

Dois cartões no Gabinete, logo depois dos termômetros. **Saúde e crises sanitárias:** sem crise, a capacidade da rede
por macrorregião e como ampliá-la (diretriz anual do Ministério da Saúde — uma rotina por ano: atenção básica,
vigilância, imunização ou controle de vetores — e a obra de hospitais regionais). Com crise: o título é o do alerta
até o agente ser identificado; "O que os boletins mostram" traz o boletim preliminar, a revisão do mês anterior e a
ocupação notificada; "Estimativas (com incerteza)" traz faixas de transmissão, de crescimento e de internação e a
janela estimada da vacina; a adesão esperada vem em faixa; os pedidos dos governadores mostram prazo; cada medida abre
custo mensal, prazo até o efeito pleno, limites e motivo de bloqueio. Leitos de emergência pedem o critério de
distribuição. Ao fim, o balanço separa notificado, estimado e contas.

**Imprensa e confiança:** confiança na comunicação com as três últimas causas de mudança; o tom atual e os outros três
com o efeito de cada um; a leitura de um veículo sobre a manchete mais recente; e os itens da imprensa com rótulo
(fato, estimativa, interpretação, rumor não verificado, rumor confirmado, falso), veículo, confiabilidade, alcance e
viés. Rumor em circulação aceita "Desmentir" ou "Esclarecer com dados". Toda escolha é uma ação de agenda; abrir os
cartões não muda o estado nem sorteia nada, e nenhum texto mostra a verdade do surto ou de um rumor não checado.

**Dilemas pensados:** investigar (uma ação agora) ou agir no escuro; restringir cedo (custa atividade e aprovação
todo mês) ou esperar os leitos lotarem; repartir um lote limitado de leitos por ocupação, população, pedidos ou
aliados; pagar o auxílio que sustenta a adesão; tranquilizar (menos alarme hoje, risco de ser desmentido) ou ser
transparente (números ruins expostos); desmentir com força um rumor que pode ser verdadeiro.

## 5. Recursos do jogador

| Recurso | Faixa | Como sobe | Como cai |
| --- | --- | --- | --- |
| **Aprovação popular** | 0–100% | Renda, emprego, inflação baixa, serviços, comunicação | Inflação, desemprego, escândalos, crises mal geridas |
| **Capital político** | 0–100 | Vitórias legislativas, aprovação alta, início de mandato | Derrotas, desgaste, uso em negociações |
| **Base parlamentar** | cadeiras | Coalizão, cargos, emendas, alinhamento | Atritos, escândalos, eleições se aproximando |
| **Confiança do mercado** | índice | Previsibilidade fiscal, cumprimento de metas | Descumprimento de metas, medidas surpresa |
| **Espaço orçamentário** | R$ | Crescimento da receita, cortes, reformas | Despesas obrigatórias crescentes, frustração de receita |
| **Ações de agenda** | por mês | Equipe competente, estabilidade | Crises simultâneas |

Aprovação do governo e intenção de voto são **indicadores distintos** (o segundo só aparece a partir da Fase 08).

---

## 6. Dificuldades

As três dificuldades usam **o mesmo motor**. Elas mudam parâmetros, visibilidade de informações e tolerância a erro, nunca a contabilidade.

| Aspecto | Casual | Estratégica (padrão) | Realismo Extremo |
| --- | --- | --- | --- |
| Ações de agenda | 4 | 3 | 2–3 |
| Congresso | Mais receptivo | Calibrado | Calibrado, com comportamento individual a partir da Fase 09 |
| Ruído nos efeitos | Baixo | Médio | Alto |
| Atraso de divulgação de dados | Nenhum | Nenhum | Igual ao real (PIB trimestral etc.) |
| Explicações | Detalhadas e com dica | Detalhadas | Cadeia causal estimada, com incerteza |
| Previsões dos ministérios | Precisas | Com margem de erro | Com margem de erro e viés institucional |
| Eventos negativos | Menos frequentes | Calibrados | Calibrados, encadeados |
| Regras legais | Simplificadas | Completas | Completas e detalhadas |
| Quebra de regras | Permitida, consequências brandas | Permitida, com STF/TCU/impeachment | idem, mais severas |

Detalhes em [POLITICAL_RULES.md](POLITICAL_RULES.md) §1.1. Explicações estão sempre disponíveis, em qualquer modo.

### 6.1 Módulos opcionais

Além da dificuldade, o Novo jogo oferece **módulos opcionais** (PLANO_EXPANSAO_BRASIL_SIMULATOR.md §4 e §6.2). Dificuldade é desafio; módulo é profundidade de apresentação. Cada módulo tem uma classe explícita, e a escolha fica gravada na configuração da campanha — retomar o save ou reiniciar com a mesma semente repõe exatamente a mesma combinação.

| Módulo | Classe | Ligado | Desligado |
| --- | --- | --- | --- |
| Clima detalhado | detalhamento | Eventos climáticos com local e severidade | O clima continua evoluindo e alimentando a economia; só os eventos que dependem do detalhe regional deixam de disparar |
| Notícias do mês | desligável | Manchetes com causa rastreável no relatório | Relatório e indicadores não mudam; só a camada de notícias deixa de ser publicada |

Regras que valem para todos:

- O que **não** está na tabela é núcleo e está sempre ligado. Módulo só entra na tabela se tiver efeito verificável — opção decorativa é proibida.
- Desligar um aprofundamento **não remove a causa econômica elementar**. O clima sem o módulo detalhado continua evoluindo e movendo a economia; só o evento regional some.
- Desligar uma camada de apresentação **não toca no motor**: os mesmos sorteios, os mesmos indicadores, o mesmo relatório. Os testes comparam os dois estados mês a mês para provar isso (`src/engine/modules.test.ts`).
- A escolha é validada na entrada: módulo desconhecido é erro explícito, nunca descarte silencioso.

---

## 7. Condições de fim de jogo e objetivos

### 7.1 Fim da campanha

| Condição | Tipo | Como ocorre |
| --- | --- | --- |
| Impeachment | Derrota | Câmara autoriza (2/3) e Senado condena (2/3). Ver [POLITICAL_RULES.md](POLITICAL_RULES.md) §10. |
| Renúncia | Derrota voluntária | Opção do jogador ou evento extremo aceito pelo jogador |
| Derrota eleitoral | Derrota | O presidente ou o candidato apoiado perde a eleição (Fase 08) |
| Sucessão de governo | Continuidade | O mandato termina e o vencedor da eleição assume; a partida **continua** sob a nova administração, com o país intacto (onda R4, [POLITICAL_RULES.md](POLITICAL_RULES.md) §11.4) |
| Fim do protótipo | Encerramento | Na versão 0.1, a campanha termina em dez/2027 |

Toda campanha encerrada gera um **Relatório de Legado**: país recebido vs. país entregue, reformas aprovadas, objetivos cumpridos, pontuação.

**Administrações** (onda R4): o mesmo relatório lista quem governou, em que mandato e como assumiu (`GameState.administrations`). O país é um só: obras, leis, dívida e orçamento atravessam a troca de governo sem cópia nem reset.

**Prestação de contas** (onda R4): para cada promessa do governo — prioridade do PPA, marca de governo e compromisso de campanha — o relatório mostra o estado (`cumprida`, `parcial`, `abandonada` ou `inviavel`) e a **evidência** que o estado final sustenta. É leitura derivada: não cria promessa, não altera orçamento e não soma efeito.

**Depois do mandato** (Fase C7 do [PLANO_CAMPANHA.md](PLANO_CAMPANHA.md)): uma seção do Legado, sem meses jogáveis, que lê o estado final em três aspectos independentes, mais as possibilidades que decorrem deles. São projeções, não destinos.

| Aspecto | Leitura |
| --- | --- |
| Influência política | 0 a 100, em faixas baixa (< 40), média (< 60) e alta: 50 mais a aprovação final acima da neutra, a relação média com os blocos e o resultado da eleição geral (sucessor ou reeleição, derrota) ou a condenação no impeachment. Pesos `pos_influencia_*` em [CALIBRATION.md](CALIBRATION.md) |
| Situação jurídica | nenhuma, investigação, acusação, condenação ou restrição efetiva, pelo item mais grave. CPI aberta ou com relatório pesado, marca de escândalo e caixa 2 descoberto são investigação; denúncia de impeachment aceita ou autorizada, sem arquivamento, é acusação; a condenação no Senado é restrição (inabilitação por 8 anos, CF art. 52, parágrafo único). Marca de CPI ou de escândalo nunca é condenação |
| Legado de governo | a pontuação de §7.2 em faixas negativo (≤ −0,2), misto e positivo (≥ 0,2), com os indicadores que melhoraram e as propostas aprovadas |

As possibilidades citam a regra que as sustenta: inabilitação até o ano da condenação + 8; depois de dois mandatos seguidos, sem candidatura na eleição seguinte (CF art. 14, §5º); senão, a candidatura volta a ser possível. A derrota antes da posse não tem esta seção: usa o resumo da campanha.

### 7.2 Objetivos alternativos (escolhidos no início)
O jogador escolhe de 1 a 3 objetivos de legado. Cada um tem meta mensurável e peso na pontuação final:

| Objetivo | Indicador de medida (exemplo) |
| --- | --- |
| Reduzir a pobreza | Taxa de pobreza (linha configurável) |
| Aumentar a renda | Renda média real per capita |
| Equilibrar as contas | Resultado primário e trajetória da dívida bruta/PIB |
| Industrializar o país | Participação da indústria de transformação no valor adicionado |
| Desenvolver as regiões | Redução da dispersão de renda entre UFs (Fase 05+; já aparece no relatório de legado, fora da pontuação) |
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

### 9.2 Dois níveis de política (Fase 06+)
Administrar 30+ políticas uma a uma, mês a mês, cansa no celular. Por isso as políticas têm dois níveis:

1. **Rotina, por diretriz.** Para cada ministério o jogador define o orçamento anual e escolhe uma **diretriz** entre opções curtas (ex.: Segurança — "inteligência e fronteiras" ou "apoio a equipamentos estaduais"). As políticas de rotina rodam sozinhas a partir disso e só pedem atenção por eventos.
2. **Marcas de governo (até 3 por mandato).** Megaprojetos escolhidos e nomeados pelo jogador (ex.: um programa de habitação, uma ferrovia, uma meta de alfabetização). Ficam fixados no Gabinete, têm eventos próprios de acompanhamento e pesam no **Relatório de Legado** (§7.1) e na campanha eleitoral (Fase 08).

---

### 9.3 Implementação da Fase 06

O cenário `brasil_2027_01_v050` permite jogar os 48 meses até dezembro/2030 para
acompanhar obras e marcas. Campanhas legadas continuam com o limite de 12 meses.
O fim desta campanha gera legado; eleição e sucessão continuam para a Fase 08.

O catálogo tem 42 políticas: 10 legadas, 22 rotinas e 10 projetos novos.
No Gabinete, a agenda normal filtra políticas por área; rotinas ficam nas
diretrizes ministeriais. Escolher orçamento/diretriz ou nomear uma marca apenas
prepara a agenda: o motor aplica a decisão ao encerrar o mês, pelo custo de uma
ação. A carteira mostra fase, avanço, desembolso, atraso e manutenção.

Na Economia, o painel social mostra os seis setores e cinco quintis, renda
real, salário mínimo, desemprego e pobreza estimada, com números provisórios
e causas rastreáveis. O legado acompanha essas medidas e as marcas sem
inventar uma nova pontuação de sucesso social. Catálogo, custos, canais e
atrasos: [POLICIES.md](POLICIES.md).

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
- Mesa de despacho simples (§4.4) e efeito de lua de mel no início do mandato ([POLITICAL_RULES.md](POLITICAL_RULES.md) §11.1).

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

**Fase 04:** entrou uma 10ª política, "Reforma da previdência (parâmetros)" (PEC, catálogo nº 18): economia de despesa obrigatória que começa pequena e cresce por anos (abre espaço no limite de despesas), com custo de aprovação e 3/5 em dois turnos em cada Casa. A articulação da mesa de despacho passou a avisar pauta cheia, presidência da Casa insatisfeita e pedágio de emendas.

**Fase 03:** entrou uma 9ª política, "Valorização extra do salário mínimo" (PL; +1% real no próximo reajuste de janeiro): sobe a aprovação, mas o reajuste se propaga para previdência e benefícios e, com o limite fixo, comprime as discricionárias. Sob o limite do arcabouço, gasto novo (decisões 1 e 5) sai das discricionárias em vez de piorar o primário, a menos que não haja espaço (ECONOMIC_MODEL.md §5.14).

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

**Eventos de 2027 implementados na Fase 03** (`src/data/events/`): "Orçamento de transição" (sempre em fevereiro de 2027: executar a LOA votada, remanejar dotações ou pedir emenda de transição fora do limite), "Calibragem da alíquota da CBS", "Setores pedem regimes diferenciados", "Governadores disputam o Fundo de Desenvolvimento Regional" e "Serviços públicos começam a parar" (dispara quando as discricionárias ficam abaixo do piso de funcionamento). Eventos não criam efeitos permanentes: duram até 24 meses. Candidatos originais: calibragem da alíquota de referência da CBS no primeiro ano de cobrança integral; setores (agro, serviços, indústria) pressionando por regimes diferenciados; disputa com governadores pelo Fundo Nacional de Desenvolvimento Regional; "orçamento de transição" opcional no início do mandato (remanejamento ou crédito para dar margem fiscal em 2027, já que a LOA foi votada pelo governo anterior); paralisação da máquina por compressão das discricionárias ([ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) §5.8).

### 11.3.1 Fase 07 (cenário v0.6.0): eventos, cadeias, marcas, personagens e notícias

Status: **FICTICIO** (casos, partidos, personagens e manchetes são fictícios; nenhuma conduta é atribuída a pessoa real, §13). Gatilhos, probabilidades, prazos e efeitos são **PROVISORIO** e aguardam a revisão do autor. Implementação: [POLITICAL_RULES.md](POLITICAL_RULES.md) §9–§10, [ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) §5.17, [FASE_07.md](FASE_07.md).

**Escopo.** O cenário `brasil_2027_01_v060` (48 meses) traz **37 eventos novos**, todos com `onlyScenarios` restrito a ele: saves e cenários anteriores não recebem nenhum deles. Por área: 14 de economia, mercado, setores e clima (`fase07_eco_*`); 14 de Congresso, governadores, STF, sociedade e mandato (`fase07_pol_*`); e 9 de instituições (`fase07_inst_*`).

**Causa identificável.** Todo evento tem condições verificáveis (ex.: "inflação de 12 meses acima de 4,5%"), probabilidade, intervalo mínimo entre ocorrências e número máximo de ocorrências. Quando o evento tem personagem em destaque, o briefing o mostra e a manchete leva o nome dele. A causa de cada manchete aponta a condição que mais se moveu no mês, o indicador que mais contribuiu ou a escolha que originou o evento.

**Marcas (memória).** Eventos de 2027 podem gravar marcas: uma escolha grava com `setFlags` (ou apaga com `clearFlags`), e a chegada do evento grava com `onFireFlags`. Cada marca guarda o mês em que foi gravada. Marcas liberam ou bloqueiam outros eventos (`requiresFlags`, `forbidsFlags`). 29 dos 37 eventos usam marcas. Exemplos: `cpi_instalada` libera o relatório final da CPI; `impeachment_denuncia_aceita` libera a votação na Câmara; `cpi_encerrada` bloqueia um segundo relatório. O quadro de Instituições (abaixo) mostra as marcas institucionais ativas.

**Cadeias (eventos encadeados).** Dez eventos só chegam por cadeia (`chainedOnly`): o sorteio mensal os ignora. Uma escolha ou um evento agenda outro com atraso de 1 a 3 meses e uma probabilidade:

| Origem (escolha) | Destino | Atraso | Probabilidade |
| --- | --- | --- | --- |
| Reportagem aponta irregularidades → investigar internamente | CPI instalada na Câmara | 2 meses | 35% |
| Reportagem aponta irregularidades → negar tudo (padrão) | CPI instalada na Câmara | 1 mês | 60% |
| CPI instalada → acionar auditoria do TCU | Parecer do Tribunal sobre as contas | 3 meses | 40% |
| Alerta do TCU → defender a execução (padrão) | Parecer do Tribunal sobre as contas | 3 meses | 50% |
| Relatório final da CPI → negociar o texto final | Pacto entre os Poderes | 2 meses | 50% |
| Greve de caminhoneiros → reprimir bloqueios | Entregadores param as plataformas | 2 meses | 40% |
| Greve de caminhoneiros → aguardar negociação | Entregadores param as plataformas | 1 mês | 25% |
| Onda de calor → acionar térmicas | Reservatórios baixos encarecem a conta de luz | 2 meses | 40% |
| Boom de commodities → investir no setor | Pacote privado de infraestrutura | 3 meses | 50% |
| Greve de professores → manter a proposta | Central sindical convoca manifestação | 2 meses | 60% |
| Central sindical convoca → ignorar a convocação | Pesquisa mostra queda entre os mais pobres | 3 meses | 50% |
| Vice conspira → deixar correr | Coluna expõe disputa dentro do governo | 2 meses | 60% |
| Câmara cobra cargos → liberar cargos | Ministro do STF suspende liberação de emendas | 3 meses | 30% |

Os 10 eventos só encadeados são: Reservatórios baixos encarecem a conta de luz, Entregadores param as plataformas, Pacote privado de infraestrutura, CPI instalada na Câmara, Pacto entre os Poderes, Parecer do Tribunal sobre as contas, Coluna expõe disputa dentro do governo, Pesquisa mostra queda entre os mais pobres, Central sindical convoca manifestação e Ministro do STF suspende liberação de emendas.

**Escolha padrão e cadeias.** As escolhas padrão encaminham a cadeia de impeachment sem resposta: aceitar a denúncia no pedido, deixar a Câmara votar e aguardar o julgamento no Senado. Quem não responde deixa a cadeia avançar; ver POLITICAL_RULES.md §10.

**Personagens (elenco fictício).** O cenário v0.6.0 traz 12 personagens com prestígio de −100 a 100. O prestígio muda pelas escolhas (`characterEffects`), pode ser condição de evento (`characterStanding`) e aparece nas manchetes. Não há agenda própria: personagens não tomam decisões sozinhos.

| id | Nome (fictício) | Papel | Bloco | Prestígio inicial |
| --- | --- | --- | --- | --- |
| `min_fazenda` | Teodoro Vilar | Ministro da Fazenda | — | 40 |
| `pres_camara` | Anselmo Rocha | Presidente da Câmara dos Deputados | centro | 10 |
| `pres_senado` | Odete Brandão | Presidente do Senado | centro | 15 |
| `lider_oposicao` | Cleusa Marante | Líder da oposição na Câmara | direita | −40 |
| `presidente_bc` | Rui Coutinho | Presidente do Banco Central | — | 20 |
| `ministro_stf` | Álvaro Peixoto | Ministro do Supremo Tribunal Federal | — | 0 |
| `governador_nordeste` | Jair Amorim | Governador de um estado do Nordeste | esquerda | 30 |
| `governador_sudeste` | Lúcia Fontenelle | Governadora de um estado do Sudeste | centro_direita | −10 |
| `jornalista` | Beatriz Camargo | Colunista de política | — | 0 |
| `empresario_agro` | Hélio Prado | Presidente de uma confederação do agronegócio | centro_direita | −5 |
| `lider_sindical` | Marlene Duarte | Dirigente de uma central sindical | esquerda | 25 |
| `vice_presidente` | Nelson Arantes | Vice-presidente da República | centro | 35 |

**Subtela Notícias.** O feed é gerado pelo motor a cada mês e persistido no save, com até 48 manchetes (as mais antigas saem primeiro) e até 6 por mês, em ordem de prioridade: institucional, evento, personagem, Congresso e, por último, economia. Cada manchete traz:
- **Causa** em uma linha ("Causa: ..."), obrigatória, rastreável ao evento, à escolha, à proposta, à decisão do Copom ou ao indicador que cruzou um nível;
- **Tom** (positiva, negativa ou neutra), com texto e marca própria, para que a cor não seja o único sinal;
- **Filtro** por tipo: Todas, Economia, Congresso, Eventos, Personagens e Instituições; as manchetes são agrupadas por mês.

Notícias não vêm de rede: são geradas a partir do estado e do relatório do mês. Nenhuma manchete é reportagem real.

**Mesa de notícias (apresentação da aba).** A aba é uma mesa em 3D vista de cima. O feed aparece como um jornal fictício (*O Arauto Nacional*) dobrado ao meio sobre a mesa; tocá-lo abre o jornal diante do jogador (ele sobe da mesa, centraliza e desdobra pela vinca) e o botão "Dobrar o jornal", o voltar do Android ou um toque fora fazem o caminho inverso. Uma edição por mês (as setas e o rodapé viram a página pela lombada), cadernos para o filtro por tipo, manchete principal (a notícia de maior prioridade do mês), quadros de Instituições e "Na sua mesa" (eventos pendentes) e, na edição mais recente, o resumo do mês. **Capa-bomba:** quando a notícia de maior prioridade da edição é institucional (CPI, TCU, impeachment, eleições, candidatura) ou tem foto cadastrada em `src/components/noticias/newsPhotos.ts`, a edição abre com uma página inteira de "Edição extra" (título gigante, foto com legenda, causa em destaque); a página seguinte traz o resto da edição sem repetir a bomba. Ao lado fica um notebook: tocá-lo leva a câmera até a tela, onde a rede social fictícia *Praça* mostra reações às manchetes (cidadãos inventados, a colunista e os personagens citados, cada um do lado que o próprio prestígio indica). As reações são só interface: determinísticas por notícia, não entram no motor nem no save. Em retrato o jornal fica abaixo do notebook e as redes ocupam a tela; em paisagem e no tablet o jornal fica à esquerda e as redes aparecem dentro da tela do notebook. Para rodar bem em Android modesto, a cena usa peças de poucos polígonos, luz pré-calculada no tampo, sombras falsas e só desenha enquanto a câmera se move.

**Quadro de Instituições.** Na subtela Notícias, mostra a pressão de impeachment em faixas — **Baixa** (abaixo de 15%), **Moderada** (15% a 35%), **Alta** (35% a 60%) e **Crítica** (60% ou mais) — e as marcas institucionais ativas (CPI instalada, alerta ou parecer do TCU, denúncia de impeachment aceita, Câmara que autorizou o processo). Uma marca superada por outra deixa de aparecer. Os limites são **PROVISORIO**.

**Fora da Fase 07:** eleições e memória do eleitor (Fase 08); comissões, emendas de plenário e parlamentares individuais (Fase 09); personagens com agenda própria; imprensa com rede; julgamento de contas pelo Congresso como votação própria.

### 11.3.2 Eventos geográficos (PR 9 do PLANO_GLOBO, cenário v0.8.0)

Status: **FICTICIO** (casos e textos), gatilhos e efeitos **PROVISORIO**. Regras de motor em [ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) §5.20; formato em [FASE_07.md](FASE_07.md) (contratos de evento); plano em [PLANO_GLOBO.md](PLANO_GLOBO.md) §6.3.

- **Onde acontece.** Um evento geográfico tem `trigger.climate` (`drought` ou `flood`, com `threshold` de 0 a 1): no sorteio mensal o motor lê o clima e devolve as **UFs atingidas** (seca: índice de seca ≥ limiar; cheia: risco de cheia ÷ risco máximo ≥ limiar), da mais para a menos atingida, até 8. Sem UF atingida o evento não é elegível. O local é gravado **no disparo** (`PendingEvent.location`) e não muda mais: responder depois atinge as mesmas UFs, mesmo que o clima já tenha mudado.
- **Quando acontece.** `probabilidade = trigger.probability × a maior severidade do local`: o clima dá a chance; `probability` é a que vale com severidade máxima. Seca severa (≥ 0,7): 0,35, intervalo de 18 meses, até 3 vezes. Chuva forte (severidade ≥ 0,25): 0,6 (= `cheia_risco_max`, ou seja, a chance é o próprio risco de cheia da UF mais atingida), intervalo de 12 meses, até 3 vezes. Em 12 campanhas de 48 meses sem responder: Casual 0,3 seca e nenhuma cheia por campanha; Estratégica 0,8 e 0,8; Realismo 1,3 e 2,0.
- **O que traz.** A crise e as escolhas, **sem repetir o choque**: o dano econômico da seca e da chuva (PIB, alimentos, energia, atividade e humor das UFs) é do clima (ECONOMIC_MODEL.md §5.19) e já aparece nos indicadores quando o evento chega; os eventos v2 não têm efeito de disparo. As escolhas têm só o custo e o benefício **da resposta**: gasto concentrado nas UFs atingidas (`atLocation`), aprovação e relação com os governadores nelas, atividade de reconstrução, e o custo político de não responder.
- **Versões novas, sem editar as publicadas.** `seca_safra_energia_v2` e `enchentes_metropole_v2` existem só no cenário `brasil_2027_01_v080` (`onlyScenarios`) e declaram `replaces` com os ids antigos: no v0.8.0 os antigos saem do **sorteio**, mas continuam conhecidos, então uma pendência de save em andamento ainda é resolvida como era. Nos cenários até o v0.7.0 nada muda.
- **Texto com o local.** Os textos do evento aceitam `{uf}` (nomes: "Ceará, Piauí e Rio Grande do Sul"), `{uf_principal}`, `{siglas}` ("CE, PI e RS") e `{regiao}` ("Nordeste e Sul"); sem local viram "o país". Valem no briefing, nas escolhas e nas manchetes. A caixa de entrada mostra "Atinge: CE, PI, RS". As notícias e o relatório do mês carregam a ocorrência (`instanceId` = `evento#mês`) e o local; no mapa, o evento e a notícia com local viram um marcador por UF (pin no globo, ícone no 2D; tocar abre a folha Alertas na instância ou o jornal na notícia), e o evento nacional não tem marcador (PLANO_GLOBO.md §7, PR 11).

### 11.3.3 Prevenção hídrica e Defesa Civil (PR 13 do PLANO_GLOBO, cenário v0.8.0)

Status: **PROVISORIO** (forças, custos e prazos). Regras de motor em [ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) §5.21; plano em [PLANO_GLOBO.md](PLANO_GLOBO.md) §7.

- **Três escolhas novas**, só no cenário v0.8.0: **Segurança hídrica do semiárido** (projeto de lei + obra de 3 anos, 6 bilhões por ano, nos 9 estados do semiárido, contra a seca), **Drenagem urbana e contenção de encostas** (projeto de lei + obra, 7 bilhões por ano, nacional, contra as cheias) e **Reforço da Defesa Civil** (rotina da pasta Cidades, 2 bilhões por ano, um pouco contra seca e cheia). Aparecem onde as demais políticas aparecem (Gabinete → políticas públicas; a rotina, nas diretrizes da pasta Cidades).
- **O que fazem.** Reduzem o **dano esperado** da seca e das cheias (PIB, alimentos, energia, atividade da UF), não a chuva: o clima continua o mesmo, só uma parte menor dele vira prejuízo. A proteção por UF tem **teto de 60%**, cresce com retornos decrescentes, só vale onde o programa chega e **depende de a obra estar pronta e mantida** (a obra em andamento protege um pouco, a pronta protege na proporção do ativo, que deprecia; a rotina some quando a dotação some e demora 3 meses para fazer efeito). Em "Por que mudou?" aparece "Prevenção reduziu o dano da seca" (e das chuvas, e a pressão nos preços), ao lado do próprio clima.
- **Custo e política.** Os projetos custam 2 ações de agenda, precisam de espaço no limite de despesas, passam pelo Congresso (o governo precisa de base e capital político) e só andam com orçamento discricionário livre; a rotina custa 1 ação e dotação anual, e a pasta só sustenta uma rotina por vez (disputa com a regularização urbanística e a eficiência do saneamento). Numa UF em emergência climática com prevenção ativa, a relação com o governador melhora um pouco no mês.
- **No mapa.** O projeto de segurança hídrica mostra um pin de obra em cada estado do semiárido enquanto está em andamento; os demais projetos são nacionais e não têm pin (nenhuma coordenada é inventada: a UF vem do conteúdo da política). O cartão da UF lista as obras, a visita e a proteção atual.

### 11.4 Critério de conclusão do protótipo
Jogar os 12 meses, tomar decisões diferentes em duas campanhas, observar consequências diferentes e explicáveis, e conseguir reiniciar ou retomar a campanha.

---

## 12. Explicabilidade

- Cada indicador tem um botão **"Por que mudou?"** que mostra a decomposição da variação do mês por causa (políticas, choques, Banco Central, tendência).
- Cada proposta tem uma **linha do tempo** com o estado atual e o histórico.
- Previsões ministeriais aparecem antes da decisão, com faixa de incerteza (§6).
- O jogo nunca mostra uma "resposta certa".
- **Verdade, publicação e interpretação são coisas distintas.** O motor guarda a verdade (o estado real); o que o jogador lê é a *publicação* — uma estimativa com fonte fictícia, método e versão, período observado, data e margem quando o método dá margem; a *interpretação* (o texto da interface, a manchete) é o que se faz com a publicação. Pesquisas e manchetes seguem o mesmo contrato (`src/engine/information/`): mesma observação depois de reabrir o save, histórico só-acréscimo (retificação é revisão nova, nunca reescrita) e nenhum número interno do eleitorado ou apuração atravessa para o que é publicado. Ler uma publicação não altera o motor nem consome sorteio.

---

## 13. Tom, neutralidade e avisos

- Tela inicial e loja: "Simulação fictícia e independente, sem afiliação a qualquer órgão do governo brasileiro."
- Personagens, partidos (decisão D1 do ROADMAP: fictícios, em blocos) e notícias são fictícios. Nenhuma conduta é atribuída a pessoas reais.
- Instituições reais (Congresso, STF, Banco Central) aparecem como **papéis institucionais genéricos**, sem logotipos oficiais.
- Políticas são descritas por mecanismo e efeito, não por rótulo partidário.
- Testes de viés: campanhas automatizadas com estratégias de orientações diferentes não devem ter vantagem estrutural injustificada (ver [ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) §9).

---

## 14. Fora do escopo da versão 1.0

Multiplayer em tempo real, Forças Armadas e guerra, governar estados ou municípios, IA generativa em diálogos, editor de cenários, diplomacia profunda. Ver Fase 11 em [ROADMAP_2.0.md](ROADMAP_2.0.md).
