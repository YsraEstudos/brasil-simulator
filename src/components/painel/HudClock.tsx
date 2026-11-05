import { getBatteryLevelAsync, getBatteryStateAsync, isAvailableAsync } from 'expo-battery';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { paletteFor } from '@/constants/theme';

import {
  batteryView,
  clockAccessibilityLabel,
  formatClock,
  msUntilNextMinute,
  type BatteryView,
} from './hudClockModel';
import { Hud } from './hudTheme';

/** Hora do aparelho, trocada na virada de cada minuto. Só interface: o motor não lê esta hora. */
function useDeviceClock(): string {
  const read = () => {
    const now = new Date();
    return formatClock(now.getHours(), now.getMinutes());
  };
  const [time, setTime] = useState(read);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setTime(read());
      const now = new Date();
      timer = setTimeout(tick, msUntilNextMinute(now.getSeconds(), now.getMilliseconds()));
    };
    tick();
    return () => clearTimeout(timer);
  }, []);
  return time;
}

/** Bateria lida a cada minuto (junto com o relógio basta); `null` sem bateria disponível. */
function useBattery(time: string): BatteryView | null {
  const [battery, setBattery] = useState<BatteryView | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!(await isAvailableAsync())) {
          if (alive) setBattery(null);
          return;
        }
        const [level, state] = await Promise.all([getBatteryLevelAsync(), getBatteryStateAsync()]);
        if (alive) setBattery(batteryView({ level, state, web: Platform.OS === 'web' }));
      } catch {
        if (alive) setBattery(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [time]);
  return battery;
}

/**
 * Canto do relógio no HUD (PLANO_SAVES_HISTORICO.md H1, D33): hora do aparelho e, quando há, a bateria. A posição e
 * o tamanho vêm de `clockRect`/`clockSize` (`hudReserved`), para o canto não cobrir números nem trilhos. Bateria
 * fraca tem cor de alerta (a do modo daltônico, quando ligado) e um "!", para a cor não ser o único sinal.
 */
export function HudClock({
  left,
  top,
  width,
  height,
  alignRight,
  textScale,
  colorBlind,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Texto encostado à direita (canto direito, no canhoto). */
  alignRight: boolean;
  textScale: number;
  colorBlind: boolean;
}) {
  const time = useDeviceClock();
  const battery = useBattery(time);
  const warning = paletteFor('dark', colorBlind).warning;
  const fontSize = 11 * textScale;

  return (
    <View
      pointerEvents="none"
      accessible
      accessibilityRole="text"
      accessibilityLabel={clockAccessibilityLabel(time, battery)}
      style={[styles.box, { left, top, width, height, justifyContent: alignRight ? 'flex-end' : 'flex-start' }]}>
      <View style={styles.chip}>
        <Text style={[styles.text, { fontSize }]} numberOfLines={1}>
          {time}
          {battery && (
            <Text style={battery.low ? { color: warning } : styles.dim}>
              {` · ${battery.text}`}
              {battery.charging ? ' ⚡' : battery.low ? ' !' : ''}
            </Text>
          )}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', flexDirection: 'row', alignItems: 'center' },
  chip: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: Hud.glassBorder,
    backgroundColor: Hud.glass,
  },
  text: { color: Hud.text, fontWeight: '700', fontVariant: ['tabular-nums'] },
  dim: { color: Hud.textDim },
});
