import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';

import type { LabelViewport, Rect } from '@/globe/labels';
import { findUf } from '@/globe/ufs';
import type { SunState } from '@/globe/visualClock';

import { layoutFlatLabels } from './flatLabels';
import { flatMap, type FlatUf } from './flatProjection';
import { flatSunFor, LIGHT_COLOR, SHADOW_COLOR, SHADOW_OVER_FILL } from './flatSun';
import type { RegionalMapViewModel } from './regionalMapViewModel';

/**
 * Mapa 2D do Brasil (PLANO_GLOBO.md §3.4): os 27 contornos como `<Path>` montados uma vez; só `fill` (e a seleção)
 * mudam com o modelo. Sem animação e sem estado por quadro. As siglas são `Text` nativo por cima do SVG.
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
  /** `full`: siglas e pontos sobre o mapa. `light`: só polígonos e seleção. */
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
  style?: StyleProp<ViewStyle>;
}

const CITY_GLOW_ID = 'cityGlow';

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
  width: number;
  height: number;
  scale: number;
  reserved: readonly Rect[] | undefined;
  insets: LabelViewport['insets'] | undefined;
}

/**
 * Siglas, pins e capitais por cima do SVG, escolhidos por `layoutFlatLabels` (as regras do globo). Só refaz o layout
 * ao redimensionar ou quando as áreas do HUD ou a escala do texto mudam.
 */
const UfLabels = memo(function UfLabels({ width, height, scale, reserved, insets }: UfLabelsProps) {
  const items = useMemo(
    () => layoutFlatLabels({ width, height, scale, reserved, insets }),
    [width, height, scale, reserved, insets],
  );
  const textBox = (box: Rect) => ({
    left: box.x - TEXT_SLACK_PX / 2,
    top: box.y,
    width: box.w + TEXT_SLACK_PX,
    height: box.h,
  });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      {items.map((item) => {
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

/** O mapa plano dos 27 estados com cores, seleção e (na variante `full`) siglas. */
export function FlatBrazilMap({
  viewModel,
  onSelect,
  variant,
  reservedRects,
  labelInsets,
  labelScale = 1,
  sun,
  style,
}: FlatBrazilMapProps) {
  // Gere os paths SVG só quando o mapa 2D for realmente renderizado; o import do fallback não bloqueia o início do globo.
  const flat = flatMap();
  const viewBox = `0 0 ${flat.viewBox.width} ${flat.viewBox.height}`;
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });
  // Despachante estável: os manipuladores (e os `UfPath` memoizados) não mudam quando `onSelect` muda.
  const select = useCallback((sigla: string | null) => onSelectRef.current(sigla), []);

  // Sombra e luzes: refeitas só quando o Sol muda (hora fixa, mês, ou a tela renderizando na "Hora real").
  const night = variant === 'full' && sun ? flatSunFor(sun) : null;
  const shadowStrength = Object.keys(viewModel.fills).length > 0 ? SHADOW_OVER_FILL : 1;

  const selected = viewModel.selectedId ? flat.ufs.find((u) => u.sigla === viewModel.selectedId) : undefined;
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
        <UfLabels
          width={size.width}
          height={size.height}
          scale={labelScale}
          reserved={reservedRects}
          insets={labelInsets}
        />
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
});
