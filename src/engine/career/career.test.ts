import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import brasilV080 from '@/data/scenarios/brasil_2027_01_v080.json';
import { parseScenario } from '@/types/scenario';

import { advanceMonth, DEFAULT_STEPS } from '../advanceMonth';
import { calendarAt, keyOfCalendar, offsetOfKey, toCalendar } from '../calendar';
import { sumActive } from '../impulses';
import { createInitialState } from '../state';
import type { GameState, MonthResult, MonthStep, ScheduledImpulse } from '../types';
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

/** Estado sem os campos da carreira: o que a partida da posse também tem. */
function withoutCareer(s: GameState): Omit<GameState, 'career'> {
  const { career: _career, ...rest } = s;
  return rest;
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
    expect(results.map((r) => r.report.career && { ...r.report.career, poll: undefined })).toEqual([
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
    expect(play(corrida(5), PRE_TURNS + 2)).toEqual(play(corrida(5), PRE_TURNS + 2));
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
    expect(errors(turns([{ stage: 'transicao', from: '2026-08', to: '2026-12' }]))).toEqual([]);
  });

  it('recusa perfis repetidos e lista vazia', () => {
    expect(errors({ ...base.career, profiles: [profile, profile] }).join('\n')).toContain('id repetido');
    expect(errors({ ...base.career, profiles: [] })).not.toEqual([]);
  });
});
