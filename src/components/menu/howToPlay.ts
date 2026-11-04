/**
 * Conteúdo da tela "Como jogar" (Instruções básicas; rota `/como-jogar`). Texto puro, sem React: o tutorial da Fase 10
 * pode reaproveitar estas seções. Cada seção descreve a interface como ela está hoje (Painel, folhas e subtelas), com
 * os nomes de botões e títulos exatamente como aparecem na tela (GAME_DESIGN.md §4.6 e §13).
 */

export interface HowToPlaySection {
  id: string;
  title: string;
  paragraphs: string[];
}

export const HOW_TO_PLAY_SECTIONS: readonly HowToPlaySection[] = [
  {
    id: 'objetivo',
    title: 'O objetivo',
    paragraphs: [
      'Você é o presidente fictício do Brasil e toma posse em janeiro de 2027.',
      'Você governa por políticas: propõe, negocia com o Congresso e executa, mas não define diretamente o PIB, a inflação nem os juros.',
      'A aprovação popular, o capital político e os indicadores da economia mostram como o governo está, e cada decisão só produz efeito com atraso, custo e incerteza.',
      'A campanha termina no fim do mandato, ou antes por impeachment ou derrota eleitoral, e então o jogo mostra o Legado; cenários de dois mandatos incluem eleições e reeleição.',
    ],
  },
  {
    id: 'ganhar-perder',
    title: 'Como se ganha e como se perde',
    paragraphs: [
      'O jogo termina ao alcançar a duração do cenário ou quando um sucessor toma posse; o Legado mostra os resultados do governo.',
      'A campanha também termina por condenação no impeachment ou derrota na eleição geral, inclusive quando o presidente apoia um sucessor.',
      'Se disputar e vencer a reeleição no primeiro mandato, o governo continua no segundo, até o limite do cenário.',
      'Não há uma pontuação única que determine vitória: avalie suas metas e o país que deixou no relatório de Legado.',
    ],
  },
  {
    id: 'painel',
    title: 'O Painel',
    paragraphs: [
      'Depois de NOVO JOGO, CARREGAR JOGO ou CONTINUAR, você cai direto no Painel, com o globo do Brasil ocupando a tela; toque num estado para ver os números dele.',
      'No topo ficam o mês, a aprovação, o PIB e a população; em tela em pé, uma segunda linha traz o capital político, a inflação e o desemprego.',
      'Os botões das laterais abrem folhas por cima do mapa: à esquerda, Alertas e Eventos, Meta Atual e Relatório do Mês (e Eleições, na época de eleição); à direita, Camadas do Mapa, Visão Regional, Indicadores, Ministérios e Perfil do Governo (no modo canhoto, os lados se invertem).',
      'O sino mostra quantas pendências aguardam resposta, e o botão Menu leva a Configurações e ao menu principal.',
    ],
  },
  {
    id: 'mes',
    title: 'O mês e os eventos',
    paragraphs: [
      'Cada mês é um turno, e o topo mostra o turno atual e as ações de agenda que ainda restam.',
      'São 4 ações por mês no modo Casual e 3 na Estratégica e no Realismo Extremo; cada decisão gasta ações, e sancionar ou vetar não gasta nenhuma.',
      'Eventos aparecem na folha Alertas e Eventos com prazo: sem resposta até o fim do mês seguinte ao surgimento, vale a escolha padrão do evento.',
      'Quando estiver pronto, segure Encerrar o mês por meio segundo e confira as pendências antes de confirmar. Com teclado ou leitor de tela, ative o botão normalmente.',
    ],
  },
  {
    id: 'gabinete',
    title: 'O Gabinete',
    paragraphs: [
      'O Gabinete é a agenda presidencial do mês, aberta pela doca do Painel, e tem quatro seções: Decisões, Ministérios, Obras e marcas e Ações rápidas.',
      'Em Decisões, as propostas grandes passam pela mesa de despacho: antes de confirmar, você lê três pareceres curtos, de Fazenda, Articulação política e Comunicação, que podem discordar.',
      'Em Ministérios você define diretrizes para cada pasta; em Obras e marcas ficam as políticas públicas e as marcas de governo; e em Ações rápidas, as ações simples de agenda.',
      'Nada do que você marca vale até encerrar o mês, e a barra do topo mostra o que já está marcado e quanto ainda cabe na agenda.',
    ],
  },
  {
    id: 'congresso',
    title: 'O Congresso',
    paragraphs: [
      'A subtela Congresso mostra as propostas por etapa, com a Casa em que estão, o relator e a data prevista de votação.',
      'Para avançar, negocie com os blocos: Negociar com um bloco, Liberar emendas, Ceder no texto e Pedir urgência, cada uma uma vez por mês e por alvo.',
      'Nomeações de ministros também ficam aqui: uma pasta entregue a um bloco rende apoio, mas pode executar pior e acumular risco de escândalo.',
      'Projetos aprovados chegam à folha Alertas e Eventos, onde você sanciona ou veta, total ou parcialmente; sem resposta no mês, vale a sanção tácita.',
    ],
  },
  {
    id: 'economia',
    title: 'Economia, Notícias e "Por que mudou?"',
    paragraphs: [
      'A subtela Economia reúne Juros e preços, Atividade, Câmbio e risco, Contas públicas e o Último Copom, além do quadro da sociedade.',
      'Na folha Indicadores, toque num indicador para abrir o Por que mudou?, com as causas do último mês encerrado.',
      'A subtela Notícias é uma mesa com o jornal e as redes, com as manchetes do mês; o selo na doca aparece quando há edição nova.',
      'Em qualquer subtela, Voltar ao Painel leva de volta à mesa.',
    ],
  },
  {
    id: 'salvar',
    title: 'Salvar e continuar',
    paragraphs: [
      'O jogo salva sozinho no início de cada mês: ao encerrar o mês, o estado completo da partida fica gravado no aparelho.',
      'Para retomar, use CONTINUAR no menu principal, que abre a partida jogada por último, ou CARREGAR JOGO, que lista as partidas salvas.',
      'No menu do Painel, Salvar como… grava uma cópia da partida, e Voltar ao menu principal mantém a partida pronta para CONTINUAR.',
    ],
  },
  {
    id: 'aviso',
    title: 'Sobre a ficção',
    paragraphs: [
      'Simulação fictícia e independente, sem afiliação a qualquer órgão do governo brasileiro.',
      'Presidente, personagens, partidos e notícias são fictícios, e nenhuma conduta é atribuída a pessoas reais.',
      'Instituições como Congresso, STF e Banco Central aparecem apenas como papéis institucionais genéricos, sem logotipos oficiais.',
    ],
  },
];
