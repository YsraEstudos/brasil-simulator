import { keyedRng } from '../career/draw';
import type { GameContent, GameState } from '../types';
import type { Ministry } from '../../types/scenario';
import { ministryOccupant } from './cabinet';

/** Valores fictícios de jogo, sujeitos a calibração; não representam pessoas reais. */
export const MANAGEMENT_CALIBRATION = {
  minimum: 0.65,
  range: 0.35,
} as const;

export interface ManagementProfile {
  competence: number;
  experience: number;
  coordination: number;
  capacity: number;
}

/** Cada indicação tem qualidades próprias, sorteadas sem consumir o PRNG principal. */
export function managementProfile(seed: number, ministryId: string, occupant: string): ManagementProfile {
  const rng = keyedRng(seed, ['management', ministryId, occupant, 'v1']);
  const quality = () => MANAGEMENT_CALIBRATION.minimum + MANAGEMENT_CALIBRATION.range * rng.float();
  const competence = quality();
  const experience = quality();
  const coordination = quality();
  return { competence, experience, coordination, capacity: (competence + experience + coordination) / 3 };
}

export function ministryManagement(state: Readonly<GameState>, ministry: Ministry): ManagementProfile {
  return managementProfile(state.seed, ministry.id, ministryOccupant(state, ministry));
}

export function policyCapacity(state: Readonly<GameState>, content: GameContent, area: string): number {
  return policyManagement(state, content, area)?.capacity ?? 1;
}

export function policyManagement(
  state: Readonly<GameState>,
  content: GameContent,
  area: string,
): ManagementProfile | null {
  const ministry = content.scenario.institutions?.ministries.find((item) => item.areas.includes(area));
  return ministry ? ministryManagement(state, ministry) : null;
}
