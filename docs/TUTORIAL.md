# Tutorial jogável e laboratório de decisões

PLANO_CAMPANHA.md Fase C8.2. O tutorial é um **exercício guiado e descartável**: oito decisões reais do motor, em dois exercícios fictícios, sem gravar nada na campanha em andamento. O laboratório de decisões é o **sandbox fiel**: simula o jogo real e serve para testar combinações sem comprometer a partida.

## Por que existem os dois

| | Tutorial jogável (`/tutorial`) | Laboratório (`/laboratorio`) |
| --- | --- | --- |
| Objetivo | Ensinar o gesto de cada tela | Explorar o motor sem consequência |
| Estado | Em memória, descartável, semente fixa (42) | Simulação própria, sem gravar a partida |
| Narrativa | Exercício de campanha e exercício de governo, separados | Sem roteiro |
| Cobertura | Uma decisão de cada mecânica principal | Painéis completos do jogo |

O tutorial **não** substitui a campanha nem o laboratório: ele mostra onde cada decisão fica no jogo real e termina apontando para os dois.

## As oito decisões

| # | Lição | Onde fica no jogo real | O que muda |
| --- | --- | --- | --- |
| 1 | Campanha: escolher alcance | Eleições › Ações de campanha | Caixa do partido, reconhecimento, uma ação do turno |
| 2 | Debate: escolher postura | Eleições › Debate | Imagem do candidato |
| 3 | Eleição: encerrar a campanha | Eleições › encerrar o turno no mês da eleição | Apuração do 1º e do 2º turno |
| 4 | Orçamento: escolher uma dotação | Gabinete › Políticas públicas › Diretrizes | Dotação anual da rotina, limitada pelo espaço fiscal |
| 5 | Lei: enviar uma proposta | Gabinete › Políticas públicas › Propostas | Tramitação no Congresso, sem aprovação garantida |
| 6 | Congresso: negociar apoio | Congresso › Propostas › Negociar | Apoio do bloco, agenda e capital político |
| 7 | Crise: responder à CPI | Alertas e Eventos › CPI | Custo político e desgaste |
| 8 | Gabinete: escolher indicação | Congresso › Gabinete › Nomear ministro | Apoio político e capacidade de gestão da pasta |

Depois da eleição, o exercício de governo começa em um estado de posse novo. A vitória ou a derrota da campanha **não** vira posse automática: o resultado eleitoral fica no relatório do passo 3 e a tela diz que o exercício seguinte é independente.

## O que cada tela mostra

- **Sua situação** — os números que a escolha pode mover: na campanha, caixa do partido, limite de ações por turno, pesquisa (share e margem) e faixas de reconhecimento; no governo, aprovação, espaço fiscal, limite de ações e carteira (obras e gargalo).
- **Resultado do mês anterior** — começa pelo que o jogador escolheu (`Você escolheu: …`), depois o que aconteceu: recusas com motivo, apuração dos dois turnos, pesquisa contra o resultado, tramitação, eventos respondidos e notas.
- **O que a sua escolha mudou** — só as causas do jogador (`acao:`, `debate`, `diretriz:`, `proposta:`, `acrescimo:` e eventos que ele respondeu), agregadas por causa e indicador. O resto do mês aparece como contagem, sem competir com a escolha.
- **O que aconteceu no período** — os meses simulados até a votação, com as transições da proposta e o desfecho (execução, rejeição ou pendência).
- **Carteira de obras** — fase, progresso, orçamento executado, gargalo, manutenção anual e saldo plurianual previsto (EX-08/EX-09). É a ponte para PPA, LDO e LOA, que ficam no Gabinete e no laboratório.
- **A votação leva tempo** — a passagem do tempo é explícita: a tela informa quantos meses serão simulados e espera o jogador avançar. Antes, a simulação acontecia escondida dentro da negociação.

## Passagem do tempo, voltar e recomeçar

- `prepareAdvance` calcula o estado e os relatórios do período **sem aplicar**; `advance()` aplica. Enquanto há passagem pendente, `choose()` recusa nova escolha.
- **Voltar uma escolha** desfaz a última decisão ou a passagem do tempo, pelo histórico de checkpoints.
- **Recomeçar** limpa o cache do cenário e volta ao passo 1.
- O tutorial fica em memória por cenário (`guidedTutorialFor`): sair para o Painel e reabrir não reinicia o exercício.

## Robustez e acessibilidade

- `tutorialContentIssues(content)` confere ids, custos, rotinas, propostas, ministério, blocos e escolhas da CPI. Se o cenário não tiver o que as lições usam, a tela mostra o problema em vez de abrir lições vazias.
- Os valores das opções (custos, dotações, gestão) vêm do catálogo (`formatMoneyThousands`, `formatMoneyMillions`, `managementProfile`), não de texto escrito à mão.
- Cada lição anuncia a etapa ao leitor de tela, as listas usam região viva e os botões têm `accessibilityHint` com o detalhe da opção. Trocar de passo rola a tela ao topo.
- A escolha inválida vira mensagem na tela, não crash.

## O que o tutorial não cobre

PPA, LDO e LOA em detalhe, a rotina inteira da carteira e os painéis completos de economia e Congresso. Para isso, o encerramento aponta para o laboratório de decisões (quando há campanha ativa) e para o Gabinete no jogo.

## Testes

- `src/store/guidedTutorial.test.ts` — percurso de oito decisões, alternativas distintas, negociação com a proposta social, passagem explícita e reversível, `back()` no começo, `lessonAt` fora da faixa, guarda de conteúdo e cache por cenário.
- `src/components/campaign/tutorialView.test.ts` — separação e agregação dos efeitos, linha de efeito, situação na campanha e no governo, eleição com pesquisa contra o resultado, carteira com gargalo e saldo plurianual.
- `src/components/campaign/campaignTutorial.test.ts` — ajuda estática coerente com limite de agenda, margem, reconhecimento e a diferença tutorial × laboratório.
