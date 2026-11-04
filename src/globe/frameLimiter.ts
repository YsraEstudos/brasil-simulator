/**
 * Limite de quadros das animações contínuas do globo (Configurações → Globo → taxa de quadros, `prefs.globeFps`:
 * 30 ou 60). Cobre os laços que pedem quadro sozinhos: inércia depois de soltar o dedo, voo de câmera (toque duplo,
 * "Centralizar", ir até uma UF) e a transição do Sol. 60 = sem limite: o pedido vai na hora, como sempre foi.
 *
 * Fora do limite, ficam os quadros que respondem ao jogador (arrastar, pinça, roda do mouse, toque): eles pedem
 * quadro na hora, porque é a resposta ao dedo. O laço das nuvens e o pulso dos marcadores já têm teto próprio de
 * 30 qps (`cloudLoop.ts`, `markerPulse.ts`), que cabe nos dois valores e não muda.
 *
 * Módulo puro (sem three/React): o relógio e o temporizador são injetáveis para o teste.
 */

/** Taxa em que o limite deixa de valer: os pedidos seguem o ritmo do aparelho (comportamento anterior). */
export const UNCAPPED_FPS = 60;

/** Intervalo mínimo entre dois quadros contínuos (ms): 1000 / taxa escolhida. */
export function frameIntervalMs(fps: number): number {
  return 1000 / fps;
}

/** O limite se aplica? (60 = não). */
export function limitsFrames(fps: number): boolean {
  return fps < UNCAPPED_FPS;
}

/**
 * Próximo instante permitido para um quadro contínuo, depois de um quadro desenhado em `now`.
 * `slot` é o instante previsto do último quadro contínuo (`null` = nenhum ainda). O cronograma não acumula atraso:
 * um quadro um pouco atrasado não empurra o seguinte. Se o laço ficou parado por mais de dois intervalos (o app
 * em segundo plano, um salto de relógio), recomeça do agora, sem rajada de quadros atrasados.
 */
export function nextFrameSlot(slot: number | null, now: number, fps: number): number {
  const interval = frameIntervalMs(fps);
  if (slot === null || now - slot >= 2 * interval) return now + interval;
  return slot + interval;
}

/** Quanto esperar (ms, nunca negativo) até o instante previsto do próximo quadro. */
export function frameDelayMs(slot: number, now: number): number {
  return Math.max(0, slot - now);
}

/** Um quadro pedido em `now` pode ser desenhado sem passar do limite? (`slot` = instante previsto). */
export function shouldRenderFrame(now: number, slot: number | null): boolean {
  return slot === null || now >= slot;
}

export interface FrameTimers {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

const REAL_TIMERS: FrameTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Pedidos de quadro dos laços contínuos. `request(fps)` é chamado num quadro que quer outro: com 60 pede na hora
 * (`draw`, o `invalidate` da cena); com 30 agenda um único temporizador para o próximo instante permitido, e os
 * pedidos que chegarem antes dele são absorvidos (nunca há dois temporizadores). `cancel()` desfaz o agendamento
 * (globo pausado ou desmontado).
 */
export class FrameThrottle {
  private slot: number | null = null;
  private handle: unknown = null;

  constructor(
    private readonly draw: () => void,
    private readonly now: () => number = () => performance.now(),
    private readonly timers: FrameTimers = REAL_TIMERS,
  ) {}

  request(fps: number): void {
    if (!limitsFrames(fps)) {
      this.draw();
      return;
    }
    if (this.handle !== null) return;
    const now = this.now();
    this.slot = nextFrameSlot(this.slot, now, fps);
    this.handle = this.timers.setTimeout(
      () => {
        this.handle = null;
        this.draw();
      },
      frameDelayMs(this.slot, now),
    );
  }

  cancel(): void {
    if (this.handle !== null) this.timers.clearTimeout(this.handle);
    this.handle = null;
    this.slot = null;
  }
}
