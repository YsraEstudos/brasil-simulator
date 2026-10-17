import { Canvas } from './r3f';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type ViewInstance } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CAMERA } from './config';
import type { CameraState } from './camera';
import { clampCamera } from './camera';
import { GlobeController } from './controller';
import { GlobeScene, type SceneStats } from './GlobeScene';
import { findUf, ufBySigla, type Uf } from './ufs';

const BRASIL_VIEW = { lon: -52, lat: -14, altitude: 0.75 };
/** Altitude da câmera ao ir até uma UF. */
const UF_ALTITUDE = 0.08;

export interface GlobeViewProps {
  initial?: CameraState;
  /** Cor de cada UF no mapa de calor (sigla → hex). */
  fills?: Readonly<Record<string, string>> | null;
  /**
   * UF selecionada (sigla). Com `onSelect`, a seleção é controlada por quem usa o globo e o cartão padrão some;
   * sem ele, o globo mostra o próprio cartão da UF tocada.
   */
  selectedId?: string | null;
  onSelect?: (sigla: string | null) => void;
  /** Recebe a função que leva a câmera até uma UF (lista da aba Brasil). */
  onReady?: (api: { flyToUf: (sigla: string) => void }) => void;
  /** Cabeçalho interno (título "Brasil" + botão Centralizar). `false` deixa o globo limpo para a mesa do Painel. */
  chrome?: boolean;
  /** Camadas da interface por cima do globo (legenda, cartão, lista). */
  children?: ReactNode;
}

export function GlobeView({ initial, fills, selectedId, onSelect, onReady, chrome = true, children }: GlobeViewProps) {
  const controller = useMemo(() => {
    const c = new GlobeController();
    if (initial) c.state = clampCamera(initial);
    return c;
    // a câmera inicial só vale na montagem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const insets = useSafeAreaInsets();
  // Último toque no globo (o contador distingue dois toques seguidos na mesma UF).
  const [tap, setTap] = useState<{ uf: Uf | null; n: number }>({ uf: null, n: 0 });
  const controlled = onSelect !== undefined;
  const selected = controlled ? (selectedId ? (ufBySigla(selectedId) ?? null) : null) : tap.uf;

  useEffect(() => {
    if (controlled && tap.n > 0) onSelect?.(tap.uf?.sigla ?? null);
    // só reage ao toque, não a uma nova função `onSelect`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tap]);

  useEffect(() => {
    onReady?.({
      flyToUf: (sigla) => {
        const uf = ufBySigla(sigla);
        if (uf) controller.flyTo({ lon: uf.centroid[0], lat: uf.centroid[1], altitude: UF_ALTITUDE });
      },
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
              frameloop="demand"
              flat
              linear
              camera={{ fov: CAMERA.fovDeg, near: 0.001, far: 120, position: [0, 0, 3] }}>
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

      {chrome && (
        <View
          pointerEvents="box-none"
          style={[
            styles.top,
            { paddingTop: insets.top + 8, paddingLeft: 16 + insets.left, paddingRight: 16 + insets.right },
          ]}>
          <Text style={styles.title}>Brasil</Text>
          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
            onPress={() => controller.flyTo(BRASIL_VIEW)}
            accessibilityRole="button"
            accessibilityLabel="Centralizar no Brasil">
            <Text style={styles.buttonText}>Centralizar</Text>
          </Pressable>
        </View>
      )}

      {children}

      {!controlled && selected && (
        <View style={[styles.card, { left: 16 + insets.left, right: 16 + insets.right }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>
              {selected.nome} <Text style={styles.cardSigla}>{selected.sigla}</Text>
            </Text>
            <Text style={styles.cardSub}>Região {selected.regiao}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
            onPress={() =>
              controller.flyTo({ lon: selected.centroid[0], lat: selected.centroid[1], altitude: UF_ALTITUDE })
            }>
            <Text style={styles.buttonText}>Ir</Text>
          </Pressable>
        </View>
      )}

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
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { color: '#f4f1e8', fontSize: 22, fontWeight: '700', letterSpacing: 0.5 },
  button: {
    backgroundColor: 'rgba(20, 28, 48, 0.85)',
    borderColor: 'rgba(255, 226, 122, 0.5)',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pressed: { opacity: 0.7 },
  buttonText: { color: '#ffe27a', fontWeight: '600' },
  card: {
    position: 'absolute',
    bottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(12, 18, 32, 0.92)',
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
  },
  cardTitle: { color: '#f4f1e8', fontSize: 18, fontWeight: '700' },
  cardSigla: { color: '#ffe27a', fontSize: 14, fontWeight: '600' },
  cardSub: { color: '#a9b1c3', marginTop: 2 },
  stats: { position: 'absolute', color: '#7f8aa3', fontSize: 11 },
});
