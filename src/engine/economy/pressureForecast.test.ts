import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { PRESSURE_ACTION_ID } from '@/engine/actions';
import { advanceMonth } from '@/engine/advanceMonth';
import { createInitialState } from '@/engine/state';
import type { GameState } from '@/engine/types';

import { boardShare, pressureForecast } from './monetary';

// PLANO_CAMPANHA.md Fase C6f: análise da pressão sobre o BC (ECONOMIC_MODEL.md §5.4.2).

const content = loadContent(DEFAULT_SCENARIO_ID);
const c = content.calibration;
const PRESS = [{ policyId: PRESSURE_ACTION_ID, agendaCost: 1 }];

function at(monthIndex: number, seed = 4): GameState {
  let s = createInitialState({ content, difficulty: 'estrategica', seed });
  for (let m = 0; m < monthIndex; m++) s = advanceMonth(s, { decisions: [] }, content).state;
  return s;
}

/** Corte extra que a pressão deste mês deu na reunião seguinte do Copom. */
function realizedCut(s: GameState): number {
  let current = advanceMonth(s, { decisions: PRESS }, content);
  for (let i = 0; i < 12; i++) {
    if (current.report.copom) return current.report.copom.pressureCut ?? 0;
    current = advanceMonth(current.state, { decisions: [] }, content);
  }
  return 0;
}

describe('diretoria indicada (LC 179/2021; correção da Fase C6f)', () => {
  it('no 2º mandato do mesmo presidente toda a diretoria já é dele', () => {
    expect(boardShare(47, c)).toBe(1);
    for (const m of [48, 60, 72, 95]) expect(boardShare(m, c)).toBe(1);
  });
});

describe('previsão da pressão (ECONOMIC_MODEL.md §5.4.2)', () => {
  it('nos três primeiros anos o BC resiste: corte previsto e obtido 0; no 4º ano, até 25 bp', () => {
    for (const month of [1, 13, 25]) {
      const s = at(month);
      expect(pressureForecast(s, content).cut).toBe(0);
      expect(realizedCut(s)).toBe(0);
    }
    const year4 = at(37);
    expect(pressureForecast(year4, content).cut).toBeCloseTo(0.0025, 12);
    expect(realizedCut(year4)).toBeCloseTo(0.0025, 12);
  });

  it('no 2º mandato a pressão rende o corte do 4º ano desde o começo', () => {
    const s = at(49);
    expect(pressureForecast(s, content).cut).toBeCloseTo(0.0025, 12);
    expect(realizedCut(s)).toBeCloseTo(0.0025, 12);
  });

  it('o custo previsto é o custo do mês, e cresce com as pressões dos 12 meses anteriores', () => {
    const s = at(2);
    const f = pressureForecast(s, content);
    const pressed = advanceMonth(s, { decisions: PRESS }, content).state;
    const quiet = advanceMonth(s, { decisions: [] }, content).state;
    expect(pressed.economy.credibility - quiet.economy.credibility).toBeCloseTo(-f.credibilityCost, 10);
    expect(pressureForecast(pressed, content).credibilityCost).toBeCloseTo(2 * c.custo_cred_pressao, 12);
    expect(pressureForecast(pressed, content).previous12m).toBe(1);
  });
  it('com pressão já valendo para a reunião, a previsão marca que repetir não aumenta o corte', () => {
    // Mês 37 = fevereiro, sem Copom: o corte fica pendente para a reunião de março.
    const pressed = advanceMonth(at(37), { decisions: PRESS }, content).state;
    expect(pressed.economy.bcPressure.pendingCut).toBeGreaterThan(0);
    const f = pressureForecast(pressed, content);
    expect(f.alreadyPending).toBe(true);
    expect(f.nextCopomMonth).toBe(38);
  });
});
