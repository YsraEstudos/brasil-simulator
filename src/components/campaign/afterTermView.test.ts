import { describe, expect, it } from 'vitest';

import { campaignMonths, DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { createInitialState, type GameState } from '@/engine';

import { afterTermView } from './afterTermView';

// PLANO_CAMPANHA.md Fase C7: o que a seção "Depois do mandato" mostra.

const content = loadContent(DEFAULT_SCENARIO_ID);
const LIMIT = campaignMonths(DEFAULT_SCENARIO_ID);
const start = () => createInitialState({ content, difficulty: 'estrategica', seed: 3 });

function ended(flags: string[] = []): GameState {
  const s = start();
  return {
    ...s,
    monthIndex: 48,
    events: { ...s.events, flags: Object.fromEntries(flags.map((f) => [f, 40])) },
    politics: {
      votingIntention: 0.5,
      memoria: [],
      declaracao: null,
      apoio: null,
      eleicao_geral: { monthIndex: 45, candidatura: false, venceu: true, turno2: false },
    },
  };
}

describe('depois do mandato na tela (Fase C7)', () => {
  it('sem leitura enquanto a partida segue', () => {
    expect(afterTermView(start(), content, LIMIT)).toBeNull();
  });

  it('três aspectos com valor e detalhes em texto, e as possibilidades', () => {
    const view = afterTermView(ended(), content, LIMIT)!;
    expect(view.aspects.map((a) => a.title)).toEqual(['Influência política', 'Situação jurídica', 'Legado de governo']);
    expect(view.aspects[0].value).toMatch(/^(baixa|média|alta) · \d+ de 100$/);
    expect(view.aspects[0].details.join()).toMatch(/Sucessor apoiado eleito \+10/);
    expect(view.aspects[1].value).toBe('nenhuma pendência');
    expect(view.aspects[2].details[0]).toMatch(/^Melhoraram \d de 5 indicadores; \d+ propostas? aprovadas?\.$/);
    expect(view.possibilities[0]).toMatch(/Pode disputar/);
  });

  it('a CPI aparece como investigação, com o item', () => {
    const view = afterTermView(ended(['cpi_instalada']), content, LIMIT)!;
    expect(view.aspects[1]).toMatchObject({ value: 'sob investigação', details: ['CPI ainda em funcionamento'] });
  });
});
