import type { Timers } from './cloudLoop';

/**
 * Pulso dos marcadores novos e críticos (PLANO_GLOBO.md §3.2 e §7, PR 11). Mesmo contrato do laço das nuvens
 * (`cloudLoop.ts`), mas **limitado no tempo**: `PULSE_ITERATIONS` voltas de `PULSE_DURATION_MS`, no máximo
 * `PULSE_MAX_FPS` quadros por segundo, e **para sozinho** no fim — depois disso o globo parado volta a não pedir
 * quadro nenhum (§8, teste 11). Módulo puro (sem three/React): o temporizador e o relógio são injetáveis para o teste.
 * O mapa 2D usa as mesmas duas constantes de tempo com o `Animated` do React Native.
 */

/** Duração de uma volta do pulso (o anel cresce e some). */
export const PULSE_DURATION_MS = 1200;
/** Quantas voltas o pulso dá antes de ficar estático. */
export const PULSE_ITERATIONS = 3;
/** Duração total do pulso. */
export const PULSE_TOTAL_MS = PULSE_DURATION_MS * PULSE_ITERATIONS;
/** Teto de quadros por segundo enquanto o pulso corre. */
export const PULSE_MAX_FPS = 30;
/** Intervalo mínimo entre dois pedidos de quadro (ms), arredondado para cima: nunca passa de `PULSE_MAX_FPS`. */
export const PULSE_FRAME_MS = Math.ceil(1000 / PULSE_MAX_FPS);

export interface PulseSample {
  /** Fase da volta atual, 0 → 1 (o anel nasce em 0 e some em 1). */
  phase: number;
  /** O tempo total acabou: nada mais deve ser desenhado nem pedido. */
  done: boolean;
}

/** Fase do pulso `elapsedMs` depois do início. Antes do início e depois do fim a fase é 1 (anel invisível). */
export function pulseAt(elapsedMs: number): PulseSample {
  if (elapsedMs < 0 || elapsedMs >= PULSE_TOTAL_MS) return { phase: 1, done: elapsedMs >= PULSE_TOTAL_MS };
  return { phase: (elapsedMs % PULSE_DURATION_MS) / PULSE_DURATION_MS, done: false };
}

const REAL_TIMERS: Timers = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

/**
 * Liga o pulso: chama `onFrame` com a fase a cada `PULSE_FRAME_MS` (pede o quadro ao desenhar) até o fim do tempo total,
 * quando entrega a última amostra (`done`, fase 1) e **limpa o próprio temporizador**. O `stop` devolvido cancela antes
 * (o efeito do React limpa ao desmontar ou quando o globo pausa); chamar `stop` duas vezes, ou depois do fim, não faz nada.
 */
export function startMarkerPulse(
  onFrame: (sample: PulseSample) => void,
  now: () => number,
  timers: Timers = REAL_TIMERS,
): () => void {
  const start = now();
  let stopped = false;
  const handle = timers.setInterval(() => {
    if (stopped) return;
    const sample = pulseAt(now() - start);
    onFrame(sample);
    if (sample.done) stop();
  }, PULSE_FRAME_MS);
  function stop() {
    if (stopped) return;
    stopped = true;
    timers.clearInterval(handle);
  }
  onFrame(pulseAt(0));
  return stop;
}
