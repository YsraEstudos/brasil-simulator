import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { shortMonthLabel } from '@/components/campaign/labels';
import { Text } from '@/components/ui';
import type { IndicatorPoint } from '@/database/campaignRepository';

import type { ChartPalette } from './chartPalette';
import { comparableMonths, compareMonths, stepMonth } from './monthCompare';

/** Seta ◀ ▶ com alvo de toque de 44 pt. */
function Arrow({
  label,
  symbol,
  disabled,
  palette,
  onPress,
}: {
  label: string;
  symbol: string;
  disabled: boolean;
  palette: ChartPalette;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: disabled ? palette.muted : palette.chipActive, fontSize: 16 }}>{symbol}</Text>
    </Pressable>
  );
}

/** Escolha de um mês pelas setas, entre os meses que a série tem. */
function MonthPicker({
  title,
  months,
  value,
  onChange,
  palette,
}: {
  title: string;
  months: readonly number[];
  value: number;
  onChange: (month: number) => void;
  palette: ChartPalette;
}) {
  const i = months.indexOf(value);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <Text style={{ color: palette.muted, fontSize: 11.5, width: 18 }}>{title}</Text>
      <Arrow
        label={`${title}: mês anterior`}
        symbol="◀"
        disabled={i <= 0}
        palette={palette}
        onPress={() => onChange(stepMonth(months, value, -1))}
      />
      <Text
        tabular
        accessibilityLiveRegion="polite"
        style={{ color: palette.text, fontSize: 13, fontWeight: '700', minWidth: 72, textAlign: 'center' }}>
        {shortMonthLabel(value)}
      </Text>
      <Arrow
        label={`${title}: mês seguinte`}
        symbol="▶"
        disabled={i >= months.length - 1}
        palette={palette}
        onPress={() => onChange(stepMonth(months, value, 1))}
      />
    </View>
  );
}

/**
 * Comparar dois meses (A27): escolha de A e B pelas setas e a tabela com os dois valores e a diferença B − A. Começa
 * com a posse do mandato em curso contra o mês atual.
 */
export function MonthCompare({
  history,
  termStart,
  palette,
}: {
  history: readonly IndicatorPoint[] | null;
  termStart: number;
  palette: ChartPalette;
}) {
  const [open, setOpen] = useState(false);
  const months = comparableMonths(history ?? []);
  const [picked, setPicked] = useState<{ a: number; b: number } | null>(null);
  const last = months[months.length - 1];
  const a = picked && months.includes(picked.a) ? picked.a : months.includes(termStart) ? termStart : months[0];
  const b = picked && months.includes(picked.b) ? picked.b : last;

  if (months.length < 2) return null;
  const color = (s: 'positive' | 'negative' | 'neutral') =>
    s === 'positive' ? palette.positive : s === 'negative' ? palette.negative : palette.muted;
  const cell = { flex: 1, fontSize: 12, textAlign: 'right' as const };

  return (
    <View style={{ gap: 6 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={{
          minHeight: 44,
          justifyContent: 'center',
          paddingHorizontal: 10,
          borderWidth: 1,
          borderRadius: 5,
          borderColor: palette.chipBorder,
          alignSelf: 'flex-start',
        }}>
        <Text style={{ color: palette.text, fontSize: 12, fontWeight: '700' }}>
          {open ? 'Fechar a comparação' : 'Comparar dois meses'}
        </Text>
      </Pressable>
      {open && (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 }}>
            <MonthPicker
              title="A"
              months={months}
              value={a}
              onChange={(m) => setPicked({ a: m, b })}
              palette={palette}
            />
            <MonthPicker
              title="B"
              months={months}
              value={b}
              onChange={(m) => setPicked({ a, b: m })}
              palette={palette}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Text style={{ flex: 1.3, color: palette.muted, fontSize: 11 }}>Indicador</Text>
            <Text style={[cell, { color: palette.muted, fontSize: 11 }]}>{shortMonthLabel(a)}</Text>
            <Text style={[cell, { color: palette.muted, fontSize: 11 }]}>{shortMonthLabel(b)}</Text>
            <Text style={[cell, { color: palette.muted, fontSize: 11 }]}>B − A</Text>
          </View>
          {compareMonths(history ?? [], a, b).map((row) => (
            <View
              key={row.key}
              accessible
              accessibilityLabel={row.accessibilityLabel}
              style={{ flexDirection: 'row', gap: 6, paddingVertical: 3 }}>
              <Text style={{ flex: 1.3, color: palette.text, fontSize: 12 }}>{row.label}</Text>
              <Text tabular style={[cell, { color: palette.text }]}>
                {row.a}
              </Text>
              <Text tabular style={[cell, { color: palette.text }]}>
                {row.b}
              </Text>
              <Text tabular style={[cell, { color: color(row.sentiment), fontWeight: '700' }]}>
                {row.difference}
              </Text>
            </View>
          ))}
          <Text style={{ color: palette.muted, fontSize: 10.5 }}>
            Valores no início de cada mês. Setores e estados não entram: o jogo guarda o detalhe só dos últimos 12
            meses.
          </Text>
        </>
      )}
    </View>
  );
}
