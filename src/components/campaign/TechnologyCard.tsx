import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import {
  CERTIFY_EXPORT_ACTION_ID,
  FUND_TECHNOLOGY_ACTION_ID,
  SUSPEND_TECHNOLOGY_ACTION_ID,
  type Decision,
  type GameContent,
  type GameState,
} from '@/engine';
import { fits, gameStore, hasDecision, useGame } from '@/store';

import { technologyFootnote, technologyTree, type TechnologyNodeView } from './technologyView';

/**
 * Árvore de tecnologias (PLANO_EXPANSAO F07, EX-32): ramos e nós com rotas importar, transferir e desenvolver. Cada
 * escolha é uma ação de agenda; o cartão mostra prazo, custo, incerteza, dependência externa, quem ganha e os riscos.
 */
export function TechnologyCard({
  state,
  content,
  actionsMax,
}: {
  state: GameState;
  content: GameContent;
  actionsMax: number;
}) {
  const draft = useGame((s) => s.draft);
  const [open, setOpen] = useState<string | null>(null);
  const tree = technologyTree(state, content);
  if (tree.length === 0) return null;

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

  const nodeBody = (node: TechnologyNodeView) => (
    <View style={styles.body}>
      <Text variant="caption">{node.summary}</Text>
      {node.prerequisites && (
        <Text variant="caption" color="textSecondary">
          {node.prerequisites}
        </Text>
      )}
      <Text variant="caption">{`Efeito esperado: ${node.effect}`}</Text>
      <Text variant="caption" color="textSecondary">
        {node.beneficiaries}
      </Text>
      <Text variant="caption" color="textSecondary">
        {node.adverse}
      </Text>
      {node.requirements && (
        <Text variant="caption" color="textSecondary">
          {node.requirements}
        </Text>
      )}
      {node.program && (
        <View style={styles.program}>
          <Text variant="label">{node.program.status}</Text>
          <Text variant="caption">{node.program.progress}</Text>
          {node.program.bottleneck && (
            <Text variant="caption" color="negative">
              {node.program.bottleneck}
            </Text>
          )}
          <Text variant="caption" color="textSecondary">
            {node.program.spent}
          </Text>
          {node.program.effect && <Text variant="caption">{node.program.effect}</Text>}
          {node.program.exportStatus && <Text variant="caption">{node.program.exportStatus}</Text>}
          {node.program.canSuspend &&
            action(
              { policyId: SUSPEND_TECHNOLOGY_ACTION_ID, agendaCost: 1, params: { nodeId: node.id } },
              'Suspender programa (1 ação)',
              true,
              'O gasto feito não volta; os estágios concluídos ficam guardados',
            )}
          {node.program.canCertify &&
            action(
              { policyId: CERTIFY_EXPORT_ACTION_ID, agendaCost: 1, params: { nodeId: node.id } },
              'Certificar para exportar (1 ação)',
              true,
            )}
        </View>
      )}
      {node.routes.map((route) => (
        <View key={route.route} style={styles.route}>
          <Text variant="label">{route.label}</Text>
          <Text variant="caption">{route.estimate}</Text>
          <Text variant="caption" color="textSecondary">
            {route.uncertainty}
          </Text>
          <Text variant="caption" color="textSecondary">
            {route.dependency}
          </Text>
          {route.route === 'transferir' ? (
            route.partners.length === 0 ? (
              <Text variant="caption" color="textSecondary">
                Nenhum parceiro aceita transferir agora: melhore a relação com missões comerciais.
              </Text>
            ) : (
              route.partners.map((partnerId) =>
                action(
                  {
                    policyId: FUND_TECHNOLOGY_ACTION_ID,
                    agendaCost: 1,
                    params: { nodeId: node.id, route: route.route, partnerId },
                  },
                  `Transferir com ${content.trade?.partners.find((p) => p.id === partnerId)?.name ?? partnerId} (1 ação)`,
                  route.available,
                ),
              )
            )
          ) : (
            action(
              { policyId: FUND_TECHNOLOGY_ACTION_ID, agendaCost: 1, params: { nodeId: node.id, route: route.route } },
              `${route.label} (1 ação)`,
              route.available,
              'Escolher outra rota para o mesmo nó substitui esta no mês',
            )
          )}
        </View>
      ))}
    </View>
  );

  return (
    <Card title="Ciência e tecnologia" subtitle={technologyFootnote()}>
      {tree.map((branch) => (
        <View key={branch.id} style={styles.branch}>
          <Text variant="label">{branch.name}</Text>
          {branch.nodes.map((node) => (
            <View key={node.id} style={styles.node}>
              <Button
                variant="ghost"
                label={`${open === node.id ? '▾' : '▸'} ${node.name}${node.program ? ` — ${node.program.status.split(' · ')[0]}` : node.locked ? ' — bloqueada' : ''}`}
                accessibilityHint={open === node.id ? 'Fecha os detalhes' : 'Abre pré-requisitos, rotas e riscos'}
                onPress={() => setOpen(open === node.id ? null : node.id)}
                block
              />
              {open === node.id && nodeBody(node)}
            </View>
          ))}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  branch: { gap: Spacing.one, paddingTop: Spacing.two },
  node: { gap: Spacing.one },
  body: { gap: Spacing.one, paddingLeft: Spacing.two, paddingBottom: Spacing.two },
  program: { gap: Spacing.one, paddingVertical: Spacing.one },
  route: { gap: Spacing.one, paddingTop: Spacing.one },
});
