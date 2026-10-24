import { useEffect, useRef } from 'react';

import { FrameStats } from './frameStats';
import { useFrame, useThree } from './r3f';

/** Motivo de falha gráfica avisado a quem usa o globo (para cair no mapa 2D, por exemplo). */
export type GlFailureReason = 'context-lost' | 'init-error';
export type GlFailureHandler = (reason: GlFailureReason, detail?: string) => void;

/** Medidas publicadas ao contador de desempenho (texturas e geometrias são contagens, não VRAM). */
export interface GlobePerf {
  samples: number;
  p50: number;
  p95: number;
  p99: number;
  fps: number;
  longFrames: number;
  calls: number;
  triangles: number;
  programs: number;
  textures: number;
  geometries: number;
}

/** Intervalo máximo (ms) entre publicações do contador: ~2 por segundo, e só se algum valor mudou. */
export const PERF_PUBLISH_MS = 500;

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Mede só os quadros realmente desenhados (o laço é `demand`). Sem setState por quadro: agrega em refs e publica
 * no máximo 2×/s, apenas quando algum valor mudou. Não desenha nem pede quadros.
 */
export function GlobePerfProbe({ onPerf }: { onPerf: (p: GlobePerf) => void }) {
  const gl = useThree((s) => s.gl);
  const stats = useRef(new FrameStats());
  const info = useRef({ calls: 0, triangles: 0 });
  const dirty = useRef(false);
  const onPerfRef = useRef(onPerf);
  useEffect(() => {
    onPerfRef.current = onPerf;
  }, [onPerf]);

  // Prioridade 0: não assume o desenho (prioridade > 0 desligaria o render automático do R3F).
  useFrame(() => {
    // `info.render` ainda guarda o quadro anterior (reinicia a cada render): uma defasagem de um quadro, aceitável.
    info.current.calls = gl.info.render.calls;
    info.current.triangles = gl.info.render.triangles;
    stats.current.push(performance.now());
    dirty.current = true;
  });

  useEffect(() => {
    let lastKey = '';
    const id = setInterval(() => {
      if (!dirty.current) return;
      dirty.current = false;
      const s = stats.current.summary();
      const perf: GlobePerf = {
        ...s,
        p50: round1(s.p50),
        p95: round1(s.p95),
        p99: round1(s.p99),
        fps: round1(s.fps),
        calls: info.current.calls,
        triangles: info.current.triangles,
        programs: gl.info.programs?.length ?? 0,
        textures: gl.info.memory.textures,
        geometries: gl.info.memory.geometries,
      };
      const key = JSON.stringify(perf);
      if (key === lastKey) return;
      lastKey = key;
      onPerfRef.current(perf);
    }, PERF_PUBLISH_MS);
    return () => clearInterval(id);
  }, [gl]);

  return null;
}

type Listenable = {
  addEventListener?: (type: string, fn: (ev: unknown) => void, opts?: unknown) => void;
  removeEventListener?: (type: string, fn: (ev: unknown) => void) => void;
};

/**
 * Avisa falhas gráficas, sem mudar o desenho:
 * - erro de compilação/link de shader (`gl.debug.onShaderError`) -> `init-error`;
 * - perda de contexto (`webglcontextlost` no canvas) -> `context-lost`. Só na web: o expo-gl nativo não expõe
 *   evento de perda de contexto (a `GLView` nativa não tem `onContextLost`); lá só `init-error` é coberto.
 */
export function GlFailureWatcher({ onFailure }: { onFailure?: GlFailureHandler }) {
  const gl = useThree((s) => s.gl);
  const ref = useRef(onFailure);
  useEffect(() => {
    ref.current = onFailure;
  }, [onFailure]);

  useEffect(() => {
    const prevCheck = gl.debug.checkShaderErrors;
    const prevHandler = gl.debug.onShaderError;
    gl.debug.checkShaderErrors = true; // padrão do three; explícito porque o gancho abaixo depende disso
    gl.debug.onShaderError = (ctx, program, vs, fs) => {
      const detail = [ctx.getProgramInfoLog(program), ctx.getShaderInfoLog(vs), ctx.getShaderInfoLog(fs)]
        .filter(Boolean)
        .join(' | ');
      if (__DEV__) console.warn('globo: erro de shader', detail);
      ref.current?.('init-error', detail || undefined);
    };

    const el = gl.domElement as unknown as Listenable | undefined;
    const onLost = (ev: unknown) => {
      (ev as { preventDefault?: () => void } | null)?.preventDefault?.();
      if (__DEV__) console.warn('globo: contexto WebGL perdido');
      ref.current?.('context-lost');
    };
    el?.addEventListener?.('webglcontextlost', onLost);

    return () => {
      gl.debug.checkShaderErrors = prevCheck;
      gl.debug.onShaderError = prevHandler;
      el?.removeEventListener?.('webglcontextlost', onLost);
    };
  }, [gl]);

  return null;
}
