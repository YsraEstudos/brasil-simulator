import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';

import { advanceMonth } from '../advanceMonth';
import { createInitialState } from '../state';
import type { GameState, MonthResult } from '../types';

import { careerParam } from './calibration';
import { keySalt } from './draw';
import { PLAYER_CANDIDATE_ID } from './opponents';
import { currentPollView, recognitionBand, takePoll } from './polls';

import { careerSchedule } from '.';

// PLANO_CAMPANHA.md Fase C2 (tarefa C2.4): pesquisas persistidas e leituras para a interface.

const content = loadContent(DEFAULT_SCENARIO_ID);
const PRE_TURNS = careerSchedule(content, 'corrida').length;
const corrida = (seed = 7) => createInitialState({ content, difficulty: 'estrategica', seed, startPoint: 'corrida' });

function play(state: GameState, n: number): MonthResult[] {
  const out: MonthResult[] = [];
  for (let i = 0; i < n; i++) {
    const r = advanceMonth(state, { decisions: [] }, content);
    out.push(r);
    state = r.state;
  }
  return out;
}

describe('pesquisas (PLANO_CAMPANHA.md Fase C2)', () => {
  it('cada turno de campanha termina com uma pesquisa no estado e no relatório; a transição não tem', () => {
    const results = play(corrida(), PRE_TURNS);
    for (const [t, r] of results.entries()) {
      const stage = r.report.career!.stage;
      if (stage === 'transicao') {
        expect(r.report.career!.poll).toBeUndefined();
        // A atual continua sendo a do turno anterior (a da eleição).
        expect(r.state.career!.poll!.turnIndex).toBe(t - 1);
      } else {
        expect(r.report.career!.poll).toEqual(r.state.career!.poll);
        expect(r.state.career!.poll).toMatchObject({ turnIndex: t, scope: 'nacional', month: r.report.career!.to });
      }
    }
    expect(corrida().career!.poll).toBeUndefined();
  });

  it('parcelas não negativas que somam 1, jogador primeiro, margem divulgada e faixa por UF', () => {
    const [r] = play(corrida(), 1);
    const poll = r.state.career!.poll!;
    const parts = [...poll.intentions.map((i) => i.share), poll.undecided, poll.blankNull];
    expect(parts.every((x) => x >= 0)).toBe(true);
    expect(parts.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
    expect(poll.intentions[0].candidateId).toBe(PLAYER_CANDIDATE_ID);
    expect(poll.intentions).toHaveLength(r.state.career!.opponents.length + 1);
    expect(poll.margin).toBe(careerParam('pesquisa_margem'));
    expect(Object.keys(poll.recognitionBands)).toEqual(content.scenario.regions!.ufs.map((u) => u.id));
  });

  it('a mesma pesquisa ao refazer o turno e ao recalcular; sem tocar no PRNG principal', () => {
    const s0 = corrida();
    const a = play(s0, 2);
    const b = play(structuredClone(s0), 2);
    expect(b[1].state.career!.poll).toEqual(a[1].state.career!.poll);
    expect(a[0].state.rng).toEqual(s0.rng);
    const career = a[0].state.career!;
    const again = takePoll(a[0].state, { ...career, turnIndex: 0 }, content, '2026-08');
    expect(again).toEqual(a[0].state.career!.poll);
    // Sementes diferentes, pesquisas diferentes (o sorteio depende da semente da campanha).
    expect(play(corrida(8), 1)[0].state.career!.poll).not.toEqual(a[0].state.career!.poll);
  });

  it('abrir a tela não muda o estado nem consome sorteio', () => {
    const [r] = play(corrida(), 1);
    const snapshot = structuredClone(r.state);
    const view = currentPollView(r.state, content)!;
    currentPollView(r.state, content);
    expect(r.state).toEqual(snapshot);
    expect(view.names[PLAYER_CANDIDATE_ID]).toBe('Você');
    expect(view.intentions).toEqual(r.state.career!.poll!.intentions);
    expect(currentPollView(corrida(), content)).toBeNull();
  });

  it('fronteiras das faixas do mapa (I8): cada limite com um teste de cada lado', () => {
    const eps = 1e-9;
    const [low, mid, high] = [careerParam('faixa_baixo'), careerParam('faixa_medio'), careerParam('faixa_alto')];
    expect(recognitionBand(0)).toBe('desconhecido');
    expect(recognitionBand(low)).toBe('desconhecido');
    expect(recognitionBand(low + eps)).toBe('pouco_conhecido');
    expect(recognitionBand(mid)).toBe('pouco_conhecido');
    expect(recognitionBand(mid + eps)).toBe('conhecido');
    expect(recognitionBand(high)).toBe('conhecido');
    expect(recognitionBand(high + eps)).toBe('muito_conhecido');
    expect(recognitionBand(1)).toBe('muito_conhecido');
  });

  it('sal da chave estável e sensível a cada parte', () => {
    expect(keySalt(['career', 'poll', 0])).toBe(keySalt(['career', 'poll', 0]));
    expect(keySalt(['career', 'poll', 0])).not.toBe(keySalt(['career', 'poll', 1]));
    expect(keySalt(['career', 'poll', 0])).toBeLessThan(2 ** 32);
  });
});
