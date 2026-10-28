import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { advanceMonth, createInitialState, PRESSURE_ACTION_ID, type GameState } from '@/engine';

import { pressureContext } from './pressureView';

// PLANO_CAMPANHA.md Fase C6f: o cartão da pressão sobre o BC mostra o efeito provável (ECONOMIC_MODEL.md §5.4.2).

const content = loadContent(DEFAULT_SCENARIO_ID);
const PRESS = [{ policyId: PRESSURE_ACTION_ID, agendaCost: 1 }];

function at(monthIndex: number): GameState {
  let s = createInitialState({ content, difficulty: 'estrategica', seed: 4 });
  for (let m = 0; m < monthIndex; m++) s = advanceMonth(s, { decisions: [] }, content).state;
  return s;
}

describe('texto da pressão sobre o BC (Fase C6f)', () => {
  it('com pressão já valendo para a reunião, avisa que repetir não aumenta o corte', () => {
    // Mês 37 = fevereiro, sem Copom: o corte fica pendente para a reunião de março.
    const pressed = advanceMonth(at(37), { decisions: PRESS }, content).state;
    expect(pressed.economy.bcPressure.pendingCut).toBeGreaterThan(0);
    expect(pressureContext(pressed, content)).toMatch(/não aumenta o corte, só o custo/);
  });

  it('o texto do cartão diz o efeito provável e o custo, sem prometer corte quando o BC resiste', () => {
    expect(pressureContext(at(1), content)).toMatch(/2 de 9 membros.*nenhum corte no Copom de .*\/2027.*Custo certo/);
    expect(pressureContext(at(37), content)).toMatch(/9 de 9 membros.*até 25 pontos-base/);
  });
});
