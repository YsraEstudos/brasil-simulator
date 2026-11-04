import Constants from 'expo-constants';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { scenarioTitle } from '@/components/campaign/campaignSetupView';
import { Card, Text } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ENGINE_VERSION, STATE_SCHEMA_VERSION } from '@/engine';
import { LATEST_DB_VERSION } from '@/database/migrations';
import { SCENARIOS } from '@/store/scenarios';
import { useGame } from '@/store';

import { enterAt, goBack, SetupHeader } from '../campaign/SetupBits';

import { buildAboutRows, DATA_SOURCES_TEXT, FICTION_DETAIL, FICTION_NOTICE, type AboutScenario } from './aboutInfo';

/** Cenários embutidos, na ordem do registro, com o título de exibição e a versão de cada um. */
const ABOUT_SCENARIOS: AboutScenario[] = Object.entries(SCENARIOS).map(([id, scenario]) => ({
  id,
  title: scenarioTitle(scenario),
  version: scenario.version,
}));

/**
 * SOBRE (rota `/sobre`, PLANO_MENU_SAVES_CONFIG.md §3 "Fase M1", item 4): versões do app, do motor, do esquema do
 * estado, do banco e de cada cenário; aviso de ficção (GAME_DESIGN.md §13) e resumo das fontes de dados. Aberta pelo
 * item "Sobre" das Configurações. Só texto: não há rede nem links.
 */
export function AboutScreen() {
  const { colors } = useTheme();
  const reduceMotion = useGame((s) => s.reduceMotion);
  const insets = useSafeAreaInsets();

  const rows = buildAboutRows({
    appVersion: Constants.expoConfig?.version ?? '1.0.0',
    engineVersion: ENGINE_VERSION,
    stateSchemaVersion: STATE_SCHEMA_VERSION,
    dbVersion: LATEST_DB_VERSION,
    scenarios: ABOUT_SCENARIOS,
  });

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Spacing.three + insets.top,
            paddingBottom: Spacing.six + insets.bottom,
            paddingLeft: Spacing.three + insets.left,
            paddingRight: Spacing.three + insets.right,
          },
        ]}>
        <SetupHeader title="SOBRE" subtitle="Versões, aviso e fontes do jogo" onBack={goBack} />

        <Animated.View entering={reduceMotion ? undefined : enterAt(0)}>
          <Card title="Versões" subtitle="Usadas para identificar saves e cenários">
            {rows.map((row) => (
              <View key={`${row.label}-${row.value}`} style={styles.row}>
                <Text variant="caption" color="textSecondary" style={styles.label}>
                  {row.label}
                </Text>
                <Text variant="label" style={styles.value}>
                  {row.value}
                </Text>
              </View>
            ))}
          </Card>
        </Animated.View>

        <Animated.View entering={enterAt(1)}>
          <Card title="Aviso de ficção" subtitle="Sobre o caráter do jogo">
            <Text variant="body">{FICTION_NOTICE}</Text>
            <Text variant="caption" color="textSecondary">
              {FICTION_DETAIL}
            </Text>
          </Card>
        </Animated.View>

        <Animated.View entering={enterAt(2)}>
          <Card title="Fontes de dados" subtitle="De onde vêm os números do cenário">
            <Text variant="body">{DATA_SOURCES_TEXT}</Text>
          </Card>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: Spacing.two },
  label: { flex: 1 },
  value: { flexShrink: 1, textAlign: 'right' },
});
