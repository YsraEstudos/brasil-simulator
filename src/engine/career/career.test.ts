import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import brasilV080 from '@/data/scenarios/brasil_2027_01_v080.json';
import { parseScenario } from '@/types/scenario';

import { advanceMonth, DEFAULT_STEPS } from '../advanceMonth';
import { calendarAt, keyOfCalendar, offsetOfKey, toCalendar } from '../calendar';
import { sumActive } from '../impulses';
import { createInitialState } from '../state';
import type { Decision, GameState, MonthResult, MonthStep, ScheduledImpulse } from '../types';
import {
  availableStartPoints,
  careerSchedule,
  currentCareerTurn,
  inaugurationTurnIndex,
  INAUGURATION_NOTE,
  isPreInauguration,
  turnIndexOf,
} from '.';

const content = loadContent(DEFAULT_SCENARIO_ID);
const corrida = (seed = 11) => createInitialState({ content, difficulty: 'estrategica', seed, startPoint: 'corrida' });
const posse = (seed = 11) => createInitialState({ content, difficulty: 'estrategica', seed });
const PRE_TURNS = careerSchedule(content, 'corrida').length;

/** Joga `n` turnos sem decisões. */
function play(state: GameState, n: number, steps = DEFAULT_STEPS): MonthResult[] {
  const out: MonthResult[] = [];
  let s = state;
  for (let i = 0; i < n; i++) {
    const r = advanceMonth(s, { decisions: [] }, content, steps);
    out.push(r);
    s = r.state;
  }
  return out;
}

/**
 * Estado sem os campos da carreira: o que a partida da posse também tem. Fora da comparação, por lista: o bloco
 * career e as notícias da campanha (`careerPeriod`, como a da posse, Fase C5).
 */
function withoutCareer(s: GameState): Omit<GameState, 'career'> {
  const { career: _career, ...rest } = s;
  return { ...rest, events: { ...rest.events, news: (rest.events.news ?? []).filter((n) => !n.careerPeriod) } };
}

describe('calendário antes da posse (PLANO_CAMPANHA.md Fase C1, tarefa C1.3)', () => {
  it('rótulos aceitam meses negativos sem mexer no mês do mandato', () => {
    expect(calendarAt(-5)).toEqual({ year: 2026, month: 8 });
    expect(calendarAt(-1)).toEqual({ year: 2026, month: 12 });
    expect(calendarAt(0)).toEqual(toCalendar(0));
    expect(offsetOfKey('2026-08')).toBe(-5);
    expect(keyOfCalendar(calendarAt(offsetOfKey('2025-10')))).toBe('2025-10');
    expect(() => toCalendar(-1)).toThrow(RangeError);
    expect(() => offsetOfKey('2026-13')).toThrow(RangeError);
  });
});

describe('estado inicial da carreira (PLANO_CAMPANHA.md Fase C1)', () => {
  it('a posse continua sem o bloco career; a corrida começa no turno 0, antes da posse', () => {
    expect(posse().career).toBeUndefined();
    expect(availableStartPoints(content)).toEqual(['posse', 'corrida']);
    const s = corrida();
    expect(s.monthIndex).toBe(0);
    expect(s.career).toMatchObject({
      startPoint: 'corrida',
      profileId: 'ex_governador',
      stage: 'corrida',
      turnIndex: 0,
    });
    expect(isPreInauguration(s)).toBe(true);
    expect(inaugurationTurnIndex(s)).toBeNull();
    expect(turnIndexOf(s)).toBe(0);
  });

  it('reconhecimento por UF combina o nacional com a base territorial, sem passar de 1', () => {
    const profile = content.scenario.career!.profiles[0];
    const s = corrida();
    const ufs = content.scenario.regions!.ufs.map((u) => u.id);
    expect(Object.keys(s.career!.recognition)).toEqual(ufs);
    expect(s.career!.recognition.AC).toBeCloseTo(profile.recognition);
    const mg = 1 - (1 - profile.recognition) * (1 - profile.territorialBase.MG);
    expect(s.career!.recognition.MG).toBeCloseTo(mg);
    for (const r of Object.values(s.career!.recognition)) expect(r).toBeLessThanOrEqual(1);
  });

  it('o governo nasce igual ao da posse (economia congelada até ela, D-C12)', () => {
    expect(withoutCareer(corrida())).toEqual(posse());
  });
});

describe('turnos antes da posse e transição mínima (PLANO_CAMPANHA.md Fase C1, tarefa C1.6)', () => {
  it('percorre o calendário fechado do §2.4 e passa a governo no turno da posse', () => {
    const results = play(corrida(), PRE_TURNS);
    expect(
      results.map(
        (r) =>
          r.report.career && {
            stage: r.report.career.stage,
            from: r.report.career.from,
            to: r.report.career.to,
            poll: undefined,
          },
      ),
    ).toEqual([
      { stage: 'corrida', from: '2026-08', to: '2026-08', poll: undefined },
      { stage: 'corrida', from: '2026-09', to: '2026-09', poll: undefined },
      { stage: 'eleicao', from: '2026-10', to: '2026-10', poll: undefined },
      { stage: 'transicao', from: '2026-11', to: '2026-12', poll: undefined },
    ]);
    expect(results.map((r) => r.report.turnIndex)).toEqual([0, 1, 2, 3]);
    expect(results.every((r) => r.report.monthIndex === 0 && r.state.monthIndex === 0)).toBe(true);
    expect(results.at(-1)!.report.notes).toEqual([INAUGURATION_NOTE]);
    const posseState = results.at(-1)!.state;
    expect(posseState.career).toMatchObject({ stage: 'governo', turnIndex: PRE_TURNS });
    expect(isPreInauguration(posseState)).toBe(false);
    expect(inaugurationTurnIndex(posseState)).toBe(PRE_TURNS);
    expect(currentCareerTurn(posseState, content)).toBeNull();
  });

  it('antes da posse nada do governo muda e nenhum sorteio é consumido', () => {
    const start = corrida();
    const [first] = play(start, 1);
    expect(withoutCareer(first.state)).toEqual(withoutCareer(start));
    expect(first.state.rng).toEqual(start.rng);
    // Fase C2: as contribuições pré-posse são só do pseudo-indicador de relatório (reconhecimento do candidato).
    expect(first.report.contributions.every((c) => c.indicator === 'careerRecognition')).toBe(true);
  });

  it('decisões de governo antes da posse são recusadas com fora_do_estagio', () => {
    const decision = { policyId: 'qualquer_politica', agendaCost: 1, params: { x: 1 } };
    const r = advanceMonth(corrida(), { decisions: [decision] }, content);
    expect(r.report.accepted).toEqual([]);
    expect(r.report.rejected).toEqual([{ decision, reason: 'fora_do_estagio' }]);
    expect(r.state.decisionLog).toEqual([]);
  });

  it('depois da posse os dois relógios andam juntos', () => {
    const results = play(corrida(), PRE_TURNS + 3);
    const governo = results.slice(PRE_TURNS);
    expect(governo.map((r) => [r.report.turnIndex, r.report.monthIndex])).toEqual([
      [4, 0],
      [5, 1],
      [6, 2],
    ]);
    expect(governo.every((r) => r.report.career === undefined)).toBe(true);
    expect(inaugurationTurnIndex(results.at(-1)!.state)).toBe(PRE_TURNS);
  });

  it('determinismo: mesma semente e mesmos comandos, mesmo resultado', () => {
    expect(play(corrida(11), PRE_TURNS + 2)).toEqual(play(corrida(11), PRE_TURNS + 2));
  });
});

describe('regressão do ponto posse (PLANO_CAMPANHA.md §4)', () => {
  // A corrida não sorteia nem mexe no governo antes da posse; da posse em diante, a partida é a mesma da que começa
  // na posse, com a mesma semente e os mesmos comandos. Fora da comparação, por lista: o bloco career e o turnIndex.
  it('da posse em diante, a corrida joga exatamente como a partida que começa na posse', () => {
    const months = 6;
    const fromRace = play(corrida(23), PRE_TURNS + months).slice(PRE_TURNS);
    const fromInauguration = play(posse(23), months);
    for (const [i, r] of fromRace.entries()) {
      const { turnIndex, ...report } = r.report;
      expect(turnIndex).toBe(PRE_TURNS + i);
      expect(report).toEqual(fromInauguration[i].report);
      expect(withoutCareer(r.state)).toEqual(fromInauguration[i].state);
    }
  });

  it('a partida da posse não ganha campos novos no estado nem no relatório', () => {
    const [r] = play(posse(), 1);
    expect(r.state.career).toBeUndefined();
    expect('turnIndex' in r.report).toBe(false);
    expect('career' in r.report).toBe(false);
  });
});

describe('fila de efeitos através da transição (PLANO_CAMPANHA.md §2.3, item 5)', () => {
  // Decisão da Fase C1: a fila usa o mês do mandato. Antes da posse nenhuma etapa de governo lê a fila e o mês do
  // mandato não anda, então nada vence nem é aplicado cedo; da posse em diante cada mês lê os ativos uma vez.
  const impulse: ScheduledImpulse = {
    sourceId: 'teste:campanha',
    label: 'Promessa de campanha',
    target: 'aprovacao',
    delta: 0.01,
    startMonth: 0,
    endMonth: 0,
  };
  const probe: MonthStep = (s, ctx) => {
    const active = sumActive(s.impulses, s.monthIndex, 'aprovacao');
    if (active !== 0) ctx.draft.notes.push(`ativo:${active}`);
    return { state: s, contributions: [] };
  };

  it('efeito criado no último turno pré-posse vale uma vez, no mês 0 do mandato', () => {
    const lastPre = play(corrida(), PRE_TURNS - 1).at(-1)!.state;
    const withImpulse = { ...lastPre, impulses: [...lastPre.impulses, impulse] };
    const results = play(withImpulse, 3, [probe]);
    expect(results.map((r) => r.report.notes.filter((n) => n.startsWith('ativo')))).toEqual([[], ['ativo:0.01'], []]);
    expect(results[0].state.impulses).toContainEqual(impulse);
    expect(results[2].state.impulses).not.toContainEqual(impulse);
  });
});

describe('bloco career do cenário (Zod, PLANO_CAMPANHA.md Fase C1, tarefa C1.1)', () => {
  const base = brasilV080 as unknown as Record<string, unknown> & { career: Record<string, unknown> };
  const withCareer = (career: unknown) => parseScenario({ ...base, career });
  const errors = (career: unknown) => {
    const r = withCareer(career);
    return r.ok ? [] : r.errors;
  };
  const profile = (base.career.profiles as Record<string, unknown>[])[0];

  it('o cenário padrão traz um ponto de partida e um perfil válidos', () => {
    expect(parseScenario(base).ok).toBe(true);
  });

  it('recusa UF inexistente na base territorial', () => {
    const bad = { ...base.career, profiles: [{ ...profile, territorialBase: { XX: 0.2 } }] };
    expect(errors(bad).join('\n')).toMatch(/UF inexistente no cenário: XX|sigla da UF/);
    const unknown = { ...base.career, profiles: [{ ...profile, territorialBase: { ZZ: 0.2 } }] };
    expect(errors(unknown).join('\n')).toContain('UF inexistente no cenário: ZZ');
  });

  it('recusa valores fora de faixa', () => {
    expect(errors({ ...base.career, profiles: [{ ...profile, recognition: 1.2 }] })).not.toEqual([]);
    expect(errors({ ...base.career, profiles: [{ ...profile, valence: -1.5 }] })).not.toEqual([]);
    expect(errors({ ...base.career, profiles: [{ ...profile, wealth: 10.5 }] })).not.toEqual([]);
    expect(errors({ ...base.career, profiles: [{ ...profile, territorialBase: { MG: 2 } }] })).not.toEqual([]);
  });

  it('recusa ponto de partida desconhecido e campo extra', () => {
    const startPoints = base.career.startPoints as Record<string, unknown>;
    expect(errors({ ...base.career, startPoints: { ...startPoints, segundo_turno: startPoints.corrida } })).not.toEqual(
      [],
    );
    expect(errors({ ...base.career, extra: true })).not.toEqual([]);
    expect(errors({ ...base.career, profiles: [{ ...profile, extra: true }] })).not.toEqual([]);
  });

  it('recusa calendário com lacuna, fora de ordem ou que não termina antes da posse', () => {
    const turns = (t: unknown[]) => ({ ...base.career, startPoints: { corrida: { turns: t } } });
    expect(
      errors(
        turns([
          { stage: 'corrida', from: '2026-08' },
          { stage: 'eleicao', from: '2026-10', to: '2026-12' },
        ]),
      ).join('\n'),
    ).toContain('lacuna');
    expect(errors(turns([{ stage: 'corrida', from: '2026-08', to: '2026-11' }])).join('\n')).toContain(
      'dezembro de 2026',
    );
    expect(errors(turns([{ stage: 'corrida', from: '2026-12', to: '2026-11' }]))).not.toEqual([]);
    expect(errors(turns([{ stage: 'governo', from: '2026-12' }]))).not.toEqual([]);
    // Sem turno de campanha não há onde pôr o debate do cenário: ele sai junto.
    const onlyTransition = { ...turns([{ stage: 'transicao', from: '2026-08', to: '2026-12' }]), debates: undefined };
    expect(errors(onlyTransition)).toEqual([]);
  });

  it('recusa perfis repetidos e lista vazia', () => {
    expect(errors({ ...base.career, profiles: [profile, profile] }).join('\n')).toContain('id repetido');
    expect(errors({ ...base.career, profiles: [] })).not.toEqual([]);
  });
});

// PLANO_CAMPANHA.md Fase C3: caixa por cenário, persistência do saldo e encerramento na posse.
describe('caixa da carreira', () => {
  it('inicia o caixa configurado e registra a sobra no último relatório da campanha', () => {
    const configured = {
      ...content,
      scenario: {
        ...content.scenario,
        career: {
          ...content.scenario.career!,
          finance: { initialBalance: 500, spendingLimit: 1000, dataStatus: 'FICTICIO' as const },
        },
      },
    };
    let state = createInitialState({ content: configured, difficulty: 'estrategica', seed: 11, startPoint: 'corrida' });
    expect(state.career!.finance).toMatchObject({ balance: 500, spendingLimit: 1000, spent: 0 });
    let last: MonthResult | undefined;
    for (let i = 0; i < PRE_TURNS; i++) {
      last = advanceMonth(state, { decisions: [] }, configured);
      state = JSON.parse(JSON.stringify(last.state)) as GameState;
    }
    expect(state.career!.finance).toMatchObject({ balance: 0, closedBalance: 500, spent: 0 });
    expect(last!.report.career!.finance).toMatchObject({ balance: 0, closedBalance: 500 });
  });
  it('não cria caixa se o sistema estiver desligado no cenário', () => {
    const configured = {
      ...content,
      scenario: { ...content.scenario, career: { ...content.scenario.career!, finance: undefined } },
    };
    const state = createInitialState({
      content: configured,
      difficulty: 'estrategica',
      seed: 11,
      startPoint: 'corrida',
    });
    expect(state.career!.finance).toBeUndefined();
  });
});

// PLANO_CAMPANHA.md Fase C3.2: motor usa custos do catálogo e reserva na ordem de envio.
describe('triagem financeira pré-posse', () => {
  it('aceita saldo exato, recusa gasto seguinte e não confia no custo enviado', () => {
    const configured = {
      ...content,
      scenario: {
        ...content.scenario,
        career: {
          ...content.scenario.career!,
          finance: {
            initialBalance: 100,
            spendingLimit: 200,
            dataStatus: 'FICTICIO' as const,
            costs: [
              { id: 'acao_teste_a', cost: 70 },
              { id: 'acao_teste_b', cost: 31 },
              { id: 'acao_teste_c', cost: 30 },
            ],
          },
        },
      },
    };
    const state = createInitialState({
      content: configured,
      difficulty: 'estrategica',
      seed: 11,
      startPoint: 'corrida',
    });
    const decisions = [
      { policyId: 'acao_teste_a', agendaCost: 0 },
      { policyId: 'acao_teste_b', agendaCost: 0 },
      { policyId: 'acao_teste_c', agendaCost: 0 },
      { policyId: 'acao_nao_catalogada', agendaCost: 0 },
    ];
    const result = advanceMonth(state, { decisions }, configured);
    expect(result.report.accepted.map((decision) => decision.policyId)).toEqual(['acao_teste_a', 'acao_teste_c']);
    expect(result.report.rejected.map((item) => item.reason)).toEqual(['sem_recursos', 'fora_do_estagio']);
    expect(result.state.career!.finance).toMatchObject({ balance: 0, spent: 100 });
    expect(result.report.career!.finance).toMatchObject({
      balance: 0,
      spent: 100,
      expenditures: [
        { actionId: 'acao_teste_a', amount: 70 },
        { actionId: 'acao_teste_c', amount: 30 },
      ],
    });
  });
});

// PLANO_CAMPANHA.md Fase C3: um custo inequívoco por ação.
it('recusa catálogo financeiro com ids repetidos', () => {
  const raw = brasilV080 as unknown as Record<string, unknown> & { career: Record<string, unknown> };
  const finance = {
    initialBalance: 100,
    spendingLimit: 100,
    dataStatus: 'FICTICIO',
    costs: [
      { id: 'arrecadar_doacoes', cost: 10 },
      { id: 'arrecadar_doacoes', cost: 90 },
    ],
  };
  const result = parseScenario({ ...raw, career: { ...raw.career, finance } });
  expect(result.ok).toBe(false);
});

// PLANO_CAMPANHA.md Fase C3.1: o cenário de corrida oferece caixa ao jogador.
it('a corrida padrão começa com finanças ativas e valores de design declarados', () => {
  expect(content.scenario.career?.finance?.dataStatus).toBe('FICTICIO');
  const finance = corrida().career!.expandedFinance;
  expect(finance).toBeDefined();
  expect(finance!.pockets.party).toBeGreaterThan(0);
  expect(finance!.spendingLimit).toBeGreaterThanOrEqual(finance!.pockets.party);
});

// PLANO_CAMPANHA.md Fase C3: a contabilidade expandida integra escolhas, turno e compromisso.
it('processa aporte e dívida escolhida, depois mantém compromisso na posse', () => {
  const configured = {
    ...content,
    scenario: {
      ...content.scenario,
      career: {
        ...content.scenario.career!,
        finance: {
          initialBalance: 100,
          spendingLimit: 1000,
          dataStatus: 'FICTICIO' as const,
          expanded: { personalAvailable: 100, personalLimit: 100, debtLimit: 50, debtDeadline: 4 },
          costs: [{ id: 'acao_teste', cost: 90, pockets: ['personal' as const] }],
        },
      },
    },
  };
  let state = createInitialState({ content: configured, difficulty: 'estrategica', seed: 11, startPoint: 'corrida' });
  expect(state.career!.finance).toBeUndefined();
  expect(state.career!.expandedFinance!.pockets.party).toBe(100);
  const result = advanceMonth(
    state,
    {
      decisions: [
        { policyId: 'aportar_campanha', agendaCost: 0, params: { valor: 50 } },
        { policyId: 'acao_teste', agendaCost: 0, params: { bolso: 'personal', divida: true } },
      ],
    },
    configured,
  );
  expect(result.report.accepted).toHaveLength(2);
  expect(result.state.career!.expandedFinance).toMatchObject({
    spent: 90,
    debt: 40,
    pockets: { personal: 0, party: 100 },
  });
  state = result.state;
  for (let i = 1; i < PRE_TURNS; i++) state = advanceMonth(state, { decisions: [] }, configured).state;
  expect(state.career!.expandedFinance!.closure).toMatchObject({ debt: 40, remaining: { party: 100 } });
  expect(state.career!.commitments).toMatchObject([{ remaining: 40, deadline: 4, status: 'pendente' }]);
});

// PLANO_CAMPANHA.md Fase C3: parcela só paga ações no turno em que é liberada.
it('recebe parcelas na abertura do turno e preserva o saldo entre retomadas', () => {
  const configured = {
    ...content,
    scenario: {
      ...content.scenario,
      career: {
        ...content.scenario.career!,
        finance: {
          initialBalance: 0,
          spendingLimit: 1000,
          dataStatus: 'FICTICIO' as const,
          expanded: {
            personalAvailable: 100,
            personalLimit: 100,
            debtLimit: 0,
            debtDeadline: 4,
            installments: [{ turn: 1, amount: 100, pocket: 'party' as const }],
          },
          costs: [{ id: 'acao_teste', cost: 100, pockets: ['party' as const] }],
        },
      },
    },
  };
  let state = createInitialState({ content: configured, difficulty: 'estrategica', seed: 11, startPoint: 'corrida' });
  const decision = { policyId: 'acao_teste', agendaCost: 0, params: { bolso: 'party' } };
  const first = advanceMonth(state, { decisions: [decision] }, configured);
  expect(first.report.rejected[0].reason).toBe('sem_recursos');
  state = JSON.parse(JSON.stringify(first.state)) as GameState;
  const second = advanceMonth(state, { decisions: [decision] }, configured);
  expect(second.report.accepted).toHaveLength(1);
  expect(second.report.career!.expandedFinance?.receipts).toEqual([{ turn: 1, amount: 100, pocket: 'party' }]);
  expect(second.state.career!.expandedFinance).toMatchObject({ spent: 100, pockets: { party: 0 }, scheduled: [] });
});

// PLANO_CAMPANHA.md Fase C3: aporte não supera liquidez ou limite pessoal.
it('valida teto pessoal e liquidez do perfil no cenário expandido', () => {
  const raw = brasilV080 as unknown as Record<string, unknown> & { career: Record<string, unknown> };
  const finance = {
    initialBalance: 0,
    spendingLimit: 1000,
    dataStatus: 'FICTICIO',
    expanded: { personalAvailable: 751, personalLimit: 101, debtLimit: 0, debtDeadline: 4 },
  };
  const result = parseScenario({ ...raw, career: { ...raw.career, finance } });
  expect(result.ok).toBe(false);
});

// PLANO_CAMPANHA.md Fase C3.4: o compromisso deve ser pagável e cobrado no governo.
it('paga dívida com recursos pessoais sem mexer na economia do governo', () => {
  const initial = play(corrida(), PRE_TURNS).at(-1)!.state;
  const configured = {
    ...initial,
    career: {
      ...initial.career!,
      commitments: [
        {
          origin: 'divida_de_campanha',
          obligation: 'pagar_divida' as const,
          initialAmount: 40,
          remaining: 40,
          deadline: 4,
          status: 'pendente' as const,
        },
      ],
      expandedFinance: {
        pockets: { personal: 0, party: 0, donations: 0 },
        personalAvailable: 70,
        personalLimit: 100,
        personalContributed: 30,
        spendingLimit: 1000,
        spent: 90,
        debt: 0,
        debtLimit: 50,
        scheduled: [],
        closure: { remaining: { personal: 0, party: 0, donations: 0 }, cancelledReceipts: 0, debt: 40 },
      },
    },
  };
  const command = { policyId: 'pagar_divida_campanha', agendaCost: 0, params: { indice: 0, valor: 40 } };
  const result = advanceMonth(configured, { decisions: [command] }, content);
  const withoutPayment = advanceMonth(configured, { decisions: [] }, content);
  expect(result.report.accepted).toHaveLength(1);
  expect(result.state.career!.commitments![0]).toMatchObject({ status: 'cumprido', remaining: 0 });
  expect(result.state.career!.expandedFinance!.personalAvailable).toBe(30);
  expect(result.state.economy).toEqual(withoutPayment.state.economy);
});

it('cobra uma única vez um compromisso vencido', () => {
  const initial = play(corrida(), PRE_TURNS).at(-1)!.state;
  const configured = {
    ...initial,
    monthIndex: 5,
    career: {
      ...initial.career!,
      commitments: [
        {
          origin: 'divida_de_campanha',
          obligation: 'pagar_divida' as const,
          initialAmount: 40,
          remaining: 40,
          deadline: 4,
          status: 'pendente' as const,
        },
      ],
    },
  };
  const first = advanceMonth(configured, { decisions: [] }, content);
  expect(first.state.career!.commitments![0].status).toBe('expirado');
  expect(first.report.notes.some((note) => note.includes('dívida'))).toBe(true);
  const second = advanceMonth(first.state, { decisions: [] }, content);
  expect(second.report.notes.some((note) => note.includes('dívida'))).toBe(false);
});

// PLANO_CAMPANHA.md Fase C3.5: caixa 2, um único risco por turno e proteção do Casual.
it('fiscaliza o caixa 2 uma vez por turno, registra investigação e o proíbe no Casual', () => {
  const configured = {
    ...content,
    scenario: {
      ...content.scenario,
      career: {
        ...content.scenario.career!,
        finance: {
          initialBalance: 0,
          spendingLimit: 1000,
          dataStatus: 'FICTICIO' as const,
          expanded: {
            personalAvailable: 100,
            personalLimit: 100,
            debtLimit: 0,
            debtDeadline: 4,
            illicit: { decay: 0.5, sensitivity: 100, maxHazard: 1, monthlyLimit: 100 },
          },
        },
      },
    },
  };
  const decision = { policyId: 'usar_caixa_dois', agendaCost: 0, params: { valor: 10 } };
  const start = createInitialState({ content: configured, difficulty: 'estrategica', seed: 11, startPoint: 'corrida' });
  const result = advanceMonth(start, { decisions: [decision] }, configured);
  expect(result.report.accepted).toHaveLength(1);
  expect(result.state.career!.illicit).toMatchObject({
    balance: 0,
    pending: [{ turn: 1, amount: 10 }],
    exposure: 0,
    investigations: 1,
  });
  expect(result.report.career!.illicit).toMatchObject({ discovered: true, hazard: 1, volume: 10 });
  expect(result.state.events.news).toContainEqual(
    expect.objectContaining({ sourceId: 'caixa_dois', careerPeriod: '2026-08' }),
  );
  expect(result.state.rng).toEqual(start.rng);
  const casual = createInitialState({ content: configured, difficulty: 'casual', seed: 11, startPoint: 'corrida' });
  const denied = advanceMonth(casual, { decisions: [decision] }, configured);
  expect(denied.report.rejected[0].reason).toBe('fora_do_estagio');
  expect(denied.state.career!.illicit).toBeUndefined();
});

// PLANO_CAMPANHA.md Fase C3.5: verba ilícita paga apenas ações autorizadas e entra no teto contratado.
it('gasta caixa 2 separadamente e respeita o teto global', () => {
  const configured = {
    ...content,
    scenario: {
      ...content.scenario,
      career: {
        ...content.scenario.career!,
        finance: {
          initialBalance: 0,
          spendingLimit: 100,
          dataStatus: 'FICTICIO' as const,
          expanded: {
            personalAvailable: 0,
            personalLimit: 0,
            debtLimit: 0,
            debtDeadline: 4,
            illicit: { decay: 0.5, sensitivity: 0, maxHazard: 0.5, monthlyLimit: 100 },
          },
          costs: [
            { id: 'acao_teste', cost: 70, pockets: ['illicit' as const] },
            { id: 'acao_cara', cost: 31, pockets: ['illicit' as const] },
          ],
        },
      },
    },
  };
  const state = createInitialState({ content: configured, difficulty: 'estrategica', seed: 11, startPoint: 'corrida' });
  const decisions: Decision[] = [
    { policyId: 'usar_caixa_dois', agendaCost: 0, params: { valor: 100 } },
    { policyId: 'acao_teste', agendaCost: 0, params: { bolso: 'illicit' } },
    { policyId: 'acao_cara', agendaCost: 0, params: { bolso: 'illicit' } },
  ];
  const first = advanceMonth(state, { decisions }, configured);
  expect(first.report.accepted).toHaveLength(1);
  expect(first.report.rejected.map((item) => item.reason)).toEqual(['sem_recursos', 'sem_recursos']);
  const result = advanceMonth(first.state, { decisions: decisions.slice(1) }, configured);
  expect(result.report.accepted).toHaveLength(1);
  expect(result.report.rejected[0].reason).toBe('teto_legal');
  expect(result.state.career!.illicit!.balance).toBe(30);
  expect(result.state.career!.expandedFinance!.spent).toBe(70);
});

// PLANO_CAMPANHA.md Fase C3: arrecadação não financia a própria ação.
it('arrecadação contratada entra somente no turno seguinte e não duplica no turno', () => {
  const configured = {
    ...content,
    scenario: {
      ...content.scenario,
      career: {
        ...content.scenario.career!,
        finance: {
          initialBalance: 100,
          spendingLimit: 1000,
          dataStatus: 'FICTICIO' as const,
          expanded: { personalAvailable: 100, personalLimit: 100, debtLimit: 0, debtDeadline: 4 },
          costs: [{ id: 'arrecadar_doacoes', cost: 100, pockets: ['party' as const] }],
        },
      },
    },
  };
  const state = createInitialState({ content: configured, difficulty: 'estrategica', seed: 11, startPoint: 'corrida' });
  const decision = { policyId: 'arrecadar_doacoes', agendaCost: 0, params: { bolso: 'party' } };
  const first = advanceMonth(state, { decisions: [decision, decision] }, configured);
  expect(first.report.accepted).toHaveLength(1);
  expect(first.report.rejected[0].reason).toBe('acao_repetida');
  expect(first.state.career!.expandedFinance).toMatchObject({
    pockets: { donations: 0 },
    scheduled: [{ pocket: 'donations', turn: 1, amount: 800 }],
  });
  const next = advanceMonth(first.state, { decisions: [] }, configured);
  expect(next.state.career!.expandedFinance!.pockets.donations).toBe(800);
});

// PLANO_CAMPANHA.md §4.1: permutação apenas de ações que não disputam saldo nem interagem.
it('permutar despesas independentes preserva estado e sorteio de fiscalização', () => {
  const configured = {
    ...content,
    scenario: {
      ...content.scenario,
      career: {
        ...content.scenario.career!,
        finance: {
          initialBalance: 100,
          spendingLimit: 1000,
          dataStatus: 'FICTICIO' as const,
          expanded: {
            personalAvailable: 100,
            personalLimit: 100,
            debtLimit: 0,
            debtDeadline: 4,
            illicit: { decay: 0.5, sensitivity: 0.01, maxHazard: 0.3, monthlyLimit: 100 },
          },
          costs: [
            { id: 'acao_a', cost: 20, pockets: ['party' as const] },
            { id: 'acao_b', cost: 30, pockets: ['personal' as const] },
          ],
        },
      },
    },
  };
  const start = createInitialState({ content: configured, difficulty: 'estrategica', seed: 42, startPoint: 'corrida' });
  const expanded = start.career!.expandedFinance!;
  const state = {
    ...start,
    career: {
      ...start.career!,
      expandedFinance: {
        ...expanded,
        personalAvailable: 50,
        personalContributed: 50,
        pockets: { ...expanded.pockets, personal: 50 },
      },
    },
  };
  const a = { policyId: 'acao_a', agendaCost: 0, params: { bolso: 'party' } };
  const b = { policyId: 'acao_b', agendaCost: 0, params: { bolso: 'personal' } };
  const illicit = { policyId: 'usar_caixa_dois', agendaCost: 0, params: { valor: 10 } };
  const first = advanceMonth(state, { decisions: [a, illicit, b] }, configured);
  const second = advanceMonth(state, { decisions: [b, illicit, a] }, configured);
  expect(first.state).toEqual(second.state);
  expect(first.report.career!.illicit).toEqual(second.report.career!.illicit);
});

// PLANO_CAMPANHA.md Fase C3: uma despesa elegível pode usar caixa 2 separado.
it('arrecada com caixa 2 e agenda o retorno para o turno seguinte', () => {
  const configured = {
    ...content,
    scenario: {
      ...content.scenario,
      career: {
        ...content.scenario.career!,
        finance: {
          initialBalance: 0,
          spendingLimit: 1000,
          dataStatus: 'FICTICIO' as const,
          expanded: {
            personalAvailable: 0,
            personalLimit: 0,
            debtLimit: 0,
            debtDeadline: 4,
            illicit: { decay: 0.5, sensitivity: 0, maxHazard: 0.5, monthlyLimit: 100 },
          },
          costs: [{ id: 'arrecadar_doacoes', cost: 100, pockets: ['illicit' as const] }],
        },
      },
    },
  };
  const start = createInitialState({ content: configured, difficulty: 'estrategica', seed: 11, startPoint: 'corrida' });
  const first = advanceMonth(
    start,
    { decisions: [{ policyId: 'usar_caixa_dois', agendaCost: 0, params: { valor: 100 } }] },
    configured,
  );
  const second = advanceMonth(
    first.state,
    { decisions: [{ policyId: 'arrecadar_doacoes', agendaCost: 0, params: { bolso: 'illicit' } }] },
    configured,
  );
  expect(second.report.accepted).toHaveLength(1);
  expect(second.state.career!.expandedFinance!.scheduled).toContainEqual({ pocket: 'donations', turn: 2, amount: 800 });
});

// PLANO_CAMPANHA.md Fase C3.1: arrecadação também funciona no caixa simples.
it('no caixa simples recebe a arrecadação no turno seguinte', () => {
  const configured = {
    ...content,
    scenario: {
      ...content.scenario,
      career: {
        ...content.scenario.career!,
        finance: {
          initialBalance: 100,
          spendingLimit: 1000,
          dataStatus: 'FICTICIO' as const,
          costs: [{ id: 'arrecadar_doacoes', cost: 100 }],
        },
      },
    },
  };
  const state = createInitialState({ content: configured, difficulty: 'estrategica', seed: 11, startPoint: 'corrida' });
  const first = advanceMonth(state, { decisions: [{ policyId: 'arrecadar_doacoes', agendaCost: 0 }] }, configured);
  expect(first.state.career!.finance!.balance).toBe(0);
  const second = advanceMonth(first.state, { decisions: [] }, configured);
  expect(second.state.career!.finance!.balance).toBe(800);
  expect(second.report.career!.finance!.receipts).toEqual([{ turn: 1, amount: 800 }]);
});

// PLANO_CAMPANHA.md Fase C3: custo configurado não deve aceitar ação sem execução no motor.
it('recusa ação financeira desconhecida no cenário', () => {
  const raw = brasilV080 as unknown as Record<string, unknown> & { career: Record<string, unknown> };
  const finance = {
    initialBalance: 0,
    spendingLimit: 100,
    dataStatus: 'FICTICIO',
    costs: [{ id: 'acao_sem_efeito', cost: 10 }],
  };
  expect(parseScenario({ ...raw, career: { ...raw.career, finance } }).ok).toBe(false);
});

// PLANO_CAMPANHA.md §4.1: pagamentos após a posse também preservam a ordem e não reservam rejeições.
it('registra a ordem dos pagamentos mesmo quando uma escolha intermediária é recusada', () => {
  const initial = play(corrida(), PRE_TURNS).at(-1)!.state;
  const configured = {
    ...initial,
    career: {
      ...initial.career!,
      commitments: [
        {
          origin: 'divida_de_campanha',
          obligation: 'pagar_divida' as const,
          initialAmount: 40,
          remaining: 40,
          deadline: 4,
          status: 'pendente' as const,
        },
      ],
      expandedFinance: {
        pockets: { personal: 0, party: 0, donations: 0 },
        personalAvailable: 70,
        personalLimit: 100,
        personalContributed: 30,
        spendingLimit: 1000,
        spent: 90,
        debt: 0,
        debtLimit: 50,
        scheduled: [],
        closure: { remaining: { personal: 0, party: 0, donations: 0 }, cancelledReceipts: 0, debt: 40 },
      },
    },
  };
  const decisions = [20, 25, 20].map((valor) => ({
    policyId: 'pagar_divida_campanha',
    agendaCost: 0,
    params: { indice: 0, valor },
  }));
  const result = advanceMonth(configured, { decisions }, content);
  expect(result.report.decisionOrder?.map((item) => [item.decision.params?.valor, item.accepted])).toEqual([
    [20, true],
    [25, false],
    [20, true],
  ]);
  expect(result.state.career!.commitments![0].status).toBe('cumprido');
});
