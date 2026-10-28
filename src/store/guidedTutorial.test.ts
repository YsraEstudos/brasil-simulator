import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';

import {
  clearGuidedTutorialCache,
  createGuidedTutorial,
  guidedTutorialFor,
  lessonAt,
  TUTORIAL_STEPS,
  tutorialContentIssues,
} from './guidedTutorial';

const content = loadContent(DEFAULT_SCENARIO_ID);

/** Escolhe a primeira alternativa de cada etapa; aplica a passagem de tempo quando ela é pedida. */
function play(tutorial: ReturnType<typeof createGuidedTutorial>, steps: number): void {
  for (let step = 0; step < steps; step++) {
    if (tutorial.getState().pendingAdvance) tutorial.getState().advance();
    const lesson = tutorial.getState().lesson();
    expect(lesson?.options.length, `etapa ${step + 1}`).toBeGreaterThanOrEqual(2);
    const result = tutorial.getState().choose(lesson!.options[0]!.id);
    expect(result.report.rejected, `etapa ${step + 1}`).toEqual([]);
  }
}

describe('tutorial guiado isolado', () => {
  it('percorre oito decisões reais com resultados e pode ser reaberto', () => {
    const tutorial = createGuidedTutorial(content);
    play(tutorial, TUTORIAL_STEPS);
    expect(tutorial.getState().step).toBe(TUTORIAL_STEPS);
    expect(tutorial.getState().lesson()).toBeNull();
    tutorial.getState().reset();
    expect(tutorial.getState().step).toBe(0);
    expect(tutorial.getState().history).toEqual([]);
  });

  it('as duas alternativas de cada etapa são aceitas e produzem consequências distintas', () => {
    for (let target = 0; target < TUTORIAL_STEPS; target++) {
      const outcomes = [0, 1].map((optionIndex) => {
        const tutorial = createGuidedTutorial(content);
        play(tutorial, target);
        if (tutorial.getState().pendingAdvance) tutorial.getState().advance();
        const lesson = tutorial.getState().lesson()!;
        const result = tutorial.getState().choose(lesson.options[optionIndex]!.id);
        expect(result.report.rejected, `etapa ${target + 1}, alternativa ${optionIndex + 1}`).toEqual([]);
        return result;
      });
      expect(outcomes[0]!.state, `etapa ${target + 1}`).not.toEqual(outcomes[1]!.state);
      if (target === 2) expect(outcomes[0]!.state.career?.election).toBeDefined();
      if (target === 6)
        expect(outcomes[0]!.report.eventsResolved).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ eventId: 'fase07_inst_cpi_instalada', choiceId: 'colaborar_com_a_cpi' }),
          ]),
        );
    }
  });

  it('a negociação também segue a proposta social alternativa', () => {
    const tutorial = createGuidedTutorial(content);
    play(tutorial, 4);
    tutorial.getState().choose(tutorial.getState().lesson()!.options[1]!.id);
    const negotiation = tutorial.getState().lesson()!;
    const result = tutorial.getState().choose(negotiation.options[0]!.id);
    expect(result.report.rejected).toEqual([]);
    expect(result.report.accepted[0]!.params?.proposalId).toContain('transferencia_renda_ampliacao');
    expect(tutorial.getState().pendingAdvance?.months).toBeGreaterThan(0);
    tutorial.getState().advance();
    const followups = tutorial.getState().followupReports;
    expect(followups.length).toBeGreaterThan(0);
    expect(
      followups
        .flatMap((report) => report.proposalChanges)
        .some((change) => change.proposalId.includes('transferencia_renda_ampliacao')),
    ).toBe(true);
  });

  it('a passagem do tempo é explícita e pode ser desfeita', () => {
    const tutorial = createGuidedTutorial(content);
    play(tutorial, 5);
    const before = tutorial.getState().step;
    tutorial.getState().choose(tutorial.getState().lesson()!.options[0]!.id);

    const pending = tutorial.getState().pendingAdvance;
    expect(pending).not.toBeNull();
    expect(pending!.months).toBeGreaterThan(0);
    expect(tutorial.getState().followupReports).toEqual([]);
    expect(() => tutorial.getState().choose('cooperar')).toThrow(/Avance/);

    tutorial.getState().advance();
    expect(tutorial.getState().pendingAdvance).toBeNull();
    expect(tutorial.getState().step).toBe(before + 1);
    expect(tutorial.getState().state.monthIndex).toBe(pending!.state.monthIndex);
    expect(tutorial.getState().followupReports).toHaveLength(pending!.months);

    expect(tutorial.getState().back()).toBe(true);
    expect(tutorial.getState().pendingAdvance).not.toBeNull();
    expect(tutorial.getState().followupReports).toEqual([]);
  });

  it('voltar no começo não muda nada', () => {
    const tutorial = createGuidedTutorial(content);
    expect(tutorial.getState().back()).toBe(false);
    expect(tutorial.getState().step).toBe(0);
  });

  it('lição fora da faixa não quebra a tela', () => {
    const tutorial = createGuidedTutorial(content);
    const state = tutorial.getState().state;
    expect(lessonAt(-1, state, content, null)).toBeNull();
    expect(lessonAt(TUTORIAL_STEPS, state, content, null)).toBeNull();
  });

  it('o cenário padrão tem todos os itens que as lições usam', () => {
    expect(tutorialContentIssues(content)).toEqual([]);
  });

  it('guarda um tutorial por cenário e permite limpar', () => {
    clearGuidedTutorialCache();
    const first = guidedTutorialFor(content);
    expect(guidedTutorialFor(content)).toBe(first);
    first.getState().choose(first.getState().lesson()!.options[0]!.id);
    expect(guidedTutorialFor(content).getState().step).toBe(1);
    clearGuidedTutorialCache();
    expect(guidedTutorialFor(content)).not.toBe(first);
    expect(guidedTutorialFor(content).getState().step).toBe(0);
  });
});
