import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { createGuidedTutorial } from './guidedTutorial';

describe('tutorial guiado isolado', () => {
  it('percorre oito decisões reais com resultados e pode ser reaberto', () => {
    const content = loadContent(DEFAULT_SCENARIO_ID);
    const tutorial = createGuidedTutorial(content);
    for (let step = 0; step < 8; step++) {
      const lesson = tutorial.getState().lesson();
      expect(lesson?.options.length).toBeGreaterThanOrEqual(2);
      const result = tutorial.getState().choose(lesson!.options[0].id);
      expect(result.report.rejected, `etapa ${step + 1}`).toEqual([]);
      expect(tutorial.getState().step).toBe(step + 1);
    }
    expect(tutorial.getState().lesson()).toBeNull();
    tutorial.getState().reset();
    expect(tutorial.getState().step).toBe(0);
  });

  it('as duas alternativas de cada etapa são aceitas e produzem consequências distintas', () => {
    const content = loadContent(DEFAULT_SCENARIO_ID);
    for (let target = 0; target < 8; target++) {
      const outcomes = [0, 1].map((optionIndex) => {
        const tutorial = createGuidedTutorial(content);
        for (let step = 0; step < target; step++) {
          const lesson = tutorial.getState().lesson()!;
          const result = tutorial.getState().choose(lesson.options[0].id);
          expect(result.report.rejected).toEqual([]);
        }
        const lesson = tutorial.getState().lesson()!;
        const result = tutorial.getState().choose(lesson.options[optionIndex].id);
        expect(result.report.rejected, `etapa ${target + 1}, alternativa ${optionIndex + 1}`).toEqual([]);
        return result;
      });
      expect(outcomes[0].state, `etapa ${target + 1}`).not.toEqual(outcomes[1].state);
      if (target === 2) expect(outcomes[0].state.career?.election).toBeDefined();
      if (target === 6)
        expect(outcomes[0].report.eventsResolved).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ eventId: 'fase07_inst_cpi_instalada', choiceId: 'colaborar_com_a_cpi' }),
          ]),
        );
    }
  });

  it('a negociação também segue a proposta social alternativa', () => {
    const tutorial = createGuidedTutorial(loadContent(DEFAULT_SCENARIO_ID));
    for (let step = 0; step < 4; step++) tutorial.getState().choose(tutorial.getState().lesson()!.options[0].id);
    tutorial.getState().choose(tutorial.getState().lesson()!.options[1].id);
    const negotiation = tutorial.getState().lesson()!;
    const result = tutorial.getState().choose(negotiation.options[0].id);
    expect(result.report.rejected).toEqual([]);
    expect(result.report.accepted[0].params?.proposalId).toContain('transferencia_renda_ampliacao');
    const followups = tutorial.getState().followupReports;
    expect(followups.length).toBeGreaterThan(0);
    expect(
      followups
        .flatMap((report) => report.proposalChanges)
        .some((change) => change.proposalId.includes('transferencia_renda_ampliacao')),
    ).toBe(true);
  });
});
