import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import type { ScreenRect } from './deskCamera';

/**
 * O jornal dobrado ao meio sobre a mesa e o caminho até aberto diante do jogador. `progress`: 0 = dobrado na mesa,
 * 1 = erguido e centralizado (ainda dobrado), 2 = aberto (a metade de baixo desdobrou pela vinca).
 *
 * As duas metades são cópias paradas do jornal (`renderPaper`) cortadas na vinca; aberto, a mesa troca as cópias
 * pelo jornal de verdade, na mesma posição, sem salto.
 */
export function FoldingNewspaper({
  open,
  folded,
  progress,
  unfolding,
  renderPaper,
}: {
  open: ScreenRect;
  folded: ScreenRect & { scale: number };
  progress: SharedValue<number>;
  /** Monta a metade de baixo (só durante a animação: dobrado na mesa ela fica atrás e não aparece). */
  unfolding: boolean;
  renderPaper: () => ReactNode;
}) {
  const half = open.height / 2;
  const s = folded.scale;
  // Onde o centro da metade de cima precisa ir (centro do jornal dobrado), com a escala aplicada no centro da folha.
  const dx = folded.x + folded.width / 2 - (open.x + open.width / 2);
  const dy = folded.y + folded.height / 2 - (open.y + open.height / 2 - (s * half) / 2);

  const sheetStyle = useAnimatedStyle(() => {
    const lift = Math.min(1, Math.max(0, progress.value));
    const k = s + (1 - s) * lift;
    return {
      transform: [
        { translateX: dx * (1 - lift) },
        // Um pequeno arco: o jornal sobe da mesa antes de vir para o centro.
        { translateY: dy * (1 - lift) - Math.sin(lift * Math.PI) * 24 },
        { rotateZ: `${(1 - lift) * -3}deg` },
        { scale: k },
      ],
    };
  });
  const flapStyle = useAnimatedStyle(() => {
    const u = progress.value - 1;
    return {
      opacity: u > 0.02 ? 1 : 0,
      // Sai de trás (perpendicular, apontando para dentro da tela) e desce até ficar plana; um leve
      // passa-do-ponto no fim assenta o papel.
      transform: [{ perspective: 1800 }, { rotateX: `${(1 - u) * -88}deg` }],
    };
  });
  const flapShade = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [1, 1.6, 2], [0.55, 0.18, 0], 'clamp'),
  }));
  const crease = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1, 2], [0.55, 0.55, 0.12], 'clamp'),
  }));

  return (
    <Animated.View
      style={[styles.sheet, { left: open.x, top: open.y, width: open.width, height: open.height }, sheetStyle]}
      pointerEvents="none">
      <View style={[styles.top, styles.shadow, { height: half }]}>
        <View style={styles.clip}>
          <View style={{ width: open.width, height: open.height }}>{renderPaper()}</View>
        </View>
        {/* Vinca: a sombra da dobra no pé da metade de cima. */}
        <Animated.View style={[styles.crease, crease]} />
      </View>
      {unfolding && (
        <Animated.View style={[styles.flap, { top: half, height: half }, flapStyle]}>
          <View style={styles.clip}>
            <View style={{ position: 'absolute', top: -half, width: open.width, height: open.height }}>
              {renderPaper()}
            </View>
          </View>
          <Animated.View style={[StyleSheet.absoluteFill, styles.flapShade, flapShade]} />
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, borderRadius: 2 },
  clip: { flex: 1, overflow: 'hidden', borderRadius: 2 },
  shadow: Platform.select({
    web: { boxShadow: '0px 18px 34px rgba(0, 0, 0, 0.6)' },
    default: {
      elevation: 16,
      shadowColor: '#000',
      shadowOpacity: 0.6,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 12 },
    },
  }),
  crease: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 14,
    backgroundColor: 'rgba(40, 28, 10, 0.35)',
  },
  flap: {
    position: 'absolute',
    left: 0,
    right: 0,
    transformOrigin: 'top',
    backfaceVisibility: 'hidden',
  },
  flapShade: { backgroundColor: '#000' },
});
