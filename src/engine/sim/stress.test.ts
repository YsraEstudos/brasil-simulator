import { describe, expect, it } from 'vitest';

import { advanceMonth } from '@/engine/advanceMonth';
import { DEFAULT_CALIBRATION, type Calibration } from '@/engine/economy/calibration';
import { checkInvariants } from '@/engine/invariants';
import type { GameState, ScheduledImpulse } from '@/engine/types';
import { testContent, testState } from '@/tests/fixtures';

// ECONOMIC_MODEL.md §9, "teste de cenários": alta inflação, recessão, recuperação, déficit persistente, crescimento
// moderado e choque externo. Testes de direção e de faixa, sem decisões do jogador e sem eventos sorteados.

const QUIET: Calibration = {
  ...DEFAULT_CALIBRATION,
  ruido_hiato_casual: 0,
  ruido_hiato_estrategica: 0,
  ruido_hiato_realismo: 0,
  ruido_cambio: 0,
  ruido_juros_externos: 0,
  ruido_termos_troca: 0,
};
const content = testContent({ calibration: QUIET, events: [] });

function play(start: GameState, months: number): GameState[] {
  const path: GameState[] = [];
  let state = start;
  for (let m = 0; m < months; m++) {
    const r = advanceMonth(state, { decisions: [] }, content);
    expect(checkInvariants(state, r.state, r.report, content)).toEqual([]);
    state = r.state;
    path.push(state);
  }
  return path;
}

const at = (path: readonly GameState[], month: number): GameState => {
  const s = path[month - 1];
  if (!s) throw new Error(`mês ${month} fora da trajetória`);
  return s;
};

const base = (): GameState => testState(1, 'estrategica', content);

const shock = (target: ScheduledImpulse['target'], delta: number, months: number): ScheduledImpulse => ({
  sourceId: `teste:${target}`,
  label: 'Choque de teste',
  target,
  delta,
  startMonth: 0,
  endMonth: months - 1,
});

describe('cenários de estresse (ECONOMIC_MODEL.md §9)', () => {
  it('alta inflação: o Copom sobe a Selic e a inflação volta para perto da meta em 3 anos', () => {
    const b = base();
    const start: GameState = {
      ...b,
      indicators: { ...b.indicators, inflation12m: 0.12 },
      economy: { ...b.economy, inflationExpectation: 0.1, credibility: 0.5 },
    };
    const path = play(start, 36);
    expect(at(path, 6).economy.selic).toBeGreaterThan(b.economy.selic);
    expect(at(path, 36).indicators.inflation12m).toBeLessThan(0.07);
  });

  it('recessão e recuperação: o desemprego sobe, a Selic cai e o hiato se fecha', () => {
    const b = base();
    const start: GameState = { ...b, economy: { ...b.economy, outputGap: -0.04 } };
    const path = play(start, 36);
    expect(at(path, 6).indicators.unemployment).toBeGreaterThan(b.indicators.unemployment);
    expect(Math.min(...path.slice(0, 12).map((s) => s.economy.selic))).toBeLessThan(b.economy.selic);
    expect(Math.abs(at(path, 36).economy.outputGap)).toBeLessThan(0.02);
  });

  it('déficit persistente fora do limite: dívida, prêmio e câmbio sobem e a credibilidade cai', () => {
    const calm = play(base(), 36);
    const deficit = play({ ...base(), impulses: [shock('gasto.extraordinario', 0.02, 36)] }, 36);
    const c = at(calm, 36).economy;
    const d = at(deficit, 36).economy;
    expect(d.grossDebt).toBeGreaterThan(c.grossDebt + 0.04);
    expect(d.riskPremium).toBeGreaterThan(c.riskPremium);
    expect(d.credibility).toBeLessThan(c.credibility);
  });

  it('choque externo: o câmbio deprecia e a inflação sobe; depois os dois voltam', () => {
    const calm = play(base(), 48);
    const hit = play({ ...base(), impulses: [shock('choque.risco', 0.03, 6), shock('choque.cambio', 0.04, 2)] }, 48);
    expect(at(hit, 3).economy.exchangeRate).toBeGreaterThan(at(calm, 3).economy.exchangeRate * 1.05);
    expect(at(hit, 9).indicators.inflation12m).toBeGreaterThan(at(calm, 9).indicators.inflation12m);
    const gapFx = at(hit, 48).economy.exchangeRate / at(calm, 48).economy.exchangeRate - 1;
    expect(Math.abs(gapFx)).toBeLessThan(0.03);
    expect(Math.abs(at(hit, 48).indicators.inflation12m - at(calm, 48).indicators.inflation12m)).toBeLessThan(0.005);
  });

  it('crescimento moderado: sem choques, PIB, inflação e desemprego ficam perto das referências em 5 anos', () => {
    const end = at(play(base(), 60), 60);
    expect(Math.abs(end.indicators.gdpGrowth12m - QUIET.g_pot_base)).toBeLessThan(0.01);
    expect(Math.abs(end.indicators.inflation12m - QUIET.meta_inflacao)).toBeLessThan(0.015);
    expect(Math.abs(end.indicators.unemployment - QUIET.nairu)).toBeLessThan(0.01);
  });
});
