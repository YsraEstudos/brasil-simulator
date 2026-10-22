import type { Vec3 } from './geo';
export const SUN_TRANSITION_MS = 1500;
export function sunTransition(
  from: readonly number[],
  to: readonly number[],
  elapsedMs: number,
  reduced: boolean,
): { dir: Vec3; active: boolean } {
  const t = reduced ? 1 : Math.min(1, Math.max(0, elapsedMs / SUN_TRANSITION_MS));
  const blend = from.map((v, i) => v + (to[i] - v) * t);
  const length = Math.hypot(...blend);
  const dir: Vec3 = length > 1e-10 ? [blend[0] / length, blend[1] / length, blend[2] / length] : [to[0], to[1], to[2]];
  return { dir, active: t < 1 };
}
