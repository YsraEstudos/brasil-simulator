import { describe, expect, it } from 'vitest';

import { APPOINT_ACTION_ID, NEGOTIATE_ACTION_ID, PRESSURE_ACTION_ID, type Decision } from '@/engine';
import { TEST_BILL, TEST_EVENT, TEST_PEC, testContent } from '@/tests/fixtures';

import {
  draftInput,
  draftPoints,
  EMPTY_DRAFT,
  findDecision,
  fits,
  hasDecision,
  toggleDecision,
  toggleEventChoice,
} from './agendaDraft';

const content = testContent();
const policy = (id: string): Decision => ({ policyId: id, agendaCost: 0 });
const appoint = (occupant: string): Decision => ({
  policyId: APPOINT_ACTION_ID,
  agendaCost: 1,
  params: { ministryId: 'social', occupant },
});
const negotiate = (blocId: string): Decision => ({
  policyId: NEGOTIATE_ACTION_ID,
  agendaCost: 1,
  params: { proposalId: 'p', blocId },
});

describe('rascunho da agenda do mês (GAME_DESIGN.md §4.3)', () => {
  it('marcar de novo desmarca; custos vêm do catálogo', () => {
    let d = toggleDecision(EMPTY_DRAFT, policy(TEST_PEC.id));
    d = toggleDecision(d, { policyId: PRESSURE_ACTION_ID, agendaCost: 99 });
    expect(draftPoints(d, content)).toBe(TEST_PEC.agendaCost + 1);
    d = toggleDecision(d, policy(TEST_PEC.id));
    expect(d.decisions.map((x) => x.policyId)).toEqual([PRESSURE_ACTION_ID]);
  });

  it('mesma pasta com outro ocupante substitui; blocos diferentes na mesma proposta somam', () => {
    let d = toggleDecision(EMPTY_DRAFT, appoint('centro'));
    d = toggleDecision(d, appoint('direita'));
    expect(d.decisions).toHaveLength(1);
    expect(findDecision(d, appoint('x'))?.params?.occupant).toBe('direita');
    expect(hasDecision(d, appoint('centro'))).toBe(false);
    d = toggleDecision(d, negotiate('centro'));
    d = toggleDecision(d, negotiate('direita'));
    expect(d.decisions).toHaveLength(3);
    expect(draftPoints(d, content)).toBe(3);
  });

  it('fits considera o custo liberado ao trocar e os pontos dos eventos', () => {
    let d = toggleDecision(EMPTY_DRAFT, appoint('centro'));
    d = toggleDecision(d, policy(TEST_BILL.id));
    d = toggleEventChoice(d, TEST_EVENT.id, 'subsidiar');
    expect(draftPoints(d, content)).toBe(3);
    expect(fits(d, appoint('direita'), content, 3)).toBe(true);
    expect(fits(d, negotiate('centro'), content, 3)).toBe(false);
  });

  it('a resposta do evento marcada de novo é desmarcada; a entrada do motor leva tudo', () => {
    let d = toggleEventChoice(EMPTY_DRAFT, TEST_EVENT.id, 'subsidiar');
    d = toggleDecision(d, policy(TEST_BILL.id));
    expect(draftInput(d, content)).toEqual({
      decisions: [{ policyId: TEST_BILL.id, agendaCost: TEST_BILL.agendaCost }],
      eventChoices: [{ eventId: TEST_EVENT.id, choiceId: 'subsidiar' }],
    });
    d = toggleEventChoice(d, TEST_EVENT.id, 'subsidiar');
    expect(d.eventChoices).toEqual({});
  });
});
