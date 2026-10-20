import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Alert, Button, Card, formatMoneyMillions, Indicator, Text } from '@/components/ui';
import { MaxContentWidth, Spacing, TEXT_SCALES } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Vitrine do sistema de design (rota /design, fora do jogo). Dados PROVISORIO, só para visualização. */
export default function DesignScreen() {
  const { scheme, colors, textScale, setTextScale } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + Spacing.three,
          paddingLeft: Spacing.three + insets.left,
          paddingRight: Spacing.three + insets.right,
        },
      ]}>
      <Text variant="display">Sistema de design</Text>
      <Text color="textSecondary">
        Tema {scheme === 'dark' ? 'escuro' : 'claro'} · texto {Math.round(textScale * 100)}%
      </Text>

      <Section title="Tamanho do texto">
        <View style={styles.row}>
          {TEXT_SCALES.map((s) => (
            <Button
              key={s}
              label={`${Math.round(s * 100)}%`}
              variant={s === textScale ? 'primary' : 'secondary'}
              onPress={() => setTextScale(s)}
            />
          ))}
        </View>
      </Section>

      <Section title="Indicadores">
        <View style={styles.grid}>
          <Indicator label="Aprovação" value={0.452} previous={0.441} goodWhen="up" />
          <Indicator label="Inflação (IPCA 12m)" value={0.049} previous={0.046} goodWhen="down" context="meta 3,0%" />
          <Indicator label="Desemprego" value={0.061} previous={0.063} goodWhen="down" />
          <Indicator label="PIB (12m)" value={0.019} previous={0.019} goodWhen="up" />
          <Indicator
            label="Resultado primário (% PIB)"
            value={-0.004}
            previous={-0.002}
            goodWhen="up"
            decimals={2}
            context="meta 0,25%"
          />
        </View>
      </Section>

      <Section title="Alertas">
        <Alert
          tone="warning"
          title="Meta fiscal em risco"
          message="No ritmo atual o resultado primário fica abaixo da banda de tolerância."
        />
        <Alert
          tone="negative"
          title="Risco jurídico alto"
          message="Renúncia de receita sem compensação (LRF art. 14)."
          action={{ label: 'Ver alternativas', onPress: () => {} }}
        />
        <Alert tone="positive" title="Reforma aprovada na Câmara" />
        <Alert tone="info" title="Copom se reúne este mês" />
      </Section>

      <Section title="Botões">
        <View style={styles.row}>
          <Button label="Enviar ao Congresso" onPress={() => {}} />
          <Button label="Negociar" variant="secondary" onPress={() => {}} />
          <Button label="Detalhes" variant="ghost" onPress={() => {}} />
          <Button label="Vetar" variant="danger" onPress={() => {}} />
          <Button label="Indisponível" disabled onPress={() => {}} />
          <Button label="Carregando" loading onPress={() => {}} />
        </View>
        <Button label="Encerrar o mês" block onPress={() => {}} />
      </Section>

      <Section title="Cartões e texto">
        <Card title="Crédito para infraestrutura" subtitle="PLN · tramitação ~3 meses" onPress={() => {}}>
          <Text>
            {formatMoneyMillions(15000)} em obras federais de transporte. Demanda agora, capacidade produtiva depois.
          </Text>
        </Card>
        <Text variant="title">Título</Text>
        <Text variant="heading">Cabeçalho</Text>
        <Text>Corpo de texto padrão do jogo.</Text>
        <Text variant="label">Rótulo</Text>
        <Text variant="caption" color="textMuted">
          Legenda discreta
        </Text>
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="heading" color="accent">
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  section: { gap: Spacing.two },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
