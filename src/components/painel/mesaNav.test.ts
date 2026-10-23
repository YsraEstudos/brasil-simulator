import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { createInitialState, TERM_MONTHS, type GameState, type NewsItem, type Proposal } from '@/engine';
import { VEDACAO_MESES } from '@/engine/elections';

import {
  actionsCaption,
  congressBadge,
  ELECTION_RESULT_MONTHS,
  electionsRelevant,
  endMonthControl,
  endMonthOutcome,
  LEFT_RAIL,
  leftRail,
  monthAdvanced,
  newsBadge,
  RIGHT_RAIL,
} from './mesaNav';

const content = loadContent(DEFAULT_SCENARIO_ID);

const playing = { hasCampaign: true, finished: false, busy: false, actionsUsed: 1, actionsMax: 3 };

describe('Encerrar o mês na doca', () => {
  it('com a partida em andamento encerra e mostra as ações usadas', () => {
    expect(endMonthControl(playing)).toEqual({
      mode: 'encerrar',
      label: 'Encerrar o mês',
      caption: '1 de 3 ações usadas',
      disabled: false,
    });
  });

  it('enquanto a store processa o mês o botão fica desabilitado e avisa', () => {
    const control = endMonthControl({ ...playing, busy: true });
    expect(control.mode).toBe('encerrar');
    expect(control.disabled).toBe(true);
    expect(control.label).toBe('Encerrando…');
  });

  it('com a campanha encerrada vira "Ver legado" e continua tocável', () => {
    const control = endMonthControl({ ...playing, finished: true });
    expect(control).toMatchObject({ mode: 'legado', label: 'Ver legado', disabled: false });
  });

  it('sem partida (demonstração) fica indisponível', () => {
    const control = endMonthControl({ ...playing, hasCampaign: false });
    expect(control).toMatchObject({ mode: 'indisponivel', disabled: true });
  });

  it('a legenda concorda com o limite de ações', () => {
    expect(actionsCaption(0, 3)).toBe('0 de 3 ações usadas');
    expect(actionsCaption(1, 1)).toBe('1 de 1 ação usada');
  });
});

describe('Abertura automática do relatório', () => {
  it('abre só quando o mês avançou', () => {
    expect(monthAdvanced(0, 1)).toBe(true);
    expect(monthAdvanced(4, 4)).toBe(false);
    expect(monthAdvanced(4, 3)).toBe(false);
  });

  it('sem partida antes ou depois não abre', () => {
    expect(monthAdvanced(undefined, 1)).toBe(false);
    expect(monthAdvanced(2, undefined)).toBe(false);
  });
});

describe('Trilhos da mesa', () => {
  it('esquerdo: o mês', () => {
    expect(LEFT_RAIL.map((b) => b.id)).toEqual(['alertas', 'meta', 'relatorio']);
  });

  it('direito: o país, sem o Congresso nem a evolução do PIB avulsa', () => {
    expect(RIGHT_RAIL.map((b) => b.id)).toEqual(['camadas', 'regioes', 'indicadores', 'ministerios', 'perfil']);
  });

  it('nenhum botão se repete entre os trilhos', () => {
    const ids = [...LEFT_RAIL, ...RIGHT_RAIL].map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('Eleições no trilho', () => {
  const elections = content.scenario.elections;
  const { inicio, fim } = elections?.janelaDeclaracao ?? { inicio: 0, fim: 0 };

  it('o cenário padrão tem eleições (os testes abaixo dependem do calendário dele)', () => {
    expect(elections).toBeDefined();
  });

  it('sem eleições no cenário o botão nunca aparece', () => {
    expect(electionsRelevant(undefined, inicio)).toBe(false);
  });

  it('o botão entra na janela de declaração, de ponta a ponta', () => {
    expect(electionsRelevant(elections, inicio - 1)).toBe(false);
    expect(electionsRelevant(elections, inicio)).toBe(true);
    expect(electionsRelevant(elections, fim)).toBe(true);
  });

  it('o botão entra na vedação de cada pleito, no pleito e nos meses do resultado', () => {
    if (!elections) throw new Error('cenário sem eleições');
    // O pleito geral cai dentro da janela de declaração; o "antes da vedação" só se vê no municipal.
    expect(electionsRelevant(elections, elections.mesEleicaoMunicipal - VEDACAO_MESES - 1)).toBe(false);
    for (const pleito of [elections.mesEleicaoMunicipal, elections.mesEleicaoGeral]) {
      expect(electionsRelevant(elections, pleito - VEDACAO_MESES)).toBe(true);
      expect(electionsRelevant(elections, pleito)).toBe(true);
      expect(electionsRelevant(elections, pleito + ELECTION_RESULT_MONTHS)).toBe(true);
    }
    expect(electionsRelevant(elections, elections.mesEleicaoMunicipal + ELECTION_RESULT_MONTHS + 1)).toBe(false);
  });

  it('o calendário se repete a cada mandato (48 meses)', () => {
    expect(electionsRelevant(elections, 0)).toBe(false);
    expect(electionsRelevant(elections, TERM_MONTHS + inicio)).toBe(true);
    expect(electionsRelevant(elections, TERM_MONTHS + 5)).toBe(false);
  });

  it('o trilho esquerdo ganha as Eleições por último, só quando pedido', () => {
    expect(leftRail(false).map((b) => b.id)).toEqual(['alertas', 'meta', 'relatorio']);
    expect(leftRail(true).map((b) => b.id)).toEqual(['alertas', 'meta', 'relatorio', 'eleicoes']);
  });
});

describe('Selos da doca', () => {
  function proposal(over: Partial<Proposal>): Proposal {
    return { id: 'p', policyId: 'x', status: 'em_tramitacao', voteMonth: null, ...over } as Proposal;
  }
  function news(monthIndex: number): NewsItem {
    return { id: `${monthIndex}_0`, monthIndex, kind: 'economia', tone: 'neutra', headline: 'h', cause: 'c' };
  }
  const base = createInitialState({ content, difficulty: 'estrategica', seed: 7 });

  it('Congresso: conta votações marcadas para este mês (ou atrasadas), não as futuras', () => {
    const state: GameState = {
      ...base,
      monthIndex: 5,
      proposals: [
        proposal({ id: 'a', voteMonth: 5 }),
        proposal({ id: 'b', voteMonth: 6 }),
        proposal({ id: 'c', voteMonth: 4 }),
        proposal({ id: 'd', voteMonth: null }),
      ],
    };
    expect(congressBadge(state)).toBe(2);
  });

  it('Congresso: conta veto em apreciação, ignora sanção aguardando e propostas fora do plenário', () => {
    const state: GameState = {
      ...base,
      monthIndex: 5,
      proposals: [
        proposal({ id: 'a', status: 'apreciacao_veto', voteMonth: 5 }),
        proposal({ id: 'b', status: 'aguardando_sancao', voteMonth: 5 }),
        proposal({ id: 'c', status: 'concluida', voteMonth: 5 }),
        proposal({ id: 'd', status: 'parada', voteMonth: 5 }),
      ],
    };
    expect(congressBadge(state)).toBe(1);
  });

  it('Congresso: lei em execução só conta com veto parcial ainda por apreciar', () => {
    const veto = (overridden: boolean | null) => ({ kind: 'acrescimos', overridden }) as unknown as Proposal['veto'];
    const state: GameState = {
      ...base,
      monthIndex: 5,
      proposals: [
        proposal({ id: 'a', status: 'em_execucao', voteMonth: 5, veto: null }),
        proposal({ id: 'b', status: 'em_execucao', voteMonth: 5, veto: veto(null) }),
        proposal({ id: 'c', status: 'em_execucao', voteMonth: 5, veto: veto(false) }),
      ],
    };
    expect(congressBadge(state)).toBe(1);
  });

  it('Notícias: manchetes do último mês processado, até o jogador ver', () => {
    const state: GameState = {
      ...base,
      monthIndex: 3,
      events: { ...base.events, news: [news(1), news(2), news(2)] },
    };
    expect(newsBadge(state, null)).toBe(2);
    expect(newsBadge(state, 1)).toBe(2);
    expect(newsBadge(state, 2)).toBe(0);
  });

  it('Notícias: no mês da posse não há relatório nem selo', () => {
    expect(newsBadge(base, null)).toBe(0);
  });
});

describe('Depois de encerrar o mês', () => {
  it('mês avançou: abre o relatório', () => {
    expect(endMonthOutcome(2, 3, false)).toBe('relatorio');
  });

  it('mês avançou e a campanha terminou: vai ao legado, não ao relatório', () => {
    expect(endMonthOutcome(47, 48, true)).toBe('legado');
  });

  it('recusa (mês igual ou sem partida): nada acontece, mesmo com a campanha já encerrada', () => {
    expect(endMonthOutcome(2, 2, false)).toBe('nada');
    expect(endMonthOutcome(2, 2, true)).toBe('nada');
    expect(endMonthOutcome(undefined, undefined, false)).toBe('nada');
  });
});
