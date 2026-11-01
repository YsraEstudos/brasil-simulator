import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ministryIcon } from '@/components/painel/HudBits';

import { Button, Card, formatMoneyMillions, formatPercent, Text } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import {
  AGENDA_ACTIONS,
  DIRECTIVE_ACTION_ID,
  ministriesOf,
  toCalendar,
  validateActionTarget,
  type GameContent,
  type GameState,
  type Decision,
} from '@/engine';
import type { PublicPolicyState, PublicProject } from '@/engine/publicPolicies/types';
import { useTheme } from '@/hooks/use-theme';
import { decisionCost, fits, gameStore, hasDecision, useGame, type AgendaDraft } from '@/store';

import { Badge, Icon, ICONS, IconTile, ProgressBar, SectionHeader } from './GabineteBits';
import { GovernmentBrands } from './GovernmentBrands';
import { PROPOSAL_STATUS_LABEL } from './labels';
import { currentDirective } from './publicPolicyView';

const DIRECTIVE_ACTION = AGENDA_ACTIONS[DIRECTIVE_ACTION_ID];

export interface PublicPoliciesPanelProps {
  state: GameState;
  content: GameContent;
  actionsMax: number;
}

function routinePolicies(content: GameContent, ministryAreas: readonly string[]) {
  return content.scenario.policies
    .map((id) => content.policies[id])
    .filter((policy): policy is NonNullable<typeof policy> => policy !== undefined)
    .filter((policy) => policy.delivery === 'rotina' && ministryAreas.includes(policy.area));
}

function parseMillions(value: string): number {
  const normalized = value.trim().replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function formatInputMillions(value: number): string {
  return Number.isFinite(value) ? String(value).replace('.', ',') : '';
}

function phaseLabel(phase: string): string {
  return (
    (
      {
        planejamento: 'Planejamento',
        licenciamento: 'Licenciamento',
        licitacao: 'Licitação',
        obra: 'Obra',
        operacao: 'Operação',
        cancelado: 'Cancelado',
      } as Record<string, string>
    )[phase] ?? phase
  );
}

/** Diretrizes ministeriais da Fase 06 no Gabinete: uma pasta por linha, aberta para escolher rotina e orçamento. */
export function DirectivesPanel({ state, content, actionsMax }: PublicPoliciesPanelProps) {
  const { colors } = useTheme();
  const draft = useGame((s) => s.draft);
  const [openMinistryId, setOpenMinistryId] = useState<string | null>(null);
  const directives = state.publicPolicies.directives;
  const currentYear = toCalendar(state.monthIndex).year;
  const routineMinistries = ministriesOf(content)
    .map((ministry) => ({ ministry, policies: routinePolicies(content, ministry.areas) }))
    .filter(({ policies }) => policies.length > 0);

  return (
    <View style={styles.root}>
      <SectionHeader
        icon={ICONS.ministries}
        title="Diretrizes ministeriais"
        description="Diga a cada ministério qual programa de rotina tocar e quanto gastar por ano. Custa 1 ação e vale ao encerrar o mês."
      />
      {routineMinistries.length === 0 ? (
        <Text variant="body" color="textSecondary">
          Nenhuma política de rotina disponível para as pastas deste cenário.
        </Text>
      ) : (
        routineMinistries.map(({ ministry, policies }) => {
          const current = currentDirective(directives, ministry.id, state.monthIndex);
          const open = openMinistryId === ministry.id;
          const currentPolicy = current ? content.policies[current.policyId] : undefined;
          const pending = draft.decisions.some(
            (decision) => decision.policyId === DIRECTIVE_ACTION_ID && decision.params?.ministryId === ministry.id,
          );
          return (
            <View
              key={ministry.id}
              style={[
                styles.ministry,
                { backgroundColor: colors.surface, borderColor: pending ? colors.accent : colors.border },
              ]}>
              <Pressable
                onPress={() => setOpenMinistryId(open ? null : ministry.id)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                accessibilityLabel={`${open ? 'Fechar' : 'Abrir'} diretrizes de ${ministry.name}`}
                style={({ pressed }) => [styles.ministryHead, pressed && styles.pressed]}>
                <IconTile name={ministryIcon(ministry.areas)} />
                <View style={styles.grow}>
                  <Text variant="label">{ministry.name}</Text>
                  {current ? (
                    <Text variant="caption" color="positive">
                      {`Vigente: ${currentPolicy?.name ?? current.policyId} · ${formatMoneyMillions(current.annualMillions)}/ano`}
                    </Text>
                  ) : (
                    <Text variant="caption" color="textMuted">
                      {`Sem diretriz · ${policies.length} ${policies.length === 1 ? 'programa disponível' : 'programas disponíveis'}`}
                    </Text>
                  )}
                </View>
                {pending && <Icon name={ICONS.check} size={20} />}
                <Icon name={open ? ICONS.collapse : ICONS.expand} size={20} color="textSecondary" />
              </Pressable>
              {open && (
                <View style={styles.ministryBody}>
                  <Text variant="caption" color="textSecondary">
                    Ano-base {currentYear}. Ajuste o orçamento anual (R$ milhões) e defina a diretriz; o efeito chega
                    depois do prazo indicado.
                  </Text>
                  {policies.map((policy) => (
                    <DirectiveRow
                      key={`${ministry.id}:${policy.id}`}
                      ministryId={ministry.id}
                      ministryName={ministry.name}
                      policy={policy}
                      state={state}
                      content={content}
                      draft={draft}
                      actionsMax={actionsMax}
                      current={current?.policyId === policy.id ? current : undefined}
                      colors={colors}
                    />
                  ))}
                </View>
              )}
            </View>
          );
        })
      )}
    </View>
  );
}

/** Obras e marcas: a carteira de projetos em execução e as marcas de governo dadas a eles. */
export function ProjectsPanel({ state, content, actionsMax }: PublicPoliciesPanelProps) {
  const publicState: PublicPolicyState = state.publicPolicies;
  return (
    <View style={styles.root}>
      <SectionHeader
        icon={ICONS.projects}
        title="Obras e marcas"
        description="Acompanhe o andamento dos projetos aprovados e dê um nome de marca aos que quer associar ao seu governo."
      />
      <ProjectWallet
        state={state}
        content={content}
        projects={publicState.projects}
        capitalStockMillions={publicState.capitalStockMillions}
      />
      <GovernmentBrands state={state} content={content} actionsMax={actionsMax} />
    </View>
  );
}

function DirectiveRow({
  ministryId,
  ministryName,
  policy,
  state,
  content,
  draft,
  actionsMax,
  current,
  colors,
}: {
  ministryId: string;
  ministryName: string;
  policy: NonNullable<GameContent['policies'][string]>;
  state: GameState;
  content: GameContent;
  draft: AgendaDraft;
  actionsMax: number;
  current?: { ministryId: string; policyId: string; annualMillions: number; year: number };
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const pending = draft.decisions.find(
    (decision) =>
      decision.policyId === DIRECTIVE_ACTION_ID &&
      decision.params?.ministryId === ministryId &&
      decision.params?.policyId === policy.id,
  );
  const initial =
    typeof pending?.params?.annualMillions === 'number'
      ? pending.params.annualMillions
      : (current?.annualMillions ?? policy.cost.annualMillions);
  const [budgetText, setBudgetText] = useState(formatInputMillions(initial));
  const [touched, setTouched] = useState(false);
  const budget = parseMillions(budgetText);
  const invalid = !Number.isFinite(budget) || budget <= 0;
  const decision: Decision = {
    policyId: DIRECTIVE_ACTION_ID,
    agendaCost: decisionCost({ policyId: DIRECTIVE_ACTION_ID, agendaCost: 1 }, content) || 1,
    params: { ministryId, policyId: policy.id, annualMillions: budget },
  };
  const validation = invalid ? 'orçamento inválido' : validateActionTarget(DIRECTIVE_ACTION!, decision, state, content);
  const selected = hasDecision(draft, decision);
  const canInclude = selected || (validation === null && fits(draft, decision, content, actionsMax));
  const error =
    touched && invalid
      ? 'Informe um valor positivo em R$ milhões, usando números decimais.'
      : touched && validation
        ? 'A diretriz não é válida para esta pasta neste mês.'
        : undefined;

  const toggle = () => {
    if (!selected && (!canInclude || validation !== null)) return;
    gameStore.getState().toggleDecision(decision);
  };

  return (
    <View style={[styles.directiveRow, { borderColor: selected ? colors.accent : colors.border }]}>
      <View style={styles.rowTop}>
        <Text variant="label" style={styles.grow}>
          {policy.name}
        </Text>
        {current && <Badge icon={ICONS.check} label="Vigente" tone="positive" />}
      </View>
      <Text variant="caption" color="textSecondary">
        {policy.summary}
      </Text>
      <View style={styles.badges}>
        <Badge icon={ICONS.fazenda} label={`Catálogo: ${formatMoneyMillions(policy.cost.annualMillions)}/ano`} />
        <Badge icon={ICONS.inProgress} label={lagText(policy)} />
      </View>
      <Text variant="caption" color="textMuted">
        Orçamento anual (R$ milhões)
      </Text>
      <TextInput
        accessibilityLabel={`Orçamento anual para ${policy.name} em ${ministryName}`}
        keyboardType="decimal-pad"
        onBlur={() => setTouched(true)}
        onChangeText={setBudgetText}
        placeholder="R$ milhões por ano"
        returnKeyType="done"
        style={[styles.input, { color: colors.text, borderColor: error ? colors.negative : colors.border }]}
        value={budgetText}
      />
      {error && (
        <Text variant="caption" color="negative">
          {error}
        </Text>
      )}
      <Button
        label={selected ? 'Retirar diretriz da agenda' : 'Definir diretriz (1 ação)'}
        variant={selected ? 'secondary' : 'primary'}
        disabled={!selected && !canInclude}
        accessibilityHint={
          !selected && !canInclude ? 'Informe um orçamento válido e verifique as ações de agenda' : undefined
        }
        onPress={toggle}
        block
      />
    </View>
  );
}

/** Prazo até o efeito: "efeito em 3 meses", "efeito em 1, 6 meses". */
function lagText(policy: NonNullable<GameContent['policies'][string]>): string {
  const lags = [...new Set(policy.impacts.map((impact) => impact.lagMonths))].sort((a, b) => a - b);
  if (lags.length === 0) return 'prazo não informado';
  if (lags.length === 1) return `efeito em ${lags[0]} ${lags[0] === 1 ? 'mês' : 'meses'}`;
  return `efeito em ${lags.join(', ')} meses`;
}

function ProjectWallet({
  state,
  content,
  projects,
  capitalStockMillions,
}: {
  state: GameState;
  content: GameContent;
  projects: readonly PublicProject[];
  capitalStockMillions: number;
}) {
  return (
    <Card
      title="Carteira de projetos"
      subtitle="Projeto aprovado não é obra entregue: o efeito só aparece quando a obra entra em operação.">
      <View style={styles.badges}>
        <Badge icon={ICONS.ministries} label={`Capital em operação: ${formatMoneyMillions(capitalStockMillions)}`} />
        <Badge
          icon={ICONS.projects}
          label={`Manutenção: ${formatMoneyMillions(projects.reduce((sum, project) => sum + project.maintenanceMillions, 0))}/ano`}
        />
      </View>
      {projects.length === 0 ? (
        <Text variant="body" color="textSecondary">
          Nenhum projeto explícito na carteira.
        </Text>
      ) : (
        projects.map((project) => {
          const proposal = state.proposals.find((item) => item.id === project.proposalId);
          const title = content.policies[project.policyId]?.name ?? project.policyId;
          const status = proposal ? PROPOSAL_STATUS_LABEL[proposal.status] : 'Proposta não encontrada';
          const late = project.delayMonths > 0;
          return (
            <View key={project.proposalId} style={styles.project}>
              <View style={styles.rowTop}>
                <Text variant="label" style={styles.grow}>
                  {title}
                </Text>
                <Text variant="label" color="accent" tabular>
                  {formatPercent(project.progress, 0)}
                </Text>
              </View>
              <ProgressBar
                value={project.progress}
                color={project.phase === 'cancelado' ? 'negative' : late ? 'warning' : 'accent'}
              />
              <View style={styles.badges}>
                <Badge
                  label={phaseLabel(project.phase)}
                  tone={project.phase === 'operacao' ? 'positive' : 'textSecondary'}
                />
                <Badge label={status} />
                {late && (
                  <Badge
                    icon={ICONS.warning}
                    label={`atraso de ${project.delayMonths} ${project.delayMonths === 1 ? 'mês' : 'meses'}`}
                    tone="warning"
                  />
                )}
              </View>
              <Text
                variant="caption"
                color="textSecondary">{`Gasto ${formatMoneyMillions(project.spentMillions)} de ${formatMoneyMillions(project.budgetMillions)} · manutenção anual ${formatMoneyMillions(project.maintenanceMillions)}`}</Text>
            </View>
          );
        })
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.two },
  grow: { flex: 1 },
  pressed: { opacity: 0.75 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  ministry: { borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden' },
  ministryHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three },
  ministryBody: { gap: Spacing.two, paddingHorizontal: Spacing.three, paddingBottom: Spacing.three },
  directiveRow: { gap: Spacing.one, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.two },
  project: { gap: Spacing.one, paddingTop: Spacing.two },
  input: {
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    fontSize: 16,
  },
});
