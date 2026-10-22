import { describe, expect, it } from 'vitest';

import { FRAME_WINDOW, FrameStats, IDLE_GAP_MS, LONG_FRAME_MS, percentile } from './frameStats';

function feed(s: FrameStats, intervals: number[], start = 1000): number {
  let t = start;
  s.push(t);
  for (const d of intervals) s.push((t += d));
  return t;
}

describe('percentile', () => {
  it('vazio dá 0 e usa posto mais próximo', () => {
    expect(percentile([], 0.5)).toBe(0);
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(v, 0.5)).toBe(50);
    expect(percentile(v, 0.95)).toBe(95);
    expect(percentile(v, 0.99)).toBe(99);
    expect(percentile(v, 1)).toBe(100);
  });
});

describe('FrameStats', () => {
  it('o primeiro quadro não gera intervalo', () => {
    const s = new FrameStats();
    s.push(0);
    expect(s.summary().samples).toBe(0);
  });

  it('calcula percentis e fps de intervalos conhecidos', () => {
    const s = new FrameStats();
    feed(s, Array(100).fill(20));
    const r = s.summary();
    expect(r.samples).toBe(100);
    expect(r.p50).toBe(20);
    expect(r.p99).toBe(20);
    expect(r.fps).toBeCloseTo(50);
    expect(r.longFrames).toBe(0);
  });

  it('conta quadros longos e eles aparecem no p99', () => {
    const s = new FrameStats();
    feed(s, [...Array(97).fill(16), LONG_FRAME_MS + 1, 150, 200]);
    const r = s.summary();
    expect(r.longFrames).toBe(3);
    expect(r.p50).toBe(16);
    expect(r.p99).toBe(150);
  });

  it('pausa do laço sob demanda não é medida e recomeça a sequência', () => {
    const s = new FrameStats();
    const t = feed(s, [16, 16]);
    s.push(t + IDLE_GAP_MS + 1); // volta de uma pausa
    s.push(t + IDLE_GAP_MS + 17);
    const r = s.summary();
    expect(r.samples).toBe(3);
    expect(r.longFrames).toBe(0);
    expect(r.p95).toBe(16);
  });

  it('a janela é móvel: só os últimos N intervalos contam, mas os quadros longos acumulam', () => {
    const s = new FrameStats(10);
    feed(s, [150, ...Array(10).fill(16)]);
    const r = s.summary();
    expect(r.samples).toBe(10);
    expect(r.p99).toBe(16);
    expect(r.longFrames).toBe(1);
  });

  it('janela padrão é a constante nomeada', () => {
    expect(new FrameStats().windowSize).toBe(FRAME_WINDOW);
  });

  it('relógio que anda para trás é ignorado', () => {
    const s = new FrameStats();
    s.push(100);
    s.push(50);
    expect(s.summary().samples).toBe(0);
  });
});

// Qualidade automática (PR 14c): o mesmo contador alimenta percentis e qualidade, descartando pausa e repouso ocioso.
describe('pushEvent (qualidade automática)', () => {
  it('o mesmo intervalo alimenta percentis e qualidade, descartando pausa e repouso ocioso', () => {
    const s = new FrameStats();
    const event = (atMs: number, moving = true) => ({ atMs, moving, tilesBusy: false });
    expect(s.pushEvent(event(0))).toBeNull();
    expect(s.pushEvent(event(20))).toEqual({ ms: 20, moving: true });
    expect(s.pushEvent(event(60))).toEqual({ ms: 40, moving: true });
    expect(s.summary()).toMatchObject({ samples: 2, p50: 20, p95: 40, p99: 40 });
    s.interrupt();
    expect(s.pushEvent(event(5000, false))).toBeNull();
    expect(s.pushEvent(event(5400, false))).toBeNull();
    expect(s.summary().samples).toBe(2);
    expect(s.pushEvent(event(5600, true))).toEqual({ ms: 200, moving: true });
    expect(s.summary().longFrames).toBe(1);
  });
});
