import * as THREE from 'three';
import { createRoot, extend, unmountComponentAtNode, type CanvasProps } from '@react-three/fiber/native';
import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { GLView } from 'expo-gl';
import { PixelRatio, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

// Every createRoot must see the native Three catalogue before its first render.
extend(THREE as any);

type GLContext =
  NonNullable<ComponentProps<typeof GLView>['onContextCreate']> extends (context: infer T) => void ? T : never;

type NativeGlobeCanvasProps = Pick<CanvasProps, 'camera' | 'children' | 'flat' | 'frameloop' | 'linear'> & {
  onContextFailure?: (error: Error) => void;
  style?: StyleProp<ViewStyle>;
};

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

class NativeSceneBoundary extends Component<
  { children: ReactNode; onFailure: (error: Error) => void },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onFailure(error);
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Expo GL's context can fail in its native surface callback before R3F's Canvas can report an error. */
class RecoverableGLView extends GLView {
  private contextFailureHandler?: (error: Error) => void;

  constructor(props: ConstructorParameters<typeof GLView>[0]) {
    super(props);
    const onSurfaceCreate = this._onSurfaceCreate.bind(this);
    this._onSurfaceCreate = (event) => {
      try {
        onSurfaceCreate(event);
      } catch (error) {
        this.contextFailureHandler?.(toError(error));
      }
    };
  }

  setContextFailureHandler(handler: (error: Error) => void): void {
    this.contextFailureHandler = handler;
  }
}

/** Minimal native R3F canvas that owns GLView so context creation errors can reach the map fallback. */
export function NativeGlobeCanvas({
  camera,
  children,
  flat,
  frameloop,
  linear,
  onContextFailure,
  style,
}: NativeGlobeCanvasProps) {
  const [size, setSize] = useState({ width: 0, height: 0, top: 0, left: 0 });
  const [context, setContext] = useState<GLContext | null>(null);
  const [unhandledError, setUnhandledError] = useState<Error | null>(null);
  const root = useRef<ReturnType<typeof createRoot> | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);

  const reportFailure = useCallback(
    (value: unknown) => {
      const error = toError(value);
      if (onContextFailure) onContextFailure(error);
      else setUnhandledError(error);
    },
    [onContextFailure],
  );

  if (unhandledError) throw unhandledError;

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height, x, y } = event.nativeEvent.layout;
    setSize({ width, height, top: y, left: x });
  }, []);

  const onContextCreate = useCallback(
    (gl: GLContext) => {
      try {
        const listeners = new Map<string, EventListener[]>();
        const surface = {
          style: {},
          width: gl.drawingBufferWidth,
          height: gl.drawingBufferHeight,
          clientWidth: gl.drawingBufferWidth,
          clientHeight: gl.drawingBufferHeight,
          getContext: () => gl,
          addEventListener(type: string, listener: EventListener) {
            const callbacks = listeners.get(type) ?? [];
            callbacks.push(listener);
            listeners.set(type, callbacks);
          },
          removeEventListener(type: string, listener: EventListener) {
            const callbacks = listeners.get(type);
            if (!callbacks) return;
            const index = callbacks.indexOf(listener);
            if (index !== -1) callbacks.splice(index, 1);
          },
          dispatchEvent(event: Event) {
            Object.assign(event, { target: surface });
            for (const callback of listeners.get(event.type) ?? []) callback(event);
          },
          setPointerCapture() {},
          releasePointerCapture() {},
        } as unknown as HTMLCanvasElement;
        (surface as unknown as { ownerDocument: Document }).ownerDocument = surface as unknown as Document;
        surface.getRootNode = () => surface;

        canvas.current = surface;
        root.current = createRoot<HTMLCanvasElement>(surface);
        setContext(gl);
      } catch (error) {
        reportFailure(error);
      }
    },
    [reportFailure],
  );

  const setGlViewRef = useCallback(
    (view: RecoverableGLView | null) => view?.setContextFailureHandler(reportFailure),
    [reportFailure],
  );

  useEffect(() => {
    const activeRoot = root.current;
    if (!activeRoot || !context || size.width <= 0 || size.height <= 0) return;

    let cancelled = false;
    void activeRoot
      .configure({
        camera,
        dpr: PixelRatio.get(),
        flat,
        frameloop,
        linear,
        size,
        onCreated: (state) => {
          const gl = state.gl.getContext() as GLContext;
          const renderFrame = state.gl.render.bind(state.gl);
          state.gl.render = (scene, activeCamera) => {
            renderFrame(scene, activeCamera);
            gl.endFrameEXP();
          };
        },
      })
      .then(() => {
        if (!cancelled) {
          activeRoot.render(
            <NativeSceneBoundary onFailure={reportFailure}>
              <Suspense fallback={null}>{children}</Suspense>
            </NativeSceneBoundary>,
          );
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) reportFailure(error);
      });

    return () => {
      cancelled = true;
    };
  }, [camera, children, context, flat, frameloop, linear, reportFailure, size]);

  useEffect(
    () => () => {
      if (canvas.current) unmountComponentAtNode(canvas.current);
      root.current = null;
      canvas.current = null;
    },
    [],
  );

  return (
    <View onLayout={onLayout} style={[styles.root, style]}>
      {size.width > 0 && (
        <RecoverableGLView ref={setGlViewRef} onContextCreate={onContextCreate} style={StyleSheet.absoluteFill} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
