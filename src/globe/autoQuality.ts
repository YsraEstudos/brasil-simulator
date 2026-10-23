import { neighborProfile, PROFILES_3D, type Profile3d } from './qualityProfiles';

/**
 * Escolha automática do perfil 3D (PLANO_GLOBO.md §3.1): máquina de estados PURA (sem three, React ou relógio: quem a
 * usa entrega o instante de cada quadro). Não confundir com as métricas do PR 0 (medição no moto g20): este módulo só
 * decide; os nomes não colidem com `frameStats` e podem ser unificados depois.
 *
 * Fluxo:
 * 1. Aquecimento: nenhum quadro conta até `WARMUP_QUIET_FRAMES` quadros seguidos sem tile em carregamento (shaders
 *    compilados, texturas enviadas).
 * 2. Amostragem: o intervalo entre quadros vira amostra de "movimento" (gesto ou inércia) ou de "repouso" (rajada de
 *    quadros sem a câmera andar, como a chegada de tiles). Cada classe fecha janelas de amostras.
 * 3. Histerese: uma janela é lenta, rápida ou neutra. Descer exige `STEP_DOWN_WINDOWS` janelas lentas SEGUIDAS;
 *    subir exige `STEP_UP_WINDOWS` rápidas seguidas; a zona neutra zera as duas contagens. Sempre um nível por vez,
 *    nunca para o 2D, com `SETTLE_FRAMES` quadros descartados depois de cada troca.
 * 4. Sem oscilação: se uma subida é seguida de uma descida, o perfil de onde se desceu fica vetado até o app fechar.
 */

/** Quadros seguidos sem tile em carregamento para considerar o globo aquecido. */
export const WARMUP_QUIET_FRAMES = 30;
/** Quadros descartados depois de uma troca de perfil (os tiles são reorganizados e o cache pode encolher). */
export const SETTLE_FRAMES = 20;

/** Menor intervalo contado como quadro (abaixo disso são dois desenhos no mesmo ciclo). */
export const MIN_FRAME_MS = 2;
/** Maior intervalo contado: acima disso houve pausa (subtela, app em segundo plano), não lentidão. */
export const MAX_FRAME_MS = 1000;
/** Fora do movimento, só intervalos até este valor contam (rajada de quadros); o resto é ocioso entre pedidos. */
export const MAX_BURST_GAP_MS = 120;

/** Uma janela de movimento fecha com este número de amostras (~1 s a 60 qps)… */
export const MOVING_WINDOW_SAMPLES = 60;
/** …e uma de repouso com este (rajadas curtas). */
export const REST_WINDOW_SAMPLES = 20;
/** …ou ao acumular este tempo de quadros, para um aparelho lento não esperar minutos por uma janela. */
export const WINDOW_MAX_MS = 2000;
/** Uma janela por tempo só vale com pelo menos este número de amostras. */
export const WINDOW_MIN_SAMPLES = 10;

/** Janela de movimento lenta: mediana acima de 30 qps (33,3 ms)… */
export const SLOW_MEDIAN_MS = 33.4;
/** …ou p95 acima da meta do plano (50 ms, §3.3). */
export const SLOW_P95_MS = 50;
/** Janela de movimento rápida (candidata a subir): mediana de um quadro a 60 Hz com folga (18 ms)… */
export const FAST_MEDIAN_MS = 18;
/** …e p95 sem quedas relevantes (25 ms). */
export const FAST_P95_MS = 25;
/** Janela de repouso lenta: p95 acima de 100 ms (as "quedas > 100 ms" do plano). */
export const REST_SLOW_P95_MS = 100;

/** Janelas lentas de movimento seguidas para descer (3 janelas: 3 s a 60 qps, no máximo 6 s num aparelho lento). */
export const STEP_DOWN_WINDOWS = 3;
/** Janelas lentas de repouso seguidas para descer. */
export const STEP_DOWN_REST_WINDOWS = 3;
/** Janelas rápidas de movimento seguidas para subir (8 s de gesto contínuo: subir é bem mais exigente que descer). */
export const STEP_UP_WINDOWS = 8;

export type AutoQualityPhase = 'warming' | 'sampling';

/** O que o React alimenta, uma vez por quadro realmente desenhado. */
export interface FrameEvent {
  /** Instante do quadro, em ms (`performance.now()`); só diferenças importam. */
  atMs: number;
  /** A câmera ainda está andando (gesto ou inércia): o laço pede outro quadro. */
  moving: boolean;
  /** Há bloco de tile baixando ou na fila. */
  tilesBusy: boolean;
}

export type ChangeReason = 'movimento-lento' | 'repouso-lento' | 'folga';

export interface ProfileChange {
  from: Profile3d;
  to: Profile3d;
  reason: ChangeReason;
}

type WindowClass = 'slow' | 'fast' | 'neutral';

/** Limite em memória compartilhado pelas máquinas durante a sessão do app. */
export class AutoQualitySession {
  private ceiling = PROFILES_3D.length - 1;

  get highestAllowed(): Profile3d {
    return PROFILES_3D[this.ceiling];
  }

  banAbove(profile: Profile3d) {
    this.ceiling = Math.min(this.ceiling, PROFILES_3D.indexOf(profile));
  }
}

/** O mesmo teto é reutilizado quando o globo é desmontado e montado de novo. */
export const appAutoQualitySession = new AutoQualitySession();

/** Percentil por posto mais próximo; `sorted` crescente e não vazio. */
export function percentile(sorted: readonly number[], p: number): number {
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

/** Mediana e p95 de uma janela de intervalos (ms). */
export function windowStats(samples: readonly number[]): { median: number; p95: number } {
  const sorted = [...samples].sort((a, b) => a - b);
  return { median: percentile(sorted, 50), p95: percentile(sorted, 95) };
}

/** Classifica uma janela de movimento. */
export function classifyMovingWindow(samples: readonly number[]): WindowClass {
  const { median, p95 } = windowStats(samples);
  if (median > SLOW_MEDIAN_MS || p95 > SLOW_P95_MS) return 'slow';
  if (median <= FAST_MEDIAN_MS && p95 <= FAST_P95_MS) return 'fast';
  return 'neutral';
}

/** Classifica uma janela de repouso: só pode ser lenta ou neutra (repouso nunca autoriza subir). */
export function classifyRestWindow(samples: readonly number[]): WindowClass {
  return windowStats(samples).p95 > REST_SLOW_P95_MS ? 'slow' : 'neutral';
}

class SampleWindow {
  samples: number[] = [];
  totalMs = 0;

  constructor(private readonly size: number) {}

  push(ms: number) {
    this.samples.push(ms);
    this.totalMs += ms;
  }

  get full(): boolean {
    return (
      this.samples.length >= this.size || (this.totalMs >= WINDOW_MAX_MS && this.samples.length >= WINDOW_MIN_SAMPLES)
    );
  }

  clear() {
    this.samples = [];
    this.totalMs = 0;
  }
}

/**
 * Decide o perfil 3D automático. Mutável por dentro (um objeto por globo montado), determinística: mesma sequência de
 * eventos, mesmas trocas. O React só chama `feed` a cada quadro desenhado e `interrupt` quando o laço para.
 */
export class AutoQualityMachine {
  private current: Profile3d;
  private readonly session: AutoQualitySession;
  private phasePrivate: AutoQualityPhase = 'warming';
  private quietFrames = 0;
  private settle = 0;
  private lastAt: number | null = null;
  private lastMoving = false;
  private readonly moving = new SampleWindow(MOVING_WINDOW_SAMPLES);
  private readonly rest = new SampleWindow(REST_WINDOW_SAMPLES);
  private slowStreak = 0;
  private fastStreak = 0;
  private restSlowStreak = 0;
  private lastChange: 'up' | 'down' | null = null;
  constructor(initial: Profile3d, session: AutoQualitySession = new AutoQualitySession()) {
    this.current = initial;
    this.session = session;
  }

  get profile(): Profile3d {
    return this.current;
  }

  get phase(): AutoQualityPhase {
    return this.phasePrivate;
  }

  /** Perfil mais alto que o ajuste ainda pode escolher nesta sessão. */
  get highestAllowed(): Profile3d {
    return this.session.highestAllowed;
  }

  /** O laço de quadros parou (pausa, subtela): o próximo intervalo não é medida de desempenho. */
  interrupt() {
    this.lastAt = null;
    this.lastMoving = false;
  }

  /** Um quadro desenhado. Devolve a troca de perfil, se esta amostra a provocou. */
  feed(event: FrameEvent): ProfileChange | null {
    const previousAt = this.lastAt;
    const previousMoving = this.lastMoving;
    this.lastAt = event.atMs;
    this.lastMoving = event.moving;

    if (this.phasePrivate === 'warming') {
      this.quietFrames = event.tilesBusy ? 0 : this.quietFrames + 1;
      if (this.quietFrames >= WARMUP_QUIET_FRAMES) this.phasePrivate = 'sampling';
      return null;
    }
    if (this.settle > 0) {
      this.settle--;
      return null;
    }
    if (previousAt === null) return null;

    const dt = event.atMs - previousAt;
    if (dt < MIN_FRAME_MS || dt > MAX_FRAME_MS) return null;
    const isMoving = event.moving || previousMoving;
    if (!isMoving && dt > MAX_BURST_GAP_MS) return null;

    const window = isMoving ? this.moving : this.rest;
    window.push(dt);
    if (!window.full) return null;
    const klass = isMoving ? classifyMovingWindow(window.samples) : classifyRestWindow(window.samples);
    window.clear();
    return isMoving ? this.onMovingWindow(klass) : this.onRestWindow(klass);
  }

  private onMovingWindow(klass: WindowClass): ProfileChange | null {
    if (klass === 'slow') {
      this.slowStreak++;
      this.fastStreak = 0;
      return this.slowStreak >= STEP_DOWN_WINDOWS ? this.step('down', 'movimento-lento') : null;
    }
    this.slowStreak = 0;
    if (klass === 'neutral') {
      this.fastStreak = 0;
      return null;
    }
    this.fastStreak++;
    return this.fastStreak >= STEP_UP_WINDOWS ? this.step('up', 'folga') : null;
  }

  private onRestWindow(klass: WindowClass): ProfileChange | null {
    if (klass === 'slow') {
      this.restSlowStreak++;
      this.fastStreak = 0; // repouso com queda de quadros adia qualquer subida
      return this.restSlowStreak >= STEP_DOWN_REST_WINDOWS ? this.step('down', 'repouso-lento') : null;
    }
    this.restSlowStreak = 0;
    return null;
  }

  private step(direction: 'down' | 'up', reason: ChangeReason): ProfileChange | null {
    const from = this.current;
    const to = neighborProfile(from, direction);
    this.resetWindows();
    if (to === from) return null; // já está na ponta: nada a trocar (e nada a fazer além de continuar medindo)
    if (direction === 'up' && PROFILES_3D.indexOf(to) > PROFILES_3D.indexOf(this.session.highestAllowed)) return null;
    if (direction === 'down' && this.lastChange === 'up') {
      // A subida não se sustentou: o perfil de onde se desceu fica vetado até o app fechar.
      this.session.banAbove(to);
    }
    this.current = to;
    this.lastChange = direction;
    this.settle = SETTLE_FRAMES;
    return { from, to, reason };
  }

  private resetWindows() {
    this.moving.clear();
    this.rest.clear();
    this.slowStreak = 0;
    this.fastStreak = 0;
    this.restSlowStreak = 0;
  }
}
