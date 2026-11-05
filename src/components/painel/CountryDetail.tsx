import { View } from 'react-native';

import { Text } from '@/components/ui';
import type { Country } from '@/globe/countries';
import { useScaledStyles } from '@/hooks/use-scaled-styles';

import { buildCountryView } from './countryView';
import { Hud } from './hudTheme';

/**
 * Folha do país (PLANO_PAISES.md, Fase P1): abre ao tocar num país fora do Brasil no globo, com a seção Identidade. O
 * país não muda nada no jogo: é só consulta.
 */
export function CountryDetail({ country }: { country: Country }) {
  const styles = useScaledStyles(baseStyles);
  const view = buildCountryView(country);
  return (
    <View accessible accessibilityLabel={view.accessibilityLabel} style={styles.root}>
      <Text style={styles.status}>{view.status}</Text>
      <Text style={styles.section}>Identidade</Text>
      {view.rows.map((row) => (
        <View key={row.label} style={styles.row}>
          <Text style={styles.label}>{row.label}</Text>
          <View style={styles.valueBox}>
            <Text tabular style={styles.value}>
              {row.value}
            </Text>
            {row.note ? <Text style={styles.note}>{row.note}</Text> : null}
          </View>
        </View>
      ))}
      <Text style={styles.upcoming}>{view.upcoming}</Text>
      <Text style={styles.source}>{view.source}</Text>
    </View>
  );
}

const baseStyles = {
  root: { gap: 4 },
  status: { color: Hud.textDim, fontSize: 11, lineHeight: 15 },
  section: {
    color: Hud.title,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    paddingTop: 4,
  },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingVertical: 1 },
  label: { flex: 1, color: Hud.textDim, fontSize: 11 },
  valueBox: { flexShrink: 1, alignItems: 'flex-end' },
  value: { color: Hud.text, fontSize: 12, fontWeight: '700', textAlign: 'right' },
  note: { color: Hud.textMuted, fontSize: 10, textAlign: 'right' },
  upcoming: { color: Hud.textMuted, fontSize: 10.5, fontStyle: 'italic', paddingTop: 6 },
  source: { color: Hud.textMuted, fontSize: 10, paddingTop: 2 },
} as const;
