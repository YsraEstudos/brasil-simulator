window.FEATURES_DADOS = {
  "versao": 2,
  "mostrarConcluidas": true,
  "categorias": [
    {
      "id": "cat-tutorial",
      "nome": "Tutorial e ensino",
      "features": [
        {
          "id": "feat-personagens",
          "titulo": "Personagens explicativos feitos por IA",
          "descricao": "Personagens ilustrados que explicam o jogo de forma visual, no lugar de textos longos.",
          "concluida": false,
          "cor": "amarelo",
          "tamanho": "g",
          "itens": [],
          "html": "<p>O autor vai criar personagens ilustrados que explicam o jogo de forma visual (regras, telas e consequências das decisões), no lugar de textos longos.</p>"
        }
      ],
      "pastas": []
    },
    {
      "id": "cat-expansoes",
      "nome": "Expansões",
      "features": [
        {
          "id": "feat-expansoes",
          "titulo": "Expansões",
          "descricao": "Ideias para depois da versão 1.5.",
          "concluida": false,
          "cor": "azul",
          "tamanho": "p",
          "itens": [],
          "html": "<p>A definir pelo autor. Ainda não há itens nesta seção.</p>"
        }
      ],
      "pastas": []
    },
    {
      "id": "cat-escopo",
      "nome": "Mudanças de escopo (V1 vs. Expansão)",
      "features": [
        {
          "id": "feat-corte-escopo",
          "titulo": "Corte de escopo: Caixa 2 e cassações",
          "descricao": "Ficam para DLC/update. Sem sistema jurídico de provas, dinheiro ilícito vira só um botão de aposta frustrante.",
          "concluida": false,
          "cor": "rosa",
          "tamanho": "m",
          "itens": [
            {
              "id": "it-escopo-1",
              "texto": "Caixa 2 fora do lançamento",
              "feito": false
            },
            {
              "id": "it-escopo-2",
              "texto": "Cassações fora do lançamento",
              "feito": false
            },
            {
              "id": "it-escopo-3",
              "texto": "Teto de gastos como trava rígida de orçamento (não pode gastar acima do teto, só gerenciar de onde vem o dinheiro)",
              "feito": false
            }
          ],
          "html": "<p></p>"
        },
        {
          "id": "feat-legislacao-data",
          "titulo": "Legislação data-driven (ElectoralLawConfig)",
          "descricao": "O motor lê um JSON do ano eleitoral (ex.: regras TSE 2026) em vez de prazos fixos no código.",
          "concluida": false,
          "cor": "azul",
          "tamanho": "m",
          "itens": [
            {
              "id": "it-lei-1",
              "texto": "Prazo de filiação e domicílio eleitoral: 6 meses antes do pleito (início de abril)",
              "feito": false
            },
            {
              "id": "it-lei-2",
              "texto": "Janela partidária: 30 dias entre março e abril, para trocar de partido sem perder o cargo",
              "feito": false
            },
            {
              "id": "it-lei-3",
              "texto": "Trava de impulsionamento digital: desliga 48h antes do 1º turno e 24h antes do 2º",
              "feito": false
            }
          ],
          "html": "<p></p>"
        },
        {
          "id": "feat-telegrafia",
          "titulo": "Telegrafia causal (fim do sorteio punitivo)",
          "descricao": "Nenhum aliado trai e nenhum assessor pede demissão por sorteio. Toda ruptura passa por estados visíveis.",
          "concluida": false,
          "cor": "verde",
          "tamanho": "m",
          "itens": [
            {
              "id": "it-telegrafia-1",
              "texto": "Três estados visíveis: Estável → Atrito (aviso com motivo claro) → Ruptura",
              "feito": false
            },
            {
              "id": "it-telegrafia-2",
              "texto": "O jogador escolhe pagar o preço político para contornar a crise ou aceitar o rompimento",
              "feito": false
            }
          ],
          "html": "<p></p>"
        }
      ],
      "pastas": []
    },
    {
      "id": "cat-caminho-eleitoral",
      "nome": "Caminho eleitoral",
      "features": [],
      "pastas": [
        {
          "id": "cat-progressao",
          "nome": "Progressão e viabilidade",
          "features": [
            {
              "id": "feat-viabilidade",
              "titulo": "Painel de viabilidade eleitoral (6 variáveis)",
              "descricao": "Seis variáveis no back-end alimentam um único painel de viabilidade na interface.",
              "concluida": false,
              "cor": "amarelo",
              "tamanho": "g",
              "itens": [
                {
                  "id": "it-viab-1",
                  "texto": "Reconhecimento: % do eleitorado que sabe quem você é (decai fora de época eleitoral)",
                  "feito": false
                },
                {
                  "id": "it-viab-2",
                  "texto": "Reputação (valência): imagem positiva contra rejeição, ligada às tags do histórico",
                  "feito": false
                },
                {
                  "id": "it-viab-3",
                  "texto": "Base territorial: força por estado e região",
                  "feito": false
                },
                {
                  "id": "it-viab-4",
                  "texto": "Influência partidária: capital com a executiva e as bancadas do partido",
                  "feito": false
                },
                {
                  "id": "it-viab-5",
                  "texto": "Capacidade de recursos: doadores, autofinanciamento e verba partidária",
                  "feito": false
                },
                {
                  "id": "it-viab-6",
                  "texto": "Histórico eleitoral: vitórias, votações, alianças cumpridas ou traições",
                  "feito": false
                },
                {
                  "id": "it-viab-7",
                  "texto": "Origem escolhida no início: carreira política (padrão) ou sem carreira política, como empresário, militar ou influenciador digital",
                  "feito": false
                },
                {
                  "id": "it-viab-8",
                  "texto": "Sem carreira política, a origem define o começo das variáveis: empresário ganha capacidade de recursos e base de doadores; militar ganha reputação e base territorial; influenciador ganha reconhecimento alto e base territorial baixa",
                  "feito": false
                },
                {
                  "id": "it-viab-9",
                  "texto": "Sem cargo nem partido, a influência partidária começa em zero: é preciso se filiar a um partido que aceite o nome antes da convenção",
                  "feito": false
                },
                {
                  "id": "it-viab-10",
                  "texto": "Ponto de partida: Presidência (mandato em exercício): o jogador já é o Presidente eleito e gerencia Congresso, economia e ministérios",
                  "feito": false
                },
                {
                  "id": "it-viab-11",
                  "texto": "Ponto de partida: Corrida eleitoral (campanha de 45 dias): o jogador já é o candidato homologado na convenção e foca em debates, tempo de TV e votos de 1º e 2º turno",
                  "feito": false
                },
                {
                  "id": "it-viab-12",
                  "texto": "Ponto de partida: Pré-campanha (ruas, redes e articulação): o jogador ainda não é o candidato oficial; precisa criar reconhecimento na internet, viajar os estados, convencer o partido e vencer a convenção interna",
                  "feito": false
                },
                {
                  "id": "it-viab-13",
                  "texto": "Intenção de voto = reconhecimento × aprovação (ex.: 20% de reconhecimento × 50% de aprovação = 10%; subir o reconhecimento para 40% leva a 20%)",
                  "feito": false
                }
              ],
              "html": "<p>Ao criar a candidatura, o jogador escolhe o perfil. Cada perfil começa com valores diferentes nas variáveis do painel, e são esses valores que definem onde a campanha será mais fácil e onde será mais difícil. Os números abaixo são <b>PROVISORIO</b>, a calibrar.</p><table><thead><tr><th>Perfil</th><th>Reconhecimento</th><th>Influência partidária</th><th>Capacidade de recursos</th><th>Base territorial</th></tr></thead><tbody><tr><td>Político de estado</td><td>Baixo (15%)</td><td>Muito alto (70%)</td><td>Médio</td><td>Forte em 1 estado</td></tr><tr><td>Influencer</td><td>Muito alto (60%)</td><td>Quase zero (10%)</td><td>Baixo</td><td>Dispersa no país</td></tr><tr><td>Empresário</td><td>Baixo (10%)</td><td>Baixo (20%)</td><td>Muito alto (80%)</td><td>Fraca</td></tr><tr><td>Militar / linha-dura</td><td>Médio (35%)</td><td>Médio (30%)</td><td>Baixo</td><td>Média</td></tr></tbody></table><p><b>Facilidades e dificuldades de cada perfil:</b></p><ul><li><b>Político de estado:</b> fácil montar apoio partidário e ter base forte em um estado; difícil ganhar nome no país inteiro, porque o reconhecimento nacional é baixo.</li><li><b>Influencer:</b> fácil ser conhecido e alcançar muitos eleitores pelas redes; difícil conquistar o partido (influência quase zero) e financiar a campanha (recursos baixos).</li><li><b>Empresário:</b> fácil financiar a campanha (capacidade de recursos muito alta); difícil ser reconhecido e ganhar força dentro do partido.</li><li><b>Militar / linha-dura:</b> perfil equilibrado, com reconhecimento, influência e base médios; a dificuldade maior é a falta de recursos.</li></ul><p>Quem não tem carreira política começa com esses valores e precisa construí-los durante a pré-campanha e a campanha.</p><p><b>A fórmula simples do jogo:</b> votos = quem te conhece × quem gosta de você. Para o jogador não se perder, a mecânica básica da pré-campanha é uma conta simples e visual:</p><ul><li><b>Reconhecimento (ou visibilidade):</b> quantas pessoas sabem quem você é, de 0% a 100%.</li><li><b>Aprovação (ou imagem/popularidade):</b> das pessoas que te conhecem, quantas votariam em você e quantas te rejeitam.</li></ul><p>Exemplo: se 20% do Brasil te conhece e metade dessas pessoas gosta de você (50% de aprovação), sua intenção de voto nas pesquisas é 10%. Se você aumentar quem te conhece para 40%, seus votos sobem para 20% automaticamente.</p>"
            },
            {
              "id": "feat-pre-campanha",
              "titulo": "Pré-campanha (12 a 18 meses antes da eleição)",
              "descricao": "Turnos trimestrais de decisão para viajar, articular e testar o nome.",
              "concluida": false,
              "cor": "verde",
              "tamanho": "p",
              "itens": [
                {
                  "id": "it-pre-1",
                  "texto": "Viajar pelo país, usando o cargo atual ou aparições na mídia (sobe base territorial)",
                  "feito": false
                },
                {
                  "id": "it-pre-2",
                  "texto": "Articular com líderes (sobe influência partidária)",
                  "feito": false
                },
                {
                  "id": "it-pre-3",
                  "texto": "Testar o nome em pesquisas internas",
                  "feito": false
                }
              ],
              "html": "<p></p>"
            },
            {
              "id": "feat-convencao",
              "titulo": "Convenção partidária (o grande gargalo)",
              "descricao": "Querer ser candidato não garante a vaga. Se há um cacique com mais influência, abre o evento de convenção.",
              "concluida": false,
              "cor": "rosa",
              "tamanho": "m",
              "itens": [
                {
                  "id": "it-conv-1",
                  "texto": "Disputar a prévia interna (gera racha se vencer por pouco)",
                  "feito": false
                },
                {
                  "id": "it-conv-2",
                  "texto": "Compor a chapa: aceitar ser vice ou disputar o Senado/governo em troca de apoio futuro",
                  "feito": false
                },
                {
                  "id": "it-conv-3",
                  "texto": "Recuar e apoiar o cacique (acumula crédito e Fundo Eleitoral para a própria reeleição)",
                  "feito": false
                },
                {
                  "id": "it-conv-4",
                  "texto": "Mudar de partido antes do prazo de abril (legenda menor, com menos TV e dinheiro)",
                  "feito": false
                }
              ],
              "html": "<p></p>"
            }
          ],
          "pastas": []
        },
        {
          "id": "cat-mecanicas",
          "nome": "Mecânicas refatoradas (A a I)",
          "features": [
            {
              "id": "feat-mec-a-dinheiro",
              "titulo": "A. Dinheiro, FEFC e orçamento",
              "descricao": "Três fontes: FEFC, doações privadas e recursos próprios, sempre limitados pelo teto legal do cargo.",
              "concluida": false,
              "cor": "amarelo",
              "tamanho": "g",
              "itens": [
                {
                  "id": "it-a-1",
                  "texto": "Negociação do FEFC: a executiva partidária fatia a cota que vem da bancada eleita",
                  "feito": false
                },
                {
                  "id": "it-a-2",
                  "texto": "Estratégica e Extremo: negociar a cota na convenção cumprindo metas do partido (ex.: puxar votos para a bancada)",
                  "feito": false
                },
                {
                  "id": "it-a-3",
                  "texto": "Casual: orçamento inicial 40% mais folgado e divisão em 3 áreas, sem proteção contra falência",
                  "feito": false
                },
                {
                  "id": "it-a-4",
                  "texto": "Alertas vermelhos do assessor ignorados e caixa queimado no 1º mês deixam a campanha sem verba nas semanas finais",
                  "feito": false
                }
              ],
              "html": "<p></p>"
            },
            {
              "id": "feat-mec-b-equipe",
              "titulo": "B. Equipe e assessores",
              "descricao": "Cada assessor tem competência de 1 a 5, especialidade tática e termômetro de satisfação.",
              "concluida": false,
              "cor": "azul",
              "tamanho": "g",
              "itens": [
                {
                  "id": "it-b-1",
                  "texto": "Especialidades: Mobilização Digital, Contenção de Crise, Articulação Regional, Preparação de Debate",
                  "feito": false
                },
                {
                  "id": "it-b-2",
                  "texto": "Casual: equipe competente pré-contratada, que cobra salário do orçamento da campanha",
                  "feito": false
                },
                {
                  "id": "it-b-3",
                  "texto": "Estratégica: montar a equipe pelas especialidades (ex.: Contenção de Crise quando a rejeição é alta)",
                  "feito": false
                },
                {
                  "id": "it-b-4",
                  "texto": "Extremo: linhas vermelhas por assessor (ex.: estrategista ideológico perde satisfação com aliança fisiológica)",
                  "feito": false
                },
                {
                  "id": "it-b-5",
                  "texto": "Extremo: antes de pedir demissão, o assessor emite um ultimato no gabinete",
                  "feito": false
                }
              ],
              "html": "<p></p>"
            },
            {
              "id": "feat-mec-c-pesquisas",
              "titulo": "C. Pesquisas eleitorais (amostragem e viés AAPOR)",
              "descricao": "Sai o sorteio simples de ±3%. Entra amostragem com viés de cobertura, com perfil técnico por instituto.",
              "concluida": false,
              "cor": "rosa",
              "tamanho": "m",
              "itens": [
                {
                  "id": "it-c-1",
                  "texto": "Digital/telefônica: barata e rápida, erra mais no eleitorado de baixa renda e idoso, capta ondas das redes",
                  "feito": false
                },
                {
                  "id": "it-c-2",
                  "texto": "Presencial domiciliar: cara e lenta, precisa no território, mas mostra uma fotografia de 5 a 7 dias atrás",
                  "feito": false
                },
                {
                  "id": "it-c-3",
                  "texto": "Casual: o assessor entrega o relatório já interpretado",
                  "feito": false
                },
                {
                  "id": "it-c-4",
                  "texto": "Estratégica: vê a margem de erro e o perfil do instituto",
                  "feito": false
                },
                {
                  "id": "it-c-5",
                  "texto": "Extremo: institutos soltam números divergentes no mesmo dia; é preciso abrir a ficha técnica (amostra, método, estrato)",
                  "feito": false
                },
                {
                  "id": "it-c-6",
                  "texto": "Diagnóstico regional (ação de agenda + verba): ilumina a região por 3 a 6 meses com a maior dor, o tom que agrada, o tom proibido e o canal campeão",
                  "feito": false
                },
                {
                  "id": "it-c-7",
                  "texto": "Presente do partido: com apoio partidário alto (acima de 60%, PROVISORIO), a executiva entrega o relatório regional de graça",
                  "feito": false
                },
                {
                  "id": "it-c-8",
                  "texto": "Margem de erro: o resultado real de um mês pode oscilar em torno de ±5 pontos em relação ao relatório do assessor (PROVISORIO)",
                  "feito": false
                }
              ],
              "html": "<p>No início, cada região aparece com informações básicas (ex.: \"Nordeste: prioridades desconhecidas\"). Fazer campanha ali sem pesquisar é uma aposta no escuro: pode acertar no chute ou cometer uma gafe terrível.</p><p><b>Como descobrir o que cada região quer:</b></p><ul><li><b>Opção A, diagnóstico regional (pesquisa própria):</b> custa 1 ação de agenda e um pouco de verba. Ilumina a região por 3 a 6 meses com uma ficha: a maior dor (ex.: inflação dos alimentos e falta d'água no sertão), o tom que agrada, o tom proibido (que gera rejeição) e o canal campeão (ex.: rádio local e WhatsApp).</li><li><b>Opção B, presente do partido:</b> os grandes partidos têm fundações com dinheiro do Fundo Partidário e fazem pesquisas o ano todo. Com apoio partidário alto (acima de 60%, PROVISORIO), a executiva entrega o relatório na mesa do candidato, de graça. O político tradicional se dá muito bem aqui; o influencer ou o outsider que brigou com o partido precisa gastar ações e dinheiro próprios para descobrir.</li></ul><p><b>Margem de erro (nível 1):</b> a pesquisa qualitativa nunca é exata. Se o assessor diz que o tom \"Gestor\" tem 70% de aprovação em São Paulo, o resultado real do mês pode oscilar entre 65% e 75%. Você tem boa noção, mas nunca certeza absoluta.</p>"
            },
            {
              "id": "feat-mec-d-comunicacao",
              "titulo": "D. Comunicação e retorno decrescente",
              "descricao": "Impacto = ln(1 + Investimento / CustoBase) × AlcanceCanal × Afinidade × (1 − Saturação) × Credibilidade.",
              "concluida": false,
              "cor": "verde",
              "tamanho": "m",
              "itens": [
                {
                  "id": "it-d-1",
                  "texto": "Retorno decrescente logarítmico: dobrar o investimento no mesmo tema e região dá só um ganho marginal",
                  "feito": false
                },
                {
                  "id": "it-d-2",
                  "texto": "Persistência: reconhecimento e percepção decaem a uma taxa fixa por turno, sem sumir ao pausar a propaganda",
                  "feito": false
                },
                {
                  "id": "it-d-3",
                  "texto": "Premia quem construiu imagem desde a pré-campanha, em vez de quem só compra mídia",
                  "feito": false
                },
                {
                  "id": "it-d-4",
                  "texto": "Combo de campanha em 3 toques: onde (região), como (canal) e o quê (tom do discurso), ao gastar uma ação de agenda em comunicação",
                  "feito": false
                },
                {
                  "id": "it-d-5",
                  "texto": "Efeito cobertor curto: uma fala forte que ganha um estado pode viralizar e custar rejeição em outro no mês seguinte",
                  "feito": false
                },
                {
                  "id": "it-d-6",
                  "texto": "Sorteio em cada ação na internet ou na rua: 10% de sucesso crítico (fenômeno viral) e 10% de falha crítica (gafe fora de contexto) (PROVISORIO)",
                  "feito": false
                }
              ],
              "html": "<p>Cada ação de comunicação responde a duas perguntas:</p><ul><li><b>Reconhecimento (volume de barulho):</b> quantas pessoas viram o que você fez. Depende do dinheiro investido e do canal.</li><li><b>Aprovação (afinidade cultural):</b> a mensagem bateu com o que aquele povo valoriza? Se bateu, o reconhecimento vira voto e apoio (+ aprovação). Se errou o tom, o reconhecimento vira piada ou ódio (+ rejeição, o efeito tiro pela culatra).</li></ul><p><b>O combo de campanha em 3 toques.</b> Ao gastar uma ação de agenda em comunicação, a tela pede três escolhas: <b>onde</b> (região), <b>como</b> (canal) e <b>o quê</b> (tom do discurso).</p><p><b>Passo 1, onde focar (perfil de cada região):</b> cada região tem pesos culturais invisíveis.</p><ul><li><b>Nordeste:</b> valoriza calor humano, proximidade, dignidade, programas sociais e cultura festiva. Rejeita soberba e discursos de corte de direitos.</li><li><b>São Paulo / Sudeste urbano:</b> pragmatismo, cobrança de resultados (\"o que você já fez?\"), foco em emprego e forte polarização (antipetismo no interior e nos bairros nobres).</li><li><b>Sul:</b> apelo de ordem, valorização do trabalho e do mérito, combate a privilégios. Alta rejeição a discursos assistencialistas.</li><li><b>Centro-Oeste e interior:</b> coração do agronegócio e dos valores tradicionais; infraestrutura de escoamento e segurança no campo.</li><li><b>Rio de Janeiro:</b> foco massivo em segurança pública (milícia e tráfico), forte presença religiosa e sensacionalismo na imprensa.</li><li><b>Minas Gerais (o fiel da balança):</b> desconfia de radicalismos. Aprecia sobriedade, conciliação e promessas de infraestrutura regional.</li></ul><p><b>Passo 2, como a mensagem chega (canal):</b></p><ul><li><b>Vídeos curtos, memes e TikTok:</b> custo baixo e alcance explosivo entre jovens e periferias. Ótimo para carisma e humor, arriscado se soar infantil.</li><li><b>Comício, carreata e showmício de rua:</b> custo alto de tempo e dinheiro. Gera calor humano, imagens de multidão e lealdade profunda no interior.</li><li><b>Podcasts longos e rádio:</b> o rádio ainda manda no interior. Podcasts de 2 a 3 horas constroem autoridade técnica e convencem a classe média e os indecisos do Sudeste e do Sul.</li><li><b>Disparos de WhatsApp e grupos comunitários:</b> fidelizam nichos (igrejas, agro, policiais), mas atraem a vigilância da imprensa e o risco de processos no TSE.</li></ul><p><b>Passo 3, o tom do discurso (conteúdo):</b></p><ol><li><b>Carismático e esperança:</b> comida no prato, abraço no povo, dignidade e jingle chiclete.</li><li><b>Gestor técnico:</b> déficit zero, atração de empresas, planilhas e eficiência.</li><li><b>Linha-dura e ordem:</b> bandido na cadeia, autoridade, combate à baderna e valores da família.</li><li><b>Ataque ao opositor:</b> expor o passado do rival, as contradições e os escândalos.</li><li><b>Trator do produtor:</b> estradas, crédito rural e liberdade para quem produz.</li></ol><p><b>Efeito cobertor curto:</b> na política real não dá para agradar todo mundo, e a internet conecta tudo. Exemplo: você faz um comício em Santa Catarina (Sul) com o tom \"gestor técnico\" e solta uma frase dura contra o Bolsa Família. Em Santa Catarina, a aprovação sobe 15%. Mas o áudio, gravado por um celular, viraliza e vira notícia nacional. No mês seguinte, no Nordeste, a oposição usa a frase no rádio e a rejeição sobe 20% de imediato. O jogador pensa: \"ganhei o Sul, mas criei um monstro contra mim no Nordeste; como consertar isso agora?\"</p><p><b>Sorte no viral (nível 2):</b> em toda ação na internet ou na rua, o motor sorteia um dado invisível. Sucesso crítico (10%, fenômeno viral): o jingle grudou ou uma dança virou trend; o reconhecimento do mês dobra, sem custo extra. Falha crítica (10%, gafe): um opositor corta um segundo do seu discurso e manda no grupo da família; você ganha reconhecimento, mas também rejeição extra, e a próxima ação vira contenção de danos.</p><p><b>Feedback das ruas:</b> depois de cada mês, a tela mostra reações populares, e não só números. Exemplo: um eleitor de Fortaleza gosta de quem foi à feira, tomou caldo de cana e falou de água e emprego para o sertão (+ aprovação); um eleitor dos Jardins, em São Paulo, acha o discurso populista e quer ver como as contas da União vão ser equilibradas (- aprovação). A manchete do jornal pode mostrar um vídeo que viralizou e a crítica da oposição.</p>"
            },
            {
              "id": "feat-mec-e-debates",
              "titulo": "E. Debates: argumento e coerência",
              "descricao": "Atributos viram modificadores de execução. O centro é a matriz pedra-papel-tesoura de argumentos.",
              "concluida": false,
              "cor": "amarelo",
              "tamanho": "m",
              "itens": [
                {
                  "id": "it-e-1",
                  "texto": "Atacar um tema em que o candidato tem alta credibilidade e a população aprova a gestão dele sai pela culatra",
                  "feito": false
                },
                {
                  "id": "it-e-2",
                  "texto": "Argumento técnico em tema de revolta ou urgência gera percepção de frieza",
                  "feito": false
                },
                {
                  "id": "it-e-3",
                  "texto": "Extremo: réplicas de contradição histórica cruzadas com as tags do passado parlamentar ou executivo",
                  "feito": false
                }
              ],
              "html": "<p></p>"
            },
            {
              "id": "feat-mec-f-aliancas",
              "titulo": "F. Alianças, tempo de TV e transferência de votos",
              "descricao": "Coligar com um partido não transfere votos automaticamente nem dá bônus mágico de alcance.",
              "concluida": false,
              "cor": "azul",
              "tamanho": "m",
              "itens": [
                {
                  "id": "it-f-1",
                  "texto": "Tempo de TV calculado na abertura da campanha: 90% pelas bancadas de deputados federais da coligação e 10% igualitário",
                  "feito": false
                },
                {
                  "id": "it-f-2",
                  "texto": "Transferência de votos depende da afinidade ideológica entre as bases e do engajamento do aliado",
                  "feito": false
                },
                {
                  "id": "it-f-3",
                  "texto": "Acordo só fisiológico (cargos por tempo de TV): leva o tempo de TV, mas os eleitores do partido migram para outro candidato",
                  "feito": false
                }
              ],
              "html": "<p></p>"
            },
            {
              "id": "feat-mec-g-lod",
              "titulo": "G. Adversários autônomos em camadas (LOD)",
              "descricao": "Três níveis de detalhe para manter a bateria e o processador leves, mesmo com centenas de políticos.",
              "concluida": false,
              "cor": "rosa",
              "tamanho": "m",
              "itens": [
                {
                  "id": "it-g-1",
                  "texto": "Tier 1 (3 a 8 adversários diretos): simulados turno a turno com Utility AI; no Casual, recebem pesquisas com mais ruído e alocam orçamento sub-ótimo",
                  "feito": false
                },
                {
                  "id": "it-g-2",
                  "texto": "Tier 2 (~40 grandes lideranças e governadores): ciclos mensais ou trimestrais",
                  "feito": false
                },
                {
                  "id": "it-g-3",
                  "texto": "Tier 3 (~500 base parlamentar e municipal): cálculo estatístico agregado a cada ciclo eleitoral de 2 anos",
                  "feito": false
                }
              ],
              "html": "<p></p>"
            },
            {
              "id": "feat-mec-h-calendario",
              "titulo": "H. Calendário orientado a eventos",
              "descricao": "O botão principal deixa de ser 'Avançar semana' e passa a ser 'Ir para o próximo acontecimento'.",
              "concluida": false,
              "cor": "verde",
              "tamanho": "p",
              "itens": [
                {
                  "id": "it-h-1",
                  "texto": "Fora da eleição: o calendário pula entre marcos (orçamento, crise ministerial, janela partidária, convenção)",
                  "feito": false
                },
                {
                  "id": "it-h-2",
                  "texto": "Campanha de 45 dias: 8 a 12 ciclos de decisão no 1º turno e 4 no 2º",
                  "feito": false
                },
                {
                  "id": "it-h-3",
                  "texto": "Casual: metade dos ciclos é resolvida pela assessoria, parando só nos grandes eventos e debates",
                  "feito": false
                },
                {
                  "id": "it-h-4",
                  "texto": "Eventos sazonais do calendário: São João (Caruaru e Campina Grande), Agrishow (maio) e crises de segurança (Rio) dão bônus ou holofotes a estratégias específicas",
                  "feito": false
                },
                {
                  "id": "it-h-5",
                  "texto": "Eventos imprevistos do mês (ex.: enchente no Sul ou seca no Norte) mudam a prioridade da região: ataques aos rivais naquele mês queimam a imagem",
                  "feito": false
                }
              ],
              "html": "<p><b>Eventos sazonais.</b> O mapa recebe oportunidades do calendário, para que o jogo não fique repetitivo:</p><ul><li><b>Junho (festas juninas):</b> presença física em Caruaru (PE) ou Campina Grande (PB) dá bônus triplo de reconhecimento e carisma.</li><li><b>Maio (Agrishow, em SP, e Centro-Oeste):</b> ir com o discurso \"trator do produtor\" atrai doações de empresários do agro.</li><li><b>Crise de segurança no Rio:</b> se estourar uma guerra de facções, quem usar a ação de linha-dura no RJ ganha os holofotes da imprensa nacional.</li></ul><p><b>Eventos imprevistos (nível 3).</b> Às vezes o humor de uma região muda por causa de um fato real do país. Em abril, por exemplo, uma enchente violenta no Sul ou uma seca recorde no Norte faz a prioridade do povo daquele estado virar 100% socorro e solidariedade. Quem insistir em discurso de ataque aos rivais naquele mês parece insensível e queima a própria imagem.</p>"
            },
            {
              "id": "feat-mec-i-derrotas",
              "titulo": "I. Consequências contextuais das derrotas",
              "descricao": "O pós-eleição compara expectativa com resultado, em vez de transformar votos em prestígio sempre do mesmo jeito.",
              "concluida": false,
              "cor": "amarelo",
              "tamanho": "m",
              "itens": [
                {
                  "id": "it-i-1",
                  "texto": "Derrota honrosa: azarão que começa com 3% e termina com 22% ganha influência, convites para governos aliados e vira nome natural para a próxima",
                  "feito": false
                },
                {
                  "id": "it-i-2",
                  "texto": "Derrota vexatória: favorito que recebe a maior fatia do FEFC e fica fora do 2º turno perde influência, vê aliados migrarem e reconstrói a carreira em disputas menores",
                  "feito": false
                }
              ],
              "html": "<p></p>"
            }
          ],
          "pastas": []
        },
        {
          "id": "cat-implementacao",
          "nome": "Ordem de implementação (roadmap enxuto)",
          "features": [
            {
              "id": "feat-fase-1",
              "titulo": "Fase 1: motor eleitoral e demografia",
              "descricao": "Entregável jogável: apuração de 1º e 2º turno com institutos de pesquisa e viés.",
              "concluida": false,
              "cor": "azul",
              "tamanho": "p",
              "itens": [
                {
                  "id": "it-f1-1",
                  "texto": "Coortes de eleitores por região",
                  "feito": false
                },
                {
                  "id": "it-f1-2",
                  "texto": "Fórmula logarítmica de influência",
                  "feito": false
                },
                {
                  "id": "it-f1-3",
                  "texto": "Institutos de pesquisa com viés",
                  "feito": false
                },
                {
                  "id": "it-f1-4",
                  "texto": "Apuração de 1º e 2º turno",
                  "feito": false
                }
              ],
              "html": "<p></p>"
            },
            {
              "id": "feat-fase-2",
              "titulo": "Fase 2: loop de campanha (modo Estratégica)",
              "descricao": "Entregável jogável: campanha com matriz de comunicação, orçamento e duelo tático de debates.",
              "concluida": false,
              "cor": "verde",
              "tamanho": "p",
              "itens": [
                {
                  "id": "it-f2-1",
                  "texto": "Matriz de comunicação sem repetição",
                  "feito": false
                },
                {
                  "id": "it-f2-2",
                  "texto": "Gestão de orçamento e teto",
                  "feito": false
                },
                {
                  "id": "it-f2-3",
                  "texto": "Contratação de assessores",
                  "feito": false
                },
                {
                  "id": "it-f2-4",
                  "texto": "Duelo tático de debates",
                  "feito": false
                }
              ],
              "html": "<p></p>"
            },
            {
              "id": "feat-fase-3",
              "titulo": "Fase 3: partidos, convenções e pré-campanha",
              "descricao": "Entregável jogável: os 6 atributos de viabilidade, disputa interna, FEFC, TV e coligações.",
              "concluida": false,
              "cor": "amarelo",
              "tamanho": "p",
              "itens": [
                {
                  "id": "it-f3-1",
                  "texto": "Os 6 atributos de viabilidade",
                  "feito": false
                },
                {
                  "id": "it-f3-2",
                  "texto": "Disputa interna pela candidatura",
                  "feito": false
                },
                {
                  "id": "it-f3-3",
                  "texto": "Divisão do FEFC",
                  "feito": false
                },
                {
                  "id": "it-f3-4",
                  "texto": "Tempo de TV e coligações",
                  "feito": false
                }
              ],
              "html": "<p></p>"
            },
            {
              "id": "feat-fase-4",
              "titulo": "Fase 4: carreira persistente e IA em camadas",
              "descricao": "Entregável jogável: calendário por eventos, memória histórica e expectativa vs. resultado nas derrotas.",
              "concluida": false,
              "cor": "rosa",
              "tamanho": "p",
              "itens": [
                {
                  "id": "it-f4-1",
                  "texto": "Calendário por eventos",
                  "feito": false
                },
                {
                  "id": "it-f4-2",
                  "texto": "Tags de memória histórica",
                  "feito": false
                },
                {
                  "id": "it-f4-3",
                  "texto": "IA em 3 tiers",
                  "feito": false
                },
                {
                  "id": "it-f4-4",
                  "texto": "Sistema de expectativa vs. resultado nas derrotas",
                  "feito": false
                }
              ],
              "html": "<p></p>"
            },
            {
              "id": "feat-fase-5",
              "titulo": "Fase 5: camadas Casual e Realismo Extremo",
              "descricao": "Entregável jogável: filtro de interface assistida no Casual e ElectoralLawConfig com facções no Extremo.",
              "concluida": false,
              "cor": "azul",
              "tamanho": "p",
              "itens": [
                {
                  "id": "it-f5-1",
                  "texto": "Filtro de interface assistida para o Casual",
                  "feito": false
                },
                {
                  "id": "it-f5-2",
                  "texto": "Ativação do ElectoralLawConfig (regras do TSE)",
                  "feito": false
                },
                {
                  "id": "it-f5-3",
                  "texto": "Facções internas para o Extremo",
                  "feito": false
                }
              ],
              "html": "<p></p>"
            }
          ],
          "pastas": []
        }
      ]
    },
    {
      "id": "cat-redes-sociais",
      "nome": "Redes Sociais",
      "features": [
        {
          "id": "feat-redes-x",
          "titulo": "Feed de Notícias & Debates Rápidos (Inspirado no X / Twitter)",
          "descricao": "Rede voltada para a elite política, jornalistas e militância. Postagens curtas de texto, threads, Trending Topics e guerra de narrativas em tempo real.",
          "concluida": false,
          "cor": "amarelo",
          "tamanho": "g",
          "itens": [
            {
              "id": "it-rx-1",
              "texto": "Feed dinâmico com postagens em tempo real de ministros, bancadas aliadas, oposição e imprensa",
              "feito": false
            },
            {
              "id": "it-rx-2",
              "texto": "Trending Topics: ranking dinâmico dos 10 assuntos mais comentados nacionalmente e por estado",
              "feito": false
            },
            {
              "id": "it-rx-3",
              "texto": "Ação de Publicação: tom institucional, ataque/combate, descontraído/meme ou fato novo",
              "feito": false
            },
            {
              "id": "it-rx-4",
              "texto": "Mecânica de Ratio e Cancelamento: post mal calibrado gera tempestade de críticas e perda de valência",
              "feito": false
            },
            {
              "id": "it-rx-5",
              "texto": "Militância coordenada: apoiadores fervorosos sobem hashtags e rebatem críticas de adversários",
              "feito": false
            }
          ],
          "html": "<p><b>O papel do X (antigo Twitter) na política nacional:</b> onde a bolha política, os jornalistas, os parlamentares e a militância partidária se encontram minuto a minuto para disputar a narrativa pública.</p><h4>Mecânicas no jogo</h4><ul><li><b>Feed dinâmico em tempo real:</b> o jogador acompanha publicações instantâneas de deputados da base, adversários ferrenhos, ministros e veículos de imprensa reagindo a votações e decisões presidenciais.</li><li><b>Trending Topics (Assuntos do Momento):</b> lista dos 10 tópicos mais comentados do país e filtros por estado (ex.: <i>#VotaReforma</i>, <i>#CriseNaSaúde</i>, <i>#EscandaloDosMinisterios</i>, <i>#PreçoDaGasolina</i>). Subir uma hashtag governista ajuda a pautar a imprensa.</li><li><b>Ação de Publicação:</b> o candidato/presidente pode postar escolhendo o tom:<ul><li><i>Comunicado Institucional:</i> postura sóbria, ganha respeito institucional e estabiliza crises.</li><li><i>Ataque / Combate:</i> fustiga rivais e empolga a militância radical, mas eleva a rejeição entre moderados.</li><li><i>Descontraído / Meme:</i> humaniza a figura pública e quebra o gelo com eleitores jovens.</li><li><i>Fato Novo:</i> lança um anúncio surpresa antes da cobertura do Jornal Nacional.</li></ul></li><li><b>Gafes, Ratio e Cancelamento:</b> declarações polêmicas ou contradições passadas podem receber o infame <i>Ratio</i> (quando as respostas críticas superam os likes), gerando manchete negativa no jornal do mês e perda imediata de valência.</li><li><b>Militância Coordenada:</b> eleitores leais e influenciadores alinhados defendem o candidato em massa nos comentários, amortecendo ataques adversários.</li></ul><h4>Impacto no Motor Eleitoral</h4><p>O X não é a rede mais populosa, mas é o epicentro da formação de opinião. Movimentações fortes no X afetam a <b>Reputação (Valência)</b>, a pressão sobre os líderes partidários no Congresso e as manchetes da imprensa tradicional.</p>"
        },
        {
          "id": "feat-redes-instagram",
          "titulo": "Feed Visual, Stories & Vídeos Curtos (Inspirado no Instagram / Reels)",
          "descricao": "Rede de alcance de massa para humanização do candidato. Fotos de comícios, bastidores da campanha, pílulas verticais (Reels) e lives.",
          "concluida": false,
          "cor": "amarelo",
          "tamanho": "g",
          "itens": [
            {
              "id": "it-insta-1",
              "texto": "Feed de fotos e carrosséis: multidões em comícios, propostas em infográficos e fotos humanizadas",
              "feito": false
            },
            {
              "id": "it-insta-2",
              "texto": "Stories de bastidores: registros do dia a dia (café na feira, bastidores) geram bônus de proximidade",
              "feito": false
            },
            {
              "id": "it-insta-3",
              "texto": "Produção de Reels e Shorts: vídeos verticais curtos com legendas dinâmicas e cortes rápidos de discursos",
              "feito": false
            },
            {
              "id": "it-insta-4",
              "texto": "Transmissões ao vivo (Lives): diálogo direto com os cidadãos (alto carisma, risco de gafes ao vivo)",
              "feito": false
            },
            {
              "id": "it-insta-5",
              "texto": "Algoritmo de recomendação: retenção nos primeiros 3 segundos entrega o vídeo para eleitores indecisos",
              "feito": false
            }
          ],
          "html": "<p><b>O papel do Instagram / Reels na campanha:</b> o canal direto para furar a bolha de Brasília e conversar com as famílias, jovens e o eleitor comum que não lê colunas de política.</p><h4>Mecânicas no jogo</h4><ul><li><b>Feed Visual & Carrosséis:</b> publicação de fotos de comícios com multidões, carrosséis explicativos de propostas populares (com design simples) e registros humanizados do candidato comendo pastel na feira ou ao lado da família.</li><li><b>Stories do Dia a Dia (Conteúdo Efêmero):</b> pequenos vídeos gravados com celular no carro ou bastidores de reuniões. Concedem bônus temporário de proximidade e carisma com eleitores indecisos a cada turno.</li><li><b>Produção de Vídeos Verticais (Reels & Shorts):</b> edição de cortes dinâmicos de discursos inflamados, respostas certeiras em debates e trechos de entrevistas.<ul><li><i>Algoritmo de Retenção:</i> vídeos com cortes ágeis e legendas chamativas têm chance de furar a bolha, sendo entregues para milhões de eleitores que ainda não seguiam o perfil.</li><li><i>Música e Trend:</i> uso de áudios em alta para multiplicar o alcance orgânico entre o público jovem.</li></ul></li><li><b>Transmissões ao Vivo (Lives de Campanha):</b> o candidato abre uma live para dialogar sem filtro com a população.<ul><li><i>Alto Carisma:</i> se o candidato tem boa oratória, a live bate recordes de audiência e gera sentimento de autenticidade.</li><li><i>Risco de Gafe:</i> ao vivo não tem edição; caso o candidato se exalte ou erre dados essenciais, o trecho é recortado pela oposição imediatamente.</li></ul></li></ul><h4>Impacto no Motor Eleitoral</h4><p>O Instagram e os vídeos curtos são a principal alavanca para subir o <b>Reconhecimento (% do eleitorado nacional que sabe quem você é)</b> e amenizar a taxa de rejeição através da empatia visual.</p>"
        },
        {
          "id": "feat-redes-metricas",
          "titulo": "Painel de Métricas & Analytics (Social Dashboard)",
          "descricao": "Central de dados digitais: acompanhamento de seguidores por estado, taxa de engajamento, alcance orgânico vs pago e termômetro de sentimento.",
          "concluida": false,
          "cor": "amarelo",
          "tamanho": "g",
          "itens": [
            {
              "id": "it-met-1",
              "texto": "Contador de seguidores por rede e curva de crescimento comparada aos rivais na corrida eleitoral",
              "feito": false
            },
            {
              "id": "it-met-2",
              "texto": "Métricas de engajamento: curtidas, compartilhamentos, comentários e taxa média de retenção de vídeo",
              "feito": false
            },
            {
              "id": "it-met-3",
              "texto": "Tráfego pago eleitoral (Impulsionamento): investimento financeiro com segmentação estadual e trava do TSE",
              "feito": false
            },
            {
              "id": "it-met-4",
              "texto": "Termômetro de sentimento: divisão do público em Apoiadores Fervorosos, Neutros Curiosos e Rejeição/Hate",
              "feito": false
            },
            {
              "id": "it-met-5",
              "texto": "Mapa de calor digital: visualização de penetração digital por UF para calibrar viagens e comícios",
              "feito": false
            }
          ],
          "html": "<p><b>Central de Inteligência Digital (Social Dashboard):</b> substitui palpites e achismos por métricas analíticas em tempo real sobre o alcance e a recepção da campanha.</p><h4>Indicadores Monitorados</h4><ul><li><b>Volume de Seguidores:</b> contagem em tempo real de seguidores no X e no Instagram, com gráfico de evolução mensal e comparativo direto contra os candidatos rivais na corrida eleitoral.</li><li><b>Taxas de Engajamento:</b> cálculo de likes, comentários, compartilhamentos e taxa média de retenção nos vídeos (quantos % assistiram até o final).</li><li><b>Termômetro de Sentimento da Comunidade:</b><ul><li><i>Apoiadores Fervorosos (Verde):</i> eleitores engajados que compartilham e defendem a candidatura voluntariamente.</li><li><i>Neutros / Curiosos (Cinza/Azul):</i> eleitores sem partido definido que assistiram aos vídeos; público-alvo de conversão.</li><li><i>Rejeição / Hate (Vermelho):</i> volume de comentários negativos, ataques de opositores e detratores.</li></ul></li><li><b>Tráfego Pago & Impulsionamento Eleitoral:</b> injeção de recursos (Fundo Partidário ou Dinheiro Próprio) para impulsionar postagens.<ul><li><i>Segmentação Geográfica:</i> impulsionar anúncios apenas nos estados onde o candidato é desconhecido (ex.: focar no Nordeste ou Sul).</li><li><i>Trava TSE:</i> prestação de contas automática; o jogo bloqueia impulsionamentos acima do teto legal e veta impulsionamento anônimo.</li></ul></li><li><b>Mapa de Calor Digital:</b> visualização no mapa do Brasil de onde vem a maior parte da sua audiência online vs onde o candidato ainda é um ilustre desconhecido.</li></ul><h4>Conversão em Votos</h4><p>Seguidores digitais não são votos automáticos na urna, mas compõem a base de multiplicadores de votos e elevam o piso de viabilidade eleitoral na pré-campanha.</p>"
        },
        {
          "id": "feat-redes-producao",
          "titulo": "Estúdio de Criação, Equipe Digital & Viralização",
          "descricao": "Ações de agenda para gravar vídeos, contratação de assessoria digital, memes, gestão de crises e conversão em Reconhecimento eleitoral.",
          "concluida": false,
          "cor": "amarelo",
          "tamanho": "g",
          "itens": [
            {
              "id": "it-prod-1",
              "texto": "Ação de agenda Gravar Conteúdo: gasta tempo do candidato para produzir podcasts, entrevistas e pílulas",
              "feito": false
            },
            {
              "id": "it-prod-2",
              "texto": "Contratação de equipe digital: da equipe voluntária/amadora à agência de marquetagem de elite",
              "feito": false
            },
            {
              "id": "it-prod-3",
              "texto": "Gatilhos de viralização procedural: temas quentes do mês geram bônus de tração de até 5x no algoritmo",
              "feito": false
            },
            {
              "id": "it-prod-4",
              "texto": "Gabinete de desmentidos e contenção de crises: combater boatos antes que contaminem a TV aberta",
              "feito": false
            },
            {
              "id": "it-prod-5",
              "texto": "Vantagem por perfil: o perfil Deputado Digital / Influencer já começa com estúdio próprio e bônus de tração",
              "feito": false
            }
          ],
          "html": "<p><b>A Fábrica de Conteúdo Digital:</b> estruturação profissional da máquina de comunicação da campanha para transformar presença online em capital político real.</p><h4>Mecânicas no jogo</h4><ul><li><b>Ação de Agenda Gravar Conteúdo:</b> gravar podcasts, pílulas de vídeo e sabatinas consome blocos da agenda mensal do candidato, competindo com reuniões no Congresso ou viagens de palanque.</li><li><b>Níveis de Estrutura de Marketing Digital:</b><ul><li><i>Estrutura Amadora (Custo zero):</i> voluntários e assessores imediatos gravam no celular. Produção irregular, baixa qualidade técnica e risco elevado de gafes.</li><li><i>Equipe Digital Profissional (R$ 80.000/mês):</i> videomakers dedicados, editores de corte rápido, roteiristas de pílulas e monitoramento contínuo de tendências.</li><li><i>Agência de Elite & Marqueteiro Estrela (R$ 350.000/mês):</i> estúdio cinematográfico, análise preditiva com inteligência de dados, produção de narrativas de alta persuasão e blindagem de imagem.</li></ul></li><li><b>Gatilhos Procedurais de Viralização:</b> quando um evento do mês estoura (ex.: alta dos alimentos, operação policial, desastre climático), o candidato pode lançar uma resposta rápida. Respostas ágeis recebem bônus de tração de até 5x no algoritmo.</li><li><b>Gabinete de Crise & Desmentidos:</b> equipe de checagem para publicar contraprovas e notas ágeis antes que um boato viralize a ponto de ir para o horário eleitoral na TV.</li><li><b>Sinergia com Perfil de Candidatura:</b><ul><li><i>Deputado Digital / Influencer:</i> começa já com estúdio próprio montado, milhões de seguidores herdados e bônus passivo de +40% no alcance de todas as postagens digitais com custo zero.</li><li><i>Líder Sindical / Popular:</i> começa com baixa presença digital, mas suas postagens ganham forte tração orgânica em grupos comunitários e sindicais.</li><li><i>Empresário / Faria Lima:</i> pode contratar a agência de elite logo no primeiro mês graças ao seu patrimônio inicial de autofinanciamento.</li></ul></li></ul>"
        }
      ],
      "pastas": []
    },
    {
      "id": "cat-mvi7h9m71",
      "nome": "Ideais a se condiderar",
      "features": [],
      "pastas": [
        {
          "id": "cat-mvi7jn3x2",
          "nome": "jogos para jogar",
          "features": [],
          "pastas": [
            {
              "id": "cat-jogo-democracy4",
              "nome": "Democracy 4",
              "features": [],
              "pastas": []
            },
            {
              "id": "cat-jogo-suzerain",
              "nome": "Suzerain",
              "features": [],
              "pastas": []
            },
            {
              "id": "cat-jogo-rebel-inc",
              "nome": "Rebel Inc.",
              "features": [],
              "pastas": []
            },
            {
              "id": "cat-jogo-political-process",
              "nome": "The Political Process",
              "features": [],
              "pastas": []
            },
            {
              "id": "cat-jogo-victoria3",
              "nome": "Victoria 3",
              "features": [],
              "pastas": []
            },
            {
              "id": "cat-jogo-president-simulator",
              "nome": "President Simulator / 21st Century Peace Simulator",
              "features": [],
              "pastas": []
            }
          ]
        },
        {
          "id": "cat-ideias-descartadas",
          "nome": "Ideias descartadas",
          "features": [
            {
              "id": "feat-desc-coalizoes",
              "titulo": "Coalizões reais e troca de cargos (Democracy)",
              "descricao": "Cliff Harris resistiu a multipartidarismo e coalizões por temer uma simulação de acordos de bastidores; quando incluiu, virou divisão fria de porcentagens.",
              "concluida": false,
              "cor": "amarelo",
              "tamanho": "m",
              "itens": [],
              "html": "<p><b>O que foi pensado:</b> o criador de Democracy queria um gabinete em que ministros representassem partidos rivais e exigissem pastas específicas para apoiar o governo.</p><p><b>Por que cortou:</b> achou que o jogador médio ficaria frustrado ao perder o controle de um ministério para a IA e considerou a negociação “chata e burocrática demais”. Quando finalmente adicionou coalizões, simplificou tudo para uma divisão fria de porcentagens eleitorais.</p><p><b>A lição:</b> o que o design ocidental tratou como feio demais é a alma do presidencialismo de coalizão brasileiro. O jogo deve abraçar a tensão de partidos aliados exigindo ministérios, chantagens e derrubada de governo como mecânica central, e não escondê-la.</p>"
            },
            {
              "id": "feat-desc-urban-empire",
              "titulo": "O Parlamento votando em tudo (Urban Empire)",
              "descricao": "A Kalypso submeteu até bueiro e escola de bairro ao voto da Câmara; a tramitação virou gargalo repetitivo e o jogo afundou na crítica.",
              "concluida": false,
              "cor": "rosa",
              "tamanho": "m",
              "itens": [],
              "html": "<p><b>O que tentaram:</b> em 2017, Urban Empire propunha um prefeito que precisava da Câmara de Vereadores para cada decisão da cidade.</p><p><b>Por que deu errado:</b> até a construção de um bueiro ou de uma escola de bairro passava por votação. A tramitação legislativa virou um gargalo burocrático repetitivo e enfadonho.</p><p><b>A lição:</b> nunca levar atos de gestão rotineira ao Congresso. Manter a divisão do GDD: atos do Executivo (decretos, nomeações, contingenciamento) saem por canetada; o Legislativo entra apenas em lei ordinária, PEC, orçamento e sabatina.</p>"
            },
            {
              "id": "feat-desc-republic",
              "titulo": "Simulação de milhões de indivíduos (Republic: The Revolution)",
              "descricao": "Demis Hassabis prometeu simular cada cidadão e político de uma república pós-soviética; o escopo engoliu o projeto e o jogo virou um tabuleiro abstrato.",
              "concluida": false,
              "cor": "azul",
              "tamanho": "g",
              "itens": [],
              "html": "<p><b>O que foi pensado:</b> no início dos anos 2000, Republic: The Revolution prometia simular individualmente cada cidadão, pedestre e político de uma república pós-soviética.</p><p><b>Por que cortou:</b> modelar a rotina de milhares de pessoas drenava o processamento e enlouquecia a IA. Pedestres, animais e crianças foram cortados, e o jogo foi simplificado para um tabuleiro abstrato.</p><p><b>A lição:</b> não simular 215 milhões de brasileiros um a um. Simular instituições, bancadas e grupos de interesse: Faria Lima, evangélicos, agro, servidores, centrais sindicais e Centrão.</p>"
            },
            {
              "id": "feat-desc-suzerain",
              "titulo": "Motor econômico 100% dinâmico (Suzerain)",
              "descricao": "A Torpor queria um modelo macroeconômico dinâmico completo, mas o efeito borboleta tornava o colapso inexplicável; trocou por Pontos de Orçamento.",
              "concluida": false,
              "cor": "verde",
              "tamanho": "m",
              "itens": [],
              "html": "<p><b>O que tentaram:</b> os criadores de Suzerain queriam um motor macroeconômico dinâmico e matemático completo.</p><p><b>Por que cortaram:</b> modelos puros criavam o “efeito borboleta incontrolável”: o jogador aumentava um imposto e três turnos depois o país quebrava sem a narrativa explicar por quê. Trocaram a matemática por Pontos de Orçamento estáticos e árvores de decisão.</p><p><b>A lição:</b> o Brasil Simulator pode manter o modelo econômico real do ECONOMIC_MODEL.md, desde que toda variação tenha causa explicada em texto. Se o desemprego sobe 0,5%, o card deve dizer: “Reflexo dos juros altos do Copom segurando o investimento industrial”.</p>"
            },
            {
              "id": "feat-desc-hidden-agenda",
              "titulo": "Escassez de tempo na mesa de despacho (Hidden Agenda)",
              "descricao": "No clássico de 1988, o turno era decidido por quem você recebia no gabinete; atender embaixador e chefe do Exército consumia o mês e deixava o líder camponês furioso.",
              "concluida": false,
              "cor": "amarelo",
              "tamanho": "p",
              "itens": [],
              "html": "<p><b>O que o clássico inventou:</b> em Hidden Agenda (1988), o jogador era presidente de um país centro-americano em crise e não tinha botões mágicos: o turno consistia em escolher quem receber no gabinete.</p><p><b>A mecânica:</b> receber o embaixador americano e o chefe do Exército acabava com o tempo do mês, e o líder dos camponeses esperava furioso na antessala por um “chá de cadeira”.</p><p><b>A lição:</b> a angústia de agenda é real e divertida. O presidente nunca tem tempo para tudo; cada reunião escolhida significa outra bancada ou liderança abandonada.</p>"
            },
            {
              "id": "feat-desc-orcamento-amarrado",
              "titulo": "Orçamento 100% amarrado e dívida asfixiante (Civilization e SimCity)",
              "descricao": "Civilization e SimCity testaram quebra de orçamento e hiperinflação por dívida, mas jogadores odiaram; no Brasil Simulator, o orçamento engessado é o desafio.",
              "concluida": false,
              "cor": "rosa",
              "tamanho": "m",
              "itens": [],
              "html": "<p><b>O que foi pensado:</b> versões de teste de Civilization e SimCity tentaram quebras reais de orçamento e hiperinflação por dívida.</p><p><b>Por que cortaram:</b> jogadores odiavam ter 90% do orçamento preso em juros e custos fixos. Os desenvolvedores deram a ilusão de que todo dinheiro que entra pode ser gasto onde o jogador quiser.</p><p><b>O contraponto:</b> para o Brasil Simulator, o orçamento engessado é justamente o desafio divertido: “você governa uma das maiores economias do mundo, mas só manda em 6% do dinheiro livre”.</p>"
            },
            {
              "id": "feat-desc-judiciario",
              "titulo": "Sistema judiciário ativo (The Political Process e Democracy)",
              "descricao": "The Political Process e Democracy cortaram tribunais que derrubam decretos; a chance é ter um STF ativo, com ADIs e liminares monocráticas.",
              "concluida": false,
              "cor": "azul",
              "tamanho": "m",
              "itens": [],
              "html": "<p><b>O que foi pensado:</b> ter tribunais constitucionais que derrubam decretos do presidente por iniciativa de partidos de oposição.</p><p><b>Por que cortaram:</b> o sistema foi cortado ou reduzido a um “teste de legalidade” instantâneo para evitar que o jogador sentisse que a máquina estava roubando suas decisões.</p><p><b>A oportunidade:</b> transformar o STF em um poder ativo e imprevisível, com ADIs, liminares monocráticas e sabatinas de indicação — algo que nenhum jogo de estratégia política entrega hoje.</p>"
            }
          ],
          "pastas": []
        },
        {
          "id": "cat-ideias-inovadoras",
          "nome": "Ideias inovadoras",
          "features": [
            {
              "id": "feat-inov-alavancas",
              "titulo": "Sistema de alavancas e dossiês (hooks de Crusader Kings)",
              "descricao": "O jogador acumula dossiês sobre parlamentares e ministros e os usa para comprar votos, com risco de vazamento de áudio e crise institucional.",
              "concluida": false,
              "cor": "amarelo",
              "tamanho": "g",
              "itens": [],
              "html": "<p><b>A referência:</b> em Crusader Kings III, descobrir o segredo de um nobre o força a votar a favor. Nenhum jogo moderno de política usa essa moeda suja.</p><p><b>No Brasil Simulator:</b> o jogador acumula ou descobre alavancas sobre parlamentares e ministros — relatório do Coaf sobre um líder de bancada, apoio à reeleição no reduto, diretoria na Itaipu para o irmão de um senador.</p><p><b>O risco divertido:</b> gastar uma alavanca forte para aprovar uma PEC por 1 voto pode vazar um áudio gravado no gabinete no dia seguinte e explodir uma crise institucional.</p>"
            },
            {
              "id": "feat-inov-cpi",
              "titulo": "Mini-jogo da CPI",
              "descricao": "A oposição instala a CPI, o governo escala a tropa de choque e um relatório final desfavorável pode indiciar ministros e abrir a gaveta do impeachment.",
              "concluida": false,
              "cor": "rosa",
              "tamanho": "g",
              "itens": [],
              "html": "<p><b>A inovação:</b> nenhum jogo simulou uma CPI. Quando a oposição reúne 1/3 das assinaturas, por queda de aprovação ou escândalo, a comissão é instalada.</p><p><b>Como funciona:</b> por 3 a 5 turnos, a CPI vira evento fixo no início do mês. O jogador escala a tropa de choque (deputados governistas articulados) para tumultuar sessões, apresentar requerimentos de adiamento e blindar ministros.</p><p><b>Consequência:</b> um relatório final desfavorável pode indiciar ministros e abrir a gaveta do impeachment, dando a sensação de viver uma crise de Brasília transmitida pela TV Senado.</p>"
            },
            {
              "id": "feat-inov-indicacao",
              "titulo": "Indicação técnica vs. entrega da chave do cofre",
              "descricao": "Cada estatal e ministério aceita um técnico (eficiência, mercado e imprensa) ou um apadrinhado (30 a 50 votos fiéis e risco crescente de Operação da PF).",
              "concluida": false,
              "cor": "azul",
              "tamanho": "g",
              "itens": [],
              "html": "<p><b>O dilema:</b> a maioria dos jogos trata cargos como bônus numéricos. Aqui, cada estatal (Petrobras, Caixa, Banco do Brasil, Codevasf, Dnit, Correios) e ministério tem dois caminhos.</p><ul><li><b>Indicação técnica:</b> aumenta eficiência, atrai investimento, agrada mercado e imprensa, mas gera zero votos no Congresso e revolta o partido da base.</li><li><b>Indicação política (Centrão):</b> garante um bloco de 30 a 50 votos fiéis para qualquer PEC, porém acumula Risco de Investigação a cada turno.</li></ul><p><b>Se o risco estourar:</b> o jogador acorda com a manchete de uma Operação da Polícia Federal cumprindo mandados dentro do ministério indicado.</p>"
            },
            {
              "id": "feat-inov-copom",
              "titulo": "Guerra do Boletim Focus e reuniões do Copom",
              "descricao": "A cada 45 dias o Copom decide a Selic; atacar o Banco Central agrada a base, mas piora o Focus, dispara o dólar e encarece os combustíveis no mês seguinte.",
              "concluida": false,
              "cor": "verde",
              "tamanho": "m",
              "itens": [],
              "html": "<p><b>A inovação:</b> o presidente do Banco Central tem mandato fixo e vontade própria; o jogador não move a taxa de juros com uma barra.</p><p><b>O ciclo:</b> a cada 45 dias, a tela do Copom mostra a decisão. Se a política fiscal for frouxa ou o gasto estourar, o Copom sobe a Selic na cara do governo.</p><p><b>A bravata:</b> atacar publicamente o presidente do BC em coletiva sobe a popularidade junto à militância (+4%), mas a Faria Lima reage na hora: o Boletim Focus piora as projeções, a curva de juros futura sobe, o dólar dispara e os combustíveis encarecem no mês seguinte. É um cabo-de-guerra de expectativas.</p>"
            },
            {
              "id": "feat-inov-pauta-bomba",
              "titulo": "Pautas-bomba e batalha da derrubada de veto",
              "descricao": "O Congresso aprova despesa obrigatória gigante; sancionar estoura a LRF, vetar compra briga, e a derrubada do veto vira batalha em sessão conjunta.",
              "concluida": false,
              "cor": "amarelo",
              "tamanho": "m",
              "itens": [],
              "html": "<p><b>A inovação:</b> quando o Congresso quer emparedar o presidente, aprova uma pauta-bomba — um projeto que cria despesa obrigatória gigantesca, como reajuste de 40% para uma categoria barulhenta.</p><p><b>O dilema:</b> sancionar estoura a Lei de Responsabilidade Fiscal e rende advertência do TCU; vetar compra briga aberta com os parlamentares.</p><p><b>A sessão conjunta:</b> uma vez vetado, o veto vai para Câmara e Senado. O jogador tem 1 turno para gastar prestígio, liberar emendas ou articular antes que o Congresso derrube o veto na marra.</p>"
            },
            {
              "id": "feat-inov-dois-feeds",
              "titulo": "Opinião pública em dois feeds: Zap dos tios vs. editorial dos jornais",
              "descricao": "Em vez de uma barra única de aprovação, o humor da nação se divide entre o Zap, visceral ao preço do feijão, e o editorial tradicional, atento às contas públicas.",
              "concluida": false,
              "cor": "rosa",
              "tamanho": "g",
              "itens": [],
              "html": "<p><b>A inovação:</b> substituir a barra genérica de aprovação por dois feeds vivos de opinião pública.</p><ul><li><b>Redes e WhatsApp:</b> reagem visceralmente ao preço do feijão, do gás e da gasolina, além de memes satíricos sobre o governo.</li><li><b>Editorial tradicional e mercado:</b> reagem à estabilidade das contas públicas, à segurança jurídica e à diplomacia.</li></ul><p><b>O cobertor curto:</b> a decisão que faz o editorial elogiar o governo como “maduro e responsável” pode ser a mesma que sobe o botijão e convoca protestos com bonecos infláveis na Esplanada.</p>"
            },
            {
              "id": "feat-inov-orcamento-emendas",
              "titulo": "Orçamento engessado e emendas parlamentares",
              "descricao": "Dos R$ 100 bi, R$ 94 bi já estão carimbados por lei; os R$ 6 bi livres viram moeda de troca por emendas e apoio a reformas.",
              "concluida": false,
              "cor": "azul",
              "tamanho": "m",
              "itens": [],
              "html": "<p><b>A inovação:</b> mostrar o orçamento como ele é. De cada R$ 100 bi, R$ 94 bi já estão carimbados por lei (Previdência, salários, pisos de saúde e educação); só R$ 6 bi são livres.</p><p><b>A mecânica:</b> para aprovar a Reforma Tributária ou da Previdência, os deputados não querem discurso: exigem liberação de emendas parlamentares para as cidades deles.</p><p><b>O dilema:</b> liberar a emenda e cumprir o teto no limite, ou segurar a verba e ver a reforma ser tratorada na comissão.</p>"
            },
            {
              "id": "feat-inov-centrao",
              "titulo": "Bancada do fisiologismo (Centrão)",
              "descricao": "O bloco pragmático sem ideologia fixa: quer orçamento de estatais, diretorias de bancos públicos, verbas regionais e cargos de segundo e terceiro escalão.",
              "concluida": false,
              "cor": "verde",
              "tamanho": "m",
              "itens": [],
              "html": "<p><b>A inovação:</b> em vez de facções ideológicas genéricas, criar a bancada do fisiologismo — o Centrão pragmático.</p><p><b>O que ele quer:</b> orçamento de estatais e diretorias de bancos públicos, verbas regionais e cargos de segundo e terceiro escalão (Codevasf, Dnit, diretorias regionais). Não tem paixão por privatização nem por estatização.</p><p><b>O risco:</b> indicar técnico competente rende eficiência econômica; lotear com apadrinhados garante votos, mas aumenta a cada turno a chance de uma Operação da Polícia Federal com mandados de busca e manchetes no jornal.</p>"
            },
            {
              "id": "feat-inov-stf-liminares",
              "titulo": "Guerra da canetada: STF e liminares monocráticas",
              "descricao": "Medida Provisória agressiva ou nomeação suspeita vira ADI; um ministro sorteado pode conceder liminar monocrática e suspender a política no meio do caminho.",
              "concluida": false,
              "cor": "amarelo",
              "tamanho": "m",
              "itens": [],
              "html": "<p><b>A inovação:</b> nenhum jogo tem a guerra da canetada. Se o presidente assina uma MP agressiva ou faz nomeação suspeita, a oposição entra com uma ADI no STF.</p><p><b>A liminar:</b> um ministro sorteado pode conceder liminar monocrática e suspender a política no meio do caminho.</p><p><b>A sabatina:</b> quando um ministro se aposenta aos 75 anos, a indicação vira o evento do ano. Indicar alguém leal blinda o governo; indicar um técnico evita desgaste no Senado.</p>"
            },
            {
              "id": "feat-inov-impeachment",
              "titulo": "Termômetro da gaveta do presidente da Câmara (impeachment real)",
              "descricao": "Os pedidos acumulam na gaveta; a barra de pressão sobe com crime de responsabilidade e popularidade baixa, e o relacionamento com o presidente da Câmara decide a abertura.",
              "concluida": false,
              "cor": "rosa",
              "tamanho": "g",
              "itens": [],
              "html": "<p><b>A inovação:</b> impeachment não acontece do nada. O presidente da Câmara acumula dezenas de pedidos na gaveta e o jogo mostra a barra “Pressão pela Abertura do Impeachment”.</p><p><b>Como enche:</b> crime de responsabilidade (como pedalada fiscal) e perda de apoio popular elevam a pressão.</p><p><b>A decisão:</b> a abertura depende do relacionamento com o presidente da Câmara. Aliado, ele senta em cima dos pedidos; rompido, deflagra a Comissão Especial e começa uma batalha voto a voto na TV aberta.</p>"
            },
            {
              "id": "feat-inov-governadores",
              "titulo": "Guerra dos governadores e a federação",
              "descricao": "Uma medida que corta ICMS de combustíveis une os 27 governadores, que entram na Justiça contra a União e ameaçam a base de deputados nos estados.",
              "concluida": false,
              "cor": "azul",
              "tamanho": "p",
              "itens": [],
              "html": "<p><b>A inovação:</b> o Brasil não é um país unitário. Aprovar uma medida que reduz a arrecadação de ICMS para baixar o preço dos combustíveis na marra tem consequência federativa.</p><p><b>A reação:</b> os 27 governadores se unem, entram na Justiça contra a União e ameaçam a base de deputados do governo nos estados.</p><p><b>O aprendizado:</b> política nacional precisa negociar com os estados, não apenas com o Congresso.</p>"
            },
            {
              "id": "feat-inov-gerador-historias",
              "titulo": "Gerador procedural de histórias absurdas e realistas",
              "descricao": "Em vez de planilha fria (Democracy 4) ou história fechada (Suzerain), cada partida gera uma narrativa única de sobrevivência no hospício institucional.",
              "concluida": false,
              "cor": "verde",
              "tamanho": "g",
              "itens": [],
              "html": "<p><b>A tese:</b> o coração da diversão não é ser um ditador onipotente, mas a arte da sobrevivência no hospício institucional.</p><p><b>O ciclo:</b> “Eu preciso passar a reforma da saúde, mas para isso preciso dar duas diretorias ao Centrão, torcer para a PF não bater lá semana que vem, rezar para o Copom cortar os juros e convencer o presidente da Câmara a não pautar a urgência da oposição.”</p><p><b>O resultado:</b> escolhas com consequências vivas e conectadas produzem um gerador procedural de histórias absurdas e realistas — o diferencial que nenhum jogo do mercado entrega hoje.</p>"
            }
          ],
          "pastas": []
        }
      ]
    }
  ]
};
