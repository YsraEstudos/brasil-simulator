import { describe, expect, it, vi } from 'vitest';

import type { Timers } from './cloudLoop';
import {
  PULSE_DURATION_MS,
  PULSE_FRAME_MS,
  PULSE_ITERATIONS,
  PULSE_MAX_FPS,
  PULSE_TOTAL_MS,
  pulseAt,
  startMarkerPulse,
} from './markerPulse';

// PLANO_GLOBO.md §3.2 e §8 (teste 11): o pulso é breve, limitado a 30 qps e para sozinho; depois, nenhum quadro.

/** Temporizador e relógio falsos: `advance` roda os intervalos pendentes como o JS faria. */
function fakeClock() {
  let time = 0;
  let nextHandle = 1;
  const intervals = new Map<number, { fn: () => void; ms: number; next: number }>();
  const timers: Timers = {
    setInterval: (fn, ms) => {
      const handle = nextHandle++;
      intervals.set(handle, { fn, ms, next: time + ms });
      return handle;
    },
    clearInterval: (handle) => {
      intervals.delete(handle as number);
    },
  };
  const advance = (ms: number) => {
    const end = time + ms;
    for (;;) {
      const due = [...intervals.values()].filter((i) => i.next <= end).sort((a, b) => a.next - b.next)[0];
      if (!due) break;
      time = due.next;
      due.next += due.ms;
      due.fn();
    }
    time = end;
  };
  return { timers, now: () => time, advance, active: () => intervals.size };
}

describe('pulso dos marcadores', () => {
  it('é breve: ~1,2 s por volta, poucas voltas, e o teto de quadros respeita 30 por segundo', () => {
    expect(PULSE_DURATION_MS).toBe(1200);
    expect(PULSE_ITERATIONS).toBeGreaterThanOrEqual(2);
    expect(PULSE_ITERATIONS).toBeLessThanOrEqual(4);
    expect(PULSE_TOTAL_MS).toBe(PULSE_DURATION_MS * PULSE_ITERATIONS);
    expect(1000 / PULSE_FRAME_MS).toBeLessThanOrEqual(PULSE_MAX_FPS);
  });

  it('a fase repete a cada volta (0 → 1) e fora do tempo total o anel fica invisível', () => {
    expect(pulseAt(0)).toEqual({ phase: 0, done: false });
    expect(pulseAt(PULSE_DURATION_MS / 2).phase).toBeCloseTo(0.5, 6);
    expect(pulseAt(PULSE_DURATION_MS).phase).toBe(0);
    expect(pulseAt(PULSE_DURATION_MS * 1.25).phase).toBeCloseTo(0.25, 6);
    expect(pulseAt(PULSE_TOTAL_MS - 1).done).toBe(false);
    expect(pulseAt(PULSE_TOTAL_MS)).toEqual({ phase: 1, done: true });
    expect(pulseAt(PULSE_TOTAL_MS * 10)).toEqual({ phase: 1, done: true });
    expect(pulseAt(-5)).toEqual({ phase: 1, done: false });
  });

  it('para sozinho: depois do tempo total o temporizador é limpo e nenhum quadro é pedido', () => {
    const clock = fakeClock();
    const frames = vi.fn();
    startMarkerPulse(frames, clock.now, clock.timers);
    expect(clock.active()).toBe(1);

    clock.advance(PULSE_TOTAL_MS + 1000);
    expect(clock.active()).toBe(0);
    const calls = frames.mock.calls.length;
    // a última amostra entregue é a final: fase 1 (anel invisível) e `done`
    expect(frames.mock.calls.at(-1)?.[0]).toEqual({ phase: 1, done: true });

    clock.advance(60_000);
    expect(frames.mock.calls.length).toBe(calls);
  });

  it('respeita o teto de quadros: no máximo ~30 por segundo enquanto corre', () => {
    const clock = fakeClock();
    const frames = vi.fn();
    startMarkerPulse(frames, clock.now, clock.timers);
    clock.advance(1000);
    // a amostra inicial + um quadro por intervalo
    expect(frames.mock.calls.length).toBeLessThanOrEqual(PULSE_MAX_FPS + 1);
    expect(frames.mock.calls.length).toBeGreaterThan(10);
    const phases = frames.mock.calls.map(([s]) => s.phase as number);
    expect(Math.min(...phases)).toBe(0);
    expect(Math.max(...phases)).toBeLessThan(1);
  });

  it('o `stop` cancela antes do fim (uma vez só) e nada mais é pedido', () => {
    const clock = fakeClock();
    const frames = vi.fn();
    const stop = startMarkerPulse(frames, clock.now, clock.timers);
    clock.advance(500);
    stop();
    stop();
    expect(clock.active()).toBe(0);
    const calls = frames.mock.calls.length;
    clock.advance(PULSE_TOTAL_MS * 2);
    expect(frames.mock.calls.length).toBe(calls);
  });
});
