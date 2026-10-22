/**
 * Estatística de quadros do globo (medição, PLANO_GLOBO §3.3). Puro: sem three, React ou relógio próprio.
 * O laço é `demand`: só entram quadros realmente desenhados, e uma pausa longa entre dois quadros não é "quadro lento".
 */

/** Janela móvel: quantidade dos últimos intervalos entre quadros desenhados usados nos percentis. */
export const FRAME_WINDOW = 300;
/** Intervalo (ms) acima do qual um quadro conta como longo. */
export const LONG_FRAME_MS = 100;
/** Intervalo (ms) acima do qual consideramos que o globo ficou parado (laço sob demanda): não é medido. */
export const IDLE_GAP_MS = 500;
/** Intervalos (ms) fora desta faixa são descartados pela qualidade automática (ruído ou pausa longa). */
export const MIN_FRAME_MS = 2;
export const MAX_FRAME_MS = 1000;
/** Repouso sem movimento: um intervalo maior que isto não conta, nem para a qualidade nem para os percentis. */
export const MAX_BURST_GAP_MS = 120;

/** Quadro desenhado, com o que o laço sabia dele (usado pela qualidade automática). */
export interface FrameEvent {
  atMs: number;
  moving: boolean;
  tilesBusy: boolean;
}

/** Intervalo aceito entre dois quadros e se houve movimento nele. */
export interface FrameSample {
  ms: number;
  moving: boolean;
}

export interface FrameSummary {
  /** Intervalos medidos na janela. */
  samples: number;
  p50: number;
  p95: number;
  p99: number;
  /** Quadros por segundo médios na janela (1000 / média dos intervalos). */
  fps: number;
  /** Quadros longos (> LONG_FRAME_MS) desde a criação. */
  longFrames: number;
}

/** Percentil por posto mais próximo sobre valores já ordenados (`p` em 0..1). */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}

export class FrameStats {
  private readonly buf: Float64Array;
  private count = 0;
  private head = 0;
  private lastT: number | null = null;
  private lastEvent: FrameEvent | null = null;
  private long = 0;

  constructor(
    readonly windowSize: number = FRAME_WINDOW,
    private readonly idleGapMs: number = IDLE_GAP_MS,
    private readonly longFrameMs: number = LONG_FRAME_MS,
  ) {
    this.buf = new Float64Array(windowSize);
  }

  /** Registra um quadro desenhado no instante `nowMs`. O primeiro de uma sequência não gera intervalo. */
  push(nowMs: number): void {
    const prev = this.lastT;
    this.lastT = nowMs;
    if (prev === null) return;
    const dt = nowMs - prev;
    if (dt < 0 || dt > this.idleGapMs) return; // laço parado entre gestos: recomeça a sequência
    this.record(dt);
  }

  /**
   * Versão com o evento do quadro (qualidade automática): o intervalo é aceito se estiver na faixa válida e, sem
   * movimento, não for uma pausa. Usa a mesma janela de `push`, então percentis e qualidade partem da mesma medição.
   */
  pushEvent(event: FrameEvent): FrameSample | null {
    const previous = this.lastEvent;
    this.lastEvent = { ...event };
    if (!previous) return null;
    const ms = event.atMs - previous.atMs;
    const moving = event.moving || previous.moving;
    if (!Number.isFinite(ms) || ms < MIN_FRAME_MS || ms > MAX_FRAME_MS || (!moving && ms > MAX_BURST_GAP_MS)) {
      return null;
    }
    this.record(ms);
    return { ms, moving };
  }

  /** Quebra a sequência (pausa, toque, troca de tela): o próximo quadro não gera intervalo. */
  interrupt(): void {
    this.lastT = null;
    this.lastEvent = null;
  }

  private record(dt: number): void {
    this.buf[this.head] = dt;
    this.head = (this.head + 1) % this.windowSize;
    if (this.count < this.windowSize) this.count++;
    if (dt > this.longFrameMs) this.long++;
  }

  summary(): FrameSummary {
    const v = Array.from(this.buf.subarray(0, this.count)).sort((a, b) => a - b);
    const mean = v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
    return {
      samples: v.length,
      p50: percentile(v, 0.5),
      p95: percentile(v, 0.95),
      p99: percentile(v, 0.99),
      fps: mean > 0 ? 1000 / mean : 0,
      longFrames: this.long,
    };
  }
}
