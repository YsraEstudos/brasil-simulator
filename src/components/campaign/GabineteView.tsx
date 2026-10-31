import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { loadContent } from '@/content';
import { Button, Card, Text } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import {
  AGENDA_ACTIONS,
  BRAND_ACTION_ID,
  DIRECTIVE_ACTION_ID,
  isNovoBeneficio,
  vedacaoAtiva,
  type Decision,
  type GameContent,
} from '@/engine';
import { useTheme } from '@/hooks/use-theme';
import type { Policy } from '@/types/policy';
import { decisionCost, draftCost, fits, gameStore, useGame, type ActiveCampaign } from '@/store';

import { AgendaActions } from './AgendaActions';
import { decisionLabel } from './agendaLabel';
import { DecisionPanel } from './DecisionPanel';
import { Icon, ICONS, SectionTab, type IconName } from './GabineteBits';
import { DIFFICULTY } from './labels';
import { DirectivesPanel, ProjectsPanel } from './PublicPoliciesPanel';

type Section = 'decisoes' | 'diretrizes' | 'projetos' | 'acoes';

const SECTIONS: readonly { id: Section; label: string; icon: IconName }[] = [
  { id: 'decisoes', label: 'Decisões', icon: ICONS.decisions },
  { id: 'diretrizes', label: 'Ministérios', icon: ICONS.ministries },
  { id: 'projetos', label: 'Obras e marcas', icon: ICONS.projects },
  { id: 'acoes', label: 'Ações rápidas', icon: ICONS.actions },
];

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
  const [section, setSection] = useState<Section>('decisoes');

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

  const counts: Record<Section, number> = {
    decisoes: draft.decisions.filter((d) => content.policies[d.policyId] !== undefined).length,
    diretrizes: draft.decisions.filter((d) => d.policyId === DIRECTIVE_ACTION_ID).length,
    projetos: draft.decisions.filter((d) => d.policyId === BRAND_ACTION_ID).length,
    acoes: draft.decisions.filter((d) => AGENDA_ACTIONS[d.policyId]?.listed).length,
  };

  return (
    <View style={styles.root}>
      <AgendaSummary
        campaignLabel={`${campaign.name} · ${DIFFICULTY[state.difficulty].name}`}
        content={content}
        decisions={draft.decisions}
        eventChoices={Object.keys(draft.eventChoices).length}
        actionsUsed={actionsUsed}
        actionsMax={actionsMax}
        onRemove={toggleDecision}
      />

      <View style={styles.tabs} accessibilityRole="tablist">
        {SECTIONS.map((s) => (
          <SectionTab
            key={s.id}
            icon={s.icon}
            label={s.label}
            active={section === s.id}
            count={counts[s.id]}
            onPress={() => setSection(s.id)}
          />
        ))}
      </View>

      {section === 'decisoes' && (
        <DecisionPanel
          state={state}
          content={content}
          selected={selected}
          expandedId={expandedPolicy}
          actionsMax={actionsMax}
          onExpand={setExpandedPolicy}
          onToggle={toggleSimple}
          canInclude={canInclude}
          isVedada={isVedada}
          onToggleBypass={toggleBypass}
        />
      )}
      {section === 'diretrizes' && <DirectivesPanel state={state} content={content} actionsMax={actionsMax} />}
      {section === 'projetos' && <ProjectsPanel state={state} content={content} actionsMax={actionsMax} />}
      {section === 'acoes' && (
        <AgendaActions
          state={state}
          content={content}
          selected={selected}
          canInclude={(cost) => actionsUsed + cost <= actionsMax}
          onToggle={toggleSimple}
        />
      )}
    </View>
  );
}

/**
 * Topo do Gabinete: as ações de agenda do mês como casas (cheias = usadas) e a lista do que já foi marcado, com
 * como retirar. Lembra que nada acontece antes de encerrar o mês no Painel.
 */
function AgendaSummary({
  campaignLabel,
  content,
  decisions,
  eventChoices,
  actionsUsed,
  actionsMax,
  onRemove,
}: {
  campaignLabel: string;
  content: GameContent;
  decisions: readonly Decision[];
  eventChoices: number;
  actionsUsed: number;
  actionsMax: number;
  onRemove: (decision: Decision) => void;
}) {
  const { colors } = useTheme();
  const left = actionsMax - actionsUsed;
  const slots = Math.max(actionsMax, actionsUsed);
  return (
    <View style={[styles.summary, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
      <View style={styles.summaryTop}>
        <Icon name={ICONS.agenda} size={22} />
        <View style={styles.summaryTitle}>
          <Text variant="heading">Agenda do mês</Text>
          <Text variant="caption" color="textMuted">
            {campaignLabel}
          </Text>
        </View>
        <View style={styles.summaryCount}>
          <Text variant="title" color={left > 0 ? 'accent' : 'textSecondary'} tabular>
            {left}
          </Text>
          <Text variant="caption" color="textSecondary">
            {left === 1 ? 'ação livre' : 'ações livres'}
          </Text>
        </View>
      </View>

      <View
        style={styles.slots}
        accessible
        accessibilityLabel={`${actionsUsed} de ${actionsMax} ações de agenda usadas neste mês`}>
        {Array.from({ length: slots }, (_, i) => (
          <View
            key={i}
            style={[
              styles.slot,
              i < actionsUsed
                ? { backgroundColor: colors.accent, borderColor: colors.accent }
                : { borderColor: colors.border, backgroundColor: colors.surfaceRaised },
            ]}
          />
        ))}
      </View>

      {decisions.length === 0 && eventChoices === 0 ? (
        <Text variant="caption" color="textSecondary">
          Escolha nas abas abaixo o que entra na agenda. Cada item gasta ações; nada é aplicado até você encerrar o mês
          no Painel.
        </Text>
      ) : (
        <View style={styles.picked}>
          {decisions.map((decision) => {
            const label = decisionLabel(decision, content);
            return (
              <Pressable
                key={`${decision.policyId}:${JSON.stringify(decision.params ?? {})}`}
                onPress={() => onRemove(decision)}
                accessibilityRole="button"
                accessibilityLabel={`Retirar ${label} da agenda`}
                style={({ pressed }) => [
                  styles.pickedChip,
                  { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
                  pressed && styles.pressed,
                ]}>
                <Icon name={ICONS.check} size={14} />
                <Text variant="caption" numberOfLines={1} style={styles.pickedLabel}>
                  {label}
                </Text>
                <Text variant="caption" color="accent" tabular>
                  {decisionCost(decision, content)}
                </Text>
                <Icon name={ICONS.remove} size={12} color="textMuted" />
              </Pressable>
            );
          })}
          {eventChoices > 0 && (
            <View style={[styles.pickedChip, { borderColor: colors.border }]}>
              <Icon name={ICONS.info} size={14} color="textSecondary" />
              <Text variant="caption" color="textSecondary">
                {eventChoices} {eventChoices === 1 ? 'resposta a evento' : 'respostas a eventos'}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.three },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  summary: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.two },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  summaryTitle: { flex: 1 },
  summaryCount: { alignItems: 'flex-end' },
  slots: { flexDirection: 'row', gap: Spacing.one },
  slot: { flex: 1, height: 10, borderRadius: 5, borderWidth: 1 },
  picked: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  pickedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    minHeight: 32,
    maxWidth: '100%',
  },
  pickedLabel: { flexShrink: 1 },
  pressed: { opacity: 0.75 },
});
