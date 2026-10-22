import { Canvas, useThree } from './r3f';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View, type ViewInstance } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AutoQualityMachine } from './autoQuality';
import type { ClimateMapData } from './climateTexture';
import { CAMERA } from './config';
import { GlobeController } from './controller';
import type { LabelInsets } from './GlobeLabels';
import { GlobeScene, type SceneFrame, type SceneStats } from './GlobeScene';
import type { Rect } from './labels';
import type { GlobeMarker } from './markers';
import { budgetOf, DEFAULT_PROFILE_3D, type Profile3d } from './qualityProfiles';
import { findUf, ufBySigla, type Uf } from './ufs';
import { DEFAULT_DAY_TIME, type SkyInput } from './visualClock';

const BRASIL_VIEW = { lon: -52, lat: -14, altitude: 0.75 };
/** Altitude da câmera ao ir até uma UF. */
const UF_ALTITUDE = 0.08;

/** Comandos de câmera que a mesa recebe para o globo (lista de estados e botão Centralizar). */
export interface GlobeApi {
  flyToUf: (sigla: string) => void;
  reset: () => void;
}

/** Perfil de qualidade 3D do globo (Configurações → Mapa). */
export interface GlobeQuality {
  /** Perfil cujos tetos (cache, LOD, nível, DPR) o globo obedece. Pode mudar com o globo montado. */
  profile: Profile3d;
  /** Escolha automática: o globo mede os quadros depois de aquecer e avisa por `onAutoProfile` quando troca de perfil. */
  auto: boolean;
  onAutoProfile?: (profile: Profile3d) => void;
}

const DEFAULT_QUALITY: GlobeQuality = { profile: DEFAULT_PROFILE_3D, auto: false };

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
  /** Áreas do HUD (px da tela) onde nenhuma sigla ou capital pode tocar: botões, doca, barra do topo. */
  reservedRects?: readonly Rect[];
  /** Faixas da tela onde um rótulo não cabe por inteiro (área segura + barras do HUD). Padrão: área segura. */
  labelInsets?: LabelInsets;
  /** Tamanho dos rótulos: `labelScale(textScale)`. Padrão 1. */
  labelScale?: number;
  /** Perfil de qualidade; padrão: Equilibrado fixo (os tetos atuais do globo). */
  quality?: GlobeQuality;
  /** Dia e noite: a escolha da hora do dia e o mês do calendário do jogo (estação). Padrão: tarde, janeiro. */
  sky?: SkyInput;
  /** Clima do mês (seca nos tiles e nuvens). Sem ele (sem partida) não há seca nem nuvens. */
  climate?: ClimateMapData | null;
  /** "Nuvens" de Configurações (padrão: ligadas); o perfil de qualidade pode não as permitir (Econômico). */
  clouds?: boolean;
  /** Marcadores de eventos e notícias (um por UF), no mesmo atlas e na mesma chamada de desenho dos rótulos. */
  markers?: readonly GlobeMarker[];
  /** Muda quando há marcador novo e crítico para pulsar (pulso breve que para sozinho); vazio = nenhum. */
  pulseKey?: string;
  /** Toque num marcador (a sigla da UF dele): tem prioridade sobre a seleção da UF. */
  onMarkerPress?: (sigla: string) => void;
}

const NO_RECTS: readonly Rect[] = [];
const NO_MARKERS: readonly GlobeMarker[] = [];

/** Sem `sky`: hora fixa padrão (tarde) em janeiro. */
const DEFAULT_SKY: SkyInput = { setting: DEFAULT_DAY_TIME, month: 1 };

/** Ao despausar o laço sob demanda não tem quadro pedido: invalida um para o globo reaparecer sem esperar um gesto. */
function ResumeOnUnpause({ paused }: { paused: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!paused) invalidate();
  }, [paused, invalidate]);
  return null;
}

/** O globo da federação: câmera, toques e o mapa de calor; quem usa controla a seleção (`selectedId`/`onSelect`). */
export function GlobeView({
  fills,
  selectedId,
  onSelect,
  onReady,
  paused = false,
  reservedRects = NO_RECTS,
  labelInsets,
  labelScale = 1,
  quality = DEFAULT_QUALITY,
  sky = DEFAULT_SKY,
  climate = null,
  clouds = true,
  markers = NO_MARKERS,
  pulseKey = '',
  onMarkerPress,
}: GlobeViewProps) {
  const controller = useMemo(() => new GlobeController(), []);
  const insets = useSafeAreaInsets();
  const sceneInsets = useMemo<LabelInsets>(
    () => labelInsets ?? { top: insets.top, right: insets.right, bottom: insets.bottom, left: insets.left },
    [labelInsets, insets.top, insets.right, insets.bottom, insets.left],
  );
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
  const budget = budgetOf(quality.profile);
  // O Canvas nativo (expo-gl) fixa a razão de pixels do aparelho e nem tem a prop `dpr`; o teto do perfil vale na web.
  const canvasDpr = Platform.OS === 'web' ? { dpr: [1, budget.dprCap] as [number, number] } : undefined;

  // Ajuste automático: a máquina vive fora do React e só avisa quando troca de perfil (nunca `setState` por quadro).
  // Os valores mais recentes entram por refs; o efeito de atribuição vem antes do que cria a máquina.
  const latest = useRef(quality);
  useEffect(() => {
    latest.current = quality;
  });
  const machine = useRef<AutoQualityMachine | null>(null);
  const autoOn = quality.auto;
  useEffect(() => {
    machine.current = autoOn ? new AutoQualityMachine(latest.current.profile) : null;
    return () => {
      machine.current = null;
    };
  }, [autoOn]);
  useEffect(() => {
    if (paused) machine.current?.interrupt(); // o intervalo depois de uma pausa não mede desempenho
  }, [paused]);
  const onFrame = useCallback((frame: SceneFrame) => {
    const change = machine.current?.feed(frame);
    if (change) latest.current.onAutoProfile?.(change.to);
  }, []);

  // Último toque num marcador (a sigla da UF; o contador distingue dois toques seguidos no mesmo).
  const [markerTap, setMarkerTap] = useState<{ sigla: string | null; n: number }>({ sigla: null, n: 0 });
  useEffect(() => {
    if (markerTap.sigla !== null) onMarkerPress?.(markerTap.sigla);
    // só reage ao toque, não a uma nova função `onMarkerPress`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerTap]);

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
        // Marcador primeiro: tocar nele abre o alerta/jornal e não seleciona a UF.
        const marker = controller.pickMarker(e.x, e.y);
        if (marker) {
          setMarkerTap((t) => ({ sigla: marker, n: t.n + 1 }));
          return;
        }
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
              {...canvasDpr}
              flat
              linear
              camera={{ fov: CAMERA.fovDeg, near: 0.001, far: 120, position: [0, 0, 3] }}>
              <ResumeOnUnpause paused={paused} />
              <GlobeScene
                controller={controller}
                selectedUf={selected}
                fills={fills}
                onStats={__DEV__ ? setStats : undefined}
                reservedRects={reservedRects}
                labelInsets={sceneInsets}
                labelScale={labelScale}
                budget={budget}
                onFrame={autoOn ? onFrame : undefined}
                sky={sky}
                climate={climate}
                clouds={clouds}
                drawing={!paused}
                markers={markers}
                pulseKey={pulseKey}
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
