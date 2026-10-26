window.FEATURES_DADOS = {
  versao: 2,
  mostrarConcluidas: true,
  categorias: [
    {
      id: 'cat-tutorial',
      nome: 'Tutorial e ensino',
      features: [
        {
          id: 'feat-personagens',
          titulo: 'Personagens explicativos feitos por IA',
          descricao: 'Personagens ilustrados que explicam o jogo de forma visual, no lugar de textos longos.',
          concluida: false,
          cor: 'amarelo',
          tamanho: 'g',
          itens: [],
          html: '<p>O autor vai criar personagens ilustrados que explicam o jogo de forma visual (regras, telas e consequências das decisões), no lugar de textos longos.</p>',
        },
      ],
      pastas: [],
    },
    {
      id: 'cat-expansoes',
      nome: 'Expansões',
      features: [
        {
          id: 'feat-expansoes',
          titulo: 'Expansões',
          descricao: 'Ideias para depois da versão 1.5.',
          concluida: false,
          cor: 'azul',
          tamanho: 'p',
          itens: [],
          html: '<p>A definir pelo autor. Ainda não há itens nesta seção.</p>',
        },
      ],
      pastas: [],
    },
    {
      id: 'cat-escopo',
      nome: 'Mudanças de escopo (V1 vs. Expansão)',
      features: [
        {
          id: 'feat-corte-escopo',
          titulo: 'Corte de escopo: Caixa 2 e cassações',
          descricao:
            'Ficam para DLC/update. Sem sistema jurídico de provas, dinheiro ilícito vira só um botão de aposta frustrante.',
          concluida: false,
          cor: 'rosa',
          tamanho: 'm',
          itens: [
            {
              id: 'it-escopo-1',
              texto: 'Caixa 2 fora do lançamento',
              feito: false,
            },
            {
              id: 'it-escopo-2',
              texto: 'Cassações fora do lançamento',
              feito: false,
            },
            {
              id: 'it-escopo-3',
              texto:
                'Teto de gastos como trava rígida de orçamento (não pode gastar acima do teto, só gerenciar de onde vem o dinheiro)',
              feito: false,
            },
          ],
          html: '<p></p>',
        },
        {
          id: 'feat-legislacao-data',
          titulo: 'Legislação data-driven (ElectoralLawConfig)',
          descricao: 'O motor lê um JSON do ano eleitoral (ex.: regras TSE 2026) em vez de prazos fixos no código.',
          concluida: false,
          cor: 'azul',
          tamanho: 'm',
          itens: [
            {
              id: 'it-lei-1',
              texto: 'Prazo de filiação e domicílio eleitoral: 6 meses antes do pleito (início de abril)',
              feito: false,
            },
            {
              id: 'it-lei-2',
              texto: 'Janela partidária: 30 dias entre março e abril, para trocar de partido sem perder o cargo',
              feito: false,
            },
            {
              id: 'it-lei-3',
              texto: 'Trava de impulsionamento digital: desliga 48h antes do 1º turno e 24h antes do 2º',
              feito: false,
            },
          ],
          html: '<p></p>',
        },
        {
          id: 'feat-telegrafia',
          titulo: 'Telegrafia causal (fim do sorteio punitivo)',
          descricao:
            'Nenhum aliado trai e nenhum assessor pede demissão por sorteio. Toda ruptura passa por estados visíveis.',
          concluida: false,
          cor: 'verde',
          tamanho: 'm',
          itens: [
            {
              id: 'it-telegrafia-1',
              texto: 'Três estados visíveis: Estável → Atrito (aviso com motivo claro) → Ruptura',
              feito: false,
            },
            {
              id: 'it-telegrafia-2',
              texto: 'O jogador escolhe pagar o preço político para contornar a crise ou aceitar o rompimento',
              feito: false,
            },
          ],
          html: '<p></p>',
        },
      ],
      pastas: [],
    },
    {
      id: 'cat-caminho-eleitoral',
      nome: 'Caminho eleitoral',
      features: [],
      pastas: [
        {
          id: 'cat-progressao',
          nome: 'Progressão e viabilidade',
          features: [
            {
              id: 'feat-viabilidade',
              titulo: 'Painel de viabilidade eleitoral (6 variáveis)',
              descricao: 'Seis variáveis no back-end alimentam um único painel de viabilidade na interface.',
              concluida: false,
              cor: 'amarelo',
              tamanho: 'p',
              itens: [
                {
                  id: 'it-viab-1',
                  texto: 'Reconhecimento: % do eleitorado que sabe quem você é (decai fora de época eleitoral)',
                  feito: false,
                },
                {
                  id: 'it-viab-2',
                  texto: 'Reputação (valência): imagem positiva contra rejeição, ligada às tags do histórico',
                  feito: false,
                },
                {
                  id: 'it-viab-3',
                  texto: 'Base territorial: força por estado e região',
                  feito: false,
                },
                {
                  id: 'it-viab-4',
                  texto: 'Influência partidária: capital com a executiva e as bancadas do partido',
                  feito: false,
                },
                {
                  id: 'it-viab-5',
                  texto: 'Capacidade de recursos: doadores, autofinanciamento e verba partidária',
                  feito: false,
                },
                {
                  id: 'it-viab-6',
                  texto: 'Histórico eleitoral: vitórias, votações, alianças cumpridas ou traições',
                  feito: false,
                },
                {
                  id: 'it-viab-7',
                  texto:
                    'Origem escolhida no início: carreira política (padrão) ou sem carreira política, como empresário, militar ou influenciador digital',
                  feito: false,
                },
                {
                  id: 'it-viab-8',
                  texto:
                    'Sem carreira política, a origem define o começo das variáveis: empresário ganha capacidade de recursos e base de doadores; militar ganha reputação e base territorial; influenciador ganha reconhecimento alto e base territorial baixa',
                  feito: false,
                },
                {
                  id: 'it-viab-9',
                  texto:
                    'Sem cargo nem partido, a influência partidária começa em zero: é preciso se filiar a um partido que aceite o nome antes da convenção',
                  feito: false,
                },
                {
                  id: 'it-viab-10',
                  texto:
                    'Ponto de partida: Presidência (mandato em exercício): o jogador já é o Presidente eleito e gerencia Congresso, economia e ministérios',
                  feito: false,
                },
                {
                  id: 'it-viab-11',
                  texto:
                    'Ponto de partida: Corrida eleitoral (campanha de 45 dias): o jogador já é o candidato homologado na convenção e foca em debates, tempo de TV e votos de 1º e 2º turno',
                  feito: false,
                },
                {
                  id: 'it-viab-12',
                  texto:
                    'Ponto de partida: Pré-campanha (ruas, redes e articulação): o jogador ainda não é o candidato oficial; precisa criar reconhecimento na internet, viajar os estados, convencer o partido e vencer a convenção interna',
                  feito: false,
                },
              ],
              html: '<p>Ao criar a candidatura, o jogador escolhe o perfil. Cada perfil começa com valores diferentes nas variáveis do painel, e são esses valores que definem onde a campanha será mais fácil e onde será mais difícil. Os números abaixo são <b>PROVISORIO</b>, a calibrar.</p><table><thead><tr><th>Perfil</th><th>Reconhecimento</th><th>Influência partidária</th><th>Capacidade de recursos</th><th>Base territorial</th></tr></thead><tbody><tr><td>Político de estado</td><td>Baixo (15%)</td><td>Muito alto (70%)</td><td>Médio</td><td>Forte em 1 estado</td></tr><tr><td>Influencer</td><td>Muito alto (60%)</td><td>Quase zero (10%)</td><td>Baixo</td><td>Dispersa no país</td></tr><tr><td>Empresário</td><td>Baixo (10%)</td><td>Baixo (20%)</td><td>Muito alto (80%)</td><td>Fraca</td></tr><tr><td>Militar / linha-dura</td><td>Médio (35%)</td><td>Médio (30%)</td><td>Baixo</td><td>Média</td></tr></tbody></table><p><b>Facilidades e dificuldades de cada perfil:</b></p><ul><li><b>Político de estado:</b> fácil montar apoio partidário e ter base forte em um estado; difícil ganhar nome no país inteiro, porque o reconhecimento nacional é baixo.</li><li><b>Influencer:</b> fácil ser conhecido e alcançar muitos eleitores pelas redes; difícil conquistar o partido (influência quase zero) e financiar a campanha (recursos baixos).</li><li><b>Empresário:</b> fácil financiar a campanha (capacidade de recursos muito alta); difícil ser reconhecido e ganhar força dentro do partido.</li><li><b>Militar / linha-dura:</b> perfil equilibrado, com reconhecimento, influência e base médios; a dificuldade maior é a falta de recursos.</li></ul><p>Quem não tem carreira política começa com esses valores e precisa construí-los durante a pré-campanha e a campanha.</p>',
            },
            {
              id: 'feat-pre-campanha',
              titulo: 'Pré-campanha (12 a 18 meses antes da eleição)',
              descricao: 'Turnos trimestrais de decisão para viajar, articular e testar o nome.',
              concluida: false,
              cor: 'verde',
              tamanho: 'p',
              itens: [
                {
                  id: 'it-pre-1',
                  texto: 'Viajar pelo país, usando o cargo atual ou aparições na mídia (sobe base territorial)',
                  feito: false,
                },
                {
                  id: 'it-pre-2',
                  texto: 'Articular com líderes (sobe influência partidária)',
                  feito: false,
                },
                {
                  id: 'it-pre-3',
                  texto: 'Testar o nome em pesquisas internas',
                  feito: false,
                },
              ],
              html: '<p></p>',
            },
            {
              id: 'feat-convencao',
              titulo: 'Convenção partidária (o grande gargalo)',
              descricao:
                'Querer ser candidato não garante a vaga. Se há um cacique com mais influência, abre o evento de convenção.',
              concluida: false,
              cor: 'rosa',
              tamanho: 'p',
              itens: [
                {
                  id: 'it-conv-1',
                  texto: 'Disputar a prévia interna (gera racha se vencer por pouco)',
                  feito: false,
                },
                {
                  id: 'it-conv-2',
                  texto: 'Compor a chapa: aceitar ser vice ou disputar o Senado/governo em troca de apoio futuro',
                  feito: false,
                },
                {
                  id: 'it-conv-3',
                  texto: 'Recuar e apoiar o cacique (acumula crédito e Fundo Eleitoral para a própria reeleição)',
                  feito: false,
                },
                {
                  id: 'it-conv-4',
                  texto: 'Mudar de partido antes do prazo de abril (legenda menor, com menos TV e dinheiro)',
                  feito: false,
                },
              ],
              html: '<p></p>',
            },
          ],
          pastas: [],
        },
        {
          id: 'cat-mecanicas',
          nome: 'Mecânicas refatoradas (A a I)',
          features: [
            {
              id: 'feat-mec-a-dinheiro',
              titulo: 'A. Dinheiro, FEFC e orçamento',
              descricao:
                'Três fontes: FEFC, doações privadas e recursos próprios, sempre limitados pelo teto legal do cargo.',
              concluida: false,
              cor: 'amarelo',
              tamanho: 'g',
              itens: [
                {
                  id: 'it-a-1',
                  texto: 'Negociação do FEFC: a executiva partidária fatia a cota que vem da bancada eleita',
                  feito: false,
                },
                {
                  id: 'it-a-2',
                  texto:
                    'Estratégica e Extremo: negociar a cota na convenção cumprindo metas do partido (ex.: puxar votos para a bancada)',
                  feito: false,
                },
                {
                  id: 'it-a-3',
                  texto:
                    'Casual: orçamento inicial 40% mais folgado e divisão em 3 áreas, sem proteção contra falência',
                  feito: false,
                },
                {
                  id: 'it-a-4',
                  texto:
                    'Alertas vermelhos do assessor ignorados e caixa queimado no 1º mês deixam a campanha sem verba nas semanas finais',
                  feito: false,
                },
              ],
              html: '<p></p>',
            },
            {
              id: 'feat-mec-b-equipe',
              titulo: 'B. Equipe e assessores',
              descricao: 'Cada assessor tem competência de 1 a 5, especialidade tática e termômetro de satisfação.',
              concluida: false,
              cor: 'azul',
              tamanho: 'g',
              itens: [
                {
                  id: 'it-b-1',
                  texto:
                    'Especialidades: Mobilização Digital, Contenção de Crise, Articulação Regional, Preparação de Debate',
                  feito: false,
                },
                {
                  id: 'it-b-2',
                  texto: 'Casual: equipe competente pré-contratada, que cobra salário do orçamento da campanha',
                  feito: false,
                },
                {
                  id: 'it-b-3',
                  texto:
                    'Estratégica: montar a equipe pelas especialidades (ex.: Contenção de Crise quando a rejeição é alta)',
                  feito: false,
                },
                {
                  id: 'it-b-4',
                  texto:
                    'Extremo: linhas vermelhas por assessor (ex.: estrategista ideológico perde satisfação com aliança fisiológica)',
                  feito: false,
                },
                {
                  id: 'it-b-5',
                  texto: 'Extremo: antes de pedir demissão, o assessor emite um ultimato no gabinete',
                  feito: false,
                },
              ],
              html: '<p></p>',
            },
            {
              id: 'feat-mec-c-pesquisas',
              titulo: 'C. Pesquisas eleitorais (amostragem e viés AAPOR)',
              descricao:
                'Sai o sorteio simples de ±3%. Entra amostragem com viés de cobertura, com perfil técnico por instituto.',
              concluida: false,
              cor: 'rosa',
              tamanho: 'm',
              itens: [
                {
                  id: 'it-c-1',
                  texto:
                    'Digital/telefônica: barata e rápida, erra mais no eleitorado de baixa renda e idoso, capta ondas das redes',
                  feito: false,
                },
                {
                  id: 'it-c-2',
                  texto:
                    'Presencial domiciliar: cara e lenta, precisa no território, mas mostra uma fotografia de 5 a 7 dias atrás',
                  feito: false,
                },
                {
                  id: 'it-c-3',
                  texto: 'Casual: o assessor entrega o relatório já interpretado',
                  feito: false,
                },
                {
                  id: 'it-c-4',
                  texto: 'Estratégica: vê a margem de erro e o perfil do instituto',
                  feito: false,
                },
                {
                  id: 'it-c-5',
                  texto:
                    'Extremo: institutos soltam números divergentes no mesmo dia; é preciso abrir a ficha técnica (amostra, método, estrato)',
                  feito: false,
                },
              ],
              html: '<p></p>',
            },
            {
              id: 'feat-mec-d-comunicacao',
              titulo: 'D. Comunicação e retorno decrescente',
              descricao:
                'Impacto = ln(1 + Investimento / CustoBase) × AlcanceCanal × Afinidade × (1 − Saturação) × Credibilidade.',
              concluida: false,
              cor: 'verde',
              tamanho: 'm',
              itens: [
                {
                  id: 'it-d-1',
                  texto:
                    'Retorno decrescente logarítmico: dobrar o investimento no mesmo tema e região dá só um ganho marginal',
                  feito: false,
                },
                {
                  id: 'it-d-2',
                  texto:
                    'Persistência: reconhecimento e percepção decaem a uma taxa fixa por turno, sem sumir ao pausar a propaganda',
                  feito: false,
                },
                {
                  id: 'it-d-3',
                  texto: 'Premia quem construiu imagem desde a pré-campanha, em vez de quem só compra mídia',
                  feito: false,
                },
              ],
              html: '<p></p>',
            },
            {
              id: 'feat-mec-e-debates',
              titulo: 'E. Debates: argumento e coerência',
              descricao:
                'Atributos viram modificadores de execução. O centro é a matriz pedra-papel-tesoura de argumentos.',
              concluida: false,
              cor: 'amarelo',
              tamanho: 'm',
              itens: [
                {
                  id: 'it-e-1',
                  texto:
                    'Atacar um tema em que o candidato tem alta credibilidade e a população aprova a gestão dele sai pela culatra',
                  feito: false,
                },
                {
                  id: 'it-e-2',
                  texto: 'Argumento técnico em tema de revolta ou urgência gera percepção de frieza',
                  feito: false,
                },
                {
                  id: 'it-e-3',
                  texto:
                    'Extremo: réplicas de contradição histórica cruzadas com as tags do passado parlamentar ou executivo',
                  feito: false,
                },
              ],
              html: '<p></p>',
            },
            {
              id: 'feat-mec-f-aliancas',
              titulo: 'F. Alianças, tempo de TV e transferência de votos',
              descricao: 'Coligar com um partido não transfere votos automaticamente nem dá bônus mágico de alcance.',
              concluida: false,
              cor: 'azul',
              tamanho: 'm',
              itens: [
                {
                  id: 'it-f-1',
                  texto:
                    'Tempo de TV calculado na abertura da campanha: 90% pelas bancadas de deputados federais da coligação e 10% igualitário',
                  feito: false,
                },
                {
                  id: 'it-f-2',
                  texto:
                    'Transferência de votos depende da afinidade ideológica entre as bases e do engajamento do aliado',
                  feito: false,
                },
                {
                  id: 'it-f-3',
                  texto:
                    'Acordo só fisiológico (cargos por tempo de TV): leva o tempo de TV, mas os eleitores do partido migram para outro candidato',
                  feito: false,
                },
              ],
              html: '<p></p>',
            },
            {
              id: 'feat-mec-g-lod',
              titulo: 'G. Adversários autônomos em camadas (LOD)',
              descricao:
                'Três níveis de detalhe para manter a bateria e o processador leves, mesmo com centenas de políticos.',
              concluida: false,
              cor: 'rosa',
              tamanho: 'm',
              itens: [
                {
                  id: 'it-g-1',
                  texto:
                    'Tier 1 (3 a 8 adversários diretos): simulados turno a turno com Utility AI; no Casual, recebem pesquisas com mais ruído e alocam orçamento sub-ótimo',
                  feito: false,
                },
                {
                  id: 'it-g-2',
                  texto: 'Tier 2 (~40 grandes lideranças e governadores): ciclos mensais ou trimestrais',
                  feito: false,
                },
                {
                  id: 'it-g-3',
                  texto:
                    'Tier 3 (~500 base parlamentar e municipal): cálculo estatístico agregado a cada ciclo eleitoral de 2 anos',
                  feito: false,
                },
              ],
              html: '<p></p>',
            },
            {
              id: 'feat-mec-h-calendario',
              titulo: 'H. Calendário orientado a eventos',
              descricao:
                "O botão principal deixa de ser 'Avançar semana' e passa a ser 'Ir para o próximo acontecimento'.",
              concluida: false,
              cor: 'verde',
              tamanho: 'p',
              itens: [
                {
                  id: 'it-h-1',
                  texto:
                    'Fora da eleição: o calendário pula entre marcos (orçamento, crise ministerial, janela partidária, convenção)',
                  feito: false,
                },
                {
                  id: 'it-h-2',
                  texto: 'Campanha de 45 dias: 8 a 12 ciclos de decisão no 1º turno e 4 no 2º',
                  feito: false,
                },
                {
                  id: 'it-h-3',
                  texto:
                    'Casual: metade dos ciclos é resolvida pela assessoria, parando só nos grandes eventos e debates',
                  feito: false,
                },
              ],
              html: '<p></p>',
            },
            {
              id: 'feat-mec-i-derrotas',
              titulo: 'I. Consequências contextuais das derrotas',
              descricao:
                'O pós-eleição compara expectativa com resultado, em vez de transformar votos em prestígio sempre do mesmo jeito.',
              concluida: false,
              cor: 'amarelo',
              tamanho: 'm',
              itens: [
                {
                  id: 'it-i-1',
                  texto:
                    'Derrota honrosa: azarão que começa com 3% e termina com 22% ganha influência, convites para governos aliados e vira nome natural para a próxima',
                  feito: false,
                },
                {
                  id: 'it-i-2',
                  texto:
                    'Derrota vexatória: favorito que recebe a maior fatia do FEFC e fica fora do 2º turno perde influência, vê aliados migrarem e reconstrói a carreira em disputas menores',
                  feito: false,
                },
              ],
              html: '<p></p>',
            },
          ],
          pastas: [],
        },
        {
          id: 'cat-implementacao',
          nome: 'Ordem de implementação (roadmap enxuto)',
          features: [
            {
              id: 'feat-fase-1',
              titulo: 'Fase 1: motor eleitoral e demografia',
              descricao: 'Entregável jogável: apuração de 1º e 2º turno com institutos de pesquisa e viés.',
              concluida: false,
              cor: 'azul',
              tamanho: 'p',
              itens: [
                {
                  id: 'it-f1-1',
                  texto: 'Coortes de eleitores por região',
                  feito: false,
                },
                {
                  id: 'it-f1-2',
                  texto: 'Fórmula logarítmica de influência',
                  feito: false,
                },
                {
                  id: 'it-f1-3',
                  texto: 'Institutos de pesquisa com viés',
                  feito: false,
                },
                {
                  id: 'it-f1-4',
                  texto: 'Apuração de 1º e 2º turno',
                  feito: false,
                },
              ],
              html: '<p></p>',
            },
            {
              id: 'feat-fase-2',
              titulo: 'Fase 2: loop de campanha (modo Estratégica)',
              descricao: 'Entregável jogável: campanha com matriz de comunicação, orçamento e duelo tático de debates.',
              concluida: false,
              cor: 'verde',
              tamanho: 'p',
              itens: [
                {
                  id: 'it-f2-1',
                  texto: 'Matriz de comunicação sem repetição',
                  feito: false,
                },
                {
                  id: 'it-f2-2',
                  texto: 'Gestão de orçamento e teto',
                  feito: false,
                },
                {
                  id: 'it-f2-3',
                  texto: 'Contratação de assessores',
                  feito: false,
                },
                {
                  id: 'it-f2-4',
                  texto: 'Duelo tático de debates',
                  feito: false,
                },
              ],
              html: '<p></p>',
            },
            {
              id: 'feat-fase-3',
              titulo: 'Fase 3: partidos, convenções e pré-campanha',
              descricao: 'Entregável jogável: os 6 atributos de viabilidade, disputa interna, FEFC, TV e coligações.',
              concluida: false,
              cor: 'amarelo',
              tamanho: 'p',
              itens: [
                {
                  id: 'it-f3-1',
                  texto: 'Os 6 atributos de viabilidade',
                  feito: false,
                },
                {
                  id: 'it-f3-2',
                  texto: 'Disputa interna pela candidatura',
                  feito: false,
                },
                {
                  id: 'it-f3-3',
                  texto: 'Divisão do FEFC',
                  feito: false,
                },
                {
                  id: 'it-f3-4',
                  texto: 'Tempo de TV e coligações',
                  feito: false,
                },
              ],
              html: '<p></p>',
            },
            {
              id: 'feat-fase-4',
              titulo: 'Fase 4: carreira persistente e IA em camadas',
              descricao:
                'Entregável jogável: calendário por eventos, memória histórica e expectativa vs. resultado nas derrotas.',
              concluida: false,
              cor: 'rosa',
              tamanho: 'p',
              itens: [
                {
                  id: 'it-f4-1',
                  texto: 'Calendário por eventos',
                  feito: false,
                },
                {
                  id: 'it-f4-2',
                  texto: 'Tags de memória histórica',
                  feito: false,
                },
                {
                  id: 'it-f4-3',
                  texto: 'IA em 3 tiers',
                  feito: false,
                },
                {
                  id: 'it-f4-4',
                  texto: 'Sistema de expectativa vs. resultado nas derrotas',
                  feito: false,
                },
              ],
              html: '<p></p>',
            },
            {
              id: 'feat-fase-5',
              titulo: 'Fase 5: camadas Casual e Realismo Extremo',
              descricao:
                'Entregável jogável: filtro de interface assistida no Casual e ElectoralLawConfig com facções no Extremo.',
              concluida: false,
              cor: 'azul',
              tamanho: 'p',
              itens: [
                {
                  id: 'it-f5-1',
                  texto: 'Filtro de interface assistida para o Casual',
                  feito: false,
                },
                {
                  id: 'it-f5-2',
                  texto: 'Ativação do ElectoralLawConfig (regras do TSE)',
                  feito: false,
                },
                {
                  id: 'it-f5-3',
                  texto: 'Facções internas para o Extremo',
                  feito: false,
                },
              ],
              html: '<p></p>',
            },
          ],
          pastas: [],
        },
      ],
    },
    {
      id: 'cat-mvi7h9m71',
      nome: 'Ideais a se condiderar',
      features: [],
      pastas: [
        {
          id: 'cat-mvi7jn3x2',
          nome: 'jogos para jogar',
          features: [],
          pastas: [],
        },
        {
          id: 'cat-mvi7lmg23',
          nome: 'Ideias descartadas de outros jogos',
          features: [],
          pastas: [],
        },
        {
          id: 'cat-mvi7lsdg4',
          nome: 'Ideias inovadoras',
          features: [],
          pastas: [],
        },
      ],
    },
    {
      id: 'cat-mvml4niw1',
      nome: 'Bugs',
      features: [
        {
          id: 'feat-mvml5qqa2',
          titulo: 'nuvem que some do nada dps de ir e voltar com zoom',
          descricao: '',
          concluida: false,
          cor: 'amarelo',
          tamanho: 'p',
          itens: [],
          html: '<p></p>',
        },
      ],
      pastas: [],
    },
  ],
};
