import { describe, expect, it } from 'vitest';

import escandaloDiretoria from '@/data/events/escandalo_diretoria.json';
import { DEFEND_CASE_ACTION_ID, DIRECTORATE_ACTION_ID } from '@/engine/actions';
import { advanceMonth } from '@/engine/advanceMonth';
import { DEFAULT_CALIBRATION, type Calibration } from '@/engine/economy/calibration';
import { resolveEventsStep, triggerEventsStep } from '@/engine/events/events';
import { impeachmentPressure, scandalFlagCount } from '@/engine/events/pressure';
import { checkInvariants } from '@/engine/invariants';
import type { Decision, GameContent, GameState, ScandalCase } from '@/engine/types';
import { TEST_SCENARIO, testContent, testState } from '@/tests/fixtures';
import { parseGameEvent, type GameEvent } from '@/types/event';
import type { Directorate } from '@/types/scenario';

import { cabinetStep } from './cabinet';
import { CASE_FLAGS, caseDraw, caseHazard, caseRiskBand, openCases } from './cases';
import { directorateOccupant, directoratesOf } from './directorates';

// PLANO_CAMPANHA.md Fase C6b: escândalos graduais (investigação → acusação → condenação), sem condenação automática.

const DIRECTORATES: Directorate[] = [
  { id: 'banco', name: 'Diretoria do banco público', ministryId: 'fazenda', weight: 0.8, occupant: 'tecnico' },
];
const parsed = parseGameEvent(escandaloDiretoria);
if (!parsed.ok) throw new Error(parsed.errors.join('; '));
const SCANDAL: GameEvent = { ...parsed.event, onlyScenarios: undefined };

function contentWith(calibration: Partial<Calibration> = {}, scandalCases = true): GameContent {
  return testContent({
    scenario: {
      ...TEST_SCENARIO,
      institutions: { ...TEST_SCENARIO.institutions!, directorates: DIRECTORATES, scandalCases },
    },
    events: [SCANDAL],
    calibration: { ...DEFAULT_CALIBRATION, ...calibration },
  });
}
const nomear = (occupant: string): Decision => ({
  policyId: DIRECTORATE_ACTION_ID,
  agendaCost: 1,
  params: { directorateId: 'banco', occupant },
});
const defender = (caseId: string): Decision => ({ policyId: DEFEND_CASE_ACTION_ID, agendaCost: 1, params: { caseId } });
const FULL = [resolveEventsStep, cabinetStep, triggerEventsStep];

/** Estado com a diretoria nas mãos do Centro e um caso já aberto no mês 0. */
function withCase(content: GameContent, extra: Partial<ScandalCase> = {}): GameState {
  const s = testState(42, 'estrategica', content);
  const item: ScandalCase = {
    id: 'diretoria:banco#0',
    source: 'diretoria',
    subjectId: 'banco',
    blocId: 'centro',
    stage: 'investigacao',
    openedMonth: 0,
    stageMonth: 0,
    exposure: 1,
    ...extra,
  };
  return {
    ...s,
    congress: { ...s.congress, directorates: [{ id: 'banco', occupant: 'centro', since: 0 }] },
    cases: [item],
  };
}
const caseOf = (s: GameState) => s.cases![0];

describe('abertura do caso (PLANO_CAMPANHA.md Fase C6b)', () => {
  const certain = contentWith({ escandalo_base_mes: 1, escandalo_max_mes: 1 });

  it('o escândalo em diretoria abre um caso em investigação, com a marca e o aviso de que não é condenação', () => {
    const s0 = testState(42, 'estrategica', certain);
    const out = advanceMonth(s0, { decisions: [nomear('centro')] }, certain, FULL);
    expect(out.state.cases).toEqual([
      {
        id: 'diretoria:banco#1',
        source: 'diretoria',
        subjectId: 'banco',
        blocId: 'centro',
        stage: 'investigacao',
        openedMonth: 1,
        stageMonth: 1,
        exposure: DEFAULT_CALIBRATION.caso_exposicao_inicial,
      },
    ]);
    expect(out.state.events.flags[CASE_FLAGS.investigacao]).toBe(1);
    expect(out.report.notes).toContain('O escândalo abriu uma investigação. Investigação não é condenação.');
    expect(scandalFlagCount(out.state)).toBe(scandalFlagCount(s0) + 1);
    expect(impeachmentPressure(out.state, certain)).toBeGreaterThan(impeachmentPressure(s0, certain));
  });

  it('com o sistema desligado no cenário, o escândalo não abre caso', () => {
    const off = contentWith({ escandalo_base_mes: 1, escandalo_max_mes: 1 }, false);
    const out = advanceMonth(testState(42, 'estrategica', off), { decisions: [nomear('centro')] }, off, FULL);
    expect(out.state.events.pending.map((p) => p.eventId)).toEqual(['escandalo_diretoria']);
    expect(out.state.cases).toBeUndefined();
  });
});

describe('etapas graduais (PLANO_CAMPANHA.md Fase C6b)', () => {
  it('nenhuma condenação direto da investigação: com perigo máximo, primeiro a acusação, depois a condenação', () => {
    const ctn = contentWith({ caso_perigo_max: 1, caso_lambda: 50 });
    let s = withCase(ctn);
    const stages: string[] = [];
    for (let i = 0; i < 12; i++) {
      const out = advanceMonth(s, { decisions: [] }, ctn, [cabinetStep]);
      expect(checkInvariants(s, out.state, out.report, ctn)).toEqual([]);
      s = out.state;
      stages.push(caseOf(s).stage);
    }
    const min = ctn.calibration.caso_meses_min;
    // Mínimo de 3 meses na etapa: acusação no mês 3, condenação 3 meses depois.
    expect(stages.indexOf('acusacao')).toBe(min);
    expect(stages.indexOf('condenacao')).toBe(2 * min);
    expect(caseOf(s).accusedMonth).toBe(min);
    expect(s.events.flags[CASE_FLAGS.acusacao]).toBe(min);
    expect(s.events.flags[CASE_FLAGS.condenacao]).toBe(2 * min);
  });

  it('a condenação tira o indicado do cargo, sem custo de capital, e pesa na aprovação', () => {
    const ctn = contentWith({ caso_perigo_max: 1, caso_lambda: 50 });
    let s = withCase(ctn, { stage: 'acusacao', accusedMonth: 0 });
    s = { ...s, monthIndex: 3 };
    const before = s.resources.politicalCapital;
    const out = advanceMonth({ ...s, cases: [{ ...caseOf(s), stageMonth: 0 }] }, { decisions: [] }, ctn, [cabinetStep]);
    expect(caseOf(out.state).stage).toBe('condenacao');
    const banco = directoratesOf(ctn)[0];
    expect(directorateOccupant(out.state, banco)).toBe('tecnico');
    expect(out.state.resources.politicalCapital).toBe(before);
    expect(out.state.impulses.some((i) => i.sourceId.endsWith(':condenacao') && i.delta < 0)).toBe(true);
  });

  it('a acusação pode instalar a CPI existente (evento da Fase 07) no mês seguinte', () => {
    const ctn = contentWith({ caso_perigo_max: 1, caso_lambda: 50, caso_prob_cpi: 1 });
    const s = { ...withCase(ctn), monthIndex: 3 };
    const out = advanceMonth(s, { decisions: [] }, ctn, [cabinetStep]);
    expect(caseOf(out.state).stage).toBe('acusacao');
    expect(out.state.events.scheduled).toEqual([
      {
        eventId: 'fase07_inst_cpi_instalada',
        monthIndex: 4,
        causeEventId: 'escandalo_diretoria',
        causeChoiceId: 'acusacao',
      },
    ]);
  });

  it('afastar o indicado corta o volume: a exposição cai e o caso é arquivado, sem condenação', () => {
    const ctn = contentWith();
    let s = withCase(ctn);
    s = advanceMonth(s, { decisions: [nomear('tecnico')] }, ctn, [cabinetStep]).state;
    for (let i = 0; i < 6 && openCases(s).length > 0; i++) {
      s = advanceMonth(s, { decisions: [] }, ctn, [cabinetStep]).state;
    }
    expect(caseOf(s).stage).toBe('arquivado');
    expect(s.events.flags[CASE_FLAGS.condenacao]).toBeUndefined();
  });

  it('com o indicado no cargo, a exposição converge a 1/(1 − δ) e o risco fica na faixa alta', () => {
    const ctn = contentWith({ caso_perigo_max: 0 });
    let s = withCase(ctn);
    for (let i = 0; i < 30; i++) s = advanceMonth(s, { decisions: [] }, ctn, [cabinetStep]).state;
    const d = ctn.calibration.caso_decaimento;
    expect(caseOf(s).exposure).toBeCloseTo(1 / (1 - d), 4);
    expect(caseOf(s).stage).toBe('investigacao');
    const real = contentWith();
    expect(caseRiskBand(caseOf(s).exposure, real)).toBe('alto');
    expect(caseRiskBand(0.31, real)).toBe('baixo');
  });

  it('o perigo segue a especificação da Fase C3: min(h_max, 1 − e^(−λ·E))', () => {
    const ctn = contentWith();
    const { caso_lambda: l, caso_perigo_max: max } = ctn.calibration;
    expect(caseHazard(1, ctn)).toBeCloseTo(Math.min(max, 1 - Math.exp(-l)), 12);
    expect(caseHazard(100, ctn)).toBe(max);
    expect(caseHazard(0, ctn)).toBe(0);
  });
});

describe('defesa e sorteio (PLANO_CAMPANHA.md Fase C6b)', () => {
  it('defender custa capital e, com defesa total, segura o caso no mês', () => {
    const ctn = contentWith({ caso_perigo_max: 1, caso_lambda: 50, caso_defesa: 1 });
    const s = { ...withCase(ctn), monthIndex: 3 };
    const out = advanceMonth(s, { decisions: [defender('diretoria:banco#0')] }, ctn, [cabinetStep]);
    expect(out.report.rejected).toEqual([]);
    expect(caseOf(out.state).stage).toBe('investigacao');
    expect(caseOf(out.state).defendedMonth).toBe(3);
    expect(out.state.resources.politicalCapital).toBeCloseTo(
      s.resources.politicalCapital + ctn.calibration.capital_defesa_caso,
      10,
    );
    const undefended = advanceMonth(s, { decisions: [] }, ctn, [cabinetStep]);
    expect(caseOf(undefended.state).stage).toBe('acusacao');
  });

  it('rejeita defender caso inexistente ou já encerrado', () => {
    const ctn = contentWith();
    const closed = withCase(ctn, { stage: 'arquivado' });
    const out = advanceMonth(closed, { decisions: [defender('diretoria:banco#0'), defender('nada')] }, ctn, [
      cabinetStep,
    ]);
    expect(out.report.rejected.map((r) => r.reason)).toEqual(['alvo_invalido', 'alvo_invalido']);
  });

  it('o sorteio do caso é por chave: não consome o PRNG principal e repete com a mesma semente', () => {
    const ctn = contentWith();
    const s = { ...withCase(ctn), monthIndex: 3 };
    const a = advanceMonth(s, { decisions: [] }, ctn, [cabinetStep]).state;
    const b = advanceMonth(s, { decisions: [] }, ctn, [cabinetStep]).state;
    expect(a.rng).toEqual(s.rng);
    expect(a).toEqual(b);
    expect(caseDraw(42, ['caso', 'x', 3])).toBe(caseDraw(42, ['caso', 'x', 3]));
    expect(caseDraw(42, ['caso', 'x', 3])).not.toBe(caseDraw(43, ['caso', 'x', 3]));
  });

  it('o invariante recusa condenação sem acusação anterior', () => {
    const ctn = contentWith();
    const s0 = withCase(ctn);
    const out = advanceMonth(s0, { decisions: [] }, ctn, [cabinetStep]);
    const broken = { ...out.state, cases: [{ ...caseOf(out.state), stage: 'condenacao' as const }] };
    expect(checkInvariants(s0, broken, out.report, ctn)).toContain(
      'diretoria:banco#0: condenação sem acusação anterior',
    );
  });
});
