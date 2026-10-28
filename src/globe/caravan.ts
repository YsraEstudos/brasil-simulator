import { lonLatToVec3, type Vec3 } from './geo';
import { ufBySigla } from './ufs';

/** A rota é ilustrativa, de Brasília até a UF da última caravana aceita. */
export function caravanDestination(actions: readonly { actionId: string; target?: string }[]): string | null {
  const action = [...actions].reverse().find((item) => item.actionId === 'caravana_regional');
  return action?.target && ufBySigla(action.target) ? action.target : null;
}

export function caravanPosition(sigla: string, progress: number, reduceMotion: boolean): Vec3 {
  const destination = ufBySigla(sigla)?.centroid ?? ufBySigla('DF')!.centroid;
  const origin = ufBySigla('DF')!.centroid;
  const t = reduceMotion ? 1 : Math.max(0, Math.min(1, progress));
  return lonLatToVec3(
    origin[0] + (destination[0] - origin[0]) * t,
    origin[1] + (destination[1] - origin[1]) * t,
    1.012,
  );
}
