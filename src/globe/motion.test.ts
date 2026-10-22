import { expect, it } from 'vitest';
import { GlobeController } from './controller';
import { sunTransition } from './motion';

it('reduzir movimento interrompe inércia e faz voo instantâneo', () => {
  const c = new GlobeController();
  c.release(1000, 0);
  c.setReduceMotion(true);
  expect(c.step(0.1)).toBe(false);
  c.flyTo({ lon: -40, lat: -10 });
  expect(c.state.lon).toBe(-40);
  expect(c.step(0.1)).toBe(false);
});
it('Sol interpola por 1500 ms com vetor unitário e reduzido vai direto ao destino', () => {
  const from = [1, 0, 0] as const;
  const to = [0, 1, 0] as const;
  expect(sunTransition(from, to, 1500, false).active).toBe(false);
  expect(sunTransition(from, to, 200, true).dir).toEqual(to);
  const middle = sunTransition(from, to, 750, false);
  expect(middle.active).toBe(true);
  expect(middle.dir[0]).toBeCloseTo(Math.SQRT1_2);
  expect(Math.hypot(...middle.dir)).toBeCloseTo(1);
});
