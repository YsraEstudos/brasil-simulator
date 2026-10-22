/** Amostragem única para o contador do PR 0 e a decisão automática do PR 5. Sem relógio próprio ou desenho. */
export interface FrameEvent {
  atMs: number;
  moving: boolean;
  tilesBusy: boolean;
}
export interface FrameSample {
  ms: number;
  moving: boolean;
}
export const FRAME_WINDOW = 300;
export const LONG_FRAME_MS = 100;
export const MIN_FRAME_MS = 2;
export const MAX_FRAME_MS = 1000;
export const MAX_BURST_GAP_MS = 120;
export function percentile(sorted: readonly number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}
export class FrameStats {
  private last: FrameEvent | null = null;
  private samples: number[] = [];
  private long = 0;
  interrupt() {
    this.last = null;
  }
  push(event: FrameEvent): FrameSample | null {
    const previous = this.last;
    this.last = { ...event };
    if (!previous) return null;
    const ms = event.atMs - previous.atMs;
    const moving = event.moving || previous.moving;
    if (!Number.isFinite(ms) || ms < MIN_FRAME_MS || ms > MAX_FRAME_MS || (!moving && ms > MAX_BURST_GAP_MS))
      return null;
    this.samples.push(ms);
    if (this.samples.length > FRAME_WINDOW) this.samples.shift();
    if (ms > LONG_FRAME_MS) this.long++;
    return { ms, moving };
  }
  summary() {
    const sorted = [...this.samples].sort((a, b) => a - b);
    const mean = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
    return {
      samples: sorted.length,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      p99: percentile(sorted, 0.99),
      fps: mean ? 1000 / mean : 0,
      longFrames: this.long,
    };
  }
}
