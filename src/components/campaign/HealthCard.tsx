import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import {
  ADOPT_MEASURE_ACTION_ID,
  BED_CRITERIA,
  END_MEASURE_ACTION_ID,
  INVESTIGATE_ALERT_ACTION_ID,
  type Decision,
  type GameContent,
  type GameState,
} from '@/engine';
import { fits, gameStore, hasDecision, useGame } from '@/store';

import { CRITERION_LABEL, healthFootnote, healthView, type CrisisView, type MeasureView } from './healthView';

/**
 * Saúde e crises sanitárias (PLANO_EXPANSAO EX-26/EX-27). Sem crise: a capacidade da rede por região e como ampliá-la.
 * Com crise: o que o governo sabe (boletins), o que estima (faixas), as medidas com custo, prazo e limites, os pedidos
 * dos governadores e, ao fim, o balanço. Cada botão é uma ação de agenda.
 */
export function HealthCard({
  state,
  content,
  actionsMax,
}: {
  state: GameState;
  content: GameContent;
  actionsMax: number;
}) {
  const draft = useGame((s) => s.draft);
  const [showRegions, setShowRegions] = useState(false);
  const [openMeasure, setOpenMeasure] = useState<string | null>(null);
  const view = healthView(state, content);
  if (!view) return null;

  const action = (decision: Decision, label: string, enabled: boolean, hint?: string) => {
    const selected = hasDecision(draft, decision);
    return (
      <Button
        key={`${decision.policyId}:${JSON.stringify(decision.params)}`}
        label={selected ? `Retirar da agenda: ${label}` : label}
        variant={selected ? 'primary' : 'secondary'}
        disabled={!selected && !(enabled && fits(draft, decision, content, actionsMax))}
        accessibilityHint={hint}
        onPress={() => gameStore.getState().toggleDecision(decision)}
        block
      />
    );
  };

  const measure = (crisis: CrisisView, m: MeasureView) => {
    const key = `${crisis.id}:${m.id}`;
    const open = openMeasure === key;
    const params = { outbreakId: crisis.id, measureId: m.id };
    return (
      <View key={m.id} style={styles.measure}>
        <Button
          variant="ghost"
          label={`${open ? '▾' : '▸'} ${m.name}${m.active ? ' — em vigor' : m.blocked ? ` — ${m.blocked}` : ''}`}
          accessibilityHint={open ? 'Fecha custo, prazo e limites' : 'Abre custo, prazo e limites da medida'}
          onPress={() => setOpenMeasure(open ? null : key)}
          block
        />
        {open && (
          <View style={styles.body}>
            <Text variant="caption">{m.summary}</Text>
            <Text variant="caption" color="textSecondary">
              {m.cost}
            </Text>
            {m.limits.map((limit) => (
              <Text key={limit} variant="caption" color="textSecondary">
                {`• ${limit}`}
              </Text>
            ))}
            {m.status && <Text variant="caption">{m.status}</Text>}
            {m.active
              ? action(
                  { policyId: END_MEASURE_ACTION_ID, agendaCost: 1, params },
                  'Encerrar medida (1 ação)',
                  true,
                  'O custo e o desgaste param; o efeito também',
                )
              : m.blocked
                ? null
                : m.id === 'leitos_emergencia'
                  ? BED_CRITERIA.map((criterion) =>
                      action(
                        { policyId: ADOPT_MEASURE_ACTION_ID, agendaCost: 1, params: { ...params, criterion } },
                        `Leitos ${CRITERION_LABEL[criterion].label} (1 ação)`,
                        true,
                        CRITERION_LABEL[criterion].hint,
                      ),
                    )
                  : action(
                      { policyId: ADOPT_MEASURE_ACTION_ID, agendaCost: 1, params },
                      'Adotar medida (1 ação)',
                      true,
                      'Custa todo mês até ser encerrada',
                    )}
          </View>
        )}
      </View>
    );
  };

  return (
    <Card title="Saúde e crises sanitárias" subtitle={healthFootnote()}>
      {view.crises.map((crisis) => (
        <View key={crisis.id} style={styles.crisis} accessibilityRole="summary">
          <Text variant="label" color="negative">
            {crisis.title}
          </Text>
          <Text variant="caption">{crisis.phase}</Text>
          {crisis.canInvestigate &&
            action(
              { policyId: INVESTIGATE_ALERT_ACTION_ID, agendaCost: 1, params: { outbreakId: crisis.id } },
              'Investigar o alerta (1 ação)',
              true,
              'Identifica o agente no próximo mês e estreita as estimativas; custo pequeno',
            )}
          {crisis.investigating && (
            <Text variant="caption" color="textSecondary">
              Investigação de campo em andamento: resultado no próximo mês.
            </Text>
          )}
          <Text variant="label">O que os boletins mostram</Text>
          {crisis.observed.map((line) => (
            <Text key={line} variant="caption">
              {line}
            </Text>
          ))}
          {crisis.hotspots.map((line) => (
            <Text key={line} variant="caption" color="textSecondary">
              {line}
            </Text>
          ))}
          <Text variant="label">Estimativas (com incerteza)</Text>
          {crisis.estimates.map((line) => (
            <Text key={line} variant="caption">
              {line}
            </Text>
          ))}
          <Text variant="caption" color="textSecondary">
            {crisis.adherence}
          </Text>
          {crisis.requests.length > 0 && (
            <>
              <Text variant="label" color="warning">
                Pedidos dos governadores
              </Text>
              {crisis.requests.map((line) => (
                <Text key={line} variant="caption">
                  {line}
                </Text>
              ))}
              <Text variant="caption" color="textSecondary">
                Leitos de emergência atendem pedidos conforme o critério de distribuição; o lote nacional não cobre
                todos.
              </Text>
            </>
          )}
          <Text variant="label">Medidas</Text>
          {crisis.measures.map((m) => measure(crisis, m))}
        </View>
      ))}

      {view.lastReport && (
        <View style={styles.crisis}>
          <Text variant="label">{view.lastReport.title}</Text>
          <Text variant="caption" color="textSecondary">
            Notificado (observado)
          </Text>
          {view.lastReport.observed.map((line) => (
            <Text key={line} variant="caption">
              {line}
            </Text>
          ))}
          <Text variant="caption" color="textSecondary">
            Estimado (faixas e modelo)
          </Text>
          {view.lastReport.estimated.map((line) => (
            <Text key={line} variant="caption">
              {line}
            </Text>
          ))}
          <Text variant="caption" color="textSecondary">
            Contas
          </Text>
          {view.lastReport.accounts.map((line) => (
            <Text key={line} variant="caption">
              {line}
            </Text>
          ))}
        </View>
      )}

      <Button
        variant="ghost"
        label={`${showRegions ? '▾' : '▸'} Capacidade da rede por região`}
        accessibilityHint={showRegions ? 'Fecha a capacidade por região' : 'Abre leitos, atenção básica e vigilância'}
        onPress={() => setShowRegions(!showRegions)}
        block
      />
      {showRegions && (
        <View style={styles.body}>
          {view.regions.map((region) => (
            <View key={region.id} style={styles.region}>
              <Text variant="label">{region.name}</Text>
              <Text variant="caption">{region.beds}</Text>
              <Text variant="caption" color="textSecondary">
                {region.network}
              </Text>
            </View>
          ))}
          <Text variant="caption" color="textSecondary">
            {view.howToInvest}
          </Text>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  crisis: { gap: Spacing.one, paddingBottom: Spacing.two },
  measure: { gap: Spacing.one },
  body: { gap: Spacing.one, paddingLeft: Spacing.two, paddingBottom: Spacing.two },
  region: { gap: 2, paddingTop: Spacing.one },
});
