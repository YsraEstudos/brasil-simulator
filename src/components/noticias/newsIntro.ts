/**
 * Abertura da mesa de notícias (Configurações → "Pular a abertura do jornal 3D", `prefs.skipNewspaperIntro`).
 * Com a opção ligada, a mesa começa no estado final: a câmera já está na pose da mesa, o jornal aparece aberto
 * diante do jogador e não há animação de entrada nem de abertura. Módulo puro: o estado inicial de cada animação
 * da `NewsDeskScreen` e da `DeskScene` sai daqui, e os testes cobrem os dois caminhos.
 */
export interface NewsIntro {
  /** Jornal: dobrado sobre a mesa (com a abertura) ou já aberto diante do jogador (sem ela). */
  paper: 'fechado' | 'aberto';
  /** Progresso do desdobrar (`unfold` da `NewsDeskScreen`): 0 = dobrado, 2 = aberto. */
  unfold: 0 | 2;
  /** Entrada do jornal sobre a mesa: 0 = ainda descendo, 1 = assentado. */
  settle: 0 | 1;
  /** Câmera: `entrada` desce de uma pose mais alta até a mesa; `mesa` começa na pose da mesa. */
  camera: 'entrada' | 'mesa';
}

/** Estado inicial da mesa: com `skip` (preferência ligada), o estado final; sem ele, a abertura completa. */
export function newsIntro(skip: boolean): NewsIntro {
  if (skip) return { paper: 'aberto', unfold: 2, settle: 1, camera: 'mesa' };
  return { paper: 'fechado', unfold: 0, settle: 0, camera: 'entrada' };
}
