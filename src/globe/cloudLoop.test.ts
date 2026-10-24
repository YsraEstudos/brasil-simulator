import { describe, expect, it, vi } from 'vitest';

import {
  CLOUD_FRAME_MS,
  CLOUD_MAX_FPS,
  shouldAnimateClouds,
  startCloudLoop,
  type CloudLoopConditions,
  type Timers,
} from './cloudLoop';
import { GLOBE_BUDGETS, PROFILES_3D } from './qualityProfiles';

// PLANO_GLOBO.md §3.1 e §3.2: o único laço periódico do globo é o das nuvens do Alto, ≤ 30 qps, e para sozinho.

const ALL: CloudLoopConditions = { profileAllows: true, cloudsOn: true, drawing: true, appActive: true };

describe('laço das nuvens animadas', () => {
  it('roda só com as quatro condições juntas: perfil, opção, globo desenhando e app em primeiro plano', () => {
    expect(shouldAnimateClouds(ALL)).toBe(true);
    for (const off of ['profileAllows', 'cloudsOn', 'drawing', 'appActive'] as const) {
      expect(shouldAnimateClouds({ ...ALL, [off]: false }), off).toBe(false);
    }
  });

  it('só o perfil Alto permite nuvens animadas; o Econômico nem tem nuvens', () => {
    expect(PROFILES_3D.filter((p) => GLOBE_BUDGETS[p].effects.animatedClouds)).toEqual(['alto']);
    expect(GLOBE_BUDGETS['economico-3d'].effects.clouds).toBe(false);
    expect(GLOBE_BUDGETS.equilibrado.effects.clouds).toBe(true);
    expect(GLOBE_BUDGETS.equilibrado.effects.animatedClouds).toBe(false);
  });

  it('o intervalo respeita o teto de 30 quadros por segundo', () => {
    expect(CLOUD_MAX_FPS).toBe(30);
    expect(1000 / CLOUD_FRAME_MS).toBeLessThanOrEqual(CLOUD_MAX_FPS);
  });

  it('liga um temporizador no intervalo do teto e o `stop` o limpa (uma vez só)', () => {
    const set = vi.fn(() => 'h1');
    const clear = vi.fn();
    const timers: Timers = { setInterval: set, clearInterval: clear };
    const tick = vi.fn();
    const stop = startCloudLoop(tick, timers);
    expect(set).toHaveBeenCalledWith(tick, CLOUD_FRAME_MS);
    expect(clear).not.toHaveBeenCalled();
    stop();
    stop();
    expect(clear).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith('h1');
  });
});
