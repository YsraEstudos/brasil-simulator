/**
 * Laço das nuvens animadas (PLANO_GLOBO.md §3.1: "nuvens animadas (≤ 30 qps)", só no perfil Alto). É o **único** laço
 * periódico de quadros do globo e tem orçamento explícito:
 *
 *  - no máximo `CLOUD_MAX_FPS` pedidos de quadro por segundo (um temporizador, nunca `requestAnimationFrame` livre);
 *  - só roda quando `shouldAnimateClouds` é verdadeiro: perfil que permite nuvens animadas (Alto), nuvens ligadas em
 *    Configurações, globo desenhando (não pausado por subtela/foco) e app em primeiro plano;
 *  - para na hora quando qualquer condição some (o efeito do React limpa o temporizador), então globo parado, Painel
 *    desfocado ou app em segundo plano ficam sem laço (PLANO_GLOBO.md §8, teste 11).
 *
 * Módulo puro (sem three/React): o temporizador é injetável para o teste.
 */

/** Teto de quadros por segundo do laço das nuvens. */
export const CLOUD_MAX_FPS = 30;
/** Intervalo mínimo entre dois pedidos de quadro (ms), arredondado para cima: nunca passa de `CLOUD_MAX_FPS`. */
export const CLOUD_FRAME_MS = Math.ceil(1000 / CLOUD_MAX_FPS);

export interface CloudLoopConditions {
  /** `effects.animatedClouds` do perfil de qualidade 3D ativo. */
  profileAllows: boolean;
  /** "Nuvens" ligado em Configurações (e permitido pelo perfil: `effects.clouds`). */
  cloudsOn: boolean;
  /** O globo está desenhando (não pausado). */
  drawing: boolean;
  /** O aplicativo está em primeiro plano. */
  appActive: boolean;
}

/** O laço das nuvens deve rodar? */
export function shouldAnimateClouds(c: CloudLoopConditions): boolean {
  return c.profileAllows && c.cloudsOn && c.drawing && c.appActive;
}

export interface Timers {
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

const REAL_TIMERS: Timers = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

/** Liga o laço: chama `tick` no máximo `CLOUD_MAX_FPS` vezes por segundo até o `stop` devolvido ser chamado. */
export function startCloudLoop(tick: () => void, timers: Timers = REAL_TIMERS): () => void {
  const handle = timers.setInterval(tick, CLOUD_FRAME_MS);
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    timers.clearInterval(handle);
  };
}

/** Velocidade da deriva das nuvens em repetições do ruído por segundo (uma volta a cada ~2 min). */
export const CLOUD_DRIFT_PER_SECOND = 0.008;
