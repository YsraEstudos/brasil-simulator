import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { DRAWER_ACTION_ID } from '@/engine/actions';
import { advanceMonth } from '@/engine/advanceMonth';
import type { Calibration } from '@/engine/economy/calibration';
import { resolveEventsStep, triggerEventsStep } from '@/engine/events/events';
import { checkInvariants } from '@/engine/invariants';
import { createInitialState } from '@/engine/state';
import type { Decision, GameContent, GameState, ImpeachmentRequest } from '@/engine/types';

import { cabinetStep } from './cabinet';
import { CASE_FLAGS } from './cases';
import { housePresident } from './congress';
import {
  camaraPresidentRelation,
  chainStillOpen,
  drawerStance,
  IMPEACHMENT_REQUEST_EVENT_ID,
  pendingRequests,
} from './drawer';

// PLANO_CAMPANHA.md Fase C6e: gaveta do impeachment (acúmulo, descarte e abertura de pedidos).

const base = loadContent(DEFAULT_SCENARIO_ID);
const PRESIDENT = housePresident(base, 'camara')!;
const off: GameContent = {
  ...base,
  scenario: { ...base.scenario, institutions: { ...base.scenario.institutions!, impeachmentDrawer: false } },
};
const withCalibration = (calibration: Partial<Calibration>): GameContent => ({
  ...base,
  calibration: { ...base.calibration, ...calibration },
});
/** Sem pedidos pela pressão: só as marcas e o que o teste puser na gaveta. */
const quiet = withCalibration({ gaveta_pedido_pressao: 0 });

const request = (filedMonth: number, i = 0): ImpeachmentRequest => ({
  id: `pedido#${filedMonth}#${i}`,
  filedMonth,
  cause: 'pressao',
  status: 'na_gaveta',
});

/** Estado no mês `t`, com a relação da presidência da Câmara e, se quiser, aprovação baixa (pressão alta). */
function at(t: number, presidentRelation: number, opts: { approval?: number; drawer?: ImpeachmentRequest[] } = {}) {
  const s = createInitialState({ content: base, difficulty: 'estrategica', seed: 9 });
  const blocs = base.scenario.blocs.map((b) => ({
    id: b.id,
    governmentRelation: b.id === PRESIDENT.id ? presidentRelation : -60,
  }));
  return {
    ...s,
    monthIndex: t,
    indicators: { ...s.indicators, approval: opts.approval ?? s.indicators.approval },
    congress: { ...s.congress, blocs },
    ...(opts.drawer ? { impeachmentDrawer: opts.drawer } : {}),
  } as GameState;
}
const month = (s: GameState, decisions: Decision[], content: GameContent = quiet) =>
  advanceMonth(s, { decisions }, content, [cabinetStep]);

describe('acúmulo (PLANO_CAMPANHA.md Fase C6e)', () => {
  it('cada marca de escândalo gravada no mês protocola um pedido', () => {
    const s = at(10, 10);
    const marked = {
      ...s,
      events: { ...s.events, flags: { [CASE_FLAGS.acusacao]: 10, [CASE_FLAGS.investigacao]: 4 } },
    };
    const out = month(marked, []);
    expect(out.state.impeachmentDrawer).toEqual([
      { id: 'pedido#10#0', filedMonth: 10, cause: 'escandalo_acusacao', status: 'na_gaveta' },
    ]);
    expect(out.report.notes).toContain(
      'Novo pedido de impeachment protocolado na Câmara (acusação formal em escândalo).',
    );
  });

  it('a pressão protocola pedidos por sorteio com chave, sem consumir o PRNG principal', () => {
    const always = withCalibration({ gaveta_pedido_pressao: 1e6 });
    const s = at(10, 10);
    const out = month(s, [], always);
    expect(pendingRequests(out.state).map((r) => r.cause)).toEqual(['pressao']);
    expect(out.state.rng).toEqual(s.rng);
    expect(month(s, [], always).state).toEqual(out.state);
  });

  it('com o sistema desligado não há gaveta', () => {
    const s = at(10, -60, { approval: 0.1 });
    const marked = { ...s, events: { ...s.events, flags: { [CASE_FLAGS.acusacao]: 10 } } };
    expect(month(marked, [], off).state.impeachmentDrawer).toBeUndefined();
  });
});

describe('descarte (PLANO_CAMPANHA.md Fase C6e)', () => {
  it('a presidência aliada arquiva os pedidos com mais de `gaveta_meses_arquivo` meses', () => {
    const months = quiet.calibration.gaveta_meses_arquivo;
    const s = at(20, 10, { drawer: [request(20 - months), request(19)] });
    const out = month(s, []);
    expect(out.state.impeachmentDrawer!.map((r) => r.status)).toEqual(['arquivado', 'na_gaveta']);
    expect(drawerStance(s, quiet)).toBe('arquiva');
  });

  it('com relação neutra a presidência só segura os pedidos', () => {
    const s = at(20, -10, { drawer: [request(1)] });
    expect(drawerStance(s, quiet)).toBe('segura');
    expect(month(s, []).state.impeachmentDrawer).toEqual([request(1)]);
  });

  it('negociar arquiva o mais antigo, custa capital e melhora a relação com a presidência', () => {
    const s = at(20, -40, { drawer: [request(3), request(5)] });
    const out = month(s, [{ policyId: DRAWER_ACTION_ID, agendaCost: 1 }]);
    expect(out.report.rejected).toEqual([]);
    expect(out.state.impeachmentDrawer!.map((r) => r.status)).toEqual(['arquivado', 'na_gaveta']);
    expect(out.state.resources.politicalCapital).toBeCloseTo(
      s.resources.politicalCapital + quiet.calibration.capital_negociar_gaveta,
      10,
    );
    expect(camaraPresidentRelation(out.state, quiet)).toBeCloseTo(-40 + quiet.calibration.relacao_negociar_gaveta, 10);
  });

  it('sem pedido na gaveta, negociar é rejeitado', () => {
    const out = month(at(20, 0), [{ policyId: DRAWER_ACTION_ID, agendaCost: 1 }]);
    expect(out.report.rejected.map((r) => r.reason)).toEqual(['alvo_invalido']);
  });
});

describe('abertura e a cadeia existente (PLANO_CAMPANHA.md Fase C6e)', () => {
  const opening = withCalibration({ gaveta_pedido_pressao: 0, gaveta_chance_abertura: 1 });

  it('presidência hostil com pressão alta abre o pedido mais antigo e agenda só o 1º evento da cadeia', () => {
    const s = at(20, -60, { approval: 0.05, drawer: [request(3), request(5)] });
    const out = month(s, [], opening);
    expect(drawerStance(s, opening)).toBe('ameaca');
    expect(out.state.impeachmentDrawer!.map((r) => r.status)).toEqual(['aberto', 'na_gaveta']);
    expect(out.state.events.scheduled).toEqual([
      {
        eventId: IMPEACHMENT_REQUEST_EVENT_ID,
        monthIndex: 21,
        causeEventId: 'gaveta_impeachment',
        causeChoiceId: 'abertura',
      },
    ]);
    // Nenhuma marca da cadeia é gravada pela gaveta: a condenação só vem pelos eventos de §10.
    expect(Object.keys(out.state.events.flags).filter((f) => f.startsWith('impeachment_'))).toEqual([]);
    expect(checkInvariants(s, out.state, out.report, opening)).toEqual([]);
  });

  it('o evento agendado chega à caixa de entrada pelo caminho dos encadeados', () => {
    const s = at(20, -60, { approval: 0.05, drawer: [request(3)] });
    const out = advanceMonth(s, { decisions: [] }, opening, [resolveEventsStep, cabinetStep, triggerEventsStep]);
    expect(out.state.events.pending.map((p) => p.eventId)).toContain(IMPEACHMENT_REQUEST_EVENT_ID);
  });

  it('com pressão baixa não abre, e depois do pedido da cadeia a gaveta não abre outro', () => {
    const low = at(20, -60, { approval: 0.9, drawer: [request(3)] });
    expect(month(low, [], opening).state.events.scheduled).toEqual([]);
    const done = at(20, -60, { approval: 0.05, drawer: [request(3)] });
    const after = { ...done, events: { ...done.events, flags: { impeachment_arquivado: 12 } } };
    expect(chainStillOpen(after)).toBe(false);
    expect(month(after, [], opening).state.events.scheduled).toEqual([]);
  });
});

describe('regressão com o sistema desligado (PLANO_CAMPANHA.md Fase C6)', () => {
  it('sem decisões, o jogo é idêntico ligado ou desligado, fora a própria gaveta e as notas dela', () => {
    let a = createInitialState({ content: base, difficulty: 'estrategica', seed: 7 });
    let b = createInitialState({ content: off, difficulty: 'estrategica', seed: 7 });
    for (let i = 0; i < 36; i++) {
      const ra = advanceMonth(a, { decisions: [] }, base);
      const rb = advanceMonth(b, { decisions: [] }, off);
      const opened = (ra.state.impeachmentDrawer ?? []).some((r) => r.status === 'aberto');
      if (opened) break;
      const { impeachmentDrawer, ...restA } = ra.state;
      expect(restA).toEqual(rb.state);
      const notes = ra.report.notes.filter((n) => !n.includes('impeachment'));
      expect({ ...ra.report, notes }).toEqual(rb.report);
      expect(impeachmentDrawer === undefined || Array.isArray(impeachmentDrawer)).toBe(true);
      a = ra.state;
      b = rb.state;
    }
  });
});
