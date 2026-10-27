import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Text } from '@/components/ui';
import { MIN_TOUCH, Radius, Spacing } from '@/constants/theme';
import { DEBATE_ACTION_ID, type Decision, type GameContent, type GameState, type MonthReport } from '@/engine';
import { useTheme } from '@/hooks/use-theme';
import type { AgendaDraft } from '@/store/agendaDraft';

import { careerActionsViewModel, type ActionRow } from './careerActionsView';

type Pocket = 'party' | 'donations';
const POCKET_LABEL: Record<Pocket, string> = { party: 'Verba do partido', donations: 'Doações' };

/** Opção de um seletor curto (UF ou adversário): alvo de toque mínimo e estado lido pelo leitor de tela. */
function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[
        styles.choice,
        { borderColor: colors.accent, backgroundColor: selected ? colors.accent : 'transparent' },
      ]}>
      <Text color={selected ? 'onAccent' : 'accent'}>{label}</Text>
    </Pressable>
  );
}

/**
 * Ações de campanha e debate (PLANO_CAMPANHA.md Fase C4, tarefa C4.4): marcar entra no rascunho do turno; o motor
 * confere estágio, alvo, limite e dinheiro ao encerrar, na ordem da lista. Só faixas e texto, sem valores internos.
 */
export function CareerActionsCard({
  state,
  content,
  report,
  draft,
  onToggle,
}: {
  state: GameState;
  content: GameContent;
  report?: MonthReport;
  draft: AgendaDraft;
  onToggle: (decision: Decision) => void;
}) {
  const [pocket, setPocket] = useState<Pocket>('party');
  const [openTarget, setOpenTarget] = useState<string | null>(null);
  const view = careerActionsViewModel(state, content, draft.decisions, report);
  if (!view) return null;
  // Na contabilidade de três bolsos o motor exige o bolso; no caixa simples o parâmetro é ignorado.
  const expanded = state.career?.expandedFinance !== undefined;
  const decide = (id: string, params: Decision['params'] = {}) =>
    onToggle({ policyId: id, agendaCost: 0, params: { ...(expanded ? { bolso: pocket } : {}), ...params } });
  const ufs = content.scenario.regions?.ufs ?? [];

  const targets = (row: ActionRow) => {
    if (openTarget !== row.id && !row.selected) return null;
    if (row.target === 'uf') {
      return (
        <View style={styles.choices} accessibilityLabel="Escolha o estado da caravana">
          {ufs.map((u) => (
            <Choice
              key={u.id}
              label={u.id}
              selected={row.selectedTarget === u.id}
              onPress={() => decide(row.id, { uf: u.id })}
            />
          ))}
        </View>
      );
    }
    if (row.target === 'alvo') {
      return (
        <View style={styles.section}>
          {view.opponents.map((o) => (
            <Choice
              key={o.blocId}
              label={`${o.name} — ${o.image}, ${o.risk}`}
              selected={row.selectedTarget === o.blocId}
              onPress={() => decide(row.id, { alvo: o.blocId })}
            />
          ))}
        </View>
      );
    }
    return null;
  };

  return (
    <>
      <Card title="Ações de campanha" subtitle={view.slots}>
        {view.lastResults.length > 0 && (
          <View style={styles.section}>
            <Text variant="label">No último turno</Text>
            {view.lastResults.map((line) => (
              <Text key={line}>{line}</Text>
            ))}
          </View>
        )}
        {expanded && (
          <View style={styles.section}>
            <Text variant="label">Pagar as ações com</Text>
            <View style={styles.choices}>
              {(['party', 'donations'] as const).map((p) => (
                <Choice key={p} label={POCKET_LABEL[p]} selected={pocket === p} onPress={() => setPocket(p)} />
              ))}
            </View>
          </View>
        )}
        <Text color="textSecondary">As ações são pagas na ordem da lista; uma ação sem dinheiro é recusada.</Text>
        {view.actions.map((row) => (
          <View key={row.id} style={styles.section}>
            <Text variant="heading">{row.name}</Text>
            <Text>{row.summary}</Text>
            <Text color="textSecondary">Custo: {row.cost}</Text>
            {row.unavailable && !row.selected ? (
              <Text color="textSecondary">{row.unavailable}</Text>
            ) : row.target ? (
              <>
                <Button
                  label={
                    row.selected ? 'Desmarcar' : openTarget === row.id ? 'Escolha o alvo abaixo' : 'Escolher o alvo'
                  }
                  variant="secondary"
                  onPress={() => {
                    if (row.selected) {
                      const chosen = draft.decisions.find((d) => d.policyId === row.id);
                      if (chosen) onToggle(chosen);
                      setOpenTarget(null);
                    } else setOpenTarget(openTarget === row.id ? null : row.id);
                  }}
                />
                {targets(row)}
              </>
            ) : (
              <Button
                label={row.selected ? 'Desmarcar' : 'Marcar'}
                variant="secondary"
                onPress={() => {
                  const chosen = draft.decisions.find((d) => d.policyId === row.id);
                  if (chosen) onToggle(chosen);
                  else decide(row.id);
                }}
              />
            )}
          </View>
        ))}
      </Card>
      {view.debate && (
        <Card title={view.debate.title} subtitle="Escolha a postura">
          <Text color="textSecondary">{view.debate.defaultNote}</Text>
          {view.debate.rows.map((row) => (
            <View key={`${row.posture}-${row.target ?? ''}`} style={styles.section}>
              <Choice
                label={row.label}
                selected={row.selected}
                onPress={() =>
                  onToggle({
                    policyId: DEBATE_ACTION_ID,
                    agendaCost: 0,
                    params: { postura: row.posture, ...(row.target ? { alvo: row.target } : {}) },
                  })
                }
              />
              <Text color="textSecondary">{row.effect}</Text>
            </View>
          ))}
        </Card>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.one, paddingTop: Spacing.two },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  choice: {
    minHeight: MIN_TOUCH,
    minWidth: MIN_TOUCH,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.md,
  },
});
