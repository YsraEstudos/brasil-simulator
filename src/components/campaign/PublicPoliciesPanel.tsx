import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

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

import { GovernmentBrands } from './GovernmentBrands';
import { PROPOSAL_STATUS_LABEL } from './labels';
import { currentDirective } from './publicPolicyView';

const DIRECTIVE_ACTION = AGENDA_ACTIONS[DIRECTIVE_ACTION_ID];

export interface PublicPoliciesPanelProps {
  state: GameState;
  content: GameContent;
  pointsMax: number;
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

/** Diretrizes, carteira e marcas da Fase 06 na tela da Presidência. */
export function PublicPoliciesPanel({ state, content, pointsMax }: PublicPoliciesPanelProps) {
  const { colors } = useTheme();
  const draft = useGame((s) => s.draft);
  const [openMinistryId, setOpenMinistryId] = useState<string | null>(null);
  const publicState: PublicPolicyState = state.publicPolicies;
  const directives = publicState.directives;
  const projects = publicState.projects;
  const currentYear = toCalendar(state.monthIndex).year;
  const routineMinistries = ministriesOf(content)
    .map((ministry) => ({ ministry, policies: routinePolicies(content, ministry.areas) }))
    .filter(({ policies }) => policies.length > 0);

  return (
    <View style={styles.root}>
      <Card
        title="Diretrizes ministeriais"
        subtitle="Políticas de rotina com orçamento anual em R$ milhões. A seleção entra na agenda e só é aplicada ao encerrar o mês.">
        {routineMinistries.length === 0 ? (
          <Text variant="body" color="textSecondary">
            Nenhuma política de rotina disponível para as pastas deste cenário.
          </Text>
        ) : (
          routineMinistries.map(({ ministry, policies }) => {
            const current = currentDirective(directives, ministry.id, state.monthIndex);
            const open = openMinistryId === ministry.id;
            const currentPolicy = current ? content.policies[current.policyId] : undefined;
            const summary = current
              ? `Vigente: ${currentPolicy?.name ?? current.policyId} · ${formatMoneyMillions(current.annualMillions)}/ano`
              : `${policies.length} rotina${policies.length === 1 ? '' : 's'} · nenhuma diretriz vigente`;
            return (
              <View key={ministry.id} style={styles.ministry}>
                <Card
                  title={ministry.name}
                  subtitle={`${summary} · ${open ? 'toque para fechar' : 'toque para abrir opções'}`}
                  onPress={() => setOpenMinistryId(open ? null : ministry.id)}
                  accessibilityLabel={`${open ? 'Fechar' : 'Abrir'} diretrizes de ${ministry.name}`}
                />
                {open && (
                  <View style={styles.ministryBody}>
                    <Text variant="caption" color="textSecondary">
                      Ano-base {currentYear}. O custo e o lag abaixo vêm do catálogo; selecionar só prepara a agenda.
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
                        pointsMax={pointsMax}
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
      </Card>

      <ProjectWallet
        state={state}
        content={content}
        projects={projects}
        capitalStockMillions={publicState.capitalStockMillions}
      />
      <GovernmentBrands state={state} content={content} pointsMax={pointsMax} />
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
  pointsMax,
  current,
  colors,
}: {
  ministryId: string;
  ministryName: string;
  policy: NonNullable<GameContent['policies'][string]>;
  state: GameState;
  content: GameContent;
  draft: AgendaDraft;
  pointsMax: number;
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
  const canInclude = selected || (validation === null && fits(draft, decision, content, pointsMax));
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
    <View style={styles.directiveRow}>
      <Text variant="label">{policy.name}</Text>
      <Text variant="caption" color="textSecondary">
        {policy.summary}
      </Text>
      <Text variant="caption" color="textSecondary">
        {routineMeta(policy)}
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
        label={selected ? 'Retirar diretriz da agenda' : 'Definir diretriz (1 ponto)'}
        variant={selected ? 'secondary' : 'primary'}
        disabled={!selected && !canInclude}
        accessibilityHint={
          !selected && !canInclude ? 'Informe um orçamento válido e verifique os pontos de agenda' : undefined
        }
        onPress={toggle}
        block
      />
    </View>
  );
}

function routineMeta(policy: NonNullable<GameContent['policies'][string]>): string {
  const lags = [...new Set(policy.impacts.map((impact) => impact.lagMonths))].sort((a, b) => a - b);
  const lagText =
    lags.length === 0
      ? 'lag não informado'
      : lags.length === 1
        ? `lag ${lags[0]} ${lags[0] === 1 ? 'mês' : 'meses'}`
        : `lags ${lags.join(', ')} meses`;
  return `Custo de catálogo: ${formatMoneyMillions(policy.cost.annualMillions)}/ano · ${lagText}`;
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
      subtitle="Execução mensal, desembolso, atrasos e manutenção aparecem juntos para evitar confundir projeto com efeito já entregue.">
      <Text variant="body" color="textSecondary">
        Capital público líquido em operação: {formatMoneyMillions(capitalStockMillions)} · manutenção anual:{' '}
        {formatMoneyMillions(projects.reduce((sum, project) => sum + project.maintenanceMillions, 0))}
      </Text>
      {projects.length === 0 ? (
        <Text variant="body" color="textSecondary">
          Nenhum projeto explícito na carteira.
        </Text>
      ) : (
        projects.map((project) => {
          const proposal = state.proposals.find((item) => item.id === project.proposalId);
          const title = content.policies[project.policyId]?.name ?? project.policyId;
          const status = proposal ? PROPOSAL_STATUS_LABEL[proposal.status] : 'Proposta não encontrada';
          const delay =
            project.delayMonths > 0
              ? ` · atraso ${project.delayMonths} ${project.delayMonths === 1 ? 'mês' : 'meses'}`
              : '';
          return (
            <View key={project.proposalId} style={styles.project}>
              <Text variant="label">{title}</Text>
              <Text
                variant="caption"
                color="textSecondary">{`${status} · ${phaseLabel(project.phase)} · ${formatPercent(project.progress, 0)} executado${delay}`}</Text>
              <Text
                variant="caption"
                color="textSecondary">{`${formatMoneyMillions(project.spentMillions)} de ${formatMoneyMillions(project.budgetMillions)} · manutenção anual ${formatMoneyMillions(project.maintenanceMillions)}`}</Text>
            </View>
          );
        })
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.three },
  ministry: { gap: Spacing.two, paddingTop: Spacing.two },
  ministryBody: { gap: Spacing.two, paddingHorizontal: Spacing.one },
  directiveRow: { gap: Spacing.one, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two },
  project: {
    gap: Spacing.one,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
    paddingTop: Spacing.two,
  },
  input: {
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    fontSize: 16,
  },
});
