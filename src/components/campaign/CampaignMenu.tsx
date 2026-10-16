import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Text } from '@/components/ui';
import { MIN_TOUCH, Radius, Spacing, TEXT_SCALES } from '@/constants/theme';
import type { Difficulty } from '@/engine';
import { useTheme } from '@/hooks/use-theme';
import { gameStore, useGame } from '@/store';
import { campaignMonths } from '@/store/scenarios';

import { DIFFICULTY, shortMonthLabel } from './labels';

/** Menu sem partida aberta: nova partida, partidas salvas e tamanho do texto. */
export function CampaignMenu() {
  const { colors, textScale, setTextScale } = useTheme();
  const campaigns = useGame((s) => s.campaigns);
  const busy = useGame((s) => s.busy);
  const [name, setName] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('estrategica');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const { newCampaign, continueCampaign, deleteCampaign } = gameStore.getState();

  return (
    <View style={styles.root}>
      <Card title="Nova partida" subtitle="Posse em 5 de janeiro de 2027">
        <Text variant="label" color="textSecondary">
          Nome da campanha
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Ex.: Governo de união nacional"
          placeholderTextColor={colors.textMuted}
          maxLength={60}
          accessibilityLabel="Nome da campanha"
          style={[
            styles.input,
            {
              color: colors.text,
              borderColor: colors.border,
              backgroundColor: colors.background,
              fontSize: 16 * textScale,
            },
          ]}
        />
        <Text variant="label" color="textSecondary">
          Dificuldade
        </Text>
        <View style={styles.row}>
          {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
            <Button
              key={d}
              label={DIFFICULTY[d].name}
              variant={d === difficulty ? 'primary' : 'secondary'}
              onPress={() => setDifficulty(d)}
            />
          ))}
        </View>
        <Text variant="caption" color="textSecondary">
          {DIFFICULTY[difficulty].description}
        </Text>
        <Button label="Tomar posse" block loading={busy} onPress={() => newCampaign({ name, difficulty })} />
      </Card>

      {campaigns.length > 0 && (
        <View style={styles.section}>
          <Text variant="heading" color="accent">
            Partidas salvas
          </Text>
          {campaigns.map((c) => {
            const done = c.status === 'encerrada';
            const where = done
              ? 'Encerrada'
              : `${shortMonthLabel(c.currentMonth)} · mês ${c.currentMonth + 1} de ${campaignMonths(c.scenarioId)}`;
            return (
              <Card key={c.id} title={c.name} subtitle={`${where} · ${DIFFICULTY[c.difficulty].name}`}>
                <View style={styles.row}>
                  <Button
                    label={done ? 'Ver resultado' : 'Continuar'}
                    disabled={busy}
                    onPress={() => continueCampaign(c.id)}
                  />
                  {confirmDelete === c.id ? (
                    <>
                      <Button
                        label="Confirmar exclusão"
                        variant="danger"
                        onPress={() => {
                          setConfirmDelete(null);
                          void deleteCampaign(c.id);
                        }}
                      />
                      <Button label="Cancelar" variant="ghost" onPress={() => setConfirmDelete(null)} />
                    </>
                  ) : (
                    <Button label="Apagar" variant="ghost" onPress={() => setConfirmDelete(c.id)} />
                  )}
                </View>
              </Card>
            );
          })}
        </View>
      )}

      <View style={styles.section}>
        <Text variant="heading" color="accent">
          Tamanho do texto
        </Text>
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
      </View>

      <Button label="Menu principal" variant="ghost" block onPress={() => router.navigate('/')} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.four },
  section: { gap: Spacing.two },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  input: { minHeight: MIN_TOUCH, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.three },
});
