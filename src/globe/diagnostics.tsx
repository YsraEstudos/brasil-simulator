import { useEffect, useRef } from 'react';

import { useFrame, useThree } from './r3f';

/** Motivo de falha gráfica avisado a quem usa o globo (para cair no mapa 2D, por exemplo). */
export type GlFailureReason = 'context-lost' | 'init-error';
export type GlFailureHandler = (reason: GlFailureReason, detail?: string) => void;

type Listenable = {
  addEventListener?: (type: string, fn: (ev: unknown) => void, opts?: unknown) => void;
  removeEventListener?: (type: string, fn: (ev: unknown) => void) => void;
};

/**
 * Avisa falhas gráficas, sem mudar o desenho:
 * - erro de compilação/link de shader (`gl.debug.onShaderError`) -> `init-error`;
 * - perda de contexto (`webglcontextlost` no canvas) -> `context-lost`. Só na web: o expo-gl nativo não expõe
 *   evento de perda de contexto (a `GLView` nativa não tem `onContextLost`); consulta-se `isContextLost` quando há frame.
 */
export function GlFailureWatcher({ onFailure }: { onFailure?: GlFailureHandler }) {
  const gl = useThree((s) => s.gl);
  const ref = useRef(onFailure);
  useEffect(() => {
    ref.current = onFailure;
  }, [onFailure]);

  useFrame(() => {
    if (gl.getContext().isContextLost()) ref.current?.('context-lost');
  });

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
