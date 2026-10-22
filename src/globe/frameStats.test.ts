import { expect, it } from 'vitest';
import { FrameStats } from './frameStats';
it('o mesmo intervalo alimenta percentis e qualidade, descartando pausa e repouso ocioso', () => {
  const s = new FrameStats();
  const event = (atMs: number, moving = true) => ({ atMs, moving, tilesBusy: false });
  expect(s.push(event(0))).toBeNull();
  expect(s.push(event(20))).toEqual({ ms: 20, moving: true });
  expect(s.push(event(60))).toEqual({ ms: 40, moving: true });
  expect(s.summary()).toMatchObject({ samples: 2, p50: 20, p95: 40, p99: 40 });
  s.interrupt();
  expect(s.push(event(5000, false))).toBeNull();
  expect(s.push(event(5400, false))).toBeNull();
  expect(s.summary().samples).toBe(2);
  expect(s.push(event(5600, true))).toEqual({ ms: 200, moving: true });
  expect(s.summary().longFrames).toBe(1);
});
