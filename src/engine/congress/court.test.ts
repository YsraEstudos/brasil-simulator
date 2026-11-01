import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { NOMINATE_JUSTICE_ACTION_ID } from '@/engine/actions';
import { advanceMonth } from '@/engine/advanceMonth';
import type { Calibration } from '@/engine/economy/calibration';
import { checkInvariants } from '@/engine/invariants';
import { proposalsStep } from '@/engine/proposals/proposals';
import { createInitialState } from '@/engine/state';
import type { CourtNomineeProfile, Decision, GameContent, GameState } from '@/engine/types';

import { SENATE_ABSOLUTE_MAJORITY } from './congress';
import { appointedJustices, courtCalendar, expectedNominationYes, nomineeSupport } from './court';

// PLANO_CAMPANHA.md Fase C6d: STF com vaga, indicação e aprovação no Senado separadas.

const base = loadContent(DEFAULT_SCENARIO_ID);
const [FIRST] = courtCalendar(base);
const off: GameContent = {
  ...base,
  scenario: { ...base.scenario, institutions: { ...base.scenario.institutions!, supremeCourt: undefined } },
};
const withCalibration = (calibration: Partial<Calibration>): GameContent => ({
  ...base,
  calibration: { ...base.calibration, ...calibration },
});

function at(monthIndex: number, content: GameContent = base, relation?: number): GameState {
  const s = createInitialState({ content, difficulty: 'estrategica', seed: 3 });
  const blocs =
    relation === undefined
      ? s.congress.blocs
      : content.scenario.blocs.map((b) => ({ id: b.id, governmentRelation: relation }));
  return { ...s, monthIndex, congress: { ...s.congress, blocs } };
}
const indicar = (profile: CourtNomineeProfile, vacancyId = FIRST.id): Decision => ({
  policyId: NOMINATE_JUSTICE_ACTION_ID,
  agendaCost: 1,
  params: { vacancyId, profile },
});
const month = (s: GameState, decisions: Decision[], content: GameContent = base) =>
  advanceMonth(s, { decisions }, content, [proposalsStep]);
const vacancy = (s: GameState) => s.court!.vacancies.find((v) => v.id === FIRST.id)!;
const opened = (content: GameContent = base, relation?: number) =>
  month(at(FIRST.monthIndex, content, relation), [], content).state;

describe('vaga (PLANO_CAMPANHA.md Fase C6d)', () => {
  it('a vaga abre no mês do calendário do cenário, sem guardar idade no estado', () => {
    const before = month(at(FIRST.monthIndex - 1), []).state;
    expect(before.court).toBeUndefined();
    const out = month(before, []);
    expect(out.state.court?.vacancies).toEqual([
      { id: FIRST.id, openedMonth: FIRST.monthIndex, status: 'aberta', rejections: 0 },
    ]);
    expect(out.report.notes.some((n) => n.startsWith('Abriu uma vaga no STF'))).toBe(true);
  });

  it('com o sistema desligado não há vaga e a ação é rejeitada', () => {
    const out = month(at(FIRST.monthIndex, off), [indicar('jurista')], off);
    expect(out.state.court).toBeUndefined();
    expect(out.report.rejected.map((r) => r.reason)).toEqual(['alvo_invalido']);
  });
});

describe('indicação e aprovação no Senado (PLANO_CAMPANHA.md Fase C6d)', () => {
  it('a indicação vai à sabatina no mês seguinte; antes da vaga não há o que indicar', () => {
    const early = month(at(1), [indicar('jurista')]);
    expect(early.report.rejected.map((r) => r.reason)).toEqual(['alvo_invalido']);
    const s0 = opened();
    const s1 = month(s0, [indicar('jurista')]).state;
    expect(vacancy(s1)).toMatchObject({ status: 'em_sabatina', nominee: 'jurista', hearingMonth: s0.monthIndex + 1 });
    const again = month(s1, [indicar('aliado')]);
    expect(again.report.rejected.map((r) => r.reason)).toEqual(['alvo_invalido']);
  });

  it('com o Senado favorável, a indicação é aprovada por maioria absoluta e rende capital', () => {
    const s1 = month(opened(base, 60), [indicar('jurista')]).state;
    const out = month(s1, []);
    const v = vacancy(out.state);
    expect(v.status).toBe('preenchida');
    expect(v.lastVote).toMatchObject({ approved: true, required: SENATE_ABSOLUTE_MAJORITY });
    expect(v.lastVote!.yes).toBeGreaterThanOrEqual(SENATE_ABSOLUTE_MAJORITY);
    expect(appointedJustices(out.state)).toBe(1);
    expect(out.state.resources.politicalCapital).toBeGreaterThan(s1.resources.politicalCapital);
    expect(checkInvariants(s1, out.state, out.report, base)).toEqual([]);
  });

  it('com o Senado hostil, a indicação é rejeitada: custa capital e a vaga volta a ficar aberta', () => {
    const s1 = month(opened(base, -90), [indicar('aliado')]).state;
    const out = month(s1, []);
    const v = vacancy(out.state);
    expect(v).toMatchObject({ status: 'aberta', rejections: 1 });
    expect(v.nominee).toBeUndefined();
    expect(v.lastVote?.approved).toBe(false);
    expect(out.state.resources.politicalCapital).toBeLessThan(s1.resources.politicalCapital);
    expect(month(out.state, [indicar('jurista')]).report.rejected).toEqual([]);
  });

  it('o jurista de carreira tem mais apoio que o aliado no bloco mais distante do governo', () => {
    const s = opened();
    const p = s.government.profile;
    const distance = (b: (typeof base.scenario.blocs)[number]) =>
      Math.abs(b.ideology.economic - p.economic) + Math.abs(b.ideology.social - p.social);
    const far = [...base.scenario.blocs].sort((a, b) => distance(b) - distance(a))[0];
    expect(nomineeSupport(s, far, 'jurista', base)).toBeGreaterThan(nomineeSupport(s, far, 'aliado', base));
  });

  it('a previsão sobe com a relação e com o apoio próprio do jurista', () => {
    expect(expectedNominationYes(at(5, base, 50), 'jurista', base)).toBeGreaterThan(
      expectedNominationYes(at(5, base, -50), 'jurista', base),
    );
    const stronger = withCalibration({ stf_apoio_jurista: 0.6 });
    expect(expectedNominationYes(at(5, stronger), 'jurista', stronger)).toBeGreaterThan(
      expectedNominationYes(at(5, base), 'jurista', base),
    );
  });

  it('o invariante recusa vaga preenchida sem aprovação do Senado', () => {
    const s0 = opened();
    const out = month(s0, []);
    const broken: GameState = {
      ...out.state,
      court: { vacancies: [{ ...vacancy(out.state), status: 'preenchida', nominee: 'aliado' }] },
    };
    expect(checkInvariants(s0, broken, out.report, base)).toContain(
      `${FIRST.id}: vaga preenchida sem aprovação do Senado`,
    );
  });
});

describe('regressão com o sistema desligado (PLANO_CAMPANHA.md Fase C6)', () => {
  it('sem indicações, o jogo é idêntico ligado ou desligado, exceto o registro das vagas', () => {
    let a = createInitialState({ content: base, difficulty: 'estrategica', seed: 7 });
    let b = createInitialState({ content: off, difficulty: 'estrategica', seed: 7 });
    for (let i = 0; i < FIRST.monthIndex + 6; i++) {
      const ra = advanceMonth(a, { decisions: [] }, base);
      const rb = advanceMonth(b, { decisions: [] }, off);
      const { court, ...restA } = ra.state;
      expect(restA).toEqual(rb.state);
      expect({ ...ra.report, notes: ra.report.notes.filter((n) => !n.includes('STF')) }).toEqual(rb.report);
      expect(court === undefined).toBe(a.monthIndex < FIRST.monthIndex);
      a = ra.state;
      b = rb.state;
    }
  });
});
