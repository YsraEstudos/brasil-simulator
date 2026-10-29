import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { loadContent } from '@/content';
import { Button, Card, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { careerDefeated, isNovoBeneficio, vedacaoAtiva, type Decision } from '@/engine';
import type { Policy } from '@/types/policy';
import { decisionCost, draftCost, fits, gameStore, useGame, type ActiveCampaign } from '@/store';

import { ThermometersCard } from './ThermometersCard';
import { AgendaActions } from './AgendaActions';
import { DecisionPanel } from './DecisionPanel';
import { HealthCard } from './HealthCard';
import { DIFFICULTY } from './labels';
import { PressCard } from './PressCard';
import { PublicPoliciesPanel } from './PublicPoliciesPanel';
import { SkillsCard } from './SkillsCard';
import { TechnologyCard } from './TechnologyCard';
import { TradeCard } from './TradeCard';

/**
 * Gabinete (GAME_DESIGN.md §4.2): a agenda presidencial do mês — mesa de despacho das decisões, políticas públicas
 * com as marcas de governo e ações de agenda simples. O resto do mês mora em outros lugares: alertas, sanção e
 * veto, e eleições são folhas do Painel; as propostas em tramitação ficam no Congresso; o legado, em sua subtela.
 * Com a campanha encerrada não há mais o que decidir: o Gabinete só indica o caminho para o legado.
 */
export function GabineteView({ campaign }: { campaign: ActiveCampaign }) {
  const { state, finished } = campaign;
  const content = useMemo(() => loadContent(state.scenarioId), [state.scenarioId]);

  const draft = useGame((s) => s.draft);
  const [expandedPolicy, setExpandedPolicy] = useState<string | null>(null);

  const actionsMax = state.resources.agendaActionsPerMonth;
  const actionsUsed = draftCost(draft, content);
  const { toggleDecision } = gameStore.getState();

  // Políticas e ações marcadas sem alvo; as com alvo (negociação, ministérios) aparecem na subtela Congresso. Decisões
  // com apenas a quebra declarada da vedação contam como simples (a mesa de despacho as marca e desmarca).
  const selected = draft.decisions
    .filter((d) => d.params === undefined || Object.keys(d.params).every((key) => key === 'vedacao_bypass'))
    .map((d) => d.policyId);
  const simple = (id: string): Decision => {
    const decision: Decision = { policyId: id, agendaCost: 0 };
    return { ...decision, agendaCost: decisionCost(decision, content) };
  };

  const canInclude = (policy: Policy): boolean =>
    selected.includes(policy.id) || fits(draft, simple(policy.id), content, actionsMax);

  const toggleSimple = (id: string) => {
    const decision = simple(id);
    if (selected.includes(id) || fits(draft, decision, content, actionsMax)) toggleDecision(decision);
  };

  // Vedação eleitoral (Fase 08): incluir novo benefício na janela exige a quebra declarada (`vedacao_bypass`).
  const isVedada = (policy: Policy): boolean => vedacaoAtiva(state, content) && isNovoBeneficio(policy);
  const toggleBypass = (id: string) => {
    const decision: Decision = { ...simple(id), params: { vedacao_bypass: true } };
    if (selected.includes(id) || fits(draft, decision, content, actionsMax)) toggleDecision(decision);
  };

  if (finished && careerDefeated(state)) {
    return (
      <Card title="A campanha terminou" subtitle="A candidatura perdeu a eleição: não houve mandato.">
        <Text variant="body" color="textSecondary">
          O resumo mostra o resultado, o que pesou na disputa e como tentar de novo.
        </Text>
        <Button label="Ver o resumo" onPress={() => router.replace('/legado')} block />
      </Card>
    );
  }
  if (finished) {
    return (
      <Card title="A campanha terminou" subtitle="O mandato acabou: não há mais agenda a montar.">
        <Text variant="body" color="textSecondary">
          O relatório de legado mostra o país que você recebeu e o que entregou.
        </Text>
        <Button label="Ver o legado" onPress={() => router.replace('/legado')} block />
      </Card>
    );
  }

  return (
    <View style={styles.root}>
      <Text variant="caption" color="textSecondary">
        {campaign.name} · {DIFFICULTY[state.difficulty].name}
      </Text>

      <DecisionPanel
        state={state}
        content={content}
        selected={selected}
        expandedId={expandedPolicy}
        actionsUsed={actionsUsed}
        actionsMax={actionsMax}
        onExpand={setExpandedPolicy}
        onToggle={toggleSimple}
        canInclude={canInclude}
        isVedada={isVedada}
        onToggleBypass={toggleBypass}
      />

      <PublicPoliciesPanel state={state} content={content} actionsMax={actionsMax} />

      <ThermometersCard state={state} content={content} />

      <HealthCard state={state} content={content} actionsMax={actionsMax} />
      <PressCard state={state} content={content} actionsMax={actionsMax} />

      <SkillsCard state={state} content={content} actionsMax={actionsMax} />
      <TechnologyCard state={state} content={content} actionsMax={actionsMax} />
      <TradeCard state={state} content={content} actionsMax={actionsMax} />

      <AgendaActions
        state={state}
        content={content}
        selected={selected}
        canInclude={(cost) => actionsUsed + cost <= actionsMax}
        onToggle={toggleSimple}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.four },
});
