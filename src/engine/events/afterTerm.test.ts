import { describe, expect, it } from 'vitest';

import { campaignMonths, DEFAULT_SCENARIO_ID, loadContent } from '@/content';

import { createInitialState } from '../state';
import type { CareerElectionResult, GameState, PresidentialElection } from '../types';
import {
  AFTER_TERM_PARAMS,
  afterTerm,
  finalOutcome,
  influenceBand,
  initialIndicators,
  legacyBand,
  legacyScore,
} from './afterTerm';
import { IMPEACHMENT_PARAMS } from './calibration';
import { campaignOutcome } from './outcome';
import { meanCongressRelation } from './pressure';

// PLANO_CAMPANHA.md Fase C7: situação e possibilidades depois do mandato, como leitura do estado final.

const content = loadContent(DEFAULT_SCENARIO_ID);
const LIMIT = campaignMonths(DEFAULT_SCENARIO_ID);
const P = (name: keyof typeof AFTER_TERM_PARAMS) => AFTER_TERM_PARAMS[name].value;
const start = () => createInitialState({ content, difficulty: 'estrategica', seed: 3 });
type Career = NonNullable<GameState['career']>;
const POLITICS = { votingIntention: 0.5, memoria: [], declaracao: null, apoio: null };

/** Estado no mês `month`, com marcas, eleição geral e aprovação opcionais. */
function at(
  month: number,
  opts: { flags?: string[]; general?: Partial<PresidentialElection>; approval?: number } = {},
): GameState {
  const s = start();
  const flags = Object.fromEntries((opts.flags ?? []).map((f) => [f, month - 1]));
  return {
    ...s,
    monthIndex: month,
    indicators: { ...s.indicators, ...(opts.approval === undefined ? {} : { approval: opts.approval }) },
    events: { ...s.events, flags: { ...s.events.flags, ...flags } },
    ...(opts.general
      ? {
          politics: {
            ...POLITICS,
            eleicao_geral: { monthIndex: 45, candidatura: false, venceu: false, turno2: false, ...opts.general },
          },
        }
      : {}),
  };
}
const read = (s: GameState) => afterTerm(s, content, LIMIT)!;
const defeatedBeforeInauguration = (s: GameState, outcome: 'derrotado_1t' | 'derrotado_2t'): GameState => ({
  ...s,
  career: { ...({} as Career), election: { outcome } as CareerElectionResult },
});

describe('desfecho final e precedência (Fase C7)', () => {
  it('a partida em andamento não tem leitura; o limite de meses é o último desfecho', () => {
    expect(afterTerm(at(10), content, LIMIT)).toBeNull();
    expect(finalOutcome(at(10), 10)).toBe('limite_de_meses');
    expect(finalOutcome(at(9), 10)).toBeNull();
  });

  it('desfechos simultâneos seguem a ordem da tabela', () => {
    expect(finalOutcome(at(46, { flags: ['impeachment_condenado'], general: { candidatura: true } }), 46)).toBe(
      'impeachment',
    );
    expect(finalOutcome(at(46, { general: { candidatura: true } }), 46)).toBe('derrota_eleitoral');
    expect(finalOutcome(at(48, { general: { venceu: true } }), 48)).toBe('fim_de_mandato');
    const both = defeatedBeforeInauguration(at(5, { flags: ['impeachment_condenado'] }), 'derrotado_1t');
    expect(campaignOutcome(both)).toBe('impeachment');
    expect(campaignOutcome({ ...both, events: start().events })).toBe('derrota_campanha');
  });

  it('a derrota antes da posse não tem leitura de governo (usa o resumo da Fase C5)', () => {
    expect(afterTerm(defeatedBeforeInauguration(start(), 'derrotado_2t'), content, LIMIT)).toBeNull();
  });
});

describe('influência política', () => {
  it('é 50 + a soma dos fatores, limitada a [0, 100], com fórmulas reproduzíveis', () => {
    const s = at(48, { general: { venceu: true } });
    const { influence } = read(s);
    expect(influence.factors.map((f) => f.points)).toEqual([
      P('pos_influencia_aprovacao') * (s.indicators.approval - IMPEACHMENT_PARAMS.aprovacao_neutra.value),
      P('pos_influencia_relacao') * meanCongressRelation(s, content),
      P('pos_influencia_sucessor'),
    ]);
    const raw = 50 + influence.factors.reduce((sum, f) => sum + f.points, 0);
    expect(influence.value).toBeCloseTo(Math.min(100, Math.max(0, raw)), 12);
    expect(influence.band).toBe(influenceBand(influence.value));
    expect([influenceBand(39.9), influenceBand(40), influenceBand(60)]).toEqual(['baixa', 'media', 'alta']);
  });

  it('cai com a derrota eleitoral e mais ainda com o impeachment', () => {
    const won = read(at(48, { general: { venceu: true } })).influence.value;
    const lost = read(at(46, { general: { candidatura: true } })).influence.value;
    const removed = read(at(20, { flags: ['impeachment_condenado'] })).influence.value;
    expect(won).toBeGreaterThan(lost);
    expect(lost).toBeGreaterThan(removed);
    expect(read(at(20, { flags: ['impeachment_condenado'], approval: 0 })).influence.value).toBe(0);
  });
});

describe('situação jurídica', () => {
  const legal = (flags: string[]) => read(at(48, { flags, general: { venceu: true } })).legal;

  it('sem marcas, nenhuma pendência', () => {
    expect(legal([])).toEqual({ level: 'nenhuma', items: [] });
  });

  it('CPI e escândalo são investigação, nunca condenação', () => {
    expect(legal(['cpi_instalada']).level).toBe('investigacao');
    expect(legal(['cpi_instalada', 'cpi_encerrada']).level).toBe('nenhuma');
    expect(legal(['cpi_instalada', 'cpi_encerrada', 'cpi_relatorio_pesado']).level).toBe('investigacao');
    expect(legal(['escandalo_denuncia']).level).toBe('investigacao');
  });

  it('denúncia aceita ou autorizada é acusação; arquivada, some; condenação no Senado é restrição', () => {
    expect(legal(['impeachment_denuncia_aceita']).level).toBe('acusacao');
    expect(legal(['impeachment_denuncia_aceita', 'impeachment_autorizado']).level).toBe('acusacao');
    expect(legal(['impeachment_denuncia_aceita', 'impeachment_arquivado']).level).toBe('nenhuma');
    const removed = read(at(20, { flags: ['impeachment_condenado', 'cpi_instalada'] })).legal;
    expect(removed.level).toBe('restricao');
    expect(removed.items).toHaveLength(2);
  });

  // PLANO_CAMPANHA.md C6b/C7: a condenação é da diretoria, não automaticamente do presidente.
  it('registra condenação de diretor sem atribuí-la ao presidente', () => {
    const s = at(48, { general: { venceu: true } });
    const withCase: GameState = {
      ...s,
      cases: [
        {
          id: 'diretoria:a#1',
          source: 'diretoria',
          subjectId: 'a',
          blocId: 'centro',
          stage: 'condenacao',
          openedMonth: 1,
          stageMonth: 3,
          accusedMonth: 2,
          exposure: 0,
        },
      ],
    };
    expect(read(withCase).legal).toMatchObject({
      level: 'condenacao',
      items: [{ level: 'condenacao', label: expect.stringMatching(/diretoria/i) }],
    });
  });

  it('o caixa 2 descoberto na campanha conta como investigação', () => {
    const s = at(48, { general: { venceu: true } });
    const withCase: GameState = {
      ...s,
      career: { ...({} as Career), illicit: { balance: 0, pending: [], exposure: 0, investigations: 1 } },
    };
    expect(read(withCase).legal.level).toBe('investigacao');
  });
});

describe('legado de governo e possibilidades', () => {
  it('a pontuação é a do relatório de legado, com faixas', () => {
    const s = at(48, { general: { venceu: true } });
    expect(read(s).legacy.score).toBe(legacyScore(initialIndicators(content), s.indicators).score);
    expect([legacyBand(-0.2), legacyBand(0), legacyBand(0.2)]).toEqual(['negativo', 'misto', 'positivo']);
    expect(legacyScore(initialIndicators(content), initialIndicators(content)).score).toBe(0);
  });

  it('impeachment: inabilitação por 8 anos contados do ano da condenação', () => {
    const p = read(at(20, { flags: ['impeachment_condenado'] })).possibilities;
    expect(p[0]).toMatch(/até 2036.*CF art\. 52/);
    expect(p).toHaveLength(1);
  });

  it('dois mandatos impedem a eleição seguinte; um mandato não', () => {
    const second = read(at(96, { general: { monthIndex: 93, venceu: true } }));
    expect(second.terms).toBe(2);
    expect(second.possibilities[0]).toMatch(/dois mandatos/);
    expect(read(at(48, { general: { venceu: true } })).possibilities[0]).toMatch(/Pode disputar/);
  });

  it('apuração em aberto é lembrada sem virar condenação', () => {
    const p = read(at(48, { flags: ['cpi_instalada'], general: { venceu: true } })).possibilities;
    expect(p.at(-1)).toMatch(/nada aqui é condenação/);
  });

  it('é só leitura: não muda o estado e repete', () => {
    const s = at(48, { general: { venceu: true } });
    const copy = structuredClone(s);
    expect(read(s)).toEqual(read(s));
    expect(s).toEqual(copy);
  });

  it('todo parâmetro tem o valor dentro da faixa', () => {
    for (const [name, spec] of Object.entries(AFTER_TERM_PARAMS)) {
      expect(spec.min, name).toBeLessThanOrEqual(spec.value);
      expect(spec.value, name).toBeLessThanOrEqual(spec.max);
    }
  });
});
