import { describe, expect, it } from 'vitest';

import { campaignMonths, DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { createInitialState, type GameState } from '@/engine';

import { afterTermView } from './afterTermView';

// PLANO_CAMPANHA.md Fase C7: o que a seção "Depois do mandato" mostra.

const content = loadContent(DEFAULT_SCENARIO_ID);
const LIMIT = campaignMonths(DEFAULT_SCENARIO_ID);
const start = () => createInitialState({ content, difficulty: 'estrategica', seed: 3 });

/** Fim de leitura no mês 48: o limite é o próprio mês, como no fim de uma partida. */
const END = 48;

function ended(flags: string[] = []): GameState {
  const s = start();
  return {
    ...s,
    monthIndex: END,
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

  it('a posse de um sucessor não encerra a partida (R4): o país continua', () => {
    expect(afterTermView(ended(), content, LIMIT)).toBeNull();
  });

  it('três aspectos com valor e detalhes em texto, e as possibilidades', () => {
    const view = afterTermView(ended(), content, END)!;
    expect(view.aspects.map((a) => a.title)).toEqual(['Influência política', 'Situação jurídica', 'Legado de governo']);
    expect(view.aspects[0].value).toMatch(/^(baixa|média|alta) · \d+ de 100$/);
    expect(view.aspects[0].details.join()).toMatch(/Sucessor apoiado eleito \+10/);
    expect(view.aspects[1].value).toBe('nenhuma pendência');
    expect(view.aspects[2].details[0]).toMatch(/^Melhoraram \d de 5 indicadores; \d+ propostas? aprovadas?\.$/);
    expect(view.possibilities[0]).toMatch(/Pode disputar/);
  });

  it('a CPI aparece como investigação, com o item', () => {
    const view = afterTermView(ended(['cpi_instalada']), content, END)!;
    expect(view.aspects[1]).toMatchObject({ value: 'sob investigação', details: ['CPI ainda em funcionamento'] });
  });

  it('prestação de contas mostra estado, tom e evidência de cada promessa', () => {
    const s = ended();
    const ppa = { kind: 'ppa' as const, year: 2027, priority: 'saude' as const, proposalId: 'ppa_2027', enactedAt: 5 };
    const view = afterTermView({ ...s, publicPolicies: { ...s.publicPolicies, budgetLaws: [ppa] } }, content, END)!;
    expect(view.accountability).toHaveLength(1);
    expect(view.accountability[0]).toMatchObject({ status: 'Inviável', tone: 'negative' });
    expect(view.accountability[0].evidence).toMatch(/Sem LOA/);
  });
});
