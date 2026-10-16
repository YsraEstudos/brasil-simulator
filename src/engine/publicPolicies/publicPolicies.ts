import { annualReview, fiscalStructure, revenueMonth, spendingMonth } from '../economy/fiscal';
import { BRAND_ACTION_ID, DIRECTIVE_ACTION_ID } from '../actions';
import { currentNominalGdpMillions, fiscalValues, scenarioEconomyValues } from '../state';
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
const MANDATE_MONTHS = 48;
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
    if (!finiteNonNegative(project.maintenanceMillions))
      errors.push(`projeto ${project.proposalId}: manutenção inválida`);
    if (!Number.isInteger(project.phaseMonth) || project.phaseMonth < 0)
      errors.push(`projeto ${project.proposalId}: mês inválido`);
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
  let state = input as PublicGameState;
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
  let roomMillions = preview.annualRoomMillions;
  const gdpMillions = preview.gdpMillions;

  renewDirectives(publicState, t, ctx.draft);
  const previousAssets = new Map(publicState.projects.map((project) => [project.proposalId, project.assetMillions]));
  depreciateAssets(publicState, ctx.content);

  const currentDirectives = publicState.directives.filter((directive) => directive.year === yearOf(t));
  for (const directive of currentDirectives) {
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
  }

  const projectRuns = ensureProjects(publicState, proposals, ctx.content, t, state);
  for (const run of projectRuns) {
    const result = processProject(run, roomMillions, gdpMillions, state, ctx);
    roomMillions = result.roomMillions;
    impulses.push(...result.impulses);
    if (result.transition) ctx.draft.notes.push(result.transition);
  }

  publicState.capitalStockMillions = publicState.projects
    .filter((project) => project.phase === 'operacao')
    .reduce((sum, project) => sum + project.assetMillions, 0);
  const c = calibration(ctx.content);
  const realGdpMillions = gdpMillions / positiveOr(state.economy.priceLevel, 1);
  for (const project of publicState.projects) {
    const deltaAsset = project.assetMillions - (previousAssets.get(project.proposalId) ?? 0);
    const policy = ctx.content.policies[project.policyId];
    const potentialDelta = (deltaAsset / positiveOr(realGdpMillions, 1)) * c.elast_kg * MONTHS_PER_YEAR;
    if (!policy || !Number.isFinite(potentialDelta) || Math.abs(potentialDelta) <= EPSILON) continue;
    const regional = policyRegional(policy);
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
    known.add(proposal.id);
  }
  return publicState.projects.map((project) => ({
    project,
    proposal: proposals.find((proposal) => proposal.id === project.proposalId),
    policy: content.policies[project.policyId],
    capacity: ministryCapacity(project, content, state),
  }));
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
  if (proposal.status === 'abandonada') {
    project.phase = 'cancelado';
    project.phaseMonth = 0;
    return { roomMillions, impulses: [], transition: `Projeto ${policy.name} cancelado.` };
  }
  if (proposal.status === 'suspensa') {
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
      const extraDepreciation = (calibration(ctx.content).dep_kg * (1 - maintenanceCoverage)) / MONTHS_PER_YEAR;
      project.assetMillions = Math.max(0, asset * (1 - extraDepreciation));
    }
    const regional = policyRegional(policy);
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
    project.phaseMonth += 1;
    if (project.phaseMonth >= phaseDuration(phase, policy)) {
      project.phase = nextPhase(phase);
      project.phaseMonth = 0;
      transition = `Projeto ${policy.name}: fase ${project.phase}.`;
    }
    return { roomMillions, impulses: [], transition };
  }

  const duration = effectiveConstructionMonths(policy, run.capacity);
  const c = calibration(ctx.content);
  const after = sCurve((project.phaseMonth + 1) / duration, c.curva_s_projetos);
  const planned = plannedConstructionSpend(project, policy, project.phaseMonth, duration, c.curva_s_projetos);
  // A zero profile tranche is an intentional calendar gap. It must not make the
  // project impossible to finish, while a positive tranche with no fiscal room
  // remains blocked until the monthly pool can fund it.
  if (planned <= EPSILON) {
    project.phaseMonth += 1;
    project.delayMonths += 1;
    return { roomMillions, impulses: [], transition };
  }
  const availableMonthly = roomMillions / MONTHS_PER_YEAR;
  const allocated = Math.min(planned, availableMonthly);
  if (allocated <= EPSILON) {
    project.delayMonths += 1;
    ctx.draft.notes.push(`Projeto ${policy.name}: orçamento mensal indisponível; obra atrasada.`);
    return { roomMillions, impulses: [], transition };
  }
  roomMillions -= allocated * MONTHS_PER_YEAR;
  project.spentMillions = Math.min(project.budgetMillions, project.spentMillions + allocated);
  const share = planned > EPSILON ? allocated / planned : 1;
  project.progress = Math.min(1, project.progress + (after - project.progress) * share);
  if (share >= 1 - EPSILON) project.phaseMonth += 1;
  else project.delayMonths += 1;
  const regional = policyRegional(policy);
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
  if (project.progress >= 1 - EPSILON) {
    project.progress = 1;
    project.phase = 'operacao';
    project.phaseMonth = 0;
    project.assetMillions =
      (project.spentMillions / positiveOr(state.economy.priceLevel, 1)) * (policy.project?.efficiency ?? 1);
    project.maintenanceMillions =
      project.assetMillions * (policy.project?.annualMaintenanceRate ?? 0) * positiveOr(state.economy.priceLevel, 1);
    transition = `Projeto ${policy.name}: obra concluída e ativo entrou em operação.`;
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
  }
  return { roomMillions, impulses, transition };
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

function budgetPreview(state: Readonly<GameState>, content: GameContent): BudgetPreview {
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
  const ministry = content.scenario.institutions?.ministries.find((item) => item.areas.includes(policy?.area ?? ''));
  if (!ministry) return 1;
  const cabinet = state.congress.cabinet.find((item) => item.id === ministry.id);
  const occupant = cabinet?.occupant ?? ministry.occupant;
  const c = calibration(content);
  const partisanLoss = c.perda_execucao_partidaria;
  return occupant === 'tecnico' ? 1 : Math.max(c.capacidade_minima_projetos, 1 - partisanLoss);
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
    projects: publicState.projects.map((project) => ({ ...project })),
    brands: publicState.brands.map((brand) => ({ ...brand })),
    capitalStockMillions: publicState.capitalStockMillions,
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

function termOf(month: number): number {
  return Math.floor(month / MANDATE_MONTHS);
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
