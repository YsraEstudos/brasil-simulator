import { describe, expect, it } from 'vitest';

import { advanceEducation, educationLevers, initialEducation, type ScheduledImpulse } from '@/engine';

import { educationView } from './educationView';

// PLANO_EXPANSAO EX-19: o cartão mostra etapas, escolaridade, alavancas com fonte e o capital humano contra o início.

describe('cartão Educação', () => {
  it('no início mostra as três etapas, as quatro escolaridades e nenhuma alavanca ativa', () => {
    const view = educationView(initialEducation());
    expect(view.stages.map((s) => s.label)).toEqual(['Ensino fundamental', 'Ensino médio', 'Ensino superior']);
    expect(view.workforce).toHaveLength(4);
    expect(view.levers.every((l) => !l.active)).toBe(true);
    expect(view.humanCapitalChange).toContain('Igual ao início');
    expect(view.stages[0].flows).toMatch(/^Concluem .* mil\/ano · abandonam .* mil\/ano$/);
  });

  it('com política, a alavanca cita a política que a alimenta e o capital humano mostra a variação', () => {
    const impulse: ScheduledImpulse = {
      sourceId: 'diretriz:x',
      label: 'Rotina de formação docente',
      target: 'educacao.docentes',
      delta: 0.8,
      startMonth: 0,
      endMonth: null,
    };
    let education = initialEducation();
    for (let t = 0; t < 240; t++) education = advanceEducation(education, educationLevers([impulse], t));
    const view = educationView(education);
    const docentes = view.levers.find((l) => l.id === 'docentes')!;
    expect(docentes.active).toBe(true);
    expect(docentes.text).toContain('Rotina de formação docente');
    expect(view.humanCapitalChange).toMatch(/^\+/);
  });
});
