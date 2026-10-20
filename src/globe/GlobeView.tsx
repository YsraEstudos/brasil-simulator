import { Canvas, useThree } from './r3f';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View, type ViewInstance } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CAMERA } from './config';
import { GlobeController } from './controller';
import { GlobeScene, type SceneStats } from './GlobeScene';
import { findUf, ufBySigla, type Uf } from './ufs';

const BRASIL_VIEW = { lon: -52, lat: -14, altitude: 0.75 };
/** Altitude da câmera ao ir até uma UF. */
const UF_ALTITUDE = 0.08;

/** Comandos de câmera que a mesa recebe para o globo (lista de estados e botão Centralizar). */
export interface GlobeApi {
  flyToUf: (sigla: string) => void;
  reset: () => void;
}

export interface GlobeViewProps {
  /** Cor de cada UF no mapa de calor (sigla → hex). */
  fills?: Readonly<Record<string, string>> | null;
  /** UF selecionada (sigla): a seleção é controlada por quem usa o globo (a mesa do Painel). */
  selectedId: string | null;
  /** Toque no globo: a UF tocada (ou `null` no oceano), para quem usa o globo decidir o que fazer. */
  onSelect: (sigla: string | null) => void;
  onReady?: (api: GlobeApi) => void;
  /**
   * Pausa o desenho (`frameloop="never"`): a tela perdeu o foco (há uma subtela por cima do Painel) e o Canvas não
   * deve gastar GPU. A câmera, a seleção e os tiles ficam como estão; ao despausar o globo desenha um quadro na hora.
   */
  paused?: boolean;
}

/** Ao despausar o laço sob demanda não tem quadro pedido: invalida um para o globo reaparecer sem esperar um gesto. */
function ResumeOnUnpause({ paused }: { paused: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!paused) invalidate();
  }, [paused, invalidate]);
  return null;
}

/** O globo da federação: câmera, toques e o mapa de calor; quem usa controla a seleção (`selectedId`/`onSelect`). */
export function GlobeView({ fills, selectedId, onSelect, onReady, paused = false }: GlobeViewProps) {
  const controller = useMemo(() => new GlobeController(), []);
  const insets = useSafeAreaInsets();
  // Último toque no globo (o contador distingue dois toques seguidos na mesma UF).
  const [tap, setTap] = useState<{ uf: Uf | null; n: number }>({ uf: null, n: 0 });
  const selected = selectedId ? (ufBySigla(selectedId) ?? null) : null;

  useEffect(() => {
    if (tap.n > 0) onSelect(tap.uf?.sigla ?? null);
    // só reage ao toque, não a uma nova função `onSelect`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tap]);

  useEffect(() => {
    onReady?.({
      flyToUf: (sigla) => {
        const uf = ufBySigla(sigla);
        if (uf) controller.flyTo({ lon: uf.centroid[0], lat: uf.centroid[1], altitude: UF_ALTITUDE });
      },
      reset: () => controller.flyTo(BRASIL_VIEW),
    });
    // só na montagem: o controlador não muda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller]);
  const [stats, setStats] = useState<SceneStats | null>(null);
  const container = useRef<ViewInstance>(null);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .runOnJS(true)
      .maxPointers(1)
      .onBegin(() => controller.stop())
      .onChange((e) => controller.panBy(e.changeX, e.changeY))
      .onEnd((e) => controller.release(e.velocityX, e.velocityY));
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onBegin(() => controller.pinchBegin())
      .onUpdate((e) => controller.pinch(e.scale));
    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((e) => {
        const p = controller.pick(e.x, e.y);
        const uf = p ? findUf(p.lon, p.lat) : null;
        setTap((t) => ({ uf, n: t.n + 1 }));
      });
    const doubleTap = Gesture.Tap()
      .runOnJS(true)
      .numberOfTaps(2)
      .onEnd((e) => {
        const p = controller.pick(e.x, e.y);
        if (p) controller.flyTo({ ...p, altitude: controller.state.altitude / 2.5 }, 0.8);
      });
    return Gesture.Race(Gesture.Simultaneous(pan, pinch), Gesture.Exclusive(doubleTap, tap));
  }, [controller]);

  // Roda do mouse na web (desenvolvimento)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = container.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      controller.zoomBy(Math.exp(ev.deltaY * 0.0015));
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [controller]);

  return (
    <View style={styles.root}>
      <GestureDetector gesture={gesture}>
        <View ref={container} style={styles.canvas} collapsable={false}>
          {/* No nativo o Canvas do R3F cobre o GLView com um PanResponder que captura todos os toques e
              os rouba do GestureDetector. Não usamos eventos de ponteiro do R3F (o pick é nosso), então
              o Canvas fica fora do hit-test e os toques chegam ao container. */}
          <View style={styles.canvas} pointerEvents={Platform.OS === 'web' ? 'auto' : 'none'}>
            <Canvas
              frameloop={paused ? 'never' : 'demand'}
              flat
              linear
              camera={{ fov: CAMERA.fovDeg, near: 0.001, far: 120, position: [0, 0, 3] }}>
              <ResumeOnUnpause paused={paused} />
              <GlobeScene
                controller={controller}
                selectedUf={selected}
                fills={fills}
                onStats={__DEV__ ? setStats : undefined}
              />
            </Canvas>
          </View>
        </View>
      </GestureDetector>

      {stats && (
        <Text style={[styles.stats, { top: insets.top + 52, left: 16 + insets.left }]} pointerEvents="none">
          tiles {stats.tiles} · cache {stats.cached} · nível {stats.maxLevel}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05070f' },
  canvas: { flex: 1 },
  stats: { position: 'absolute', color: '#7f8aa3', fontSize: 11 },
});
