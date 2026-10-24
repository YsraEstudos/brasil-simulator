import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Defs, G, Line, Path, Pattern, RadialGradient, Stop } from 'react-native-svg';

import type { LabelViewport, Rect } from '@/globe/labels';
import { PULSE_DURATION_MS, PULSE_ITERATIONS } from '@/globe/markerPulse';
import { MARKER_COLORS, MARKER_HIT_PADDING_PX, markerColor, markerCountKey } from '@/globe/markers';
import { findUf } from '@/globe/ufs';
import type { SunState } from '@/globe/visualClock';

import { layoutFlatLabels, type FlatLabelItem } from './flatLabels';
import {
  CLOUD_ICON_PATH,
  cloudIconPlacements,
  HATCH_PATTERN_ID,
  HATCH_STROKE_OPACITY,
  HATCH_STROKE_WIDTH,
  HATCH_TILE,
  hatchedPaths,
} from './flatClimate';
import { flatMap, type FlatUf } from './flatProjection';
import { flatSunFor, LIGHT_COLOR, SHADOW_COLOR, SHADOW_OVER_FILL } from './flatSun';
import { markerPulseKey, type MapMarker } from './markersView';
import type { RegionalMapViewModel } from './regionalMapViewModel';

/**
 * Mapa 2D do Brasil (PLANO_GLOBO.md §3.4): os 27 contornos como `<Path>` montados uma vez; só `fill` (e a seleção)
 * mudam com o modelo. Sem estado por quadro. As siglas são `Text` nativo por cima do SVG, e os marcadores de eventos e
 * notícias (PR 11) são ícones nativos tocáveis por cima delas; só o pulso dos críticos novos anima, com laço finito.
 */

/** Fundo do globo (`GlobeView`), para os dois renderizadores parecerem o mesmo lugar. */
const BACKGROUND = '#05070f';
/** Terra sem mapa de calor (Satélite). */
const LAND = '#1f2a40';
/** Divisa entre estados. */
const BORDER = '#05070f';
const BORDER_WIDTH = 1.2;
/** Contorno da UF selecionada (mesmo amarelo do globo). */
const SELECTED_STROKE = '#ffe27a';
const SELECTED_STROKE_WIDTH = 3.2;
// Na web o react-native-svg repassa as props ao DOM: nada de props só do RN nos `<Path>` (lá vai `aria-label`).
/** Contorno e miolo do pin e do ponto da capital (mesmas cores do atlas do globo). */
const PIN_FILL = '#ffffff';
const PIN_OUTLINE = '#10141c';
/** Folga horizontal (px) da caixa de texto nativo: a fonte do sistema não tem a largura exata da do atlas. */
const TEXT_SLACK_PX = 12;

export interface FlatBrazilMapProps {
  viewModel: RegionalMapViewModel;
  /** Toque numa UF (sigla) ou no fundo (`null`). */
  onSelect: (sigla: string | null) => void;
  /** `full`: siglas, pontos e marcadores sobre o mapa. `light`: só polígonos e seleção (sem marcadores nem pulso). */
  variant: 'full' | 'light';
  /** Áreas do HUD (px do mapa) onde nenhuma sigla ou capital pode tocar. Só na variante `full`. */
  reservedRects?: readonly Rect[];
  /** Faixas onde um rótulo não cabe por inteiro (área segura e barras do HUD). */
  labelInsets?: LabelViewport['insets'];
  /** Tamanho dos rótulos: `labelScale(textScale)`. Padrão 1. */
  labelScale?: number;
  /**
   * Dia e noite (só na variante `full`): sombra do terminador e luzes das cidades do lado noturno. `null`/ausente =
   * nada (também em "Sempre dia"). A sombra fica em cache enquanto a hora e o mês forem os mesmos.
   */
  sun?: SunState | null;
  /** Toque num marcador de eventos e notícias (um de `viewModel.markers`). Só na variante `full`. */
  onMarkerPress?: (marker: MapMarker) => void;
  /** O anel de `pulseKey` terminou (as instâncias param de pulsar na sessão). Só na variante `full`. */
  onPulseDone?: (instanceIds: readonly string[]) => void;
  /** Sub-tela aberta (o painel sai de foco): o pulso para e não avisa o fim; ao voltar, recomeça. */
  paused?: boolean;
  style?: StyleProp<ViewStyle>;
}

const CITY_GLOW_ID = 'cityGlow';
/** Ícone de nuvem da chuva acima do normal: branco com contorno escuro, legível sobre qualquer cor de camada. */
const CLOUD_ICON_FILL = '#ffffff';
const CLOUD_ICON_STROKE = '#10141c';

interface UfPathProps {
  uf: FlatUf;
  fill: string;
}

/** Um estado: memoizado, só repinta quando a cor muda. O toque é tratado uma vez no mapa inteiro (`FlatBrazilMap`). */
const UfPath = memo(function UfPath({ uf, fill }: UfPathProps) {
  return (
    <Path
      d={uf.d}
      fill={fill}
      stroke={BORDER}
      strokeWidth={BORDER_WIDTH}
      strokeLinejoin="round"
      pointerEvents="none"
      {...(Platform.OS === 'web' ? { 'aria-label': uf.nome } : { accessibilityLabel: uf.nome })}
    />
  );
});

interface UfLabelsProps {
  items: readonly FlatLabelItem[];
}

/** Siglas, pins e capitais por cima do SVG, já escolhidos por `layoutFlatLabels` (as regras do globo). */
const UfLabels = memo(function UfLabels({ items }: UfLabelsProps) {
  const textBox = (box: Rect) => ({
    left: box.x - TEXT_SLACK_PX / 2,
    top: box.y,
    width: box.w + TEXT_SLACK_PX,
    height: box.h,
  });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      {items.map((item) => {
        if (item.kind === 'marker') return null;
        if (item.kind === 'pin')
          return (
            <View
              key={item.id}
              style={[
                styles.pin,
                {
                  left: item.box.x,
                  top: item.box.y,
                  width: item.box.w,
                  height: item.box.h,
                  borderRadius: item.box.w / 2,
                },
              ]}
            />
          );
        if (item.kind === 'sigla')
          return (
            <Text
              key={item.id}
              style={[styles.label, textBox(item.box), { fontSize: item.fontSize, lineHeight: item.box.h }]}
              numberOfLines={1}
              maxFontSizeMultiplier={1}>
              {item.text}
            </Text>
          );
        return (
          <View key={item.id} style={StyleSheet.absoluteFill}>
            <View
              style={[
                styles.dot,
                {
                  left: item.dot.x,
                  top: item.dot.y,
                  width: item.dot.w,
                  height: item.dot.h,
                  borderRadius: item.dot.w / 2,
                },
              ]}
            />
            <Text
              style={[styles.label, textBox(item.name), { fontSize: item.fontSize, lineHeight: item.name.h }]}
              numberOfLines={1}
              maxFontSizeMultiplier={1}>
              {item.text}
            </Text>
          </View>
        );
      })}
    </View>
  );
});

/** Fonte (px, escala 1) do glifo do marcador e do número do selo. */
const MARKER_GLYPH_FONT_PX = 12;
const MARKER_BADGE_FONT_PX = 9;
/**
 * Um glifo para cada tipo, como no atlas do globo: o "!" do evento, o "≡" (colunas de jornal) da notícia, o "⚑" da visita
 * presidencial e o "⚒" da obra. Os dois últimos levam o seletor de variação de texto (U+FE0E) para o sistema não os
 * trocar por emoji colorido.
 */
const MARKER_GLYPHS = { event: '!', news: '≡', visit: '⚑︎', work: '⚒︎' } as const;

interface FlatMarkersProps {
  items: readonly FlatLabelItem[];
  markers: readonly MapMarker[];
  scale: number;
  pulseKey: string;
  onPress: (marker: MapMarker) => void;
  onPulseDone?: (instanceIds: readonly string[]) => void;
  paused?: boolean;
}

/**
 * Marcadores de eventos e notícias: ícone nativo por UF (disco colorido com o glifo e, em grupo, o selo com o número),
 * tocável e com rótulo de acessibilidade em português. O pulso dos críticos novos é um `Animated` finito
 * (`PULSE_ITERATIONS` voltas de `PULSE_DURATION_MS`) que para sozinho e deixa tudo estático; quando termina de verdade
 * (não se foi interrompido) avisa `onPulseDone`.
 */
const FlatMarkers = memo(function FlatMarkers({
  items,
  markers,
  scale,
  pulseKey,
  onPress,
  onPulseDone,
  paused,
}: FlatMarkersProps) {
  const [pulse] = useState(() => new Animated.Value(1)); // 1 = anel invisível
  const pulseDone = useRef(onPulseDone);
  useEffect(() => {
    pulseDone.current = onPulseDone;
  });
  useEffect(() => {
    if (!pulseKey || paused) return;
    const instances = pulseKey.split('|');
    pulse.setValue(0);
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: PULSE_DURATION_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: Platform.OS !== 'web',
      }),
      { iterations: PULSE_ITERATIONS },
    );
    loop.start(({ finished }) => {
      pulse.setValue(1);
      if (finished) pulseDone.current?.(instances);
    });
    return () => {
      loop.stop();
      pulse.setValue(1);
    };
  }, [pulseKey, paused, pulse]);
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 0] });
  const hitSlop = MARKER_HIT_PADDING_PX * scale;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {items.map((item) => {
        if (item.kind !== 'marker') return null;
        const marker = markers.find((m) => m.sigla === item.sigla);
        if (!marker) return null;
        const color = markerColor(marker);
        return (
          <View key={item.id} style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={marker.label}
              accessibilityHint="Toque para abrir"
              hitSlop={hitSlop}
              onPress={() => onPress(marker)}
              style={[
                styles.marker,
                {
                  left: item.box.x,
                  top: item.box.y,
                  width: item.box.w,
                  height: item.box.h,
                  borderRadius: item.box.w / 2,
                  backgroundColor: color,
                },
              ]}>
              {marker.pulse && (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.markerRing,
                    {
                      borderRadius: item.box.w / 2,
                      borderColor: color,
                      opacity: ringOpacity,
                      transform: [{ scale: ringScale }],
                    },
                  ]}
                />
              )}
              <Text
                style={[styles.markerGlyph, { fontSize: MARKER_GLYPH_FONT_PX * scale, lineHeight: item.box.h }]}
                maxFontSizeMultiplier={1}>
                {MARKER_GLYPHS[marker.kind]}
              </Text>
            </Pressable>
            {item.badge && (
              <View
                pointerEvents="none"
                style={[
                  styles.markerBadge,
                  {
                    left: item.badge.x,
                    top: item.badge.y,
                    width: item.badge.w,
                    height: item.badge.h,
                    borderRadius: item.badge.w / 2,
                  },
                ]}>
                <Text
                  style={[styles.markerBadgeText, { fontSize: MARKER_BADGE_FONT_PX * scale, lineHeight: item.badge.h }]}
                  maxFontSizeMultiplier={1}>
                  {markerCountKey(marker.count)}
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
});

/** O mapa plano dos 27 estados com cores, seleção e (na variante `full`) siglas e marcadores. */
export function FlatBrazilMap({
  viewModel,
  onSelect,
  variant,
  reservedRects,
  labelInsets,
  labelScale = 1,
  sun,
  onMarkerPress,
  onPulseDone,
  paused,
  style,
}: FlatBrazilMapProps) {
  // Gere os paths SVG só quando o mapa 2D for realmente renderizado; o import do fallback não bloqueia o início do globo.
  const flat = flatMap();
  const viewBox = `0 0 ${flat.viewBox.width} ${flat.viewBox.height}`;
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onSelectRef = useRef(onSelect);
  const onMarkerPressRef = useRef(onMarkerPress);
  useEffect(() => {
    onSelectRef.current = onSelect;
    onMarkerPressRef.current = onMarkerPress;
  });
  const markerPress = useCallback((marker: MapMarker) => onMarkerPressRef.current?.(marker), []);
  // Despachante estável: os manipuladores (e os `UfPath` memoizados) não mudam quando `onSelect` muda.
  const select = useCallback((sigla: string | null) => onSelectRef.current(sigla), []);

  // Sombra e luzes: refeitas só quando o Sol muda (hora fixa, mês, ou a tela renderizando na "Hora real").
  const night = variant === 'full' && sun ? flatSunFor(sun) : null;
  const shadowStrength = Object.keys(viewModel.fills).length > 0 ? SHADOW_OVER_FILL : 1;

  // Rótulos e marcadores num layout só (o marcador vence a sigla da própria UF). O 2D leve não desenha nenhum dos dois.
  const markers = viewModel.markers;
  const laidOut = useMemo(
    () =>
      variant === 'full' && size.width > 0
        ? layoutFlatLabels({
            width: size.width,
            height: size.height,
            scale: labelScale,
            reserved: reservedRects,
            insets: labelInsets,
            markers,
          })
        : [],
    [variant, size.width, size.height, labelScale, reservedRects, labelInsets, markers],
  );
  const pulseKey = markerPulseKey(markers);

  const selected = viewModel.selectedId ? flat.ufs.find((u) => u.sigla === viewModel.selectedId) : undefined;

  // Clima (só no 2D completo): hachura nas UFs em seca forte ou chuva forte e um ícone de nuvem por UF com chuva acima do
  // normal. Estático: refeito só quando o modelo muda (nada anima).
  const hatched = useMemo(
    () => (variant === 'full' ? hatchedPaths(viewModel.climate.hatched) : []),
    [variant, viewModel.climate.hatched],
  );
  const cloudIcons = useMemo(
    () => (variant === 'full' ? cloudIconPlacements(viewModel.climate.clouds) : []),
    [variant, viewModel.climate.clouds],
  );

  // Um só toque para o mapa todo: o ponto volta para lon/lat e `findUf` acha a UF (o mesmo teste do globo). O
  // `onPress` por `<Path>` não funciona na web (o react-native-svg repassa os handlers de toque ao DOM).
  const onPress = (event: GestureResponderEvent) => {
    // Na web o clique chega como MouseEvent, sem `locationX`: usa `offsetX` (relativo ao SVG, que ocupa o mapa todo).
    const native = event.nativeEvent as GestureResponderEvent['nativeEvent'] & { offsetX?: number; offsetY?: number };
    const locationX = native.locationX ?? native.offsetX;
    const locationY = native.locationY ?? native.offsetY;
    const { width, height } = size;
    if (width === 0 || height === 0 || locationX === undefined || locationY === undefined) return select(null);
    const scale = Math.min(width / flat.viewBox.width, height / flat.viewBox.height);
    const x = (locationX - (width - flat.viewBox.width * scale) / 2) / scale;
    const y = (locationY - (height - flat.viewBox.height * scale) / 2) / scale;
    const [lon, lat] = flat.unproject({ x, y });
    select(findUf(lon, lat)?.sigla ?? null);
  };

  return (
    <Pressable
      accessible={false}
      style={[styles.root, style]}
      onPress={onPress}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
      }}>
      <Svg width="100%" height="100%" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
        {flat.ufs.map((uf) => (
          <UfPath key={uf.sigla} uf={uf} fill={viewModel.fills[uf.sigla] ?? LAND} />
        ))}
        {hatched.length > 0 && (
          <G pointerEvents="none">
            <Defs>
              <Pattern
                id={HATCH_PATTERN_ID}
                patternUnits="userSpaceOnUse"
                width={HATCH_TILE}
                height={HATCH_TILE}
                patternTransform="rotate(45)">
                <Line
                  x1={0}
                  y1={0}
                  x2={0}
                  y2={HATCH_TILE}
                  stroke="#ffffff"
                  strokeOpacity={HATCH_STROKE_OPACITY}
                  strokeWidth={HATCH_STROKE_WIDTH}
                />
              </Pattern>
            </Defs>
            {hatched.map((h) => (
              <Path key={h.sigla} d={h.d} fill={`url(#${HATCH_PATTERN_ID})`} />
            ))}
          </G>
        )}
        {night && (
          <G pointerEvents="none">
            {night.bands.map((band, i) => (
              <Path key={i} d={band.d} fill={SHADOW_COLOR} fillOpacity={band.opacity * shadowStrength} />
            ))}
            <Defs>
              <RadialGradient id={CITY_GLOW_ID}>
                <Stop offset="0" stopColor={LIGHT_COLOR} stopOpacity="1" />
                <Stop offset="0.35" stopColor={LIGHT_COLOR} stopOpacity="0.55" />
                <Stop offset="1" stopColor={LIGHT_COLOR} stopOpacity="0" />
              </RadialGradient>
            </Defs>
            {night.lights.map((light) => (
              <Circle
                key={light.name}
                cx={light.x}
                cy={light.y}
                r={light.r}
                fill={`url(#${CITY_GLOW_ID})`}
                opacity={light.opacity}
              />
            ))}
          </G>
        )}
        {cloudIcons.length > 0 && (
          <G pointerEvents="none">
            {cloudIcons.map((icon) => (
              <G key={icon.sigla} transform={`translate(${icon.x} ${icon.y}) scale(${icon.scale})`}>
                <Path
                  d={CLOUD_ICON_PATH}
                  fill={CLOUD_ICON_FILL}
                  fillOpacity={0.92}
                  stroke={CLOUD_ICON_STROKE}
                  strokeWidth={1.4}
                  strokeLinejoin="round"
                />
              </G>
            ))}
          </G>
        )}
        {selected && (
          <Path
            d={selected.d}
            fill="none"
            stroke={SELECTED_STROKE}
            strokeWidth={SELECTED_STROKE_WIDTH}
            strokeLinejoin="round"
            pointerEvents="none"
          />
        )}
      </Svg>
      {variant === 'full' && size.width > 0 && (
        <>
          <UfLabels items={laidOut} />
          {markers.length > 0 && (
            <FlatMarkers
              items={laidOut}
              markers={markers}
              scale={labelScale}
              pulseKey={pulseKey}
              onPress={markerPress}
              onPulseDone={onPulseDone}
              paused={paused}
            />
          )}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BACKGROUND },
  label: {
    position: 'absolute',
    textAlign: 'center',
    color: '#ffffff',
    fontWeight: '700',
    textShadowColor: 'rgba(16,20,28,0.95)',
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 0 },
  },
  pin: {
    position: 'absolute',
    backgroundColor: PIN_FILL,
    borderWidth: 1.5,
    borderColor: PIN_OUTLINE,
  },
  dot: {
    position: 'absolute',
    backgroundColor: PIN_FILL,
    borderWidth: 1,
    borderColor: PIN_OUTLINE,
  },
  marker: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  markerRing: { position: 'absolute', left: -1.5, top: -1.5, right: -1.5, bottom: -1.5, borderWidth: 2 },
  markerGlyph: {
    textAlign: 'center',
    color: '#ffffff',
    fontWeight: '800',
    textShadowColor: 'rgba(16,20,28,0.95)',
    textShadowRadius: 2,
    textShadowOffset: { width: 0, height: 0 },
  },
  markerBadge: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: MARKER_COLORS.badge,
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  markerBadgeText: { textAlign: 'center', color: '#ffffff', fontWeight: '700' },
});
