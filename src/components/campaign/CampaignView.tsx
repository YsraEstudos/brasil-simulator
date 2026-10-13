import { StyleSheet, View } from 'react-native';

import { Alert, Button, Indicator, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { gameStore, useGame, type ActiveCampaign } from '@/store';
import { PROTOTYPE_MONTHS } from '@/store/scenarios';

import { DIFFICULTY, monthLabel } from './labels';

/** Partida aberta: mês atual, indicadores e encerrar o mês. Decisões e eventos chegam na Fase 02. */
export function CampaignView({ campaign }: { campaign: ActiveCampaign }) {
  const busy = useGame((s) => s.busy);
  const { endMonth, leaveCampaign } = gameStore.getState();
  const { state, previous, finished } = campaign;
  const i = state.indicators;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text variant="caption" color="textSecondary">
          {campaign.name} · {DIFFICULTY[state.difficulty].name}
        </Text>
        <Text variant="display">{finished ? 'Fim do protótipo' : monthLabel(state.monthIndex)}</Text>
        <Text color="textSecondary">
          {finished
            ? `Campanha encerrada em dezembro de 2027.`
            : `Mês ${state.monthIndex + 1} de ${PROTOTYPE_MONTHS} · ${state.resources.agendaPointsPerMonth} pontos de agenda`}
        </Text>
      </View>

      <View style={styles.grid}>
        <Indicator label="Aprovação" value={i.approval} previous={previous?.approval} goodWhen="up" />
        <Indicator
          label="Inflação (12 meses)"
          value={i.inflation12m}
          previous={previous?.inflation12m}
          goodWhen="down"
          context="meta 3,0%"
        />
        <Indicator label="Desemprego" value={i.unemployment} previous={previous?.unemployment} goodWhen="down" />
        <Indicator label="PIB (12 meses)" value={i.gdpGrowth12m} previous={previous?.gdpGrowth12m} goodWhen="up" />
        <Indicator
          label="Resultado primário (% do PIB)"
          value={i.primaryBalance12m}
          previous={previous?.primaryBalance12m}
          goodWhen="up"
          decimals={2}
        />
      </View>

      <Alert
        tone="info"
        title="Protótipo técnico"
        message="A economia, o Congresso e as decisões entram na Fase 02. Por enquanto os meses avançam e tudo é salvo a cada mês."
      />

      <View style={styles.actions}>
        {!finished && <Button label="Encerrar o mês" block loading={busy} onPress={() => endMonth()} />}
        <Button label="Voltar ao menu" variant="secondary" block disabled={busy} onPress={() => leaveCampaign()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.four },
  header: { gap: Spacing.one },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  actions: { gap: Spacing.two },
});
