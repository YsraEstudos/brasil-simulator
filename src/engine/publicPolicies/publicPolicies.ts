import { termOf, toCalendar } from '../calendar';
import { recordBudgetLaws } from './budgetLaws';
import { climateParam } from '../climate/calibration';
import { policyCapacity, policyManagement } from '../congress/management';
import { preventionOf, type Prevention } from '../climate/effects';
import { annualReview, fiscalStructure, revenueMonth, spendingMonth } from '../economy/fiscal';
import { BRAND_ACTION_ID, DIRECTIVE_ACTION_ID } from '../actions';
import { currentNominalGdpMillions, fiscalValues, scenarioEconomyValues } from '../state';
import { EDUCATION_LEVER_IDS } from '../education/types';
import { advanceAgreement, agreementRegional, counterpartCoverage, createAgreement } from './federative';
import type {
  Decision,
  DecisionRejection,
  GameContent,
  GameState,
  ImpulseRegional,
  MonthStep,
  Proposal,
  ProposalStatus,
  ScheduledImpulse,
  StepContext,
} from '../types';
import type { Policy } from '../../types/policy';
import {
  PROJECT_PHASES,
  type GovernmentBrand,
  type MinistryDirective,
  type ProjectPhase,
  type PublicPolicyState,
  type PublicProject,
} from './types';

export { BRAND_ACTION_ID, DIRECTIVE_ACTION_ID } from '../actions';

const MONTHS_PER_YEAR = 12;
const MAX_BRANDS_PER_TERM = 3;
const MAX_BRAND_NAME_LENGTH = 60;
const ROUTINE_IMPULSE_PREFIX = 'diretriz:';
const PROJECT_IMPULSE_PREFIX = 'projeto:';
const EPSILON = 1e-9;

type PublicGameState = GameState;

export const BRANDABLE_STATUSES: ReadonlySet<ProposalStatus> = new Set([
  'em_tramitacao',
  'parada',
  'em_execucao',
  'concluida',
]);

interface BudgetPreview {
  gdpMillions: number;
  annualRoomMillions: number;
}

interface ProjectRun {
  project: PublicProject;
  proposal: Proposal | undefined;
  policy: Policy | undefined;
  capacity: number;
  preparation: number;
  licensing: number;
  procurement: number;
}

/**
 * Validates one of the two public-policy actions. The caller may pass a state returned by
 * `reservePublicAction` to screen a batch without accidentally approving two requests against one room.
 */
export function validatePublicAction(
  decision: Decision,
  state: Readonly<GameState>,
  content: GameContent,
): DecisionRejection | null {
  if (decision.policyId !== DIRECTIVE_ACTION_ID && decision.policyId !== BRAND_ACTION_ID) return null;
  if (!Number.isFinite(decision.agendaCost) || decision.agendaCost < 0) return 'custo_invalido';
  const params = decision.params;
  const publicState = readPublicState(state);
  const t = state.monthIndex;

  if (decision.policyId === DIRECTIVE_ACTION_ID) {
    const ministryId = stringParam(params, 'ministryId');
    const policyId = stringParam(params, 'policyId');
    const annualMillions = numberParam(params, 'annualMillions');
    if (!ministryId || !policyId || annualMillions === null || !(annualMillions > 0)) return 'alvo_invalido';
    const ministry = content.scenario.institutions?.ministries.find((item) => item.id === ministryId);
    const policy = content.policies[policyId];
    if (
      !ministry ||
      !policy ||
      !content.scenario.policies.includes(policyId) ||
      policy.delivery !== 'rotina' ||
      !ministry.areas.includes(policy.area)
    ) {
      return 'alvo_invalido';
    }
    const year = yearOf(t);
    const duplicate =
      publicState.directives.some(
        (directive) =>
          directive.year === year && directive.ministryId === ministryId && directive.policyId === policyId,
      ) &&
      publicState.directives.some(
        (directive) =>
          directive.year === year &&
          directive.ministryId === ministryId &&
          directive.policyId === policyId &&
          directive.annualMillions === annualMillions,
      );
    if (duplicate) return 'acao_repetida';
    const requested = publicState.directives
      .filter((directive) => directive.year === year && directive.ministryId !== ministryId)
      .reduce((sum, directive) => sum + safePositive(directive.annualMillions), 0);
    const room = budgetPreview(state, content).annualRoomMillions;
    if (requested + annualMillions > room + EPSILON) return 'custo_invalido';
    return null;
  }

  const proposalId = stringParam(params, 'proposalId');
  const name = stringParam(params, 'name');
  if (!proposalId || !name || name.trim().length === 0 || [...name.trim()].length > MAX_BRAND_NAME_LENGTH) {
    return 'alvo_invalido';
  }
  const proposal = state.proposals.find((item) => item.id === proposalId);
  const policy = proposal ? content.policies[proposal.policyId] : undefined;
  if (!proposal || !policy || policy.delivery !== 'projeto' || !BRANDABLE_STATUSES.has(proposal.status)) {
    return 'alvo_invalido';
  }
  if (publicState.brands.some((brand) => brand.proposalId === proposalId)) return 'acao_repetida';
  const term = termOf(t);
  if (publicState.brands.filter((brand) => brand.term === term).length >= MAX_BRANDS_PER_TERM) {
    return 'alvo_invalido';
  }
  return null;
}

/**
 * Reserves an accepted public action for input screening. It has no economic effect and consumes no RNG;
 * the monthly step applies the reservation later. Invalid decisions are returned unchanged.
 */
export function reservePublicAction(state: Readonly<GameState>, decision: Decision, content: GameContent): GameState {
  if (validatePublicAction(decision, state, content) !== null) return state as GameState;
  return applyReservedPublicAction(state, decision);
}

/** Applies an action already accepted by input screening without rechecking mutable proposal or fiscal state. */
export function applyReservedPublicAction(state: Readonly<GameState>, decision: Decision): GameState {
  const publicState = readPublicState(state);
  const params = decision.params;
  if (decision.policyId === DIRECTIVE_ACTION_ID) {
    const ministryId = stringParam(params, 'ministryId');
    const policyId = stringParam(params, 'policyId');
    const annualMillions = numberParam(params, 'annualMillions');
    if (!ministryId || !policyId || annualMillions === null || !(annualMillions > 0)) return state as GameState;
    const directive: MinistryDirective = { ministryId, policyId, annualMillions, year: yearOf(state.monthIndex) };
    return withPublicState(state, {
      ...publicState,
      directives: [
        ...publicState.directives.filter(
          (item) => !(item.year === directive.year && item.ministryId === directive.ministryId),
        ),
        directive,
      ],
    });
  }
  const proposalId = stringParam(params, 'proposalId');
  const name = stringParam(params, 'name');
  if (!proposalId || !name || name.trim().length === 0 || [...name.trim()].length > MAX_BRAND_NAME_LENGTH) {
    return state as GameState;
  }
  if (publicState.brands.some((brand) => brand.proposalId === proposalId)) return state as GameState;
  const brand: GovernmentBrand = { proposalId, name: name.trim(), term: termOf(state.monthIndex) };
  return withPublicState(state, { ...publicState, brands: [...publicState.brands, brand] });
}

/** Invariant checks for saves and integration tests; an empty array means a valid public-policy state. */
export function checkPublicPolicies(state: GameState): string[] {
  const publicState = readPublicState(state);
  const errors: string[] = [];
  const directives = new Set<string>();
  for (const directive of publicState.directives) {
    if (!Number.isFinite(directive.annualMillions) || directive.annualMillions <= 0) {
      errors.push(`diretriz ${directive.ministryId}/${directive.policyId}: orçamento inválido`);
    }
    if (!Number.isInteger(directive.year) || directive.year < 0) errors.push('diretriz: ano inválido');
    const key = `${directive.year}:${directive.ministryId}:${directive.policyId}`;
    if (directives.has(key)) errors.push(`diretriz duplicada: ${key}`);
    directives.add(key);
  }

  const projects = new Set<string>();
  let assets = 0;
  for (const project of publicState.projects) {
    if (projects.has(project.proposalId)) errors.push(`projeto duplicado: ${project.proposalId}`);
    projects.add(project.proposalId);
    if (!PROJECT_PHASES.includes(project.phase as (typeof PROJECT_PHASES)[number])) {
      if (project.phase !== 'cancelado') errors.push(`projeto ${project.proposalId}: fase inválida`);
    }
    if (!finiteBetween(project.progress, 0, 1)) errors.push(`projeto ${project.proposalId}: avanço inválido`);
    if (!finiteNonNegative(project.budgetMillions)) errors.push(`projeto ${project.proposalId}: orçamento inválido`);
    if (!finiteNonNegative(project.spentMillions) || project.spentMillions > project.budgetMillions + EPSILON) {
      errors.push(`projeto ${project.proposalId}: desembolso inválido`);
    }
    if (!finiteNonNegative(project.assetMillions)) errors.push(`projeto ${project.proposalId}: ativo inválido`);
    if (
      project.monthSpentMillions !== undefined &&
      (!finiteNonNegative(project.monthSpentMillions) || project.monthSpentMillions > project.spentMillions + EPSILON)
    )
      errors.push(`projeto ${project.proposalId}: desembolso do mês inválido`);
    if (!finiteNonNegative(project.maintenanceMillions))
      errors.push(`projeto ${project.proposalId}: manutenção inválida`);
    if (!Number.isInteger(project.phaseMonth) || project.phaseMonth < 0)
      errors.push(`projeto ${project.proposalId}: mês inválido`);
    if (project.phaseEffort !== undefined && !finiteNonNegative(project.phaseEffort))
      errors.push(`projeto ${project.proposalId}: esforço de fase inválido`);
    if (!Number.isInteger(project.delayMonths) || project.delayMonths < 0)
      errors.push(`projeto ${project.proposalId}: atraso inválido`);
    assets += project.assetMillions;
  }

  const brands = new Set<string>();
  for (const brand of publicState.brands) {
    if (brands.has(brand.proposalId)) errors.push(`marca duplicada: ${brand.proposalId}`);
    brands.add(brand.proposalId);
    if (brand.name.trim().length === 0 || [...brand.name.trim()].length > MAX_BRAND_NAME_LENGTH) {
      errors.push(`marca ${brand.proposalId}: nome inválido`);
    }
    if (!Number.isInteger(brand.term) || brand.term < 0) errors.push(`marca ${brand.proposalId}: mandato inválido`);
  }
  if (!finiteNonNegative(publicState.capitalStockMillions)) errors.push('estoque de capital inválido');
  if (Math.abs(publicState.capitalStockMillions - assets) > 1e-6)
    errors.push('estoque de capital não reconcilia com os projetos');
  return errors;
}

/** Applies monthly directive and project execution after proposals have run. */
export const publicPoliciesStep: MonthStep = (input, ctx) => {
  let state = recordBudgetLaws(input) as PublicGameState;
  // Screening reserves actions only for the batch validator. Apply the accepted decisions here as well so
  // the step remains correct when called directly by a custom pipeline or by a module test.
  for (const decision of ctx.decisions) {
    if (decision.policyId === DIRECTIVE_ACTION_ID || decision.policyId === BRAND_ACTION_ID) {
      state = applyReservedPublicAction(state, decision) as PublicGameState;
    }
  }
  const publicState = clonePublicState(state.publicPolicies);
  const proposals = state.proposals.map(copyProposal);
  const t = state.monthIndex;
  let impulses = state.impulses.filter((impulse) => !currentManagedImpulse(impulse, t));
  const preview = budgetPreview({ ...state, impulses } as GameState, ctx.content);
  const year = toCalendar(t).year;
  const loa = [...(publicState.budgetLaws ?? [])]
    .filter((law) => law.kind === 'loa' && law.year === year && law.annualMillions !== undefined)
    .sort(
      (a, b) => b.enactedAt - a.enactedAt || (a.proposalId < b.proposalId ? -1 : a.proposalId > b.proposalId ? 1 : 0),
    )[0];
  let roomMillions = Math.min(preview.annualRoomMillions, loa?.annualMillions ?? Infinity);
  const gdpMillions = preview.gdpMillions;

  renewDirectives(publicState, t, ctx.draft);
  const previousAssets = new Map(publicState.projects.map((project) => [project.proposalId, project.assetMillions]));
  depreciateAssets(publicState, ctx.content);
  // O pagamento do mês é recontado a cada passo: obra parada ou concluída não carrega o valor do mês anterior.
  for (const project of publicState.projects) delete project.monthSpentMillions;

  const currentDirectives = publicState.directives.filter((directive) => directive.year === yearOf(t));
  const projectRuns = ensureProjects(publicState, proposals, ctx.content, t, state);
  // Convênios das obras federativas (PLANO_EXPANSAO EX-20): negociação, assinatura, contrapartida e vigência, antes
  // de a obra pedir dinheiro. Uma obra cancelada por falta de adesão já sai da alocação do mês.
  for (const run of projectRuns) {
    if (run.policy) advanceAgreement(run.project, run.proposal, run.policy, state, ctx);
  }
  const allocations = [
    ...currentDirectives.map((directive) => ({
      kind: 'directive' as const,
      directive,
      area: ctx.content.policies[directive.policyId]?.area,
    })),
    ...projectRuns.map((run) => ({ kind: 'project' as const, run, area: run.policy?.area })),
  ];
  if (loa) allocations.sort((a, b) => Number(b.area === loa.priority) - Number(a.area === loa.priority));
  for (const allocation of allocations) {
    if (allocation.kind === 'project') {
      const result = processProject(allocation.run, roomMillions, gdpMillions, state, ctx);
      roomMillions = result.roomMillions;
      impulses.push(...result.impulses);
      if (result.transition) ctx.draft.notes.push(result.transition);
      continue;
    }
    const directive = allocation.directive;
    const policy = ctx.content.policies[directive.policyId];
    const ministry = ctx.content.scenario.institutions?.ministries.find((item) => item.id === directive.ministryId);
    if (!policy || policy.delivery !== 'rotina' || !ministry) continue;
    const requested = safePositive(directive.annualMillions);
    const allocated = Math.min(requested, roomMillions);
    if (allocated < requested - EPSILON) {
      ctx.draft.notes.push(
        `Diretriz ${policy.name}: orçamento reduzido de R$ ${requested.toFixed(1)} mi para R$ ${allocated.toFixed(1)} mi por falta de espaço discricionário.`,
      );
    }
    roomMillions -= allocated;
    impulses.push(...routineImpulses(policy, directive, allocated, gdpMillions, t));
    impulses.push(...routinePreventionImpulses(policy, directive, allocated, t));
    impulses.push(...routineEducationImpulses(policy, directive, allocated, t));
    if (policy.id === 'rotina_eficiencia_energetica' && allocated > 0 && policy.cost.annualMillions > 0) {
      const startMonth = t + policy.timeline.maturationMonths;
      impulses.push({
        sourceId: `${ROUTINE_IMPULSE_PREFIX}${directive.ministryId}:${policy.id}:${directive.year}:${t}`,
        label: policy.name,
        target: 'energia.eficiencia',
        delta: Math.min(1, allocated / policy.cost.annualMillions),
        startMonth,
        endMonth: startMonth,
      });
    }
  }

  for (const run of projectRuns) {
    impulses.push(...projectPreventionImpulses(run.project, run.policy, t, state.economy.priceLevel));
    impulses.push(...projectEducationImpulses(run.project, run.policy, t, state.economy.priceLevel));
  }

  publicState.capitalStockMillions = publicState.projects
    .filter((project) => project.phase === 'operacao')
    .reduce((sum, project) => sum + project.assetMillions, 0);
  const c = calibration(ctx.content);
  const realGdpMillions = gdpMillions / positiveOr(state.economy.priceLevel, 1);
  for (const project of publicState.projects) {
    const deltaAsset = project.assetMillions - (previousAssets.get(project.proposalId) ?? 0);
    const policy = ctx.content.policies[project.policyId];
    // Transmissão afeta a atividade pela eletricidade entregue, não pelo canal genérico de capital público.
    if (
      ['projeto_transmissao_energia', 'projeto_geracao_energia', 'projeto_reservatorio_energia'].includes(
        project.policyId,
      )
    )
      continue;
    const potentialDelta = (deltaAsset / positiveOr(realGdpMillions, 1)) * c.elast_kg * MONTHS_PER_YEAR;
    if (!policy || !Number.isFinite(potentialDelta) || Math.abs(potentialDelta) <= EPSILON) continue;
    const regional = projectRegional(project, policy);
    impulses.push({
      sourceId: `projeto:capital:${project.proposalId}:${t}`,
      label: deltaAsset >= 0 ? 'Variação do capital público em operação' : 'Depreciação do capital público',
      target: 'oferta.potencial',
      delta: potentialDelta,
      startMonth: t,
      endMonth: t,
      ...(regional ? { regional } : {}),
    });
  }

  for (const brand of publicState.brands) {
    const proposal = proposals.find((item) => item.id === brand.proposalId);
    if (!proposal) continue;
    const project = publicState.projects.find((item) => item.proposalId === proposal.id);
    const progress = project ? `${Math.round(project.progress * 100)}%` : 'aguardando carteira';
    ctx.draft.notes.push(
      `Marca de governo “${brand.name}”: ${brandStatus(proposal.status, project?.phase, progress)}.`,
    );
  }

  const next = withPublicState({ ...state, proposals, impulses } as GameState, publicState) as PublicGameState;
  return { state: next, contributions: [] };
};

function routineImpulses(
  policy: Policy,
  directive: MinistryDirective,
  allocatedMillions: number,
  gdpMillions: number,
  month: number,
): ScheduledImpulse[] {
  if (!(allocatedMillions > 0) || !(gdpMillions > 0)) return [];
  const nominal = policy.cost.annualMillions;
  const scale = nominal > 0 ? allocatedMillions / nominal : 0;
  return policy.impacts
    .filter((impact) => impact.channel === 'custeio' || impact.channel === 'aprovacao')
    .map((impact) => {
      const regional = policyRegional(policy);
      return {
        sourceId: `${ROUTINE_IMPULSE_PREFIX}${directive.ministryId}:${directive.policyId}:${directive.year}:${month}`,
        label: `Diretriz: ${policy.name}`,
        target: impact.channel === 'custeio' ? ('gasto.custeio' as const) : ('aprovacao' as const),
        delta: impact.channel === 'custeio' ? (impact.magnitude / gdpMillions) * scale : impact.magnitude * scale,
        startMonth: month + impact.lagMonths,
        endMonth: month + impact.lagMonths,
        ...(regional ? { regional } : {}),
      };
    });
}

/**
 * UFs de um projeto, para o mapa (PLANO_GLOBO.md §7, PR 13: "obras sem coordenadas inventadas"). **Regra única:** só vale
 * UF que o próprio conteúdo da política cita — as siglas de UF do `regional.scope`, o território onde a política declara
 * gastar (macrorregiões, escopo vazio e UFs desconhecidas do cenário não contam: obra nacional ou regional **não** vira
 * pin). Nunca há coordenadas: o pin fica na âncora da UF, como os demais marcadores. Na ordem do escopo, sem repetição.
 */
export function projectUfs(policy: Pick<Policy, 'regional'>, scenarioUfIds: readonly string[]): string[] {
  const known = new Set(scenarioUfIds);
  const scope = policy.regional?.scope ?? [];
  return [...new Set(scope.filter((entry) => known.has(entry)))];
}

/**
 * Prevenção climática de uma política (PLANO_GLOBO.md §7, PR 13): um impulso `clima.prevencao_seca` e/ou
 * `clima.prevencao_cheia` com a força do programa × a capacidade entregue (0–1), no escopo regional da política (as UFs
 * do `regional.scope`; sem escopo, todas). Só o clima lê esses alvos (`preventionOf`): não mexem na economia.
 */
function preventionImpulses(
  policy: Policy,
  coverage: number,
  sourceId: string,
  startMonth: number,
  regional: ImpulseRegional | undefined,
): ScheduledImpulse[] {
  if (!policy.prevention || !(coverage > 0)) return [];
  const label = `Prevenção: ${policy.name}`;
  const make = (target: 'clima.prevencao_seca' | 'clima.prevencao_cheia', strength: number | undefined) =>
    strength !== undefined && strength > 0
      ? [
          {
            sourceId,
            label,
            target,
            delta: strength * coverage,
            startMonth,
            endMonth: startMonth,
            ...(regional ? { regional } : {}),
          },
        ]
      : [];
  return [
    ...make('clima.prevencao_seca', policy.prevention.drought),
    ...make('clima.prevencao_cheia', policy.prevention.flood),
  ];
}

/**
 * Rotina de prevenção (Defesa Civil): a força vale na proporção da dotação **efetivamente liberada** (`allocated` ÷ custo
 * nominal, no máximo 1) e chega `timeline.maturationMonths` depois, como os demais efeitos da rotina: o reforço leva
 * meses para virar alerta, equipe e abrigo, e o efeito some quando a dotação some (a rotina é recriada a cada mês).
 */
function routinePreventionImpulses(
  policy: Policy,
  directive: MinistryDirective,
  allocatedMillions: number,
  month: number,
): ScheduledImpulse[] {
  const nominal = policy.cost.annualMillions;
  if (!policy.prevention || !(allocatedMillions > 0) || !(nominal > 0)) return [];
  return preventionImpulses(
    policy,
    Math.min(1, allocatedMillions / nominal),
    `${ROUTINE_IMPULSE_PREFIX}${directive.ministryId}:${directive.policyId}:${directive.year}:${month}`,
    month + policy.timeline.maturationMonths,
    policyRegional(policy),
  );
}

/**
 * Prevenção de um projeto: a obra em andamento entrega `prevencao_fracao_obra` × avanço físico × escala aprovada (orçamento
 * ÷ custo nominal, no máximo 1: um projeto aprovado menor protege menos, como em operação); em operação, a
 * força × ativo líquido ÷ ativo nominal (custo da obra × eficiência, no máximo 1). O ativo deprecia e, sem manutenção
 * paga, deprecia mais (`processProject`), então a proteção cai sozinha quando o governo deixa a obra sem manutenção.
 * Planejamento, licenciamento, licitação e obra cancelada não protegem.
 */
function projectPreventionImpulses(
  project: PublicProject,
  policy: Policy | undefined,
  month: number,
  priceLevel: number,
): ScheduledImpulse[] {
  if (!policy?.prevention || month < project.startMonth) return [];
  let coverage = 0;
  if (project.phase === 'obra') {
    const nominalBudget = policy.cost.annualMillions * (Math.max(1, policy.timeline.executionMonths) / MONTHS_PER_YEAR);
    const approvedScale = nominalBudget > 0 ? Math.min(1, project.budgetMillions / nominalBudget) : 0;
    coverage = climateParam('prevencao_fracao_obra') * project.progress * approvedScale;
  } else if (project.phase === 'operacao') {
    // O ativo entregue está em preços-base (obra ÷ nível de preços): o nominal vai para a mesma unidade.
    coverage = operationCoverage(project, policy, priceLevel);
  }
  return preventionImpulses(
    policy,
    coverage,
    `${PROJECT_IMPULSE_PREFIX}${project.proposalId}:prevencao:${month}`,
    month,
    projectRegional(project, policy),
  );
}

/**
 * Alavancas de educação de uma política (PLANO_EXPANSAO EX-19): um impulso `educacao.<alavanca>` com a força do
 * programa × a capacidade entregue (0–1). Só a etapa da educação lê esses alvos; o gasto é o da própria rotina ou obra.
 */
function educationImpulses(policy: Policy, coverage: number, sourceId: string, startMonth: number): ScheduledImpulse[] {
  if (!policy.education || !(coverage > 0)) return [];
  const education = policy.education;
  return EDUCATION_LEVER_IDS.flatMap((lever) => {
    const strength = education[lever];
    return strength !== undefined && strength > 0
      ? [
          {
            sourceId: `${sourceId}:${lever}`,
            label: policy.name,
            target: `educacao.${lever}` as const,
            delta: strength * coverage,
            startMonth,
            endMonth: startMonth,
          },
        ]
      : [];
  });
}

/** Rotina de educação: força × dotação liberada ÷ custo nominal, depois da maturação (como a prevenção da rotina). */
function routineEducationImpulses(
  policy: Policy,
  directive: MinistryDirective,
  allocatedMillions: number,
  month: number,
): ScheduledImpulse[] {
  const nominal = policy.cost.annualMillions;
  if (!policy.education || !(allocatedMillions > 0) || !(nominal > 0)) return [];
  return educationImpulses(
    policy,
    Math.min(1, allocatedMillions / nominal),
    `${ROUTINE_IMPULSE_PREFIX}${directive.ministryId}:${directive.policyId}:${directive.year}:educacao:${month}`,
    month + policy.timeline.maturationMonths,
  );
}

/**
 * Projeto de educação: só a escola **em operação** ensina. A força vale o ativo líquido ÷ ativo nominal (no máximo 1),
 * então o efeito cai quando o governo deixa a obra sem manutenção. Obra em andamento não matricula ninguém.
 */
function projectEducationImpulses(
  project: PublicProject,
  policy: Policy | undefined,
  month: number,
  priceLevel: number,
): ScheduledImpulse[] {
  if (!policy?.education || month < project.startMonth || project.phase !== 'operacao') return [];
  const sourceId = `${PROJECT_IMPULSE_PREFIX}${project.proposalId}:educacao:${month}`;
  return educationImpulses(policy, operationCoverage(project, policy, priceLevel), sourceId, month);
}

/** Ativo líquido em operação ÷ ativo nominal do projeto (custo × eficiência, em preços-base), no máximo 1. */
function operationCoverage(project: PublicProject, policy: Policy, priceLevel: number): number {
  const nominalAsset =
    (policy.cost.annualMillions *
      (Math.max(1, policy.timeline.executionMonths) / MONTHS_PER_YEAR) *
      (policy.project?.efficiency ?? 1)) /
    positiveOr(priceLevel, 1);
  return nominalAsset > 0 ? Math.min(1, project.assetMillions / nominalAsset) : 0;
}

/**
 * Proteção climática de cada UF **agora**, para a interface (cartão da UF): os impulsos de prevenção ainda ativos na fila
 * (rotinas, que chegam com atraso) mais os dos projetos calculados do estado atual da carteira. É o que a etapa do clima
 * do próximo mês vai usar, sem rodar o mês. Pura e sem sorteio.
 */
export function currentPrevention(
  state: Pick<GameState, 'economy' | 'impulses' | 'monthIndex' | 'publicPolicies'>,
  content: Pick<GameContent, 'scenario' | 'policies'>,
): Prevention {
  const ufs = content.scenario.regions?.ufs ?? [];
  const fromProjects = state.publicPolicies.projects.flatMap((project) =>
    projectPreventionImpulses(project, content.policies[project.policyId], state.monthIndex, state.economy.priceLevel),
  );
  return preventionOf([...state.impulses, ...fromProjects], state.monthIndex, ufs);
}

function ensureProjects(
  publicState: PublicPolicyState,
  proposals: Proposal[],
  content: GameContent,
  month: number,
  state: Readonly<GameState>,
): ProjectRun[] {
  const known = new Set(publicState.projects.map((project) => project.proposalId));
  for (const proposal of proposals) {
    const policy = content.policies[proposal.policyId];
    if (!policy || policy.delivery !== 'projeto' || known.has(proposal.id) || proposal.executionStart === null)
      continue;
    if (!['em_execucao', 'suspensa'].includes(proposal.status)) continue;
    const overrun = proposal.history.some((transition) => transition.cause === 'sobrecusto');
    const budget =
      policy.cost.annualMillions *
      (Math.max(1, policy.timeline.executionMonths) / MONTHS_PER_YEAR) *
      Math.max(EPSILON, proposal.scale) *
      (overrun ? calibration(content).fator_sobrecusto : 1);
    publicState.projects.push({
      proposalId: proposal.id,
      policyId: proposal.policyId,
      phase: 'planejamento',
      phaseMonth: 0,
      progress: 0,
      budgetMillions: budget,
      spentMillions: 0,
      assetMillions: 0,
      maintenanceMillions: 0,
      delayMonths: 0,
      startMonth: Math.max(month, proposal.executionStart),
    });
    const agreement = createAgreement(policy, proposal.id, state, content);
    if (agreement) publicState.projects[publicState.projects.length - 1].federative = agreement;
    known.add(proposal.id);
  }
  return publicState.projects.map((project) => {
    const policy = content.policies[project.policyId];
    const management = policy ? policyManagement(state, content, policy.area) : null;
    return {
      project,
      proposal: proposals.find((proposal) => proposal.id === project.proposalId),
      policy,
      capacity: ministryCapacity(project, content, state),
      preparation: management?.competence ?? 1,
      licensing: management?.coordination ?? 1,
      procurement: management?.experience ?? 1,
    };
  });
}

function processProject(
  run: ProjectRun,
  roomMillions: number,
  gdpMillions: number,
  state: Readonly<GameState>,
  ctx: StepContext,
): { roomMillions: number; impulses: ScheduledImpulse[]; transition: string | null } {
  const { project, proposal, policy } = run;
  if (!policy || !proposal || project.phase === 'cancelado' || state.monthIndex < project.startMonth) {
    return { roomMillions, impulses: [], transition: null };
  }
  project.bottleneck = 'nenhum';
  if (proposal.status === 'abandonada') {
    project.phase = 'cancelado';
    project.phaseMonth = 0;
    project.phaseEffort = 0;
    return { roomMillions, impulses: [], transition: `Projeto ${policy.name} cancelado.` };
  }
  if (proposal.status === 'suspensa') {
    project.bottleneck = 'suspensao';
    project.delayMonths += 1;
    return {
      roomMillions,
      impulses: [],
      transition: `Projeto ${policy.name} suspenso: cronograma e desembolso pausados.`,
    };
  }

  let transition: string | null = null;
  let phase: ProjectPhase = project.phase;
  while (phase !== 'operacao' && phase !== 'cancelado') {
    const duration = phaseDuration(phase as Exclude<ProjectPhase, 'operacao' | 'cancelado'>, policy);
    if (duration === 0) {
      phase = nextPhase(phase);
      project.phase = phase;
      project.phaseMonth = 0;
      project.phaseEffort = 0;
      transition = `Projeto ${policy.name}: fase ${phase}.`;
      continue;
    }
    break;
  }
  if (phase === 'cancelado') return { roomMillions, impulses: [], transition };
  if (phase === 'operacao') {
    const asset = project.assetMillions;
    const rate = policy.project?.annualMaintenanceRate ?? 0;
    project.maintenanceMillions = asset * rate * positiveOr(state.economy.priceLevel, 1);
    const maintenance = Math.min(project.maintenanceMillions, roomMillions);
    roomMillions -= maintenance;
    const maintenanceCoverage =
      project.maintenanceMillions > EPSILON ? Math.max(0, Math.min(1, maintenance / project.maintenanceMillions)) : 1;
    if (maintenanceCoverage < 1 - EPSILON) {
      project.bottleneck = 'orcamento';
      const extraDepreciation = (calibration(ctx.content).dep_kg * (1 - maintenanceCoverage)) / MONTHS_PER_YEAR;
      project.assetMillions = Math.max(0, asset * (1 - extraDepreciation));
    }
    const regional = projectRegional(project, policy);
    const impulses: ScheduledImpulse[] =
      maintenance > 0 && gdpMillions > 0
        ? [
            {
              sourceId: `${PROJECT_IMPULSE_PREFIX}${project.proposalId}:maintenance:${state.monthIndex}`,
              label: `Manutenção: ${policy.name}`,
              target: 'gasto.custeio',
              delta: maintenance / gdpMillions,
              startMonth: state.monthIndex,
              endMonth: state.monthIndex,
              ...(regional ? { regional } : {}),
            },
          ]
        : [];
    if (maintenance < project.maintenanceMillions - EPSILON) {
      ctx.draft.notes.push(`Projeto ${policy.name}: manutenção contingenciada neste mês.`);
    }
    return { roomMillions, impulses, transition };
  }

  if (phase !== 'obra') {
    const rate =
      phase === 'planejamento' ? run.preparation : phase === 'licenciamento' ? run.licensing : run.procurement;
    project.phaseMonth += 1;
    project.phaseEffort = (project.phaseEffort ?? 0) + rate;
    if (rate < 1 - EPSILON) {
      project.bottleneck = 'capacidade';
      ctx.draft.notes.push(`Projeto ${policy.name}: ${phase} avança conforme a capacidade de gestão da etapa.`);
    }
    if (project.phaseEffort >= phaseDuration(phase, policy)) {
      project.phase = nextPhase(phase);
      project.phaseMonth = 0;
      project.phaseEffort = 0;
      transition = `Projeto ${policy.name}: fase ${project.phase}.`;
    }
    return { roomMillions, impulses: [], transition };
  }

  const duration = effectiveConstructionMonths(policy, run.capacity);
  if (run.capacity < 1 - EPSILON) project.bottleneck = 'capacidade';
  const c = calibration(ctx.content);
  const after = sCurve((project.phaseMonth + 1) / duration, c.curva_s_projetos);
  const pastSchedule = project.phaseMonth >= duration;
  if (pastSchedule && project.spentMillions >= project.budgetMillions - EPSILON) {
    return { roomMillions, impulses: [], transition: completeProject(project, proposal, policy, state, ctx) };
  }
  const planned = pastSchedule
    ? Math.max(0, project.budgetMillions - project.spentMillions)
    : plannedConstructionSpend(project, policy, project.phaseMonth, duration, c.curva_s_projetos);
  // A zero profile tranche is an intentional calendar gap. It must not make the
  // project impossible to finish, while a positive tranche with no fiscal room
  // remains blocked until the monthly pool can fund it.
  if (planned <= EPSILON) {
    project.bottleneck = 'cronograma';
    project.phaseMonth += 1;
    project.delayMonths += 1;
    return { roomMillions, impulses: [], transition };
  }
  // A partially funded tranche keeps its curve index; only the unpaid balance is charged again.
  let paidBefore = 0;
  if (!pastSchedule) {
    for (let month = 0; month < project.phaseMonth; month += 1) {
      paidBefore += plannedConstructionSpend(project, policy, month, duration, c.curva_s_projetos);
    }
  }
  const trancheSpent = pastSchedule ? 0 : Math.min(planned, Math.max(0, project.spentMillions - paidBefore));
  const due = planned - trancheSpent;
  if (due <= EPSILON) {
    project.phaseMonth += 1;
    const funded = project.budgetMillions > EPSILON ? project.spentMillions / project.budgetMillions : 1;
    project.progress = Math.max(project.progress, Math.min(1, funded, after));
    return { roomMillions, impulses: [], transition };
  }
  // Obra federativa (EX-20): a União só repassa na proporção da contrapartida estadual paga.
  const coverage = counterpartCoverage(project.federative, ctx.content);
  if (coverage <= EPSILON) {
    project.bottleneck = 'contrapartida';
    project.delayMonths += 1;
    ctx.draft.notes.push(`Projeto ${policy.name}: estados sem pagar a contrapartida; repasse federal parado.`);
    return { roomMillions, impulses: [], transition };
  }
  const availableMonthly = roomMillions / MONTHS_PER_YEAR;
  const allocated = Math.min(due * coverage, availableMonthly);
  if (allocated <= EPSILON) {
    project.bottleneck = 'orcamento';
    project.delayMonths += 1;
    ctx.draft.notes.push(`Projeto ${policy.name}: orçamento mensal indisponível; obra atrasada.`);
    return { roomMillions, impulses: [], transition };
  }
  roomMillions -= allocated * MONTHS_PER_YEAR;
  const spentBefore = project.spentMillions;
  project.spentMillions = Math.min(project.budgetMillions, project.spentMillions + allocated);
  project.monthSpentMillions = project.spentMillions - spentBefore;
  const share = allocated / due;
  if (share < 1 - EPSILON) project.bottleneck = coverage < 1 - EPSILON ? 'contrapartida' : 'orcamento';
  project.progress = Math.min(
    1,
    project.budgetMillions > EPSILON ? project.spentMillions / project.budgetMillions : 1,
    project.progress + (after - project.progress) * share,
  );
  if (share >= 1 - EPSILON) project.phaseMonth += 1;
  else project.delayMonths += 1;
  const regional = projectRegional(project, policy);
  const impulses: ScheduledImpulse[] =
    gdpMillions > 0
      ? [
          {
            sourceId: `${PROJECT_IMPULSE_PREFIX}${project.proposalId}:obra:${state.monthIndex}`,
            label: `Obra: ${policy.name}`,
            target: 'gasto.investimento',
            delta: (allocated * MONTHS_PER_YEAR) / gdpMillions,
            startMonth: state.monthIndex,
            endMonth: state.monthIndex,
            ...(regional ? { regional } : {}),
          },
        ]
      : [];
  if (project.progress >= 1 - EPSILON && project.spentMillions >= project.budgetMillions - EPSILON) {
    transition = completeProject(project, proposal, policy, state, ctx);
  }
  return { roomMillions, impulses, transition };
}

function completeProject(
  project: PublicProject,
  proposal: Proposal,
  policy: Policy,
  state: Readonly<GameState>,
  ctx: StepContext,
): string {
  project.progress = 1;
  project.phase = 'operacao';
  project.phaseMonth = 0;
  project.phaseEffort = 0;
  // Obra federativa: o ativo é a obra inteira, paga em parte pelos estados; o desembolso federal é só a parcela federal.
  const federalShare = positiveOr(project.federative?.federalShare ?? 1, 1);
  project.assetMillions =
    ((project.spentMillions / positiveOr(state.economy.priceLevel, 1)) * (policy.project?.efficiency ?? 1)) /
    federalShare;
  project.maintenanceMillions =
    project.assetMillions * (policy.project?.annualMaintenanceRate ?? 0) * positiveOr(state.economy.priceLevel, 1);
  if (proposal.status === 'em_execucao') {
    proposal.status = 'concluida';
    const transitionRecord = {
      monthIndex: state.monthIndex,
      status: 'concluida' as const,
      cause: 'obra_concluida',
      detail: 'Projeto concluído após 100% de avanço físico.',
    };
    proposal.history = [...proposal.history, transitionRecord];
    ctx.draft.proposalChanges.push({
      proposalId: proposal.id,
      policyId: proposal.policyId,
      transition: transitionRecord,
    });
  }
  return `Projeto ${policy.name}: obra concluída e ativo entrou em operação.`;
}

function renewDirectives(publicState: PublicPolicyState, month: number, draft: StepContext['draft']): void {
  if (month <= 0 || month % MONTHS_PER_YEAR !== 0) return;
  const year = yearOf(month);
  const previous = publicState.directives.filter((directive) => directive.year === year - 1);
  const currentKeys = new Set(
    publicState.directives.filter((directive) => directive.year === year).map((directive) => directive.ministryId),
  );
  for (const directive of previous) {
    if (currentKeys.has(directive.ministryId)) continue;
    publicState.directives.push({ ...directive, year });
    currentKeys.add(directive.ministryId);
    draft.notes.push(
      `Diretriz ${directive.policyId}: renovada para o novo ano; disponibilidade será revista neste mês.`,
    );
  }
  // Only the active year's reservations are execution state. The report keeps the renewal note,
  // so retaining historical annual rows would only create duplicate budget candidates on later screens.
  publicState.directives = publicState.directives.filter((directive) => directive.year === year);
}

function depreciateAssets(publicState: PublicPolicyState, content: GameContent): void {
  const depAnnual = calibration(content).dep_kg;
  for (const project of publicState.projects) {
    if (project.phase !== 'operacao' || !(project.assetMillions > 0)) continue;
    project.assetMillions = Math.max(0, project.assetMillions * (1 - depAnnual / MONTHS_PER_YEAR));
  }
}

/**
 * Espaço discricionário anual livre. Impulsos da carteira (rotinas, obras, manutenção) ficam de fora: cada alocação
 * ocupa o espaço uma única vez, no mês em que é decidida, mesmo quando o efeito chega com defasagem.
 */
function budgetPreview(rawState: Readonly<GameState>, content: GameContent): BudgetPreview {
  const state = { ...rawState, impulses: rawState.impulses.filter((impulse) => !managedImpulse(impulse)) } as GameState;
  const c = content.calibration;
  const anchor = scenarioEconomyValues(content.scenario);
  const structure = fiscalStructure(fiscalValues(content.scenario, anchor));
  const gdpMillions = currentNominalGdpMillions(state, content);
  const reviewState =
    state.monthIndex > 0 && state.monthIndex % MONTHS_PER_YEAR === 0
      ? ({ ...state, economy: { ...state.economy, fiscal: annualReview(state, c).fiscal } } as GameState)
      : state;
  const revenue = revenueMonth(reviewState, structure, reviewState.economy.outputGap, c);
  const potential = c.g_pot_base + sumActiveOferta(reviewState);
  const spending = spendingMonth(reviewState, reviewState.economy.fiscal, structure, revenue.linkedBase, potential, c);
  const room = Math.max(0, spending.discretionary - c.discricionaria_minima);
  return { gdpMillions, annualRoomMillions: room * gdpMillions };
}

function sumActiveOferta(state: Readonly<GameState>): number {
  return state.impulses
    .filter((impulse) => impulse.target === 'oferta.potencial' && impulse.startMonth <= state.monthIndex)
    .filter((impulse) => impulse.endMonth === null || impulse.endMonth >= state.monthIndex)
    .reduce((sum, impulse) => sum + impulse.delta, 0);
}

function ministryCapacity(project: PublicProject, content: GameContent, state: Readonly<GameState>): number {
  const policy = content.policies[project.policyId];
  return policy ? policyCapacity(state, content, policy.area) : 1;
}

function effectiveConstructionMonths(policy: Policy, capacity: number): number {
  const nominal = Math.max(1, policy.timeline.executionMonths);
  const efficiency = Math.max(EPSILON, policy.project?.efficiency ?? 1);
  return Math.max(1, Math.ceil(nominal / (efficiency * capacity)));
}

function phaseDuration(phase: Exclude<ProjectPhase, 'operacao' | 'cancelado'>, policy: Policy): number {
  if (phase === 'planejamento') return policy.timeline.planningMonths;
  if (phase === 'licenciamento') return policy.project?.licensingMonths ?? 0;
  if (phase === 'licitacao') return policy.project?.procurementMonths ?? 0;
  return effectiveConstructionMonths(policy, 1);
}

function nextPhase(phase: ProjectPhase): ProjectPhase {
  const index = PROJECT_PHASES.indexOf(phase as (typeof PROJECT_PHASES)[number]);
  return PROJECT_PHASES[Math.min(PROJECT_PHASES.length - 1, index + 1)] ?? 'operacao';
}

function sCurve(x: number, steepness: number): number {
  const bounded = Math.max(0, Math.min(1, x));
  const logistic = (value: number) => 1 / (1 + Math.exp(-steepness * (value - 0.5)));
  const low = logistic(0);
  const high = logistic(1);
  return (logistic(bounded) - low) / (high - low);
}

/**
 * Converts the annual profile into monthly nominal disbursement while retaining
 * a normalized S curve inside each profile tranche. The tranche boundaries are
 * stretched when execution is delayed by ministerial capacity, so the declared
 * total is still spent exactly once over the effective duration.
 */
function plannedConstructionSpend(
  project: PublicProject,
  policy: Policy,
  month: number,
  duration: number,
  steepness: number,
): number {
  const profile = policy.cost.disbursementProfile;
  const profileTotal = profile.reduce((sum, share) => sum + (Number.isFinite(share) ? share : 0), 0);
  const nominalMonths = Math.max(1, policy.timeline.executionMonths);
  if (profile.length === 0 || !(profileTotal > EPSILON) || !(duration > 0)) {
    return Math.max(
      0,
      (sCurve((month + 1) / duration, steepness) - sCurve(month / duration, steepness)) * project.budgetMillions,
    );
  }

  const boundaries = profile.map((_, index) =>
    index === profile.length - 1
      ? duration
      : Math.min(duration, Math.max(0, Math.round(((index + 1) * MONTHS_PER_YEAR * duration) / nominalMonths))),
  );
  const segment = (at: number): number => {
    for (let index = 0; index < boundaries.length; index += 1) {
      if (at < boundaries[index]!) return index;
    }
    return boundaries.length - 1;
  };
  const segmentSums = profile.map(() => 0);
  for (let at = 0; at < duration; at += 1) {
    const index = segment(at);
    segmentSums[index] += sCurve((at + 1) / duration, steepness) - sCurve(at / duration, steepness);
  }
  const index = segment(Math.max(0, Math.min(duration - 1, month)));
  const curveIncrement = Math.max(0, sCurve((month + 1) / duration, steepness) - sCurve(month / duration, steepness));
  const segmentCurve = segmentSums[index] ?? 0;
  if (!(segmentCurve > EPSILON)) return 0;
  const share = Math.max(0, profile[index] ?? 0) / profileTotal;
  return project.budgetMillions * share * (curveIncrement / segmentCurve);
}

function brandStatus(status: ProposalStatus, phase: ProjectPhase | undefined, progress: string): string {
  if (status === 'abandonada' || phase === 'cancelado') return 'cancelado';
  if (status === 'rejeitada') return 'rejeitado no Congresso';
  if (status === 'vetada') return 'vetado';
  if (status === 'bloqueada') return 'bloqueado';
  if (status === 'suspensa') return `suspenso (${progress})`;
  if (phase === 'operacao' || status === 'concluida') return 'concluído e em operação';
  return `${phase ?? 'em tramitação'} (${progress})`;
}

function policyRegional(policy: Policy): ImpulseRegional | undefined {
  const profile = policy.regional;
  if (!profile) return undefined;
  return {
    key: profile.key,
    scope: [...profile.scope],
    ...(Object.keys(profile.boost).length > 0 ? { boost: { ...profile.boost } } : {}),
  };
}

/** Incidência regional de um projeto: a da política ou, numa obra federativa assinada, só os estados atendidos. */
function projectRegional(project: PublicProject, policy: Policy): ImpulseRegional | undefined {
  return agreementRegional(project.federative, policyRegional(policy));
}

function managedImpulse(impulse: ScheduledImpulse): boolean {
  return impulse.sourceId.startsWith(ROUTINE_IMPULSE_PREFIX) || impulse.sourceId.startsWith(PROJECT_IMPULSE_PREFIX);
}

function currentManagedImpulse(impulse: ScheduledImpulse, month: number): boolean {
  if (!managedImpulse(impulse)) return false;
  if (impulse.sourceId.endsWith(`:${month}`)) return true;
  return impulse.endMonth !== null && impulse.endMonth < month;
}

function readPublicState(state: Readonly<GameState>): PublicPolicyState {
  return clonePublicState(state.publicPolicies);
}

function withPublicState(state: Readonly<GameState>, publicPolicies: PublicPolicyState): GameState {
  return { ...state, publicPolicies } as GameState;
}

function clonePublicState(publicState: PublicPolicyState): PublicPolicyState {
  return {
    directives: publicState.directives.map((directive) => ({ ...directive })),
    projects: publicState.projects.map((project) => ({
      ...project,
      ...(project.federative
        ? {
            federative: {
              ...project.federative,
              members: project.federative.members.map((member) => ({ ...member })),
            },
          }
        : {}),
    })),
    brands: publicState.brands.map((brand) => ({ ...brand })),
    capitalStockMillions: publicState.capitalStockMillions,
    ...(publicState.budgetLaws ? { budgetLaws: publicState.budgetLaws.map((law) => ({ ...law })) } : {}),
  };
}

function copyProposal(proposal: Proposal): Proposal {
  return {
    ...proposal,
    votes: [...proposal.votes],
    history: [...proposal.history],
    negotiation: { ...proposal.negotiation, blocs: { ...proposal.negotiation.blocs } },
    veto: proposal.veto ? { ...proposal.veto } : null,
    judicial: proposal.judicial ? { ...proposal.judicial } : null,
  };
}

function calibration(content: GameContent): GameContent['calibration'] {
  return content.calibration;
}

function yearOf(month: number): number {
  return Math.floor(month / MONTHS_PER_YEAR);
}

function stringParam(params: Decision['params'], key: string): string | null {
  const value = params?.[key];
  return typeof value === 'string' ? value : null;
}

function numberParam(params: Decision['params'], key: string): number | null {
  const value = params?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function safePositive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function finiteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function finiteBetween(value: number, low: number, high: number): boolean {
  return Number.isFinite(value) && value >= low - EPSILON && value <= high + EPSILON;
}

function positiveOr(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
