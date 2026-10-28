import { describe, expect, it } from 'vitest';

import { DEFEND_CASE_ACTION_ID, FISCALIZE_CASE_ACTION_ID } from '@/engine/actions';
import { advanceMonth } from '@/engine/advanceMonth';
import { DEFAULT_CALIBRATION, PARAMS, type Calibration } from '@/engine/economy/calibration';
import { checkInvariants } from '@/engine/invariants';
import type { Decision, GameContent, GameState, ScandalCase } from '@/engine/types';
import { TEST_SCENARIO, testContent, testState } from '@/tests/fixtures';
import type { Directorate } from '@/types/scenario';

import { cabinetStep } from './cabinet';
import { CASE_FLAGS, SANCTION_STAGES, caseEvidenceBand, isOpenCase, newCase, nextEvidence } from './cases';
import { directorateOccupant, directoratesOf } from './directorates';
import { blocRelation } from './relations';

// POLITICAL_RULES.md §9.1.1; PLANO_EXPANSAO EX-13/14: fato latente, prova e desfecho são coisas diferentes.

const DIRECTORATES: Directorate[] = [
  { id: 'banco', name: 'Diretoria do banco público', ministryId: 'fazenda', weight: 0.8, occupant: 'tecnico' },
];

function contentWith(calibration: Partial<Calibration> = {}): GameContent {
  return testContent({
    scenario: {
      ...TEST_SCENARIO,
      institutions: { ...TEST_SCENARIO.institutions!, directorates: DIRECTORATES, scandalCases: true },
    },
    events: [],
    calibration: { ...DEFAULT_CALIBRATION, ...calibration },
  });
}

/** Caso já aberto no mês 0, com o Centro na diretoria. */
function withCase(content: GameContent, extra: Partial<ScandalCase> = {}, seed = 42, occupant = 'centro'): GameState {
  const s = testState(seed, 'estrategica', content);
  const item: ScandalCase = {
    id: 'diretoria:banco#0',
    source: 'diretoria',
    subjectId: 'banco',
    blocId: occupant,
    stage: 'investigacao',
    openedMonth: 0,
    stageMonth: 0,
    exposure: 1,
    irregular: true,
    evidence: 0.1,
    ...extra,
  };
  return {
    ...s,
    congress: { ...s.congress, directorates: [{ id: 'banco', occupant, since: 0 }] },
    cases: [item],
  };
}
const caseOf = (s: GameState) => s.cases![0];
const action = (policyId: string): Decision => ({
  policyId,
  agendaCost: 1,
  params: { caseId: 'diretoria:banco#0' },
});

/** Joga até o caso fechar (ou `months` meses), conferindo os invariantes a cada mês. */
function play(s0: GameState, content: GameContent, months: number, decisions: (s: GameState) => Decision[] = () => []) {
  let s = s0;
  for (let i = 0; i < months && isOpenCase(caseOf(s)); i++) {
    const out = advanceMonth(s, { decisions: decisions(s) }, content, [cabinetStep]);
    expect(checkInvariants(s, out.state, out.report, content)).toEqual([]);
    s = out.state;
  }
  return s;
}

describe('fato latente (EX-13)', () => {
  const ctn = contentWith();

  it('a irregularidade é sorteada por chave e não depende do bloco nem do PRNG principal', () => {
    let irregular = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const centro = withCase(ctn, {}, seed, 'centro');
      const outro = withCase(ctn, {}, seed, 'esquerda');
      const a = newCase(centro, ctn, 'banco', 5)!;
      const b = newCase(outro, ctn, 'banco', 5)!;
      expect(a.irregular).toBe(b.irregular);
      expect(centro.rng).toEqual(testState(seed, 'estrategica', ctn).rng);
      if (a.irregular) irregular += 1;
    }
    // Frequência perto da chance calibrada (400 sorteios, tolerância folgada de ~4 desvios-padrão).
    expect(Math.abs(irregular / 400 - ctn.calibration.caso_prob_irregular)).toBeLessThan(0.1);
  });

  it('a prova anda em direção ao que os fatos sustentam e nunca sai de 0–1', () => {
    const c = ctn.calibration;
    let guilty = { irregular: true, evidence: c.caso_prova_inicial };
    let innocent = { irregular: false, evidence: c.caso_prova_inicial };
    for (let i = 0; i < 200; i++) {
      guilty = { ...guilty, evidence: nextEvidence(guilty, i % 3 === 0, ctn) };
      innocent = { ...innocent, evidence: nextEvidence(innocent, false, ctn) };
      expect(innocent.evidence).toBeLessThanOrEqual(c.caso_prova_teto_indicios + 1e-12);
    }
    expect(guilty.evidence).toBeGreaterThan(0.99);
    expect(guilty.evidence).toBeLessThanOrEqual(1);
    expect(innocent.evidence).toBeCloseTo(c.caso_prova_teto_indicios, 6);
  });

  it('as faixas calibradas garantem que o teto dos indícios fica abaixo do limiar de sanção', () => {
    // Vale para qualquer ponto das faixas, não só para os valores padrão.
    expect(PARAMS.caso_prova_teto_indicios.max).toBeLessThan(PARAMS.caso_prova_sancao.min);
    expect(PARAMS.caso_prova_inicial.max).toBeLessThanOrEqual(PARAMS.caso_prova_teto_indicios.min);
    expect(PARAMS.caso_prova_sancao.max).toBeLessThanOrEqual(PARAMS.caso_prova_condenacao.min);
  });
});

describe('rumor sozinho nunca condena (EX-14)', () => {
  it('em 150 sementes, inocentes podem ser acusados, mas terminam absolvidos ou arquivados', () => {
    const ctn = contentWith({ caso_perigo_max: 0.4 });
    let accused = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const s = play(withCase(ctn, { irregular: false }, seed), ctn, 120);
      const item = caseOf(s);
      expect(SANCTION_STAGES.has(item.stage)).toBe(false);
      expect(s.events.flags[CASE_FLAGS.condenacao]).toBeUndefined();
      if (item.accusedMonth !== undefined) accused += 1;
    }
    expect(accused).toBeGreaterThan(0);
  });

  it('irregularidade real com prova insuficiente termina em absolvição', () => {
    const ctn = contentWith({ caso_perigo_max: 1, caso_lambda: 50 });
    const s = { ...withCase(ctn, { stage: 'acusacao', accusedMonth: 0, evidence: 0.3 }), monthIndex: 3 };
    const out = advanceMonth(s, { decisions: [] }, ctn, [cabinetStep]);
    expect(caseOf(out.state).stage).toBe('absolvido');
    expect(caseOf(out.state).irregular).toBe(true);
    expect(directorateOccupant(out.state, directoratesOf(ctn)[0])).toBe('centro');
  });

  it('a sanção administrativa afasta o indicado sem marca de condenação; a judicial grava a marca', () => {
    const ctn = contentWith({ caso_perigo_max: 1, caso_lambda: 50 });
    const at = (evidence: number) => ({
      ...withCase(ctn, { stage: 'acusacao', accusedMonth: 0, evidence }),
      monthIndex: 3,
    });
    const admin = advanceMonth(at(0.6), { decisions: [] }, ctn, [cabinetStep]).state;
    expect(caseOf(admin).stage).toBe('sancao');
    expect(directorateOccupant(admin, directoratesOf(ctn)[0])).toBe('tecnico');
    expect(admin.events.flags[CASE_FLAGS.condenacao]).toBeUndefined();

    const judicial = advanceMonth(at(0.9), { decisions: [] }, ctn, [cabinetStep]).state;
    expect(caseOf(judicial).stage).toBe('condenacao');
    expect(judicial.events.flags[CASE_FLAGS.condenacao]).toBe(3);
  });

  it('a defesa contesta a prova da decisão, mas não muda o fato nem a prova acumulada', () => {
    const ctn = contentWith({ caso_perigo_max: 1, caso_lambda: 50 });
    const s = { ...withCase(ctn, { stage: 'acusacao', accusedMonth: 0, evidence: 0.85 }), monthIndex: 3 };
    const plain = advanceMonth(s, { decisions: [] }, ctn, [cabinetStep]).state;
    const defended = advanceMonth(s, { decisions: [action(DEFEND_CASE_ACTION_ID)] }, ctn, [cabinetStep]).state;
    expect(caseOf(plain).stage).toBe('condenacao');
    expect(caseOf(defended).stage).toBe('sancao');
    expect(caseOf(defended).irregular).toBe(caseOf(plain).irregular);
    expect(caseOf(defended).evidence).toBe(caseOf(plain).evidence);
  });

  it('o invariante recusa sanção sem irregularidade real', () => {
    const ctn = contentWith();
    const s0 = withCase(ctn, { irregular: false });
    const out = advanceMonth(s0, { decisions: [] }, ctn, [cabinetStep]);
    const broken = {
      ...out.state,
      cases: [{ ...caseOf(out.state), stage: 'sancao' as const, accusedMonth: 0, stageMonth: 1 }],
    };
    expect(checkInvariants(s0, broken, out.report, ctn)).toContain('diretoria:banco#0: sanção sem irregularidade real');
  });
});

describe('fiscalização (EX-13: descobre, não cria irregularidade)', () => {
  const ctn = contentWith({ caso_perigo_max: 0 });

  it('a auditoria aproxima a prova da verdade para os dois lados e custa relação com o bloco', () => {
    const audit = () => [action(FISCALIZE_CASE_ACTION_ID)];
    // Mês 1: no mês da abertura a prova ainda não anda.
    const guilty = { ...withCase(ctn, { irregular: true, evidence: 0.3 }), monthIndex: 1 };
    const innocent = { ...withCase(ctn, { irregular: false, evidence: 0.3 }), monthIndex: 1 };
    const g0 = advanceMonth(guilty, { decisions: [] }, ctn, [cabinetStep]).state;
    const g1 = advanceMonth(guilty, { decisions: audit() }, ctn, [cabinetStep]);
    const i0 = advanceMonth(innocent, { decisions: [] }, ctn, [cabinetStep]).state;
    const i1 = advanceMonth(innocent, { decisions: audit() }, ctn, [cabinetStep]).state;
    expect(g1.report.rejected).toEqual([]);
    expect(caseOf(g1.state).evidence).toBeGreaterThan(caseOf(g0).evidence);
    expect(caseOf(i1).evidence).toBeLessThan(caseOf(i0).evidence);
    expect(caseOf(g1.state).auditedMonth).toBe(1);
    const centro = ctn.scenario.blocs.find((b) => b.id === 'centro')!;
    expect(blocRelation(g1.state, centro)).toBeCloseTo(
      blocRelation(guilty, centro) + ctn.calibration.relacao_auditoria_caso,
      10,
    );
  });

  it('auditar todo mês não muda a quantidade de irregularidades reais, só os desfechos', () => {
    const live = contentWith({ caso_perigo_max: 0.4 });
    let realWith = 0;
    let realWithout = 0;
    let sanctionedWith = 0;
    let wrongWith = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const opened = newCase(withCase(live, {}, seed), live, 'banco', 0)!;
      const s0 = { ...withCase(live, {}, seed), cases: [opened] };
      const audited = play(s0, live, 120, () => [action(FISCALIZE_CASE_ACTION_ID)]);
      const plain = play(s0, live, 120);
      realWith += Number(caseOf(audited).irregular);
      realWithout += Number(caseOf(plain).irregular);
      if (SANCTION_STAGES.has(caseOf(audited).stage)) sanctionedWith += 1;
      if (!caseOf(audited).irregular && caseOf(audited).accusedMonth !== undefined) wrongWith += 1;
    }
    expect(realWith).toBe(realWithout);
    expect(sanctionedWith).toBeGreaterThan(0);
    // Com auditoria todo mês, a prova de um inocente nunca chega ao limiar de acusação.
    expect(wrongWith).toBe(0);
  });

  it('rejeita auditoria em caso encerrado; a faixa de prova não revela o fato latente', () => {
    const closed = withCase(ctn, { stage: 'arquivado' });
    const out = advanceMonth(closed, { decisions: [action(FISCALIZE_CASE_ACTION_ID)] }, ctn, [cabinetStep]);
    expect(out.report.rejected.map((r) => r.reason)).toEqual(['alvo_invalido']);
    // Mesma prova, fatos diferentes: a interface mostra a mesma faixa.
    expect(caseEvidenceBand(0.35, ctn)).toBe('moderados');
    expect(caseEvidenceBand(0.1, ctn)).toBe('fracos');
    expect(caseEvidenceBand(0.9, ctn)).toBe('fortes');
  });
});
