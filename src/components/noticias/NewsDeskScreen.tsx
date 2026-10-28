import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';

import { Hud } from '@/components/painel/hudTheme';
import { BackToPainelButton } from '@/components/painel/SubScreen';
import { activeInstitutionalMarks, pressureBand } from '@/components/tabs/institutionsView';
import { NoCampaign } from '@/components/tabs/NoCampaign';
import { Alert } from '@/components/ui';
import { loadContent } from '@/content';
import { formatEventText, headlines, impeachmentPressure, moduleEnabled } from '@/engine';
import { Canvas } from '@/globe/r3f';
import { useGame, type ActiveCampaign } from '@/store';

import { deskLayout, DESK_FOV } from './deskCamera';
import { newspaperRect, rectStyle, socialScreenRect } from './deskOverlay';
import { DeskScene, type DeskGoal } from './DeskScene';
import { Newspaper } from './Newspaper';
import { buildEditions } from './newspaperView';
import { buildSocialFeed } from './socialFeed';
import { SocialScreen } from './SocialScreen';

/**
 * Onde está o olhar: na mesa, a caminho do notebook, no notebook, apagando a tela das redes (`saindo`) ou com a
 * câmera voltando para a mesa.
 */
type Mode = 'mesa' | 'indo' | 'pc' | 'saindo' | 'voltando';

/** Subtela Notícias (GAME_DESIGN.md §12–§13): carregamento, partida ausente ou a mesa de notícias. */
export function NewsDeskScreen() {
  const status = useGame((s) => s.status);
  const error = useGame((s) => s.error);
  const active = useGame((s) => s.active);
  const insets = useSafeAreaInsets();

  if (status === 'iniciando' || !active) {
    return (
      <View style={[styles.center, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
        {status === 'iniciando' ? <ActivityIndicator color={Hud.title} size="large" /> : <NoCampaign />}
        {error && <Alert tone="negative" title="Algo deu errado ao salvar ou carregar" message={error} />}
        <View
          pointerEvents="box-none"
          style={[styles.backButton, { top: insets.top + BACK_MARGIN, left: insets.left + BACK_MARGIN }]}>
          <BackToPainelButton />
        </View>
      </View>
    );
  }
  // key: trocar de partida recomeça a mesa (jornal na edição mais recente, câmera na entrada).
  return <NewsDesk key={active.id} campaign={active} error={error} />;
}

/**
 * A mesa: cena 3D ao fundo, o jornal da interface "deitado" sobre ela e o notebook. Tocar o notebook leva a
 * câmera até a tela, onde as redes sociais aparecem; voltar faz o caminho inverso. Os textos ficam na
 * interface nativa (nítidos e acessíveis); o 3D é o cenário e o movimento de câmera.
 */
function NewsDesk({ campaign, error }: { campaign: ActiveCampaign; error: string | null | undefined }) {
  const { state, lastReport } = campaign;
  const insets = useSafeAreaInsets();
  const content = useMemo(() => loadContent(state.scenarioId), [state.scenarioId]);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [mode, setMode] = useState<Mode>('mesa');
  // Notícia aberta pelo marcador do mapa (rota `/noticias?noticia=<id>`): o jornal abre nela.
  const { noticia } = useLocalSearchParams<{ noticia?: string }>();

  const feed = state.events.news;
  // Módulo de notícias desligado nesta campanha: sem edição nova nunca, e os vazios explicam isso.
  const newsOff = !moduleEnabled(state, 'noticias');
  const editions = useMemo(() => buildEditions(feed), [feed]);
  const characters = useMemo(() => content.scenario.characters ?? [], [content]);
  const posts = useMemo(
    () =>
      buildSocialFeed(
        feed,
        characters.map((c) => ({ ...c, standing: state.events.characters[c.id] ?? c.initialStanding })),
        state.indicators.approval,
        state.monthIndex,
      ),
    [feed, characters, state.events.characters, state.indicators.approval, state.monthIndex],
  );
  // Memorizados: trocar de modo (mesa ↔ notebook) não refaz o jornal no meio da viagem da câmera.
  const summary = useMemo(() => (lastReport ? headlines(lastReport, content) : []), [lastReport, content]);
  const pressure = useMemo(() => impeachmentPressure(state, content), [state, content]);
  const marks = useMemo(() => activeInstitutionalMarks(state.events.flags), [state.events.flags]);
  const pending = useMemo(
    () =>
      state.events.pending.map((p) => ({
        key: p.instanceId,
        title: formatEventText(content.events.find((e) => e.id === p.eventId)?.title ?? p.eventId, p.location, content),
        monthIndex: p.monthIndex,
      })),
    [state.events.pending, content],
  );
  // As redes são montadas escondidas logo depois da entrada: ao chegar no notebook só falta acendê-las.
  const [socialMounted, setSocialMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSocialMounted(true), SOCIAL_PREMOUNT_MS);
    return () => clearTimeout(t);
  }, []);

  const layout = useMemo(() => (size ? deskLayout(size.width, size.height) : null), [size]);
  const poses = useMemo(() => (layout ? { desk: layout.desk, pc: layout.pc } : null), [layout]);
  const goal: DeskGoal = mode === 'indo' || mode === 'pc' || mode === 'saindo' ? 'pc' : 'mesa';
  // O jornal só fica "vivo" (camadas normais, rolagem barata) parado na mesa; em movimento vira textura de GPU.
  const [paperResting, setPaperResting] = useState(false);
  const paperMoving = mode !== 'mesa' || !paperResting;
  useEffect(() => {
    if (mode !== 'mesa') return;
    const t = setTimeout(() => setPaperResting(true), PAPER_SETTLE_MS);
    return () => clearTimeout(t);
  }, [mode]);

  // Animações da interface (thread de UI): jornal entra/sai, redes "ligam", anel pulsando no notebook.
  const paper = useSharedValue(0);
  const social = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    paper.set(withDelay(650, withSpring(1, { damping: 16, stiffness: 90, mass: 0.9 })));
  }, [paper]);

  // O anel do notebook pulsa algumas vezes ao chegar na mesa e para (sem animação eterna gastando bateria).
  useEffect(() => {
    if (mode !== 'mesa') return;
    pulse.set(
      withSequence(
        withTiming(0, { duration: 0 }),
        withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), PULSES, false),
      ),
    );
    return () => cancelAnimation(pulse);
  }, [mode, pulse]);

  const openPc = () => {
    if (mode !== 'mesa') return;
    setSocialMounted(true);
    setPaperResting(false);
    paper.set(withTiming(0, { duration: 420, easing: Easing.in(Easing.cubic) }));
    setMode('indo');
  };

  // Temporizadores da troca de modo, limpos ao desmontar.
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(leaveTimer.current);
      clearTimeout(fadeTimer.current);
    },
    [],
  );
  // A tela das redes vira textura de GPU só enquanto acende ou apaga.
  const [socialFading, setSocialFading] = useState(false);

  const backToDesk = useCallback(() => {
    // Ainda a caminho do notebook: a câmera dá meia-volta de onde estiver (as redes nem acenderam).
    if (mode === 'indo') {
      setMode('voltando');
      return;
    }
    // Só sai do notebook uma vez: toques repetidos durante `saindo` não reiniciam nada.
    if (mode !== 'pc') return;
    setMode('saindo');
    social.set(withTiming(0, { duration: 220, easing: Easing.in(Easing.quad) }));
    leaveTimer.current = setTimeout(() => setMode('voltando'), 160);
  }, [mode, social]);

  const onArrive = useCallback(
    (at: DeskGoal) => {
      if (at === 'pc') {
        setMode((m) => (m === 'indo' ? 'pc' : m));
        setSocialFading(true);
        clearTimeout(fadeTimer.current);
        fadeTimer.current = setTimeout(() => setSocialFading(false), SOCIAL_FADE_MS + 40);
        social.set(withTiming(1, { duration: SOCIAL_FADE_MS, easing: Easing.out(Easing.cubic) }));
      } else {
        setMode((m) => (m === 'voltando' ? 'mesa' : m));
        paper.set(withSpring(1, { damping: 16, stiffness: 110 }));
      }
    },
    [paper, social],
  );

  // Botão voltar do Android: do notebook (ou do caminho até ele) volta para a mesa. Só com a tela em foco — as
  // telas empilhadas continuam montadas, e um ouvinte global esquecido aqui roubaria o voltar de outra tela.
  useFocusEffect(
    useCallback(() => {
      if (mode !== 'indo' && mode !== 'pc' && mode !== 'saindo') return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        backToDesk();
        return true;
      });
      return () => sub.remove();
    }, [mode, backToDesk]),
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0 && (width !== size?.width || height !== size?.height)) setSize({ width, height });
  };

  const paperRect = size && layout ? newspaperRect(size, layout, insets) : null;
  const socialRect = size && layout ? socialScreenRect(size, layout, insets) : null;
  const paperHeight = paperRect?.height ?? 0;

  const paperStyle = useAnimatedStyle(() => ({
    opacity: interpolate(paper.value, [0, 0.35, 1], [0, 0.9, 1]),
    transform: [
      { perspective: 1400 },
      { translateY: (1 - paper.value) * paperHeight * 0.45 },
      { rotateX: `${(1 - paper.value) * 28}deg` },
      { rotateZ: `${(1 - paper.value) * -4}deg` },
      { scale: 0.9 + paper.value * 0.1 },
    ],
  }));
  const socialStyle = useAnimatedStyle(() => ({
    opacity: interpolate(social.value, [0, 0.25], [0, 1], 'clamp'),
    transform: [{ scale: 0.94 + social.value * 0.06 }],
  }));
  const flashStyle = useAnimatedStyle(() => ({
    opacity: interpolate(social.value, [0, 0.12, 0.5], [0, 0.35, 0], 'clamp'),
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: 1 - pulse.value,
    transform: [{ scale: 0.6 + pulse.value * 0.9 }],
  }));

  return (
    <View style={styles.root} onLayout={onLayout}>
      {poses && (
        // No nativo o Canvas do R3F captura os toques; a cena não usa eventos de ponteiro, então fica fora do hit-test.
        <View style={StyleSheet.absoluteFill} pointerEvents={Platform.OS === 'web' ? 'auto' : 'none'}>
          <Canvas frameloop="demand" flat camera={{ fov: DESK_FOV, near: 0.1, far: 120 }}>
            <DeskScene poses={poses} goal={goal} editions={editions.length} onArrive={onArrive} />
          </Canvas>
        </View>
      )}

      {/* Botão sobre o notebook: some quando o olhar sai da mesa. */}
      {layout && mode === 'mesa' && (
        <Pressable
          onPress={openPc}
          accessibilityRole="button"
          accessibilityLabel="Abrir as redes sociais no notebook"
          style={[styles.hotspot, rectStyle(layout.laptop)]}>
          <View style={styles.hotspotInner} pointerEvents="none">
            <Animated.View style={[styles.ring, ringStyle]} />
            <View style={styles.pill}>
              <Text style={styles.pillText}>Redes ›</Text>
            </View>
          </View>
        </Pressable>
      )}

      {paperRect && (
        <Animated.View
          style={[styles.paper, rectStyle(paperRect), paperStyle]}
          // No notebook o jornal está invisível: sem camada de GPU guardada à toa.
          renderToHardwareTextureAndroid={paperMoving && mode !== 'pc'}
          pointerEvents={mode === 'mesa' ? 'auto' : 'none'}>
          <Newspaper
            width={paperRect.width}
            short={paperRect.height < 420}
            editions={editions}
            summary={summary}
            characters={characters}
            pressure={pressure}
            pressureLabel={pressureBand(pressure)}
            marks={marks}
            pending={pending}
            focusNewsId={noticia}
            newsOff={newsOff}
          />
        </Animated.View>
      )}

      {socialRect && socialMounted && (
        <Animated.View
          style={[
            styles.social,
            rectStyle(socialRect),
            socialStyle,
            mode !== 'pc' && mode !== 'saindo' && mode !== 'voltando' && styles.hidden,
          ]}
          renderToHardwareTextureAndroid={socialFading || mode === 'saindo'}
          pointerEvents={mode === 'pc' ? 'auto' : 'none'}>
          <SocialScreen posts={posts} onBack={backToDesk} progress={social} newsOff={newsOff} />
          <Animated.View style={[StyleSheet.absoluteFill, styles.flash, flashStyle]} pointerEvents="none" />
        </Animated.View>
      )}

      {/* Voltar ao Painel: com o olhar na mesa. No notebook o voltar é o das próprias redes (de volta à mesa). */}
      {mode === 'mesa' && (
        <View
          pointerEvents="box-none"
          style={[styles.backButton, { top: insets.top + BACK_MARGIN, left: insets.left + BACK_MARGIN }]}>
          <BackToPainelButton />
        </View>
      )}

      {/* Falha de salvar/carregar com a partida aberta: o aviso fica por cima da mesa até a store limpar o erro. */}
      {error && (
        <View
          pointerEvents="box-none"
          style={[
            styles.errorBanner,
            // Abaixo do botão de voltar, que ocupa o canto superior esquerdo.
            { top: insets.top + BACK_MARGIN + BACK_SPACE, left: insets.left + 12, right: insets.right + 12 },
          ]}>
          <Alert tone="negative" title="Algo deu errado ao salvar ou carregar" message={error} />
        </View>
      )}
    </View>
  );
}

/** Espera antes de montar as redes escondidas (depois da animação de entrada da mesa). */
const SOCIAL_PREMOUNT_MS = 1800;
/** Tempo para o jornal assentar na mesa (entrada e volta do notebook). */
const PAPER_SETTLE_MS = 1500;
/** Duração da tela das redes acendendo. */
const SOCIAL_FADE_MS = 620;
/** Quantas vezes o anel do notebook pulsa a cada chegada na mesa. */
const PULSES = 4;

/** Margem do botão de voltar ao Painel em relação à área segura, e o espaço que ele ocupa (botão + folga). */
const BACK_MARGIN = 8;
const BACK_SPACE = 48;

const styles = StyleSheet.create({
  hidden: { display: 'none' },
  backButton: { position: 'absolute' },
  errorBanner: { position: 'absolute' },
  root: { flex: 1, backgroundColor: '#0b0806', overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: Hud.board },
  hotspot: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  hotspotInner: { alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: Hud.titleBright,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: Hud.glass,
    borderWidth: 1,
    borderColor: Hud.glassBorder,
  },
  pillText: { color: Hud.titleBright, fontWeight: '800', fontSize: 14, letterSpacing: 0.3 },
  // Sombra do jornal: na web, CSS; no celular, a elevação nativa (calculada pela GPU, sem desfoque por quadro).
  paper: Platform.select({
    web: { position: 'absolute', borderRadius: 3, boxShadow: '0px 22px 38px rgba(0, 0, 0, 0.6)' },
    default: {
      position: 'absolute',
      borderRadius: 3,
      elevation: 18,
      shadowColor: '#000',
      shadowOpacity: 0.6,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 14 },
    },
  }),
  social: {
    position: 'absolute',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#000',
  },
  flash: { backgroundColor: '#cfe6ff' },
});
