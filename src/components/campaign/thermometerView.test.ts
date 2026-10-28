import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { advanceMonth, createInitialState, PRONOUNCEMENT_ACTION_ID } from '@/engine';

import { pronouncementContext, thermometerRows } from './thermometerView';

// PLANO_CAMPANHA.md Fase C6g: o que o cartão dos termômetros e o da ação mostram.

const content = loadContent(DEFAULT_SCENARIO_ID);
const start = () => createInitialState({ content, difficulty: 'estrategica', seed: 2 });

describe('termômetros na tela (Fase C6g)', () => {
  it('quatro linhas inteiras de 0 a 100, com faixa e até dois fatores com sinal', () => {
    const rows = thermometerRows(start(), content);
    expect(rows.map((r) => r.label)).toEqual(['Congresso', 'Ruas', 'Mercado', 'Instituições']);
    for (const r of rows) {
      expect(Number.isInteger(r.value)).toBe(true);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThanOrEqual(100);
      expect(r.drivers.length).toBeLessThanOrEqual(2);
      for (const d of r.drivers) expect(d).toMatch(/ [+−]\d/);
    }
  });

  it('o cartão do pronunciamento diz o ganho provável e avisa da repetição', () => {
    const s0 = start();
    expect(pronouncementContext(s0, content)).toMatch(/^Efeito provável: aprovação 0,8 ponto percentual maior/);
    const said = advanceMonth(s0, { decisions: [{ policyId: PRONOUNCEMENT_ACTION_ID, agendaCost: 1 }] }, content).state;
    expect(pronouncementContext(said, content)).toMatch(/0,4 ponto percentual.*Já houve 1 pronunciamento/);
  });
});
