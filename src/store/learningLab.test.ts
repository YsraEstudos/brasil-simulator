import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { createInitialState } from '@/engine';
import { createLearningLab } from './learningLab';

describe('laboratório isolado', () => {
  it('experimentos repetíveis não alteram a campanha original e podem ser reiniciados', () => {
    const content = loadContent(DEFAULT_SCENARIO_ID);
    const original = createInitialState({ content, difficulty: 'estrategica', seed: 37 });
    const before = structuredClone(original);
    const lab = createLearningLab(original, content);
    const first = lab.getState().run({ decisions: [] });
    expect(original).toEqual(before);
    expect(first.state.monthIndex).toBe(original.monthIndex + 1);
    lab.getState().reset();
    expect(lab.getState().state).toEqual(original);
    expect(lab.getState().run({ decisions: [] })).toEqual(first);
    expect(original).toEqual(before);
  });

  it('responde evento na cópia sem remover a pendência da campanha', () => {
    const content = loadContent(DEFAULT_SCENARIO_ID);
    const event = content.events.find((item) => item.id === 'fase07_inst_cpi_instalada')!;
    const original = createInitialState({ content, difficulty: 'estrategica', seed: 37 });
    original.events.pending.push({ eventId: event.id, monthIndex: 0, instanceId: `${event.id}#0` });
    const lab = createLearningLab(original, content);
    const result = lab
      .getState()
      .run({ decisions: [], eventChoices: [{ eventId: event.id, choiceId: event.choices[0].id }] });
    expect(result.report.eventsResolved).toMatchObject([{ eventId: event.id, choiceId: event.choices[0].id }]);
    expect(original.events.pending).toHaveLength(1);
    expect(result.state.events.pending.some((item) => item.eventId === event.id)).toBe(false);
  });
});
