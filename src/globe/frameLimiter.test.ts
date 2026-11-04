import { describe, expect, it } from 'vitest';

import {
  FrameThrottle,
  frameDelayMs,
  frameIntervalMs,
  limitsFrames,
  nextFrameSlot,
  shouldRenderFrame,
  type FrameTimers,
} from './frameLimiter';

/** Temporizador falso: os disparos ficam numa lista e rodam quando o relógio da simulação passa deles. */
function fakeTimers() {
  let nextId = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const timers: FrameTimers = {
    setTimeout: (fn, ms) => {
      const id = nextId++;
      pending.set(id, { at: clock.t + ms, fn });
      return id;
    },
    clearTimeout: (handle) => {
      pending.delete(handle as number);
    },
  };
  const clock = {
    t: 0,
    timers,
    pendingCount: () => pending.size,
    /** Dispara, em ordem, os temporizadores vencidos até `t`. */
    fireDue(t: number) {
      for (;;) {
        let due: [number, { at: number; fn: () => void }] | undefined;
        for (const entry of pending) if (entry[1].at <= t + 1e-6 && (!due || entry[1].at < due[1].at)) due = entry;
        if (!due) return;
        pending.delete(due[0]);
        clock.t = due[1].at;
        due[1].fn();
      }
    },
  };
  return clock;
}

/**
 * Simula o globo: um vsync a cada 1000/60 ms. Um `invalidate` pede o próximo vsync; o quadro desenhado pede outro
 * quadro contínuo (como a `useFrame` da cena faz enquanto a inércia ou o voo dura).
 */
function simulate(fps: number, durationMs: number) {
  const clock = fakeTimers();
  let wantsFrame = false;
  let frames = 0;
  const framesAt: number[] = [];
  const throttle = new FrameThrottle(
    () => {
      wantsFrame = true;
    },
    () => clock.t,
    clock.timers,
  );
  throttle.request(fps); // início do movimento
  const vsync = 1000 / 60;
  for (let t = 0; t <= durationMs + 1e-6; t += vsync) {
    clock.t = t;
    clock.fireDue(t);
    if (wantsFrame) {
      wantsFrame = false;
      frames++;
      framesAt.push(t);
      throttle.request(fps);
    }
  }
  return { frames, framesAt, throttle, clock };
}

describe('limite de quadros do globo', () => {
  it('intervalo mínimo é 1000 / taxa (ms)', () => {
    expect(frameIntervalMs(30)).toBeCloseTo(33.33, 2);
    expect(frameIntervalMs(60)).toBeCloseTo(16.67, 2);
  });

  it('só 30 limita; 60 é o comportamento atual (sem limite)', () => {
    expect(limitsFrames(30)).toBe(true);
    expect(limitsFrames(60)).toBe(false);
  });

  it('primeiro quadro segue na hora; depois, o próximo cai no instante previsto', () => {
    const first = nextFrameSlot(null, 100, 30);
    expect(first).toBeCloseTo(133.33, 2);
    expect(shouldRenderFrame(100, first)).toBe(false);
    expect(shouldRenderFrame(133.4, first)).toBe(true);
    expect(frameDelayMs(first, 100)).toBeCloseTo(33.33, 2);
  });

  it('o cronograma não acumula atraso: um quadro tardio não empurra o seguinte', () => {
    const slot = nextFrameSlot(null, 0, 30); // 33,3
    const next = nextFrameSlot(slot, slot + 5, 30); // desenhado 5 ms depois do previsto
    expect(next).toBeCloseTo(slot * 2, 6);
  });

  it('depois de uma parada longa recomeça do agora, sem rajada', () => {
    const slot = nextFrameSlot(null, 0, 30);
    expect(nextFrameSlot(slot, 5000, 30)).toBeCloseTo(5000 + 1000 / 30, 6);
  });

  it('atraso nunca é negativo', () => {
    expect(frameDelayMs(10, 50)).toBe(0);
  });

  it('com 30 qps, uma simulação de 1 s desenha 30 quadros (±1) e nunca mais que isso', () => {
    const { frames, framesAt } = simulate(30, 1000);
    expect(frames).toBeGreaterThanOrEqual(29);
    expect(frames).toBeLessThanOrEqual(31);
    // intervalo entre quadros consecutivos nunca fica abaixo do mínimo (com a folga de um vsync)
    for (let i = 1; i < framesAt.length; i++) {
      expect(framesAt[i]! - framesAt[i - 1]!).toBeGreaterThanOrEqual(1000 / 30 - 1e-6);
    }
  });

  it('com 60 qps (sem limite) o laço segue o vsync: um quadro por vsync', () => {
    const { frames } = simulate(60, 1000);
    expect(frames).toBeGreaterThanOrEqual(60);
    expect(frames).toBeLessThanOrEqual(61);
  });

  it('nunca há dois temporizadores pendentes: pedidos extras são absorvidos', () => {
    const clock = fakeTimers();
    const throttle = new FrameThrottle(
      () => undefined,
      () => clock.t,
      clock.timers,
    );
    throttle.request(30);
    throttle.request(30);
    throttle.request(30);
    expect(clock.pendingCount()).toBe(1);
  });

  it('cancel() tira o quadro agendado (globo pausado ou desmontado)', () => {
    const clock = fakeTimers();
    let draws = 0;
    const throttle = new FrameThrottle(
      () => {
        draws++;
      },
      () => clock.t,
      clock.timers,
    );
    throttle.request(30);
    throttle.cancel();
    expect(clock.pendingCount()).toBe(0);
    clock.fireDue(1000);
    expect(draws).toBe(0);
  });
});
