import { memo, useCallback, useEffect, useRef, useState } from 'react';
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
import Svg, { Path } from 'react-native-svg';

import { findUf } from '@/globe/ufs';

import { flatMap, type FlatUf } from './flatProjection';
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
/** Menor lado da caixa da UF, em pixels na tela, a partir do qual cabe a sigla; abaixo vira um ponto. */
const LABEL_MIN_PX = 22;
const LABEL_WIDTH = 30;
const LABEL_HEIGHT = 14;
const DOT_SIZE = 5;

export interface FlatBrazilMapProps {
  viewModel: RegionalMapViewModel;
  /** Toque numa UF (sigla) ou no fundo (`null`). */
  onSelect: (sigla: string | null) => void;
  /** `full`: siglas e pontos sobre o mapa. `light`: só polígonos e seleção. */
  variant: 'full' | 'light';
  style?: StyleProp<ViewStyle>;
}

const FLAT = flatMap();
const VIEWBOX = `0 0 ${FLAT.viewBox.width} ${FLAT.viewBox.height}`;

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
}

/** Siglas (UFs que cabem) e pontos (as pequenas: DF, SE, AL…) nas posições projetadas. Só muda ao redimensionar. */
const UfLabels = memo(function UfLabels({ width, height }: UfLabelsProps) {
  const { viewBox, ufs } = FLAT;
  const scale = Math.min(width / viewBox.width, height / viewBox.height);
  const offsetX = (width - viewBox.width * scale) / 2;
  const offsetY = (height - viewBox.height * scale) / 2;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      {ufs.map((uf) => {
        const x = offsetX + uf.centroid.x * scale;
        const y = offsetY + uf.centroid.y * scale;
        if (Math.min(uf.width, uf.height) * scale < LABEL_MIN_PX)
          return <View key={uf.sigla} style={[styles.dot, { left: x - DOT_SIZE / 2, top: y - DOT_SIZE / 2 }]} />;
        return (
          <Text
            key={uf.sigla}
            style={[styles.label, { left: x - LABEL_WIDTH / 2, top: y - LABEL_HEIGHT / 2 }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1}>
            {uf.sigla}
          </Text>
        );
      })}
    </View>
  );
});

/** O mapa plano dos 27 estados com cores, seleção e (na variante `full`) siglas. */
export function FlatBrazilMap({ viewModel, onSelect, variant, style }: FlatBrazilMapProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });
  // Despachante estável: os manipuladores (e os `UfPath` memoizados) não mudam quando `onSelect` muda.
  const select = useCallback((sigla: string | null) => onSelectRef.current(sigla), []);

  const selected = viewModel.selectedId ? FLAT.ufs.find((u) => u.sigla === viewModel.selectedId) : undefined;

  // Um só toque para o mapa todo: o ponto volta para lon/lat e `findUf` acha a UF (o mesmo teste do globo). O
  // `onPress` por `<Path>` não funciona na web (o react-native-svg repassa os handlers de toque ao DOM).
  const onPress = (event: GestureResponderEvent) => {
    // Na web o clique chega como MouseEvent, sem `locationX`: usa `offsetX` (relativo ao SVG, que ocupa o mapa todo).
    const native = event.nativeEvent as GestureResponderEvent['nativeEvent'] & { offsetX?: number; offsetY?: number };
    const locationX = native.locationX ?? native.offsetX;
    const locationY = native.locationY ?? native.offsetY;
    const { width, height } = size;
    if (width === 0 || height === 0 || locationX === undefined || locationY === undefined) return select(null);
    const scale = Math.min(width / FLAT.viewBox.width, height / FLAT.viewBox.height);
    const x = (locationX - (width - FLAT.viewBox.width * scale) / 2) / scale;
    const y = (locationY - (height - FLAT.viewBox.height * scale) / 2) / scale;
    const [lon, lat] = FLAT.unproject({ x, y });
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
      <Svg width="100%" height="100%" viewBox={VIEWBOX} preserveAspectRatio="xMidYMid meet">
        {FLAT.ufs.map((uf) => (
          <UfPath key={uf.sigla} uf={uf} fill={viewModel.fills[uf.sigla] ?? LAND} />
        ))}
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
      {variant === 'full' && size.width > 0 && <UfLabels width={size.width} height={size.height} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BACKGROUND },
  label: {
    position: 'absolute',
    width: LABEL_WIDTH,
    height: LABEL_HEIGHT,
    textAlign: 'center',
    color: '#ffffff',
    fontSize: 10,
    lineHeight: LABEL_HEIGHT,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 0 },
  },
  dot: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
});
