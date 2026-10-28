import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import escandaloDiretoria from '@/data/events/escandalo_diretoria.json';
import { APPOINT_ACTION_ID, DIRECTORATE_ACTION_ID } from '@/engine/actions';
import { advanceMonth } from '@/engine/advanceMonth';
import { DEFAULT_CALIBRATION } from '@/engine/economy/calibration';
import { resolveEventsStep, triggerEventsStep } from '@/engine/events/events';
import { checkInvariants } from '@/engine/invariants';
import { createInitialState } from '@/engine/state';
import type { Decision, GameContent, GameState } from '@/engine/types';
import { TEST_SCENARIO, testContent, testState } from '@/tests/fixtures';
import { parseGameEvent, type GameEvent } from '@/types/event';
import type { Directorate } from '@/types/scenario';

import { cabinetStep, cabinetSupport } from './cabinet';
import {
  directorateOccupant,
  directorateScandalChance,
  directorateScandalRisk,
  directoratesOf,
  isClosedGate,
  partisanDirectorates,
  riskiestDirectorate,
} from './directorates';

// PLANO_CAMPANHA.md Fase C6a: diretorias de estatais (nomear, substituir e sofrer escândalo, com causa).

const c = DEFAULT_CALIBRATION;
const DIRECTORATES: Directorate[] = [
  { id: 'banco', name: 'Diretoria do banco público', ministryId: 'fazenda', weight: 0.8, occupant: 'tecnico' },
  { id: 'obras', name: 'Diretoria da estatal de obras', ministryId: 'social', weight: 0.5, occupant: 'tecnico' },
];
const parsed = parseGameEvent(escandaloDiretoria);
if (!parsed.ok) throw new Error(parsed.errors.join('; '));
const SCANDAL: GameEvent = { ...parsed.event, onlyScenarios: undefined };

function withDirectorates(overrides: Partial<GameContent> = {}): GameContent {
  return testContent({
    scenario: { ...TEST_SCENARIO, institutions: { ...TEST_SCENARIO.institutions!, directorates: DIRECTORATES } },
    ...overrides,
  });
}
const content = withDirectorates();
const directorate = (id: string) => directoratesOf(content).find((d) => d.id === id)!;
const nomear = (directorateId: string, occupant: string): Decision => ({
  policyId: DIRECTORATE_ACTION_ID,
  agendaCost: 1,
  params: { directorateId, occupant },
});
const relation = (s: GameState, id: string) => s.congress.blocs.find((b) => b.id === id)?.governmentRelation ?? 0;
const mes = (state: GameState, decisions: Decision[], ctn: GameContent = content) =>
  advanceMonth(state, { decisions }, ctn, [cabinetStep]);

describe('diretorias de estatais (PLANO_CAMPANHA.md Fase C6a)', () => {
  it('no início, todas técnicas: sem apoio, sem risco e sem campo novo no estado', () => {
    const s = testState(42, 'estrategica', content);
    expect(partisanDirectorates(s, content)).toEqual([]);
    expect(directorateScandalRisk(s, content)).toBe(0);
    expect(cabinetSupport(s, 'centro', content)).toBe(0);
    expect(s.congress.directorates).toBeUndefined();
  });

  it('nomear indicação de bloco: a relação sobe × peso, o bloco apoia mais e o risco passa a existir', () => {
    const s0 = testState(42, 'estrategica', content);
    const out = mes(s0, [nomear('banco', 'centro')]);
    expect(out.report.rejected).toEqual([]);
    const s1 = out.state;
    expect(directorateOccupant(s1, directorate('banco'))).toBe('centro');
    expect(relation(s1, 'centro')).toBeCloseTo(relation(s0, 'centro') + c.relacao_nomeacao_diretoria * 0.8, 10);
    expect(cabinetSupport(s1, 'centro', content)).toBeCloseTo(c.apoio_diretoria * 0.8, 12);
    expect(directorateScandalChance(s1, content, directorate('banco'))).toBeGreaterThan(0);
    expect(out.report.notes).toContain(
      'Diretoria do banco público: sai quadro técnico, entra indicação do bloco Centro.',
    );
  });

  it('substituir indicação de bloco custa capital e a relação do bloco que perde', () => {
    const s1 = mes(testState(42, 'estrategica', content), [nomear('banco', 'centro')]).state;
    const s2 = mes(s1, [nomear('banco', 'direita')]).state;
    expect(directorateOccupant(s2, directorate('banco'))).toBe('direita');
    expect(relation(s2, 'centro')).toBeCloseTo(relation(s1, 'centro') + c.relacao_demissao_diretoria * 0.8, 10);
    expect(s2.resources.politicalCapital).toBeCloseTo(s1.resources.politicalCapital + c.capital_demissao_diretoria, 10);
    expect(s2.congress.directorates).toHaveLength(1);
    expect(s2.congress.directorates![0]).toEqual({ id: 'banco', occupant: 'direita', since: s1.monthIndex });
  });

  it('rejeita diretoria inexistente, ocupante inválido e o mesmo ocupante', () => {
    const s = testState(42, 'estrategica', content);
    const out = mes(s, [nomear('nada', 'centro'), nomear('banco', 'ninguem'), nomear('obras', 'tecnico')]);
    expect(out.report.rejected.map((r) => r.reason)).toEqual(['alvo_invalido', 'alvo_invalido', 'alvo_invalido']);
    expect(out.state.congress.directorates).toBeUndefined();
  });

  it('sem diretorias no cenário, a ação é rejeitada (sistema desligado)', () => {
    const out = mes(testState(), [nomear('banco', 'centro')], testContent());
    expect(out.report.rejected.map((r) => r.reason)).toEqual(['alvo_invalido']);
  });

  it('o risco cresce com o tempo no cargo e satura em `escandalo_max_mes`', () => {
    const s1 = mes(testState(42, 'estrategica', content), [nomear('obras', 'centro')]).state;
    const d = directorate('obras');
    const now = directorateScandalChance(s1, content, d);
    expect(now).toBeCloseTo((c.escandalo_base_mes + c.escandalo_por_ano / 12) * 0.5, 12);
    const later = directorateScandalChance({ ...s1, monthIndex: s1.monthIndex + 24 }, content, d);
    expect(later).toBeCloseTo((c.escandalo_base_mes + (25 / 12) * c.escandalo_por_ano) * 0.5, 12);
    expect(directorateScandalChance({ ...s1, monthIndex: 600 }, content, d)).toBe(c.escandalo_max_mes);
  });

  it('porteira fechada: com o ministério do mesmo bloco, o risco × `fator_porteira_fechada`', () => {
    const s1 = mes(testState(42, 'estrategica', content), [nomear('obras', 'centro')]).state;
    const open = directorateScandalChance(s1, content, directorate('obras'));
    const ministry: Decision = {
      policyId: APPOINT_ACTION_ID,
      agendaCost: 1,
      params: { ministryId: 'social', occupant: 'centro' },
    };
    const s2 = mes(s1, [ministry]).state;
    const s1Later = { ...s1, monthIndex: s2.monthIndex };
    expect(isClosedGate(s2, content, directorate('obras'))).toBe(true);
    expect(isClosedGate(s1Later, content, directorate('obras'))).toBe(false);
    expect(directorateScandalChance(s2, content, directorate('obras'))).toBeCloseTo(
      directorateScandalChance(s1Later, content, directorate('obras')) * c.fator_porteira_fechada,
      12,
    );
    expect(open).toBeGreaterThan(0);
    // Trocar o ministro preserva as diretorias já trocadas.
    expect(s2.congress.directorates).toEqual(s1.congress.directorates);
  });

  it('o apoio das diretorias soma com o das pastas sob o mesmo teto', () => {
    const many: Directorate[] = Array.from({ length: 12 }, (_, i) => ({
      id: `d${i}`,
      name: `Diretoria ${i}`,
      ministryId: 'fazenda',
      weight: 1,
      occupant: 'centro',
    }));
    const ctn = testContent({
      scenario: { ...TEST_SCENARIO, institutions: { ...TEST_SCENARIO.institutions!, directorates: many } },
    });
    expect(cabinetSupport(testState(42, 'estrategica', ctn), 'centro', ctn)).toBe(c.apoio_ministerio_max);
  });

  it('o alvo do escândalo é a diretoria de maior risco; empate: a há mais tempo no cargo', () => {
    let s = mes(testState(42, 'estrategica', content), [nomear('obras', 'centro')]).state;
    s = mes(s, [nomear('banco', 'direita')]).state;
    expect(riskiestDirectorate(s, content)?.id).toBe('banco');
    const same = {
      ...s,
      congress: {
        ...s.congress,
        directorates: [
          { id: 'banco', occupant: 'direita', since: 1 },
          { id: 'obras', occupant: 'centro', since: 0 },
        ],
      },
    };
    const calib = { ...c, escandalo_max_mes: 0 };
    expect(riskiestDirectorate(same, { ...content, calibration: calib })?.id).toBe('obras');
  });
});

describe('escândalo em diretoria, com causa (PLANO_CAMPANHA.md Fase C6a)', () => {
  // Risco 1 ao mês para o evento sempre disparar quando elegível.
  const certain = withDirectorates({
    events: [SCANDAL],
    calibration: { ...c, escandalo_base_mes: 1, escandalo_max_mes: 1 },
  });
  const steps = [resolveEventsStep, cabinetStep, triggerEventsStep];

  it('sem diretoria de bloco o evento não é elegível e não consome o sorteio', () => {
    const s0 = testState(42, 'estrategica', certain);
    const out = advanceMonth(s0, { decisions: [] }, certain, steps);
    expect(out.state.events.pending).toEqual([]);
    expect(out.state.rng).toEqual(s0.rng);
  });

  it('dispara com a diretoria e o bloco congelados no disparo e o texto da causa no relatório', () => {
    const s0 = testState(42, 'estrategica', certain);
    const out = advanceMonth(s0, { decisions: [nomear('banco', 'centro')] }, certain, steps);
    const pending = out.state.events.pending.find((p) => p.eventId === 'escandalo_diretoria');
    expect(pending?.subjectId).toBe('banco');
    expect(out.report.notes).toContain(
      'Escândalo: Diretoria do banco público, indicação do bloco Centro recém-nomeada.',
    );
  });

  it('afastar devolve a diretoria do escândalo ao quadro técnico, com o custo da troca', () => {
    const s0 = testState(42, 'estrategica', certain);
    const s1 = advanceMonth(s0, { decisions: [nomear('banco', 'centro')] }, certain, steps).state;
    const out = advanceMonth(
      s1,
      { decisions: [], eventChoices: [{ eventId: 'escandalo_diretoria', choiceId: 'afastar_diretor' }] },
      certain,
      steps,
    );
    expect(out.report.rejected).toEqual([]);
    expect(directorateOccupant(out.state, directorate('banco'))).toBe('tecnico');
    const kept = advanceMonth(
      s1,
      { decisions: [], eventChoices: [{ eventId: 'escandalo_diretoria', choiceId: 'defender' }] },
      certain,
      steps,
    );
    expect(out.state.resources.politicalCapital - kept.state.resources.politicalCapital).toBeCloseTo(
      c.capital_demissao_diretoria,
      10,
    );
    expect(out.report.notes).toContain(
      'Diretoria do banco público: sai indicação do bloco Centro, entra quadro técnico.',
    );
  });

  it('manter (escolha padrão) não troca a diretoria', () => {
    const s1 = advanceMonth(
      testState(42, 'estrategica', certain),
      { decisions: [nomear('banco', 'centro')] },
      certain,
      steps,
    ).state;
    const out = advanceMonth(
      s1,
      { decisions: [], eventChoices: [{ eventId: 'escandalo_diretoria', choiceId: 'defender' }] },
      certain,
      steps,
    );
    expect(directorateOccupant(out.state, directorate('banco'))).toBe('centro');
  });

  it('o evento do conteúdo é válido e só existe no cenário padrão', () => {
    expect(parsed.event.onlyScenarios).toEqual([DEFAULT_SCENARIO_ID]);
    expect(parsed.event.trigger.subject).toBe('diretoria');
    const bad = parseGameEvent({
      ...escandaloDiretoria,
      trigger: { ...escandaloDiretoria.trigger, subject: undefined },
    });
    expect(bad.ok).toBe(false);
  });
});

describe('regressão com o sistema desligado (PLANO_CAMPANHA.md Fase C6)', () => {
  it('no cenário padrão, sem trocas de diretoria, o jogo é idêntico com o sistema ligado ou desligado', () => {
    const on = loadContent(DEFAULT_SCENARIO_ID);
    expect(directoratesOf(on).length).toBeGreaterThan(0);
    const off: GameContent = {
      ...on,
      scenario: { ...on.scenario, institutions: { ...on.scenario.institutions!, directorates: undefined } },
    };
    let a = createInitialState({ content: on, difficulty: 'estrategica', seed: 7 });
    let b = createInitialState({ content: off, difficulty: 'estrategica', seed: 7 });
    expect(a).toEqual(b);
    for (let i = 0; i < 24; i++) {
      const ra = advanceMonth(a, { decisions: [] }, on);
      const rb = advanceMonth(b, { decisions: [] }, off);
      expect(ra.report).toEqual(rb.report);
      a = ra.state;
      b = rb.state;
    }
    expect(a).toEqual(b);
  });

  it('o invariante recusa diretoria fora do cenário ou ocupante inválido', () => {
    const s0 = testState(42, 'estrategica', content);
    const out = mes(s0, [nomear('banco', 'centro')]);
    expect(checkInvariants(s0, out.state, out.report, content)).toEqual([]);
    const broken = {
      ...out.state,
      congress: { ...out.state.congress, directorates: [{ id: 'x', occupant: 'y', since: 99 }] },
    };
    const errors = checkInvariants(s0, broken, out.report, content);
    expect(errors).toEqual(
      expect.arrayContaining(['diretoria fora do cenário: x', 'x: ocupante inválido y', 'x: nomeação no mês 99']),
    );
  });
});
