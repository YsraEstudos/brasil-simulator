import { describe, expect, it } from 'vitest';

import { newsIntro } from './newsIntro';

describe('abertura da mesa de notícias (prefs.skipNewspaperIntro)', () => {
  it('sem pular: jornal dobrado, em assentamento e câmera descendo da entrada', () => {
    expect(newsIntro(false)).toEqual({ paper: 'fechado', unfold: 0, settle: 0, camera: 'entrada' });
  });

  it('pulando: jornal já aberto no estado final, sem animação de entrada nem de abertura', () => {
    expect(newsIntro(true)).toEqual({ paper: 'aberto', unfold: 2, settle: 1, camera: 'mesa' });
  });

  it('pulando, o fundo escurecido já está no nível final (unfold 2 = aberto)', () => {
    const intro = newsIntro(true);
    expect(intro.unfold).toBe(2);
    expect(intro.paper).toBe('aberto');
  });
});
